/**
 * Offline regression proof against a schema-only production catalog capture.
 * Never reads DATABASE_URL and cannot target an application database.
 *
 * node scripts/src/verify-publish-checks.mjs /absolute/local/socket output-dir
 * Requires an already-started throwaway PostgreSQL cluster on port 55439.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { userInfo } from "node:os";
import pg from "pg";

const [socket, outputArg] = process.argv.slice(2);
assert(socket && isAbsolute(socket) && socket.startsWith("/tmp/"), "Use an isolated /tmp Unix socket");
const output = resolve(outputArg || "generated-artifacts/publish-checks");
const catalog = JSON.parse(readFileSync(resolve(output, "production-catalog.json"), "utf8"));
const before = JSON.parse(readFileSync(resolve(output, "publish-before.json"), "utf8"));
const after = JSON.parse(readFileSync(resolve(output, "publish-after.json"), "utf8"));
assert(after.success && after.hasDiff, "A real Publish diff capture is required");
const client = new pg.Client({ host: socket, port: 55439, user: userInfo().username, database: "postgres", ssl: false });
const q = name => `"${name.replaceAll('"', '""')}"`;
const results = [];
const record = message => { results.push(message); process.stdout.write(`PASS ${message}\n`); };
const migration = readFileSync(".migration-backup/migrations/0080_publish_check_compatibility.sql", "utf8");

await client.connect();
try {
  // CREATE/DROP are restricted to this named, isolated test database.
  await client.query("DROP DATABASE IF EXISTS publish_checks_test");
  await client.query("CREATE DATABASE publish_checks_test");
} finally { await client.end(); }
const db = new pg.Client({ host: socket, port: 55439, user: userInfo().username, database: "publish_checks_test", ssl: false });
await db.connect();
try {
  await db.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  for (const e of catalog.enums || []) {
    await db.query(`CREATE TYPE ${q(e.name)} AS ENUM (${e.values.map(v => "'" + v.replaceAll("'", "''") + "'").join(",")})`);
  }
  for (const sequence of catalog.sequences || []) await db.query(`CREATE SEQUENCE ${q(sequence)}`);
  for (const table of catalog.tables) {
    const columns = table.columns.map(c => `${q(c.name)} ${c.type}${c.default ? ` DEFAULT ${c.default}` : ""}${c.notNull ? " NOT NULL" : ""}`);
    await db.query(`CREATE TABLE ${q(table.name)} (${columns.join(",")})`);
  }
  // All tables exist before FK creation; no production rows are copied.
  for (const type of ["p", "u", "c", "f", "x"]) {
    for (const c of catalog.constraints.filter(c => c.type === type))
      await db.query(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  }
  for (const index of catalog.indexes || []) await db.query(index);
  record(`Reconstructed ${catalog.tables.length} production tables and ${catalog.constraints.length} constraints without data`);

  const constraints = await db.query(`SELECT c.relname AS table_name, conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND con.contype='c' ORDER BY c.relname,conname`);
  assert.equal(constraints.rowCount, catalog.constraints.filter(c => c.type === "c").length);
  for (const c of constraints.rows) {
    const original = catalog.constraints.find(x => x.table === c.table_name && x.name === c.conname);
    assert.equal(c.definition, original.definition);
  }
  record("All reconstructed production CHECK definitions match the read-only capture exactly");
  const broken = before.statementsToExecute.find(s => s.startsWith('CREATE TABLE "service_programs"'));
  assert(broken && /CHECK\s*\(\s*CHECK\s*\(/i.test(broken));
  await assert.rejects(() => db.query(broken), e => e.code === "42601");
  record("Original Publish CREATE TABLE fails with PostgreSQL syntax error 42601");

  // Apply actual generated statements for affected tables, including their FKs
  // and indexes. Other pending feature migrations are intentionally not applied.
  const affected = after.statementsToExecute.filter(s =>
    /^(CREATE TABLE|ALTER TABLE|CREATE (?:UNIQUE )?INDEX)[\s\S]*?"(?:service_calendar|estimate_service_categories|estimate_quick_items|estimate_lines)"/.test(s)
  );
  assert(!affected.some(s => /CHECK\s*\(\s*CHECK\s*\(/i.test(s)));
  const calendarCreate = affected.find(s => s.startsWith('CREATE TABLE "service_calendar"'));
  assert(calendarCreate?.includes('CONSTRAINT "service_calendar_valid_check" CHECK ('));
  assert(!after.statementsToExecute.some(s => s.startsWith('CREATE TABLE "service_programs"')));
  assert(affected.some(s => s.includes('DROP CONSTRAINT "estimate_quick_items_kind_check"')));
  assert(affected.some(s => s.includes('DROP CONSTRAINT "estimate_lines_type_check"')));
  assert(affected.some(s => s.includes('ADD CONSTRAINT "estimate_quick_items_kind_v2_check"')));
  assert(affected.some(s => s.includes('ADD CONSTRAINT "estimate_lines_type_v2_check"')));
  for (const statement of affected) await db.query(statement);
  writeFileSync(resolve(output, "generated-affected.sql"), affected.join("\n\n") + "\n");
  record(`Applied ${affected.length} actual Publish statements for the four affected tables`);

  await db.query("BEGIN");
  try {
    // Only synthetic rows in the disposable clone; rollback also removes them.
    await db.query("ALTER TABLE estimate_quick_items DISABLE TRIGGER ALL");
    await db.query("ALTER TABLE estimate_lines DISABLE TRIGGER ALL");
    await db.query("ALTER TABLE estimate_service_categories DISABLE TRIGGER ALL");
    await db.query("ALTER TABLE service_calendar DISABLE TRIGGER ALL");
    await db.query(`INSERT INTO estimate_service_categories (id,company_id,name,default_umbrella_key,default_unit)
      VALUES ('publish-category','synthetic-company','Publish test','landscape_labor','hour')`);
    await db.query(`INSERT INTO estimate_quick_items (company_id,kind,label,service_category_id,default_unit,umbrella_key)
      VALUES ('synthetic-company','service','Service test','publish-category','visit','landscape_labor')`);
    record("Service quick item insert succeeds with all CHECK constraints active (FK triggers isolated)");
    await db.query(`INSERT INTO estimate_lines
      (company_id,version_id,section_id,line_type,price_source,name,unit,quantity,unit_price_cents,extended_cents,umbrella_key)
      VALUES ('synthetic-company','synthetic-version','synthetic-section','service','catalog','Service line','visit',1,100,100,'landscape_labor')`);
    record("Service estimate line insert succeeds with all CHECK constraints active");
    const reject = async (sql, params) => {
      await db.query("SAVEPOINT bad_input");
      await assert.rejects(() => db.query(sql, params), e => e.code === "23514");
      await db.query("ROLLBACK TO SAVEPOINT bad_input");
    };
    await reject("UPDATE estimate_quick_items SET kind='invalid'");
    await reject("UPDATE estimate_lines SET line_type='invalid'");
    const calendar = `INSERT INTO service_calendar
      (company_id,kind,service_key,position,name,opens_md,due_md)
      VALUES ('synthetic-company',$1,$2,$3,$4,$5,$6)`;
    await db.query(calendar, ["round","native_areas",1,"Spring native mow","04-01","05-31"]);
    await db.query(calendar, ["round","native_areas",2,"Fall native mow","09-01","10-31"]);
    await db.query(calendar, ["recurring","native_areas",1,"Beauty bands","04-01","10-31"]);
    for (const row of [
      ["checklist","native_areas",1,"Wrong kind","01-01","12-31"],
      ["round","mowing",1,"Wrong service","04-01","10-31"],
      ["round","aeration",1,"Bad date","02-29","04-30"],
      ["round","aeration",1,"Same date","04-01","04-01"],
      ["round","aeration",0,"Bad position","04-01","05-01"],
      ["round","aeration",1," Untrimmed ","04-01","05-01"],
    ]) await reject(calendar, row);
    record("Calendar accepts mixed native kinds with independent positions and rejects incompatible kinds, dates, names and positions");
  } finally { await db.query("ROLLBACK"); }

  // Historical program compatibility is tested separately, never recreated in
  // the shared database. SC1 has already retired it there.
  const foundation = readFileSync(".migration-backup/migrations/0074_campaign_service_timing.sql", "utf8");
  const programDdl = foundation.match(/CREATE TABLE IF NOT EXISTS service_programs[\s\S]*?\n\);/)?.[0];
  assert(programDdl);
  await db.query(programDdl);
  const oldPredicate = (await db.query(`SELECT pg_get_expr(conbin,conrelid) AS predicate FROM pg_constraint
    WHERE conrelid='service_programs'::regclass AND conname='service_programs_valid_check'`)).rows[0].predicate;
  await db.query(migration);
  const newPredicate = (await db.query(`SELECT pg_get_expr(conbin,conrelid) AS predicate FROM pg_constraint
    WHERE conrelid='service_programs'::regclass AND conname='service_programs_valid_check'`)).rows[0].predicate;
  const parity = await db.query(`SELECT count(*)::int AS mismatches FROM (
    SELECT keys.service_key, counts.rounds, spreads.month_spread FROM
      unnest(ARRAY['aeration','chemical','invalid',NULL]::text[]) keys(service_key)
      CROSS JOIN unnest(ARRAY[0,1,2,5,25,NULL]::smallint[]) counts(rounds)
      CROSS JOIN (VALUES
        (ARRAY[0,0,0,1,0,0,0,0,0,0,0,0]::smallint[]),
        (ARRAY[1]::smallint[]),(ARRAY[]::smallint[]),
        (ARRAY[NULL,0,0,1,0,0,0,0,0,0,0,0]::smallint[]),
        (ARRAY[0,0,0,2,-1,0,0,0,0,0,0,0]::smallint[]),
        (NULL::smallint[])) spreads(month_spread)
    ) samples WHERE (${oldPredicate}) IS DISTINCT FROM (${newPredicate})`);
  assert.equal(parity.rows[0].mismatches, 0);
  record("Legacy program predicate has identical true/false results for 144 combinations, including NULLs");
  await db.query("BEGIN");
  try {
    await db.query("ALTER TABLE service_programs DISABLE TRIGGER ALL");
    const reject = async (sql, params) => {
      await db.query("SAVEPOINT bad_program");
      await assert.rejects(() => db.query(sql, params), e => e.code === "23514");
      await db.query("ROLLBACK TO SAVEPOINT bad_program");
    };
    const program = `INSERT INTO service_programs(company_id,service_key,rounds,month_spread) VALUES ('synthetic-company',$1,$2,$3)`;
    await db.query(program, ["aeration", 1, [0,0,0,1,0,0,0,0,0,0,0,0]]);
    for (const row of [
      ["invalid", 1, [0,0,0,1,0,0,0,0,0,0,0,0]],
      ["aeration", 2, [0,0,0,1,0,0,0,0,0,0,0,0]],
      ["aeration", 1, [1]],
      ["aeration", 1, [null,0,0,1,0,0,0,0,0,0,0,0]],
      ["aeration", 5, [0,0,0,5,0,0,0,0,0,0,0,0]],
      ["aeration", 1, [0,0,0,2,-1,0,0,0,0,0,0,0]],
    ]) await reject(program, row);
    record("Legacy program check still rejects invalid keys, sums, shape, NULLs and bounds");
  } finally { await db.query("ROLLBACK"); }

  // Migration is independently idempotent after the generated Publish diff.
  await db.query(migration);
  await db.query(migration);
  record("Guarded migration runs twice without changing data or duplicating constraints");
  const calendarMigration = readFileSync(".migration-backup/migrations/0081_service_calendar_publish_check.sql", "utf8");
  await db.query(calendarMigration);
  await db.query(calendarMigration);
  record("Calendar compatibility migration runs twice without duplicating constraints");
  await db.query("DROP TABLE service_programs");
  await db.query(migration);
  assert.equal((await db.query("SELECT to_regclass('public.service_programs') AS t")).rows[0].t, null);
  record("Migration remains safe after SC1 retirement and never recreates service_programs");
  await db.query("DROP TABLE service_calendar");
  await db.query(calendarMigration);
  assert.equal((await db.query("SELECT to_regclass('public.service_calendar') AS t")).rows[0].t, null);
  record("Calendar migration safely skips an absent calendar and never creates feature tables");
  writeFileSync(resolve(output, "results.json"), JSON.stringify({ results, affectedStatements: affected.length }, null, 2) + "\n");
} finally {
  await db.end();
}
