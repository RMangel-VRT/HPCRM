import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pool as schemaPool } from "@workspace/db";
import { pool as appPool } from "../db";
import { disposableDatabase } from "../test/disposableDatabase";
import { ESTIMATE_UNITS, normalizeEstimateUnit } from "../../../../lib/db/src/estimateUnits";
import { ESTIMATE_UNIT_BOOT_LOCK, ESTIMATE_UNIT_REQUIRED_COLUMNS, normalizeStoredEstimateUnits } from "./normalizeEstimateUnits";

const logs = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock("./logger", () => ({ logger: logs }));
let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
let database: Parameters<typeof normalizeStoredEstimateUnits>[0];
let migration: string;
const file = (name: string) => readFile(new URL(`../../../../.migration-backup/migrations/${name}`, import.meta.url), "utf8");
const tables = ["estimate_quick_items", "estimate_service_categories", "hardscape_catalog_items", "irrigation_catalog_items", "estimate_lines"];
const contents = async () => Promise.all(tables.map(async table =>
  (await fixture.pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows));

describe("unit relabel and historical CHECK compatibility in isolated PostgreSQL", () => {
  beforeAll(async () => {
    fixture = await disposableDatabase();
    database = drizzle(fixture.pool) as NonNullable<typeof database>;
    migration = await file("0085_estimate_units.sql");
    // Actual historical migration SQL, including the automatic narrow unit CHECK.
    await fixture.pool.query(`CREATE TABLE companies(id varchar PRIMARY KEY);
      CREATE TABLE estimate_lines(id text PRIMARY KEY, company_id text, version_id text, unit text,
        line_type text CONSTRAINT estimate_lines_type_check CHECK(line_type IN ('custom')), payload jsonb);
      CREATE TABLE estimate_versions(id text PRIMARY KEY, company_id text, status text);
      CREATE TABLE hardscape_catalog_items(id text PRIMARY KEY,company_id text,unit text DEFAULT 'ea',is_active boolean);
      CREATE TABLE irrigation_catalog_items(id text PRIMARY KEY,company_id text,unit text DEFAULT 'ea',is_active boolean);`);
    await fixture.pool.query(await file("0053_estimate_setup.sql"));
    await fixture.pool.query(await file("0078_estimate_services.sql"));
    const checks = (await fixture.pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid='estimate_quick_items'::regclass AND contype='c'`)).rows.map(r => r.conname);
    expect(checks).toContain("estimate_quick_items_default_unit_check");
    expect(checks).toContain("estimate_quick_items_unit_check");
    await fixture.pool.query(migration);
  });
  beforeEach(async () => {
    logs.info.mockClear(); logs.warn.mockClear();
    await fixture.pool.query(`TRUNCATE companies,estimate_quick_items,estimate_service_categories,
      hardscape_catalog_items,irrigation_catalog_items,estimate_versions,estimate_lines CASCADE;
      INSERT INTO companies VALUES ('a'),('b');`);
  });
  afterAll(async () => {
    await fixture?.dispose();
    await Promise.all([appPool.end(), schemaPool.end()]);
  });
  it("retires both historical names, preserves unrelated checks, accepts the legacy/canonical union and canonical defaults", async () => {
    await fixture.pool.query(migration); // idempotent schema migration
    const checks = (await fixture.pool.query(`SELECT conname FROM pg_constraint WHERE contype='c'
      AND conrelid IN ('estimate_quick_items'::regclass,'estimate_service_categories'::regclass)`)).rows.map(r => r.conname);
    for (const table of ["estimate_quick_items", "estimate_service_categories"]) {
      expect(checks).toContain(`${table}_unit_v2_check`);
      expect(checks).not.toContain(`${table}_unit_check`);
      expect(checks).not.toContain(`${table}_default_unit_check`);
    }
    expect(checks).toContain("estimate_service_categories_name_check");
    expect(checks).toContain("estimate_quick_items_kind_check");
    const units = [...ESTIMATE_UNITS, "hour", "day", "week", "ea", "flat", "sq ft", "1,000 sq ft", "lin ft", "visit"];
    for (const [index, unit] of units.entries()) {
      await fixture.pool.query(`INSERT INTO estimate_service_categories(company_id,name,default_unit,default_umbrella_key)
        VALUES ('a',$1,$2,'landscape_labor')`, [`Category ${index}`, unit]);
      await fixture.pool.query(`INSERT INTO estimate_quick_items(company_id,kind,label,default_unit,umbrella_key)
        VALUES ('a','equipment',$1,$2,'landscape_labor')`, [`Item ${index}`, unit]);
    }
    await expect(fixture.pool.query(`INSERT INTO estimate_quick_items(company_id,kind,label,default_unit,umbrella_key)
      VALUES ('a','equipment','bad','pallet','landscape_labor')`)).rejects.toMatchObject({ code: "23514" });
    await expect(fixture.pool.query(`INSERT INTO estimate_service_categories(company_id,name,default_unit,default_umbrella_key)
      VALUES ('a','bad','pallet','landscape_labor')`)).rejects.toMatchObject({ code: "23514" });
    const defaults = (await fixture.pool.query(`SELECT table_name,column_default FROM information_schema.columns
      WHERE table_schema='public' AND (table_name='estimate_quick_items' AND column_name='default_unit'
      OR table_name IN ('hardscape_catalog_items','irrigation_catalog_items') AND column_name='unit')`)).rows;
    expect(defaults.find(r => r.table_name === "estimate_quick_items").column_default).toContain("'HR'");
    expect(defaults.filter(r => r.table_name !== "estimate_quick_items").every(r => r.column_default.includes("'EA'"))).toBe(true);
  });
  it("normalizes all catalogs including inactive rows and only owning-version drafts, reports unknowns and preserves frozen bytes/totals", async () => {
    await seed();
    const before = await contents();
    const report = await normalizeStoredEstimateUnits(database);
    expect(report?.changed).toEqual({
      estimate_quick_items: 2, estimate_service_categories: 1,
      hardscape_catalog_items: 2, irrigation_catalog_items: 1, estimate_lines: 2,
    });
    expect(report?.unknowns).toEqual([
      { source: "hardscape_catalog_items", unit: "pallet", count: 2 },
      { source: "irrigation_catalog_items", unit: "mystery", count: 1 },
      { source: "estimate_lines", unit: "unknown draft", count: 1 },
    ]);
    const after = await contents();
    for (let index = 0; index < after.length; index++) {
      const column = index < 2 ? "default_unit" : "unit";
      for (let row = 0; row < after[index].length; row++) {
        const old = before[index][row], next = after[index][row];
        const frozen = index === 4 && !old.version_id.startsWith("draft");
        expect(next).toEqual({ ...old, [column]: frozen ? old[column] : normalizeEstimateUnit(old[column]) ?? old[column] });
      }
    }
    expect(logs.info).toHaveBeenCalledWith(report, expect.stringContaining("complete"));
    const second = await normalizeStoredEstimateUnits(database);
    expect(Object.values(second!.changed)).toEqual([0, 0, 0, 0, 0]);
    expect(second!.unknowns).toEqual(report!.unknowns);
    expect(await contents()).toEqual(after);
  });
  it.each(ESTIMATE_UNIT_REQUIRED_COLUMNS)("skips clearly and does not write when required column %s is missing", async dependency => {
    await seed();
    const before = await contents();
    const [table, column] = dependency.split(".");
    await fixture.pool.query(`ALTER TABLE ${table} RENAME COLUMN ${column} TO saved_column`);
    try {
      expect(await normalizeStoredEstimateUnits(database)).toBeNull();
      expect(logs.warn).toHaveBeenCalledWith({ missing: [dependency] }, expect.stringContaining("skipped"));
      expect(logs.info).not.toHaveBeenCalled();
    } finally { await fixture.pool.query(`ALTER TABLE ${table} RENAME COLUMN saved_column TO ${column}`); }
    expect(await contents()).toEqual(before);
  });
  it.each([...tables, "estimate_versions"])("guards missing table %s without startup DDL", async table => {
    await fixture.pool.query(`ALTER TABLE ${table} RENAME TO saved_table`);
    try { expect(await normalizeStoredEstimateUnits(database)).toBeNull(); }
    finally { await fixture.pool.query(`ALTER TABLE saved_table RENAME TO ${table}`); }
  });
  it("rolls back earlier targets and propagates unrelated SQL failures", async () => {
    await seed();
    const before = await contents();
    await fixture.pool.query(`CREATE FUNCTION reject_unit_relabel() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'unit relabel failure'; END $$;
      CREATE TRIGGER reject_unit_relabel BEFORE UPDATE ON irrigation_catalog_items FOR EACH ROW EXECUTE FUNCTION reject_unit_relabel()`);
    try {
      await expect(normalizeStoredEstimateUnits(database)).rejects.toThrow();
      expect(await contents()).toEqual(before);
      expect(logs.info).not.toHaveBeenCalled();
    } finally { await fixture.pool.query("DROP TRIGGER reject_unit_relabel ON irrigation_catalog_items; DROP FUNCTION reject_unit_relabel()"); }
  });
  it("serializes two independent waiting transactions; the second reports zero changes", async () => {
    await seed();
    const holder = await fixture.pool.connect();
    let pending: ReturnType<typeof normalizeStoredEstimateUnits>[] = [];
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock($1)", [ESTIMATE_UNIT_BOOT_LOCK]);
      pending = [normalizeStoredEstimateUnits(database), normalizeStoredEstimateUnits(database)];
      const deadline = Date.now() + 10000;
      while (true) {
        const result = await holder.query(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory'
          AND NOT granted AND objid=$1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`, [ESTIMATE_UNIT_BOOT_LOCK]);
        if (result.rows[0].n === 2) break;
        if (Date.now() > deadline) throw new Error("Both independent transactions did not wait");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await holder.query("COMMIT");
      const reports = await Promise.all(pending);
      expect(reports.map(r => Object.values(r!.changed).reduce((a, b) => a + b, 0)).sort()).toEqual([0, 8]);
    } finally { await holder.query("ROLLBACK"); holder.release(); await Promise.allSettled(pending); }
  });
  it("is awaited in actual route registration, after category initialization", async () => {
    const routes = await readFile(new URL("../routes/routes.ts", import.meta.url), "utf8");
    expect(routes).toMatch(/await initializeEmptyServiceCategories\(\);\s*await normalizeStoredEstimateUnits\(\);/);
  });
  it("rechecks a newly created draft after waiting for a concurrent sender, preserving frozen bytes when send wins", async () => {
    const atLine = deferred<number>(), proceed = deferred<void>();
    const gated = lineGatedDatabase(async pid => { atLine.resolve(pid); await proceed.promise; });
    const running = normalizeStoredEstimateUnits(gated);
    const sender = await fixture.pool.connect();
    try {
      const bootPid = await atLine.promise;
      // This version did not exist when boot acquired its advisory lock or
      // processed catalogs. The sender changes status but has not committed.
      await fixture.pool.query(`INSERT INTO estimate_versions VALUES ('created-during-boot','a','draft');
        INSERT INTO estimate_lines VALUES ('new-line','a','created-during-boot',' visit ','custom','{"price":123,"total":246}');`);
      const before = (await fixture.pool.query("TABLE estimate_lines")).rows;
      await sender.query("BEGIN");
      await sender.query("UPDATE estimate_versions SET status='sent' WHERE id='created-during-boot'");
      proceed.resolve();
      await waitForDatabaseLock(bootPid);
      await sender.query("COMMIT");
      const report = await running;
      expect(report?.changed.estimate_lines).toBe(0);
      expect((await fixture.pool.query("TABLE estimate_lines")).rows).toEqual(before);
      expect((await fixture.pool.query("TABLE estimate_versions")).rows[0].status).toBe("sent");
    } finally {
      proceed.resolve();
      await sender.query("ROLLBACK"); sender.release();
      await running;
    }
  });
  it("locks a draft created during boot until relabel commits, so a waiting sender freezes the already-normalized line", async () => {
    const atLine = deferred<number>(), startLine = deferred<void>();
    const lineUpdated = deferred<void>(), finishBoot = deferred<void>();
    const gated = lineGatedDatabase(
      async pid => { atLine.resolve(pid); await startLine.promise; },
      async () => { lineUpdated.resolve(); await finishBoot.promise; },
    );
    const running = normalizeStoredEstimateUnits(gated);
    const sender = await fixture.pool.connect();
    let sending: Promise<unknown> | undefined;
    try {
      await atLine.promise;
      await fixture.pool.query(`INSERT INTO estimate_versions VALUES ('created-during-boot','b','draft');
        INSERT INTO estimate_lines VALUES ('new-line','b','created-during-boot','yd3','custom','{"price":999}');`);
      startLine.resolve();
      await lineUpdated.promise;
      await sender.query("BEGIN");
      const senderPid = (await sender.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      sending = sender.query("SELECT id FROM estimate_versions WHERE id='created-during-boot' FOR UPDATE");
      await waitForDatabaseLock(senderPid);
      finishBoot.resolve();
      expect((await running)?.changed.estimate_lines).toBe(1);
      await sending;
      const beforeSend = (await sender.query("TABLE estimate_lines")).rows;
      expect(beforeSend[0].unit).toBe("CU. YD");
      await sender.query("UPDATE estimate_versions SET status='sent' WHERE id='created-during-boot'");
      await sender.query("COMMIT");
      expect((await fixture.pool.query("TABLE estimate_lines")).rows).toEqual(beforeSend);
    } finally {
      startLine.resolve(); finishBoot.resolve();
      await running; await sending;
      await sender.query("ROLLBACK"); sender.release();
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

/** Pause real transactions at the line statement, without changing SQL/locks. */
function lineGatedDatabase(before: (pid: number) => Promise<void>, after?: () => Promise<void>) {
  const dialect = new PgDialect();
  return new Proxy(database!, {
    get(target, key) {
      if (key !== "transaction") return Reflect.get(target, key);
      return (work: (tx: unknown) => Promise<unknown>, config: unknown) => target.transaction(async tx => {
        const gatedTx = new Proxy(tx, {
          get(connection, property) {
            if (property !== "execute") {
              const value = Reflect.get(connection, property);
              return typeof value === "function" ? value.bind(connection) : value;
            }
            return async (query: Parameters<typeof tx.execute>[0]) => {
              const lineUpdate = dialect.sqlToQuery(query as Parameters<typeof dialect.sqlToQuery>[0]).sql
                .includes('UPDATE "public"."estimate_lines"');
              if (lineUpdate) {
                const result = await tx.execute(sql`SELECT pg_backend_pid() AS pid`);
                await before(Number(result.rows[0].pid));
              }
              const result = await tx.execute(query);
              if (lineUpdate) await after?.();
              return result;
            };
          },
        });
        return work(gatedTx);
      }, config as Parameters<typeof target.transaction>[1]);
    },
  }) as NonNullable<typeof database>;
}

async function waitForDatabaseLock(pid: number) {
  const deadline = Date.now() + 5000;
  while (true) {
    const result = await fixture.pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid]);
    if (result.rows[0]?.wait_event_type === "Lock") return;
    if (Date.now() > deadline) throw new Error(`Backend ${pid} did not wait on the competing transaction`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function seed() {
  await fixture.pool.query(`INSERT INTO estimate_quick_items(id,company_id,kind,label,default_unit,umbrella_key,is_active)
    VALUES ('q1','a','equipment','One','hour','landscape_labor',false),('q2','b','fee','Two','visit','fees_surcharges',true);
    INSERT INTO estimate_service_categories(id,company_id,name,default_unit,default_umbrella_key,is_active)
    VALUES ('cat','b','Inactive','1,000 sq ft','landscape_labor',false);
    INSERT INTO hardscape_catalog_items VALUES ('h1','a',' yd3 ',false),('h2','b','sqft',true),
      ('h3','a','pallet',true),('h4','b','pallet',false);
    INSERT INTO irrigation_catalog_items VALUES ('i1','b',' EACH ',false),('i2','a','mystery',true);
    INSERT INTO estimate_versions VALUES ('draft-a','a','draft'),('draft-b','b','draft'),
      ('sent','a','sent'),('accepted','a','accepted'),('declined','b','declined'),
      ('superseded','b','superseded'),('void','a','void'),('future-status','b','future-status');
    INSERT INTO estimate_lines
      SELECT id,company_id,id,' visit ','custom','{"price":123,"extended":246,"quantity":"2.00"}'::jsonb
      FROM estimate_versions;
    INSERT INTO estimate_lines VALUES ('unknown','a','draft-a','unknown draft','custom','{"price":456}');`);
}
