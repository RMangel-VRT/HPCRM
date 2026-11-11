/**
 * Dependency-order investigation against an isolated, schema-only test database.
 * Never reads DATABASE_URL, modifies application databases, or publishes.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import pg from "pg";

const socket = process.argv[2];
assert(socket?.startsWith("/tmp/") && socket.startsWith("/"), "An isolated /tmp Unix socket is required");
const config = { host: socket, port: 55439, user: userInfo().username, ssl: false };
const catalog = JSON.parse(readFileSync("generated-artifacts/publish-checks/production-catalog.json", "utf8"));
const diff = JSON.parse(readFileSync("generated-artifacts/publish-fk-order/before.json", "utf8"));
const verifyStageOne = process.argv[3] === "--stage-one";
assert(diff.success && diff.hasDiff);
const q = name => `"${name.replaceAll('"', '""')}"`;
const admin = new pg.Client({ ...config, database: "postgres" });
await admin.connect();
try {
  await admin.query("DROP DATABASE IF EXISTS publish_fk_order_test");
  await admin.query("CREATE DATABASE publish_fk_order_test");
} finally { await admin.end(); }
const db = new pg.Client({ ...config, database: "publish_fk_order_test" });
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
  for (const type of ["p", "u", "c", "f", "x"]) {
    for (const c of catalog.constraints.filter(c => c.type === type))
      await db.query(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  }
  for (const index of catalog.indexes || []) await db.query(index);
  const statements = diff.statementsToExecute;
  let failingStatement;
  let failure;
  await db.query("BEGIN");
  try {
    for (const statement of statements) {
      failingStatement = statement;
      await db.query(statement);
    }
    assert.fail("Original complete diff unexpectedly succeeded");
  } catch (error) {
    assert.equal(error.code, "42830");
    assert(failingStatement.includes('ADD CONSTRAINT "campaign_items_campaign_company_fk"'));
    failure = { code: error.code, message: error.message, statement: failingStatement };
  } finally { await db.query("ROLLBACK"); }
  console.log("PASS Reproduced the exact failure while replaying the complete actual Publish diff");
  const prerequisites = statements.filter(s =>
    /ADD CONSTRAINT "(campaigns_id_company_unique|campaign_items_id_company_unique)" UNIQUE/.test(s));
  assert.equal(prerequisites.length, 2);
  const corrected = [...prerequisites, ...statements.filter(s => !prerequisites.includes(s))];
  await db.query("BEGIN");
  try {
    for (const statement of corrected) await db.query(statement);
    const constraints = await db.query(`SELECT conname,convalidated FROM pg_constraint WHERE conname IN
      ('campaign_items_campaign_company_fk','visits_campaign_item_company_fk')`);
    assert.equal(constraints.rowCount, 2);
    assert(constraints.rows.every(c => c.convalidated));
    console.log(`PASS All ${corrected.length} statements succeed when the two prerequisite unique constraints are created first`);
    await db.query(`INSERT INTO companies(id,name,slug) VALUES
      ('fk-test-a','FK Test A','fk-test-a'),('fk-test-b','FK Test B','fk-test-b')`);
    await db.query(`INSERT INTO customers(id,company_id,name,street,city,state,zip)
      VALUES ('fk-test-customer','fk-test-a','Synthetic','','','','')`);
    await db.query(`INSERT INTO campaigns(id,company_id,title,window_start,window_end)
      VALUES ('fk-test-campaign','fk-test-a','Synthetic','2026-01-01','2026-12-31')`);
    await db.query(`INSERT INTO campaign_items(id,campaign_id,company_id,customer_id,customer_name)
      VALUES ('fk-test-item','fk-test-campaign','fk-test-a','fk-test-customer','Synthetic')`);
    await db.query(`INSERT INTO visits(company_id,visit_date,source_type,campaign_item_id)
      VALUES ('fk-test-a','2026-06-01','campaign_item','fk-test-item')`);
    const reject = async sql => {
      await db.query("SAVEPOINT wrong_company");
      await assert.rejects(() => db.query(sql), e => e.code === "23503");
      await db.query("ROLLBACK TO SAVEPOINT wrong_company");
    };
    await reject(`INSERT INTO campaign_items(campaign_id,company_id,customer_id,customer_name)
      VALUES ('fk-test-campaign','fk-test-b','fk-test-customer','Synthetic')`);
    await reject(`INSERT INTO visits(company_id,visit_date,source_type,campaign_item_id)
      VALUES ('fk-test-b','2026-06-01','campaign_item','fk-test-item')`);
    console.log("PASS Same-company inserts succeed; both cross-company relationships are rejected with all FK triggers active");
  } finally { await db.query("ROLLBACK"); }

  // A safe staged Publish would add uniqueness before adding the two new FKs.
  // Prove that sequence only locally; changing the development guards needs approval.
  const newFks = statements.filter(s => /ADD CONSTRAINT "(campaign_items_campaign_company_fk|visits_campaign_item_company_fk)"/.test(s));
  assert.equal(newFks.length, 2);
  const stageOne = statements.filter(s => !newFks.includes(s));
  await db.query("BEGIN");
  try {
    for (const statement of stageOne) await db.query(statement);
    for (const statement of newFks) await db.query(statement);
    console.log("PASS Two-stage sequence also succeeds without changing or deleting rows");
  } finally { await db.query("ROLLBACK"); }
  let actualStageOneStatements;
  if (verifyStageOne) {
    const stage = JSON.parse(readFileSync("generated-artifacts/publish-fk-order/stage-one.json", "utf8"));
    assert(stage.success && stage.hasDiff && !stage.hasStructuralDataLoss);
    assert(!stage.statementsToExecute.some(s =>
      /campaign_items_campaign_company_fk|visits_campaign_item_company_fk/.test(s)));
    actualStageOneStatements = stage.statementsToExecute.length;
    assert.equal(actualStageOneStatements, statements.length - 2);
    await db.query("BEGIN");
    try {
      for (const statement of stage.statementsToExecute) await db.query(statement);
      const keys = await db.query(`SELECT conname FROM pg_constraint WHERE conname IN
        ('campaigns_id_company_unique','campaign_items_id_company_unique') AND contype='u'`);
      assert.equal(keys.rowCount, 2);
      const oldGuards = await db.query(`SELECT conname FROM pg_constraint WHERE conname IN
        ('campaign_items_campaign_id_fkey','visits_campaign_item_id_campaign_items_id_fk') AND contype='f' AND convalidated`);
      assert.equal(oldGuards.rowCount, 2);
      console.log(`PASS All ${actualStageOneStatements} actual approved stage-one Publish statements execute in emitted order; prerequisite keys and old guards remain`);
    } finally { await db.query("ROLLBACK"); }
    // Separately check the real development migration against the complete schema.
    await db.query("BEGIN");
    try {
      for (const statement of corrected) await db.query(statement);
      // Migration contains its own transaction; strip boundaries only inside
      // this already-isolated test transaction so rollback remains possible.
      const removal = readFileSync(".migration-backup/migrations/0082_publish_company_key_stage_one.sql", "utf8")
        .replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
      await db.query(removal);
      await db.query(removal);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN
        ('campaign_items_campaign_company_fk','visits_campaign_item_company_fk')`)).rows[0].n, 0);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN
        ('campaigns_id_company_unique','campaign_items_id_company_unique')`)).rows[0].n, 2);
      console.log("PASS Approved development migration safely removes only the two new FKs and is idempotent");
    } finally { await db.query("ROLLBACK"); }
  }
  writeFileSync("generated-artifacts/publish-fk-order/results.json",
    JSON.stringify({ failure, fullDiffStatements: statements.length, correctedOrderPassed: true,
      sameCompanyAccepted: true, crossCompanyRejected: true, stagedSequencePassed: true,
      actualStageOneStatements, actualStageOnePassed: verifyStageOne }, null, 2) + "\n");
} finally { await db.end(); }
