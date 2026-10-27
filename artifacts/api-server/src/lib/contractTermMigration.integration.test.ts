import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../db";
const enabled = process.env.CONTRACT_RENEWAL_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("0050 isolated migration fixture", () => {
  afterAll(async () => { await pool.end(); });
  it("backfills, enforces defaults/constraints and preserves partially populated seasons on repeat", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Temporary tables shadow public tables, so this test never edits customer data.
      await client.query(`CREATE TEMP TABLE agreements (id text PRIMARY KEY, line text NOT NULL, form text NOT NULL DEFAULT 'ours') ON COMMIT DROP;
        CREATE TEMP TABLE agreement_terms (id text PRIMARY KEY, agreement_id text, line text, form text) ON COMMIT DROP;
        INSERT INTO agreements VALUES ('a', 'landscape', 'theirs');
        INSERT INTO agreement_terms VALUES ('empty','a',NULL,NULL), ('partial','a','both',NULL), ('seasonal','a','snow','ours')`);
      const migration = await readFile(new URL("../../../../.migration-backup/migrations/0050_term_line_form.sql", import.meta.url), "utf8");
      await client.query(migration);
      expect((await client.query("SELECT id,line,form FROM agreement_terms ORDER BY id")).rows).toEqual([
        { id: "empty", line: "landscape", form: "theirs" }, { id: "partial", line: "both", form: "theirs" }, { id: "seasonal", line: "snow", form: "ours" },
      ]);
      await client.query("UPDATE agreements SET line=NULL,form=NULL");
      await client.query(migration);
      await client.query("INSERT INTO agreement_terms(id,agreement_id,line) VALUES ('new','a','landscape')");
      expect((await client.query("SELECT form FROM agreement_terms WHERE id='new'")).rows[0].form).toBe("ours");
      await client.query("SAVEPOINT invalid");
      await expect(client.query("INSERT INTO agreement_terms(id) VALUES ('bad')")).rejects.toMatchObject({ code: "23502" });
      await client.query("ROLLBACK TO SAVEPOINT invalid");
      expect((await client.query("SELECT line FROM agreement_terms WHERE id='seasonal'")).rows[0].line).toBe("snow");
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
});
