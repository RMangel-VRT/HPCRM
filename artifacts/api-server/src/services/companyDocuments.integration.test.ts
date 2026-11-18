import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { expect, it, vi } from "vitest";
import { companyDocuments, companyDocumentFiles, companies } from "@workspace/db";
import { db, inTransaction } from "../db";
import { companyDocumentRepository as repo } from "./companyDocuments";

it("replays additive DDL twice with its circular FK after both tables exist", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }), client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schema = `cd_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}, public`);
    await client.query("CREATE TABLE companies(id varchar PRIMARY KEY); CREATE TABLE users(id varchar PRIMARY KEY)");
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0088_company_documents.sql", import.meta.url), "utf8");
    await client.query(migration); await client.query(migration);
    await client.query("INSERT INTO companies VALUES ('co'); INSERT INTO company_documents(id,company_id,name,category) VALUES ('doc','co','License','licenses')");
    await client.query("INSERT INTO company_document_files(id,company_id,document_id,file_name,file_path) VALUES ('f','co','doc','license.pdf','private')");
    await client.query("UPDATE company_documents SET current_file_id='f'");
    expect((await client.query("SELECT pinned, visibility FROM company_documents")).rows).toEqual([{ pinned: false, visibility: "office" }]);
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
});
it("actual repository retains versions, scopes writes, rejects role collisions and writes only the number", async () => {
  const rollback = new Error("rollback fixture");
  await expect(db.transaction(async tx => {
    for (const table of ["companies", "users", "company_documents", "company_document_files"])
      await tx.execute(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
    await inTransaction(tx, async () => {
      await tx.insert(companies).values({ id: "co", name: "Fixture", slug: "fixture", phone: "unchanged" });
      const build = vi.fn(async () => ({ fileName: "a.pdf", filePath: "/objects/private", fileType: "pdf", mimeType: "application/pdf", fileSize: 30 }));
      await repo.finalize("co", "doc", "f1", "u", { name: "License", category: "licenses", role: "pesticide_license", expiresOn: "2026-12-31" }, false, build);
      await repo.finalize("co", "doc", "f1", "u", { name: "ignored" }, false, build);
      await repo.finalize("co", "doc", "f2", "u", { expiresOn: "2027-12-31" }, true, build);
      expect(build).toHaveBeenCalledTimes(2);
      expect(await repo.history("co", "doc")).toHaveLength(2);
      expect(await repo.get("co", "doc")).toMatchObject({ currentFileId: "f2", expiresOn: "2027-12-31" });
      await expect(repo.get("other", "doc")).rejects.toMatchObject({ status: 404 });
      await expect(repo.get("co", "doc", false)).rejects.toMatchObject({ status: 404 });
      await expect(repo.file("other", "doc", "f1")).rejects.toMatchObject({ status: 404 });
      await expect(repo.patch("other", "doc", "u", { name: "attack" })).rejects.toMatchObject({ status: 404 });
      await expect(repo.finalize("co", "second", "f3", "u", { name: "Second", category: "licenses", role: "pesticide_license" }, false, build))
        .rejects.toMatchObject({ cause: { code: "23505" } });
      await repo.license("co", "123");
      expect(await tx.select().from(companies)).toMatchObject([{ name: "Fixture", phone: "unchanged", pesticideLicenseNumber: "123" }]);
      await repo.patch("co", "doc", "u", { archivedAt: new Date() });
      expect(await repo.list("co", true)).toMatchObject({ documents: [], license: { number: "123", documentId: null } });
      expect(await tx.select().from(companyDocumentFiles)).toHaveLength(2);
      expect(await tx.select().from(companyDocuments)).toHaveLength(1);
    });
    throw rollback;
  })).rejects.toBe(rollback);
});
