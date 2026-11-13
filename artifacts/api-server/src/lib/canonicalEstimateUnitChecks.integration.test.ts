import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool as schemaPool } from "@workspace/db";
import { pool as appPool } from "../db";
import { disposableDatabase } from "../test/disposableDatabase";
import { ESTIMATE_UNITS, ESTIMATE_UNIT_ALIASES } from "../../../../lib/db/src/estimateUnits";
import { normalizeStoredEstimateUnits } from "./normalizeEstimateUnits";

const file = (name: string) => readFile(new URL(`../../../../.migration-backup/migrations/${name}`, import.meta.url), "utf8");
const tables = ["estimate_quick_items", "estimate_service_categories"] as const;
let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
let migration: string;
const checks = async () => (await fixture.pool.query(`SELECT conrelid::regclass::text AS source,
  conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE connamespace='public'::regnamespace ORDER BY source,conname`)).rows;
const rows = async () => Promise.all(tables.map(async table =>
  (await fixture.pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
async function insert(table: typeof tables[number], unit: string, id = "test", company = "a", active = true) {
  return table === "estimate_quick_items"
    ? fixture.pool.query(`INSERT INTO estimate_quick_items(id,company_id,kind,label,default_unit,umbrella_key,is_active)
        VALUES ($1::varchar,$2,'equipment',$1::varchar,$3,'landscape_labor',$4)`, [id, company, unit, active])
    : fixture.pool.query(`INSERT INTO estimate_service_categories(id,company_id,name,default_unit,default_umbrella_key,is_active)
        VALUES ($1::varchar,$2,$1::varchar,$3,'landscape_labor',$4)`, [id, company, unit, active]);
}
async function refuse() {
  // An explicit transaction in the SQL file stays aborted on failure; always
  // rollback on the SAME connection, never return an aborted session to a pool.
  const client = await fixture.pool.connect();
  try { await client.query(migration); throw new Error("Expected preflight refusal"); }
  catch (error) { return error as { code: string; message: string; detail: string; hint: string }; }
  finally { await client.query("ROLLBACK"); client.release(); }
}

describe("canonical-only setup CHECKs from immutable historical SQL", () => {
  beforeAll(async () => { fixture = await disposableDatabase(); migration = await file("0086_estimate_canonical_unit_checks.sql"); });
  beforeEach(async () => {
    await fixture.pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
      CREATE TABLE companies(id varchar PRIMARY KEY);
      CREATE TABLE estimate_lines(id text PRIMARY KEY,company_id text,version_id text,unit text,line_type text,payload jsonb);
      CREATE TABLE estimate_versions(id text PRIMARY KEY,company_id text,status text);
      CREATE TABLE hardscape_catalog_items(id text PRIMARY KEY,company_id text,unit text DEFAULT 'ea');
      CREATE TABLE irrigation_catalog_items(id text PRIMARY KEY,company_id text,unit text DEFAULT 'ea');`);
    // No company rows during historical seed DML: this suite seeds explicitly.
    for (const name of ["0053_estimate_setup.sql", "0078_estimate_services.sql",
      "0079_estimate_service_legacy_unit_check.sql", "0080_publish_check_compatibility.sql", "0085_estimate_units.sql"])
      await fixture.pool.query(await file(name));
    await fixture.pool.query("INSERT INTO companies VALUES ('a'),('b')");
    for (const table of tables) {
      expect((await checks()).some(c => c.conname === `${table}_unit_v2_check`)).toBe(true);
      await insert(table, "EA", `${table}-existing`, "b", false);
    }
  });
  afterAll(async () => { await fixture?.dispose(); await Promise.all([schemaPool.end(), appPool.end()]); });

  it("accepts all 14 units in both tables, retains data/defaults/unrelated schema and repeats safely", async () => {
    const beforeRows = await rows(), beforeChecks = await checks();
    const metadata = async () => (await fixture.pool.query(`SELECT table_name,column_name,column_default,is_nullable,data_type
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
    const beforeColumns = await metadata();
    await fixture.pool.query(migration);
    await fixture.pool.query(migration);
    expect(await rows()).toEqual(beforeRows);
    expect(await metadata()).toEqual(beforeColumns);
    expect((await checks()).filter(c => !/_unit_v3_check$/.test(c.conname)))
      .toEqual(beforeChecks.filter(c => !/_unit_v2_check$/.test(c.conname)));
    for (const table of tables) {
      expect((await checks()).filter(c => c.conname === `${table}_unit_v3_check`)).toHaveLength(1);
      for (const [index, unit] of ESTIMATE_UNITS.entries()) await insert(table, unit, `unit-${index}`);
    }
  });
  it("rejects every noncanonical alias spelling and case/whitespace variants on INSERT and UPDATE", async () => {
    await fixture.pool.query(migration);
    const aliases = new Set([...Object.keys(ESTIMATE_UNIT_ALIASES),
      ...ESTIMATE_UNITS.map(u => u.toLowerCase()), ...ESTIMATE_UNITS.map(u => ` ${u} `),
      ...Object.keys(ESTIMATE_UNIT_ALIASES).map(u => u.toUpperCase()), "pallet", "", "case"]);
    const noncanonical = [...aliases].filter(unit => !ESTIMATE_UNITS.includes(unit as typeof ESTIMATE_UNITS[number]));
    // Execute independent error-catching subtransactions on the server, avoiding
    // hundreds of round trips to a hosted disposable database. CHECKs stay real.
    await fixture.pool.query(`CREATE FUNCTION assert_unit_refused(target text, unit text) RETURNS integer LANGUAGE plpgsql AS $$
      DECLARE actual_constraint text;
      BEGIN
        BEGIN
          IF target='estimate_quick_items' THEN
            INSERT INTO estimate_quick_items(company_id,kind,label,default_unit,umbrella_key)
              VALUES ('a','equipment','bad',unit,'landscape_labor');
          ELSE
            INSERT INTO estimate_service_categories(company_id,name,default_unit,default_umbrella_key)
              VALUES ('a','bad',unit,'landscape_labor');
          END IF;
          RAISE EXCEPTION 'Unexpectedly accepted INSERT into %: %',target,unit;
        EXCEPTION WHEN check_violation THEN
          GET STACKED DIAGNOSTICS actual_constraint = CONSTRAINT_NAME;
          IF actual_constraint <> target || '_unit_v3_check' THEN RAISE EXCEPTION 'Wrong check: %',actual_constraint; END IF;
        END;
        BEGIN
          EXECUTE format('UPDATE %I SET default_unit=$1',target) USING unit;
          RAISE EXCEPTION 'Unexpectedly accepted UPDATE into %: %',target,unit;
        EXCEPTION WHEN check_violation THEN
          GET STACKED DIAGNOSTICS actual_constraint = CONSTRAINT_NAME;
          IF actual_constraint <> target || '_unit_v3_check' THEN RAISE EXCEPTION 'Wrong check: %',actual_constraint; END IF;
        END;
        RETURN 1;
      END $$`);
    const result = await fixture.pool.query(`SELECT sum(assert_unit_refused(target,unit))::integer AS refused
      FROM unnest($1::text[]) t(target) CROSS JOIN unnest($2::text[]) u(unit)`, [tables, noncanonical]);
    expect(result.rows[0].refused).toBe(tables.length * noncanonical.length);
  }, 30000);
  it.each(tables)("refuses inactive cross-company legacy data in %s, preserving both tables and checks", async table => {
    await insert(table, "hour", "legacy-inactive", "b", false);
    const beforeRows = await rows(), beforeChecks = await checks();
    const error = await refuse();
    expect(error.code).toBe("23514");
    expect(error.message).toContain("preflight failed");
    expect(JSON.parse(error.detail)[`public.${table}`]).toEqual([{
      id: "legacy-inactive", company_id: "b", label: table === tables[0] ? "legacy-inactive" : null,
      name: table === tables[1] ? "legacy-inactive" : null, default_unit: "hour",
    }]);
    expect(error.hint).toContain("authorized");
    expect(await rows()).toEqual(beforeRows);
    expect(await checks()).toEqual(beforeChecks);
  });
  it("reports offenders from BOTH tables before changing either check", async () => {
    await insert(tables[0], "visit", "old-quick", "a");
    await insert(tables[1], "sq ft", "old-category", "b", false);
    const before = await checks(), beforeRows = await rows();
    const error = await refuse();
    expect(Object.keys(JSON.parse(error.detail))).toEqual([...tables].map(t => `public.${t}`));
    expect(await checks()).toEqual(before);
    expect(await rows()).toEqual(beforeRows);
  });
  it.each(tables)("skips absent table %s while tightening the other table", async table => {
    await fixture.pool.query(`DROP TABLE ${table} CASCADE`);
    await fixture.pool.query(migration);
    await fixture.pool.query(migration);
    expect((await fixture.pool.query("SELECT to_regclass($1) AS t", [`public.${table}`])).rows[0].t).toBeNull();
    const other = tables.find(t => t !== table)!;
    await expect(insert(other, "hour")).rejects.toMatchObject({ code: "23514" });
  });
  it.each(tables)("skips absent default_unit on %s without recreating it", async table => {
    await fixture.pool.query(`ALTER TABLE ${table} DROP COLUMN default_unit`);
    await fixture.pool.query(migration);
    await fixture.pool.query(migration);
    expect((await fixture.pool.query(`SELECT 1 FROM information_schema.columns
      WHERE table_name=$1 AND column_name='default_unit'`, [table])).rowCount).toBe(0);
    await expect(insert(tables.find(t => t !== table)!, "hour")).rejects.toMatchObject({ code: "23514" });
  });
  it("safely skips when both tables are absent", async () => {
    await fixture.pool.query("DROP TABLE estimate_quick_items,estimate_service_categories CASCADE");
    await fixture.pool.query(migration);
    expect((await fixture.pool.query(`SELECT tablename FROM pg_tables
      WHERE schemaname='public' AND tablename IN ('estimate_quick_items','estimate_service_categories')`)).rowCount).toBe(0);
  });
  it("allows the retained startup relabel before tightening, and is a byte-preserving startup no-op afterward", async () => {
    await insert(tables[0], "visit", "legacy-q", "b", false);
    await insert(tables[1], "1,000 sq ft", "legacy-c", "a", false);
    await fixture.pool.query(`INSERT INTO estimate_versions VALUES ('frozen','a','sent');
      INSERT INTO estimate_lines VALUES ('frozen','a','frozen',' visit ','custom','{"total":123}')`);
    const database = drizzle(fixture.pool) as Parameters<typeof normalizeStoredEstimateUnits>[0];
    expect((await refuse()).code).toBe("23514");
    const first = await normalizeStoredEstimateUnits(database);
    expect(first?.changed.estimate_quick_items).toBe(1);
    expect(first?.changed.estimate_service_categories).toBe(1);
    const before = await rows();
    await fixture.pool.query(migration);
    expect(Object.values((await normalizeStoredEstimateUnits(database))!.changed)).toEqual([0, 0, 0, 0, 0]);
    expect(await rows()).toEqual(before);
    expect((await fixture.pool.query("TABLE estimate_lines")).rows[0]).toMatchObject({ unit: " visit ", payload: { total: 123 } });
  });
  it("waits for an in-flight legacy write then refuses it; holds both table locks until commit", async () => {
    const writer = await fixture.pool.connect(), migrator = await fixture.pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query(`UPDATE estimate_service_categories SET default_unit='hour'`);
      const pid = (await migrator.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = migrator.query(migration).catch(error => error);
      await waitForLock(pid);
      await writer.query("COMMIT");
      expect(await pending).toMatchObject({ code: "23514" });
      await migrator.query("ROLLBACK");
      // Test-only correction in a disposable fixture, never application data.
      await writer.query("UPDATE estimate_service_categories SET default_unit='EA'");
      await migrator.query(migration.replace(/COMMIT;\s*$/, ""));
      const held = (await migrator.query(`SELECT relation::regclass::text AS t FROM pg_locks
        WHERE pid=pg_backend_pid() AND mode='AccessExclusiveLock' AND granted`)).rows.map(r => r.t);
      expect(held).toEqual(expect.arrayContaining([...tables]));
      const writerPid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = writer.query(`UPDATE estimate_quick_items SET default_unit='visit'`).catch(error => error);
      await waitForLock(writerPid);
      await migrator.query("COMMIT");
      expect(await pending).toMatchObject({ code: "23514", constraint: "estimate_quick_items_unit_v3_check" });
    } finally {
      await migrator.query("ROLLBACK"); await writer.query("ROLLBACK");
      await pending; writer.release(); migrator.release();
    }
  });
});

async function waitForLock(pid: number) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if ((await fixture.pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.wait_event_type === "Lock") return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Expected backend to wait for a real PostgreSQL lock");
}
