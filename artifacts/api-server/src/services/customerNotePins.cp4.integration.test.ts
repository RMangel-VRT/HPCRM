import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, desc, getTableColumns, sql } from "drizzle-orm";
import { notes, users, insertNoteSchema } from "@workspace/db";
import pg from "pg";
import { describe, expect, it } from "vitest";

// Execute the actual storage methods against transaction-local TEMP tables.
// No application/customer data or startup services are changed by these tests.
const storageSource = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");
const start = storageSource.indexOf("  async getNotesByCustomerId(");
const end = storageSource.indexOf("  async getContractsByCustomerId(", start);
if (start < 0 || end < 0) throw new Error("Note storage methods not found");
const makeStorage = new Function("db", "notes", "users", "and", "eq", "desc", "sql", "getTableColumns",
  transformSync(`return new class { ${storageSource.slice(start, end)} }`, { loader: "ts", target: "es2022" }).code);

describe.skipIf(process.env.NODE_ENV === "production")("CP4 note migration and actual scoped storage", () => {
  it("migration is additive and repeatable; server pin preserves note facts and orders deterministically", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE TEMP TABLE notes (
        id text PRIMARY KEY, company_id text NOT NULL, customer_id text NOT NULL,
        body text NOT NULL, author_id text NOT NULL, created_at timestamp NOT NULL DEFAULT now()
      ) ON COMMIT DROP`);
      await client.query("CREATE TEMP TABLE users (id text PRIMARY KEY, name text) ON COMMIT DROP");
      await client.query("INSERT INTO users VALUES ('author','Original author'),('editor','Different editor')");
      await client.query(`INSERT INTO notes VALUES
        ('old','company','customer','Old shared text','author','2026-01-01'),
        ('new','company','customer','Newest shared text','author','2026-11-01'),
        ('tie-a','company','customer','Tie A','author','2026-10-01'),
        ('tie-b','company','customer','Tie B','author','2026-10-01'),
        ('foreign','other','customer','Private other company','author','2026-11-06')`);
      const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0071_customer_note_pins.sql", import.meta.url), "utf8");
      await client.query(migration); await client.query(migration);
      expect((await client.query("SELECT pinned_at FROM notes")).rows.every(r => r.pinned_at === null)).toBe(true);
      const storage = makeStorage(drizzle(client), notes, users, and, eq, desc, sql, getTableColumns);
      let rows = await storage.getNotesByCustomerId("customer", "company");
      expect(rows.map((r: any) => r.id)).toEqual(["new", "tie-b", "tie-a", "old"]);
      const before = rows.find((r: any) => r.id === "old");
      const instant = Date.now();
      const pinned = await storage.pinNote("old", "company", true);
      expect(pinned.pinnedAt.getTime()).toBeGreaterThanOrEqual(instant - 1000);
      expect({ ...pinned, pinnedAt: null }).toEqual({ ...before, authorName: undefined, pinnedAt: null });
      rows = await storage.getNotesByCustomerId("customer", "company");
      expect(rows[0]).toMatchObject({ id: "old", authorName: "Original author", body: "Old shared text" });
      expect(rows.some((r: any) => r.id === "foreign")).toBe(false);
      expect(await storage.pinNote("foreign", "company", true)).toBeUndefined();
      // Explicit pin instant ties resolve by creation then id, not DB scan order.
      await client.query("UPDATE notes SET pinned_at='2100-11-06' WHERE id IN ('tie-a','tie-b')");
      expect((await storage.getNotesByCustomerId("customer", "company")).slice(0, 2).map((r: any) => r.id))
        .toEqual(["tie-b", "tie-a"]);
      await storage.pinNote("old", "company", false);
      expect((await storage.getNotesByCustomerId("customer", "company")).at(-1).id).toBe("old");
      const edited = await storage.updateNote("old", "company", "Edited shared text");
      expect(edited).toMatchObject({ authorId: "author", createdAt: before.createdAt, pinnedAt: null });
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
  it("creation schema cannot accept a client-owned pin instant", () => {
    const parsed = insertNoteSchema.parse({ companyId: "company", customerId: "customer", body: "Note",
      authorId: "author", pinnedAt: new Date("2000-01-01") });
    expect(parsed).not.toHaveProperty("pinnedAt");
  });
});
