/**
 * Local full-schema diff proof. Reads development schema ONLY via pg_dump;
 * all SQL execution is restricted to named databases on a disposable socket.
 * Does not publish, repair rows or connect to production.
 *
 * node scripts/src/verify-canonical-unit-checks.mjs /tmp/hp-canonical-units/socket [pre-tightening-schema.sql] [pre-slice-git-ref]
 * Start an isolated PostgreSQL 16 cluster on port 55447 first.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire, Module } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { userInfo } from "node:os";
import pg from "pg";

const kitRequire = createRequire(resolve("lib/db/package.json"));
const kitPath = kitRequire.resolve("drizzle-kit/api");
// Drizzle Kit has no public database-to-database API. Expose its installed,
// unmodified introspector in memory only, not a hand-written schema parser.
const kit = new Module(kitPath);
kit.filename = kitPath;
kit.paths = Module._nodeModulePaths(dirname(kitPath));
kit._compile(readFileSync(kitPath, "utf8") +
  "\nmodule.exports.introspectDatabase = pgPushIntrospect;\n", kitPath);
const { introspectDatabase, generateMigration } = kit.exports;
const socket = process.argv[2];
assert(socket?.startsWith("/tmp/") && socket.startsWith("/"), "Use an isolated /tmp Unix socket");
const output = resolve("generated-artifacts/canonical-unit-checks");
mkdirSync(output, { recursive: true });
const config = { host: socket, port: 55447, user: userInfo().username, ssl: false };
const migration = readFileSync(".migration-backup/migrations/0086_estimate_canonical_unit_checks.sql", "utf8");
const admin = new pg.Client({ ...config, database: "postgres" });
await admin.connect();
const names = ["canonical_units_before", "canonical_units_after", "canonical_units_replay"];
try {
  for (const name of names) {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name}`);
  }
} finally { await admin.end(); }

// Schema-only dump is test evidence, not a data backup. Never copy customer rows.
const dump = process.argv[3] ? readFileSync(resolve(process.argv[3]), "utf8")
  : execFileSync("pg_dump", ["--schema-only", "--no-owner", "--no-privileges",
    "--dbname", process.env.DATABASE_URL], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
writeFileSync(resolve(output, "development-schema-before.sql"), dump);
const clients = names.map(name => new pg.Client({ ...config, database: name }));
try {
  for (const client of clients) {
    await client.connect();
    // psql understands pg_dump's \restrict/\unrestrict meta-commands.
    execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55447",
      "-U", config.user, "-d", client.database], { input: dump, stdio: ["pipe", "pipe", "pipe"] });
  }
  const [before, after, replay] = clients;
  const query = client => ({ query: async (sql, params) => (await client.query(sql, params)).rows });
  const snapshot = async client => (await introspectDatabase(query(client), [], ["public"])).schema;
  const previous = await snapshot(before);
  // Require actual transitional checks in the database baseline.
  for (const table of ["estimate_quick_items", "estimate_service_categories"])
    assert(previous.tables[`public.${table}`].checkConstraints[`${table}_unit_v2_check`]);
  await after.query(migration);
  const next = await snapshot(after);
  const statements = await generateMigration(previous, next);
  writeFileSync(resolve(output, "database-diff-before.json"), JSON.stringify(previous, null, 2));
  writeFileSync(resolve(output, "database-diff-after.json"), JSON.stringify(next, null, 2));
  writeFileSync(resolve(output, "generated-complete.sql"), statements.join("\n\n") + "\n");
  // Inspect the COMPLETE diff. Installed Kit introspection can also produce
  // unrelated index/opclass churn; preserve and attempt that SQL separately.
  const sliceStatements = statements.filter(s => /estimate_(quick_items|service_categories).*unit_v[23]_check/.test(s));
  const unrelated = statements.filter(s => !sliceStatements.includes(s));
  assert.equal(sliceStatements.length, 4, JSON.stringify(statements));
  for (const table of ["estimate_quick_items", "estimate_service_categories"]) {
    assert.equal(statements.filter(s => s.includes(`ALTER TABLE "${table}" DROP CONSTRAINT "${table}_unit_v2_check"`)).length, 1);
    assert.equal(statements.filter(s => s.includes(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_unit_v3_check"`)).length, 1);
  }
  const fullExecutionErrors = [];
  await replay.query("BEGIN");
  for (const statement of statements) {
    await replay.query("SAVEPOINT emitted");
    try { await replay.query(statement); }
    catch (error) {
      fullExecutionErrors.push({ statement, code: error.code, message: error.message });
      await replay.query("ROLLBACK TO SAVEPOINT emitted");
    }
  }
  await replay.query("ROLLBACK");
  for (const statement of sliceStatements) await replay.query(statement);
  const catalog = async client => {
    const result = {};
    for (const [name, sql] of Object.entries({
      columns: `SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
        FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
      indexes: `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`,
      constraints: `SELECT conrelid::regclass::text AS source,conname,pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY source,conname`,
    })) result[name] = (await client.query(sql)).rows;
    return result;
  };
  const beforeCatalog = await catalog(before), afterCatalog = await catalog(after), replayCatalog = await catalog(replay);
  assert.deepEqual(replayCatalog, afterCatalog, "Generated slice SQL must reproduce the migration's complete catalog");
  assert.deepEqual(beforeCatalog.columns, afterCatalog.columns);
  assert.deepEqual(beforeCatalog.indexes, afterCatalog.indexes);
  assert.deepEqual(
    beforeCatalog.constraints.filter(c => !/_unit_v2_check$/.test(c.conname)),
    afterCatalog.constraints.filter(c => !/_unit_v3_check$/.test(c.conname)));
  writeFileSync(resolve(output, "catalog-verification.json"), JSON.stringify({ before: beforeCatalog, after: afterCatalog }, null, 2));
  console.log(`PASS Complete generated diff inspected (${statements.length} statements); all attempted in disposable PostgreSQL; four slice statements replay exactly`);

  // Compare the COMPLETE source declarations at HEAD with this slice. Keep this
  // separate from database-to-database evidence: SQL expression formatting is
  // not comparable between ORM snapshots and catalog introspection.
  const baselineRef = process.argv[4] || "HEAD";
  const oldSetup = execFileSync("git", ["show", `${baselineRef}:lib/db/src/schema/estimateSetup.ts`], { encoding: "utf8" })
    .replace('from "./schema"', 'from "../../lib/db/src/schema/schema"')
    .replaceAll('from "../estimateUnits"', 'from "../../lib/db/src/estimateUnits"');
  assert(oldSetup.includes('check("estimate_quick_items_unit_v2_check"'),
    "Source baseline must precede this slice; pass a pre-slice Git ref as the fourth argument");
  writeFileSync(resolve(output, "estimateSetup-before.ts"), oldSetup);
  // A child tsx process imports existing TS without a second Drizzle config.
  const sourceProbe = resolve(output, "source-diff-probe.ts");
  writeFileSync(sourceProbe, `
    import { createRequire } from 'node:module';
    import { writeFileSync } from 'node:fs';
    import * as exports from '../../lib/db/src/schema/index';
    import { estimateQuickItems, estimateServiceCategories } from './estimateSetup-before';
    // Compatibility aliases export the SAME table object twice. The installed
    // Kit API doesn't deduplicate these; remove identical references only for
    // this diagnostic probe, without editing the application's schema/config.
    const seen = new Set();
    const schema = Object.fromEntries(Object.entries(exports).filter(([, value]) => {
      if (seen.has(value)) return false;
      seen.add(value); return true;
    }));
    const require = createRequire(new URL('../../lib/db/package.json', import.meta.url));
    const { generateDrizzleJson } = require('drizzle-kit/api');
    writeFileSync(${JSON.stringify(resolve(output, "source-snapshots.json"))}, JSON.stringify([
      generateDrizzleJson({ ...schema, estimateQuickItems, estimateServiceCategories }),
      generateDrizzleJson(schema)
    ], null, 2));
  `);
  execFileSync("pnpm", ["--filter", "@workspace/scripts", "exec", "tsx", sourceProbe], { stdio: "inherit" });
  const [sourceBefore, sourceAfter] = JSON.parse(readFileSync(resolve(output, "source-snapshots.json"), "utf8"));
  const sourceStatements = await generateMigration(sourceBefore, sourceAfter);
  writeFileSync(resolve(output, "generated-complete-source.sql"), sourceStatements.join("\n\n") + "\n");
  assert.equal(sourceStatements.length, 4, JSON.stringify(sourceStatements));
  for (const statement of sourceStatements) assert(/estimate_(quick_items|service_categories).*unit_v[23]_check/.test(statement), statement);
  // Execute every source-generated statement too, on the unmodified before DB.
  await before.query("BEGIN");
  try { for (const statement of sourceStatements) await before.query(statement); }
  finally { await before.query("ROLLBACK"); }
  const results = {
    completeDatabaseDiffStatements: statements.length,
    sliceStatements,
    unrelatedGeneratedStatements: unrelated,
    fullExecutionErrors,
    everyEmittedStatementAttempted: true,
    sliceSQLExactlyMatchesMigrationCatalog: true,
    completeSourceDiffStatements: sourceStatements.length,
    allSourceStatementsExecuted: true,
    livePublishPreview: "Unavailable: explainSchemaDiff is not exposed in the assigned-task environment",
  };
  writeFileSync(resolve(output, "results.json"), JSON.stringify(results, null, 2));
  console.log("PASS Complete source diff: four slice statements only; every source-generated statement executed successfully");
} finally {
  for (const client of clients) await client.end();
}
