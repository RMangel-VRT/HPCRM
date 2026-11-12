import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@workspace/db";
import { pool as appPool } from "../db";
import { initializeServiceCategories } from "../services/estimateServiceCategories";
import { disposableDatabase } from "../test/disposableDatabase";
import { initializeEmptyServiceCategories, SERVICE_CATEGORY_BOOT_LOCK } from "./initializeEmptyServiceCategories";

let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
let database: ReturnType<typeof drizzle<typeof schema>>;
let historicalSeed: string;
const migrationUrl = new URL("../../../../.migration-backup/migrations/0078_estimate_services.sql", import.meta.url);
const rows = () => fixture.pool.query(`SELECT * FROM estimate_service_categories ORDER BY company_id,sort_order,name`).then(r => r.rows);
const values = () => fixture.pool.query(`SELECT name, default_umbrella_key AS "defaultUmbrellaKey",
  default_unit AS "defaultUnit", sort_order AS "sortOrder" FROM estimate_service_categories ORDER BY sort_order`).then(r => r.rows);

describe("default category boot DML in an isolated disposable PostgreSQL database", () => {
  beforeAll(async () => {
    fixture = await disposableDatabase();
    database = drizzle({ client: fixture.pool, schema });
    const migration = await readFile(migrationUrl, "utf8");
    // Execute the historical table/index definitions and seed verbatim, not a
    // reimplementation or a string-presence check of its default values.
    const definitions = migration.match(/CREATE TABLE IF NOT EXISTS estimate_service_categories[\s\S]*?;\s*CREATE UNIQUE INDEX[^;]+;/)?.[0];
    historicalSeed = migration.match(/INSERT INTO estimate_service_categories[\s\S]*?;/)?.[0] ?? "";
    if (!definitions || !historicalSeed) throw new Error("Historical category migration shape changed");
    await fixture.pool.query(`CREATE TABLE companies(id varchar PRIMARY KEY); ${definitions}
      CREATE TABLE estimate_quick_items(id text PRIMARY KEY, company_id varchar, payload jsonb);
      CREATE TABLE estimate_lines(id text PRIMARY KEY, company_id varchar, payload jsonb);`);
  });
  beforeEach(async () => {
    await fixture.pool.query("TRUNCATE companies, estimate_service_categories, estimate_quick_items, estimate_lines CASCADE");
  });
  afterAll(async () => {
    await fixture?.dispose();
    await Promise.all([appPool.end(), schema.pool.end()]);
  });
  it("seeds empty companies once, returns companies rather than rows, and preserves exact rows on rerun", async () => {
    await fixture.pool.query("INSERT INTO companies VALUES ('a'),('b')");
    expect(await initializeEmptyServiceCategories(database)).toBe(2);
    const once = await rows();
    expect(once).toHaveLength(4);
    for (const company of ["a", "b"]) {
      expect(once.filter(row => row.company_id === company).map(row => ({
        name: row.name, defaultUmbrellaKey: row.default_umbrella_key,
        defaultUnit: row.default_unit, sortOrder: row.sort_order,
      }))).toEqual(schema.SERVICE_CATEGORY_DEFAULTS);
    }
    expect(once.every(row => row.is_active === true)).toBe(true);
    expect(await initializeEmptyServiceCategories(database)).toBe(0);
    expect(await rows()).toEqual(once);
  });
  it("leaves renamed, inactive, custom and partial companies untouched while seeding only empty neighbors", async () => {
    await fixture.pool.query(`INSERT INTO companies VALUES ('empty'),('renamed'),('inactive'),('custom'),('partial');
      INSERT INTO estimate_service_categories(company_id,name,default_umbrella_key,default_unit,sort_order,is_active)
      VALUES ('renamed','Owner renamed','plants','visit',7,true),
      ('inactive','General Landscape','landscape_labor','1,000 sq ft',0,false),
      ('custom','Custom only','irrigation_labor','hour',-4,true),
      ('partial','Chemical Treatments','landscape_labor','1,000 sq ft',1,true);
      INSERT INTO estimate_quick_items VALUES ('service','custom','{"rate":42}');
      INSERT INTO estimate_lines VALUES ('line','custom','{"snapshot":"unchanged"}');`);
    const before = await rows();
    const services = (await fixture.pool.query("TABLE estimate_quick_items")).rows;
    const lines = (await fixture.pool.query("TABLE estimate_lines")).rows;
    expect(await initializeEmptyServiceCategories(database)).toBe(1);
    expect((await rows()).filter(row => row.company_id !== "empty")).toEqual(before);
    expect((await fixture.pool.query("TABLE estimate_quick_items")).rows).toEqual(services);
    expect((await fixture.pool.query("TABLE estimate_lines")).rows).toEqual(lines);
  });
  it("skips an unpublished category table without creating it", async () => {
    await fixture.pool.query("INSERT INTO companies VALUES ('a'); ALTER TABLE estimate_service_categories RENAME TO saved_categories");
    try {
      expect(await initializeEmptyServiceCategories(database)).toBe(0);
      expect((await fixture.pool.query("SELECT to_regclass('public.estimate_service_categories') AS name")).rows[0].name).toBeNull();
      expect((await fixture.pool.query("TABLE saved_categories")).rows).toEqual([]);
    } finally { await fixture.pool.query("ALTER TABLE saved_categories RENAME TO estimate_service_categories"); }
  });
  it.each(["id", "company_id", "name", "default_umbrella_key", "default_unit", "sort_order",
    "is_active", "created_at", "updated_at"])("skips a missing category column %s without category writes", async column => {
    await fixture.pool.query(`INSERT INTO companies VALUES ('a'); ALTER TABLE estimate_service_categories RENAME COLUMN ${column} TO saved_column`);
    try {
      expect(await initializeEmptyServiceCategories(database)).toBe(0);
      expect(await rowsWithoutOrder()).toEqual([]);
    } finally { await fixture.pool.query(`ALTER TABLE estimate_service_categories RENAME COLUMN saved_column TO ${column}`); }
  });
  it("guards the company identifier source too", async () => {
    await fixture.pool.query("ALTER TABLE companies RENAME COLUMN id TO saved_id");
    try {
      expect(await initializeEmptyServiceCategories(database)).toBe(0);
      expect(await rows()).toEqual([]);
    } finally { await fixture.pool.query("ALTER TABLE companies RENAME COLUMN saved_id TO id"); }
    await fixture.pool.query("ALTER TABLE companies RENAME TO saved_companies");
    try {
      expect(await initializeEmptyServiceCategories(database)).toBe(0);
    } finally { await fixture.pool.query("ALTER TABLE saved_companies RENAME TO companies"); }
  });
  it("historical migration, transactional company seed and boot seed all agree semantically with shared defaults", async () => {
    await fixture.pool.query("INSERT INTO companies VALUES ('a')");
    await fixture.pool.query(historicalSeed);
    expect(await values()).toEqual(schema.SERVICE_CATEGORY_DEFAULTS);
    await fixture.pool.query("TRUNCATE estimate_service_categories");
    await database.transaction(tx => initializeServiceCategories(tx, "a"));
    expect(await values()).toEqual(schema.SERVICE_CATEGORY_DEFAULTS);
    await fixture.pool.query("TRUNCATE estimate_service_categories");
    expect(await initializeEmptyServiceCategories(database)).toBe(1);
    expect(await values()).toEqual(schema.SERVICE_CATEGORY_DEFAULTS);
    await fixture.pool.query("INSERT INTO companies VALUES ('rolled-back')");
    await expect(database.transaction(async tx => {
      await initializeServiceCategories(tx, "rolled-back");
      throw new Error("abort company setup");
    })).rejects.toThrow("abort company setup");
    expect((await rows()).some(row => row.company_id === "rolled-back")).toBe(false);
  });
  it("two independent simultaneous transactions wait on the lock and leave exactly two defaults per empty company", async () => {
    await fixture.pool.query("INSERT INTO companies VALUES ('a'),('b')");
    const results = await runBlockedInitializers();
    expect(results.sort()).toEqual([0, 2]);
    expect((await rows()).map(row => row.company_id)).toEqual(["a", "a", "b", "b"]);
    expect(await initializeEmptyServiceCategories(database)).toBe(0);
  });
  it("rechecks eligibility after waiting for the lock, preserving a newly committed category", async () => {
    await fixture.pool.query("INSERT INTO companies VALUES ('a')");
    expect(await runBlockedInitializers(async holder => {
      await holder.query(`INSERT INTO estimate_service_categories(company_id,name,default_umbrella_key,default_unit)
        VALUES ('a','Chosen while boot waited','plants','visit')`);
    })).toEqual([0, 0]);
    expect(await rows()).toMatchObject([{ name: "Chosen while boot waited" }]);
  });
  it("rolls back all company inserts and rejects unrelated SQL failures rather than logging a successful skip", async () => {
    await fixture.pool.query(`INSERT INTO companies VALUES ('a'),('b');
      CREATE FUNCTION reject_category_seed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.name = 'Chemical Treatments' THEN RAISE EXCEPTION 'simulated category failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_category_seed BEFORE INSERT ON estimate_service_categories FOR EACH ROW EXECUTE FUNCTION reject_category_seed();`);
    try {
      await expect(initializeEmptyServiceCategories(database)).rejects.toThrow();
      expect(await rows()).toEqual([]);
    } finally { await fixture.pool.query("DROP TRIGGER reject_category_seed ON estimate_service_categories; DROP FUNCTION reject_category_seed()"); }
  });
  it("is awaited in the real route-registration boot path next to schedule-by", async () => {
    const routes = await readFile(new URL("../routes/routes.ts", import.meta.url), "utf8");
    expect(routes).toMatch(/await backfillScheduleBy\(\);\s*await initializeEmptyServiceCategories\(\);/);
  });
});

async function rowsWithoutOrder() {
  return (await fixture.pool.query("TABLE estimate_service_categories")).rows;
}

async function runBlockedInitializers(whileBlocked?: (holder: import("pg").PoolClient) => Promise<void>) {
  const holder = await fixture.pool.connect();
  let pending: Promise<number>[] = [];
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock($1)", [SERVICE_CATEGORY_BOOT_LOCK]);
    pending = [initializeEmptyServiceCategories(database), initializeEmptyServiceCategories(database)];
    // Observe both real backend transactions waiting, not just Promise.all or a
    // timing-based assumption that they happened to overlap.
    const deadline = Date.now() + 10000;
    while (true) {
      const waiting = await holder.query(`SELECT count(*)::int AS count FROM pg_locks
        WHERE locktype='advisory' AND NOT granted AND objid=$1
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`, [SERVICE_CATEGORY_BOOT_LOCK]);
      if (waiting.rows[0].count === 2) break;
      if (Date.now() > deadline) throw new Error("Both initializer transactions did not wait on the advisory lock");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await whileBlocked?.(holder);
    await holder.query("COMMIT");
    return await Promise.all(pending);
  } finally {
    await holder.query("ROLLBACK");
    holder.release();
    await Promise.allSettled(pending);
  }
}
