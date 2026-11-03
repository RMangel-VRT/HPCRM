import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import pg from "pg";

it("applies the billing migration twice safely and preserves non-default sync states", async () => {
  // TEMP table shadows public.customers; all DDL/DML stays on this connection and rolls back.
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE customers (id text PRIMARY KEY, qbo_customer_id text) ON COMMIT DROP");
    await client.query("INSERT INTO customers VALUES ('linked','qbo-1'), ('unlinked',null), ('pending','qbo-2'), ('error','qbo-3'), ('parent','qbo-4')");
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0067_customer_billing_fields.sql", import.meta.url), "utf8");
    await client.query(migration);
    expect((await client.query("SELECT qbo_sync_state, billing_emails, bill_to_mode, branch_billing_mode FROM customers WHERE id='linked'")).rows[0])
      .toEqual({ qbo_sync_state: "in_sync", billing_emails: [], bill_to_mode: "property", branch_billing_mode: "master" });
    await client.query("UPDATE customers SET qbo_sync_state = CASE id WHEN 'pending' THEN 'pending_push' WHEN 'error' THEN 'error' ELSE 'via_parent' END WHERE id IN ('pending','error','parent')");
    await client.query(migration);
    expect((await client.query("SELECT id, qbo_sync_state FROM customers ORDER BY id")).rows).toEqual([
      { id: "error", qbo_sync_state: "error" }, { id: "linked", qbo_sync_state: "in_sync" },
      { id: "parent", qbo_sync_state: "via_parent" }, { id: "pending", qbo_sync_state: "pending_push" },
      { id: "unlinked", qbo_sync_state: "not_linked" },
    ]);
    for (const [column, value] of [["bill_to_mode", "bad"], ["branch_billing_mode", "bad"], ["qbo_sync_state", "bad"], ["billing_emails", null]]) {
      await client.query("SAVEPOINT invalid_enum");
      await expect(client.query(`UPDATE customers SET ${column}=$1 WHERE id='linked'`, [value])).rejects.toBeDefined();
      await client.query("ROLLBACK TO SAVEPOINT invalid_enum");
    }
  } finally {
    await client.query("ROLLBACK");
    client.release(); await pool.end();
  }
});
