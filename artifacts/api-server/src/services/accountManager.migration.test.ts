import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { insertCustomerSchema, insertCompanyUserSchema } from "@workspace/db";
import pg from "pg";
describe("additive account-manager schema contract", () => {
  it("applies twice without changing existing rows and enforces ON DELETE SET NULL", async () => {
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0069_customer_account_manager.sql", import.meta.url), "utf8");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TEMP TABLE users (id varchar PRIMARY KEY) ON COMMIT DROP");
      await client.query("CREATE TEMP TABLE customers (id varchar PRIMARY KEY, company_id varchar NOT NULL) ON COMMIT DROP");
      await client.query("INSERT INTO customers VALUES ('existing','co')");
      await client.query(migration); await client.query(migration);
      expect((await client.query("SELECT account_manager_id FROM customers WHERE id='existing'")).rows).toEqual([{ account_manager_id: null }]);
      await client.query("INSERT INTO users VALUES ('synthetic')");
      await client.query("UPDATE customers SET account_manager_id='synthetic'");
      await client.query("DELETE FROM users WHERE id='synthetic'");
      expect((await client.query("SELECT account_manager_id FROM customers WHERE id='existing'")).rows).toEqual([{ account_manager_id: null }]);
      const indexes = await client.query("SELECT indexdef FROM pg_indexes WHERE tablename='customers' AND schemaname LIKE 'pg_temp_%'");
      expect(indexes.rows.some(r => /\(company_id, account_manager_id\)/.test(r.indexdef))).toBe(true);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
  it("keeps the nullable user foreign key, scoped index and guards without inferred assignments", () => {
    const sql = readFileSync(new URL("../../../../.migration-backup/migrations/0069_customer_account_manager.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS account_manager_id varchar[\s\S]*REFERENCES users\(id\) ON DELETE SET NULL/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS[\s\S]*ON customers\s*\(company_id,\s*account_manager_id\)/i);
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE FROM|DROP|SET NOT NULL)\b/i);
    const empty = insertCustomerSchema.partial().parse({});
    expect(empty).not.toHaveProperty("accountManagerId");
    expect(insertCustomerSchema.partial().parse({ accountManagerId: null }).accountManagerId).toBeNull();
    expect(insertCustomerSchema.partial().parse({ accountManagerId: "synthetic" }).accountManagerId).toBe("synthetic");
    expect(insertCompanyUserSchema.parse({ companyId: "co", userId: "synthetic", role: "account_manager" }).role).toBe("account_manager");
  });
});
