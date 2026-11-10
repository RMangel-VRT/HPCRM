import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { customerDocuments, users, customers, termDocuments } from "@workspace/db";
import { db, inTransaction } from "../db";
import { customerDocumentRepository as repo } from "./customerDocuments";
import { ObjectStorageService } from "../objectStorage";

describe.skipIf(process.env.NODE_ENV === "production")("CP5 preservation and actual SQL lifecycle", () => {
  it("preserves nonempty identities, OID, paths and references; reruns and partial migration guards are safe", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }), client = await pool.connect();
    const schema = `cp5_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`CREATE TABLE ${schema}.users (id varchar PRIMARY KEY)`);
      await client.query(`CREATE TABLE ${schema}.customer_map_documents (
        id varchar PRIMARY KEY, company_id varchar NOT NULL, customer_id varchar NOT NULL,
        name text NOT NULL, file_path text NOT NULL, file_type text NOT NULL DEFAULT 'pdf',
        file_size integer, created_at timestamp NOT NULL DEFAULT now())`);
      await client.query(`CREATE TABLE ${schema}.document_reference (document_id varchar REFERENCES ${schema}.customer_map_documents(id))`);
      await client.query(`INSERT INTO ${schema}.customer_map_documents VALUES
        ('pdf','co','property','Preserved PDF','/bucket/.private/map-documents/co/property/map.pdf','pdf',123,'2026-01-02'),
        ('unknown','co','parent','Preserved unknown','/objects/map-documents/co/parent/unknown','image',NULL,'2026-02-03')`);
      await client.query(`INSERT INTO ${schema}.document_reference VALUES ('pdf')`);
      const oid = (await client.query(`SELECT '${schema}.customer_map_documents'::regclass::oid AS oid`)).rows[0].oid;
      const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0073_customer_documents.sql", import.meta.url), "utf8")
        .replaceAll("public.", `${schema}.`);
      await client.query(migration);
      const once = (await client.query(`SELECT * FROM ${schema}.customer_documents ORDER BY id`)).rows;
      await client.query(migration);
      expect((await client.query(`SELECT * FROM ${schema}.customer_documents ORDER BY id`)).rows).toEqual(once);
      expect((await client.query(`SELECT '${schema}.customer_documents'::regclass::oid AS oid`)).rows[0].oid).toBe(oid);
      expect(once[0]).toMatchObject({ id: "pdf", name: "Preserved PDF", file_path: "/bucket/.private/map-documents/co/property/map.pdf",
        category: "map", mime_type: "application/pdf", file_size: 123, uploaded_by: null });
      expect(once[1]).toMatchObject({ id: "unknown", category: "map", mime_type: null, file_size: null });
      expect((await client.query(`SELECT d.id FROM ${schema}.document_reference r JOIN ${schema}.customer_documents d ON d.id=r.document_id`)).rows).toEqual([{ id: "pdf" }]);
      await client.query(`INSERT INTO ${schema}.users VALUES ('uploader')`);
      await client.query(`UPDATE ${schema}.customer_documents SET uploaded_by='uploader' WHERE id='pdf'`);
      await client.query(`DELETE FROM ${schema}.users WHERE id='uploader'`);
      expect((await client.query(`SELECT uploaded_by FROM ${schema}.customer_documents WHERE id='pdf'`)).rows[0].uploaded_by).toBeNull();
      await client.query("SAVEPOINT invalid_note");
      await expect(client.query(`UPDATE ${schema}.customer_documents SET note=$1 WHERE id='pdf'`, ["x".repeat(501)])).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT invalid_note");
      // An interrupted rename with already-present nullable columns is completed.
      await client.query(`ALTER TABLE ${schema}.customer_documents ALTER COLUMN category DROP NOT NULL`);
      await client.query(`UPDATE ${schema}.customer_documents SET category=NULL WHERE id='pdf'`);
      await client.query(migration);
      expect((await client.query(`SELECT category FROM ${schema}.customer_documents WHERE id='pdf'`)).rows[0].category).toBe("map");
      // Competing stores fail closed without merging/deleting either.
      await client.query(`CREATE TABLE ${schema}.customer_map_documents (id text)`);
      await client.query("SAVEPOINT competing");
      await expect(client.query(migration)).rejects.toThrow("Both customer document tables exist");
      await client.query("ROLLBACK TO SAVEPOINT competing");
      expect((await client.query(`SELECT count(*)::int AS count FROM ${schema}.customer_documents`)).rows[0].count).toBe(2);
      const missingSchema = `${schema}_missing`;
      await client.query(`CREATE SCHEMA ${missingSchema}`);
      await client.query("SAVEPOINT missing_owner");
      await expect(client.query(migration.replaceAll(`${schema}.`, `${missingSchema}.`))).rejects.toThrow("Customer document owner is missing");
      await client.query("ROLLBACK TO SAVEPOINT missing_owner");
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
  it("scopes all actual repository reads/patches/deletes and refuses shared object cleanup", async () => {
    const original = ObjectStorageService.prototype.getPrivateObjectDir;
    ObjectStorageService.prototype.getPrivateObjectDir = () => "/bucket/.private";
    const rollback = new Error("fixture rollback");
    try {
      await expect(db.transaction(async tx => {
        for (const table of ["customers", "customer_documents", "users", "term_documents"]) {
          await tx.execute(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`);
        }
        await inTransaction(tx, async () => {
          await tx.insert(customers).values([{ id: "cu", companyId: "co", name: "Fixture", street: "", city: "", state: "", zip: "" }]);
          await tx.insert(users).values({ id: "u", name: "Fixture uploader", passwordHash: "not-a-login" });
          await tx.insert(customerDocuments).values([
            { id: "doc", companyId: "co", customerId: "cu", name: "Original", note: "Note", uploadedBy: "u", filePath: "/objects/map-documents/co/cu/doc", fileType: "pdf" },
            { id: "foreign", companyId: "other", customerId: "cu", name: "Foreign", filePath: "/objects/map-documents/other/cu/doc" },
          ]);
          const scope = { companyId: "co", customerId: "cu" }, other = { companyId: "other", customerId: "cu" };
          expect(await repo.customer(scope)).toBe(true); expect(await repo.customer(other)).toBe(false);
          expect(await repo.list(scope)).toMatchObject([{ id: "doc", uploadedByName: "Fixture uploader" }]);
          expect(await repo.get(scope, "foreign")).toBeUndefined();
          expect(await repo.get({ ...scope, customerId: "parent" }, "doc")).toBeUndefined();
          const patch = await repo.patch(scope, "doc", { name: "Renamed" });
          expect(patch).toMatchObject({ name: "Renamed", note: "Note", category: "map" });
          await expect(repo.patch(other, "doc", { name: "Attack" })).rejects.toMatchObject({ status: 404 });
          await expect(repo.remove(other, "doc", vi.fn())).rejects.toMatchObject({ status: 404 });
          const cleanup = vi.fn().mockRejectedValueOnce(new Error("Storage unavailable")).mockResolvedValue(undefined);
          await expect(repo.remove(scope, "doc", cleanup)).rejects.toThrow("Storage unavailable");
          expect(await repo.get(scope, "doc")).toBeDefined();
          await tx.insert(termDocuments).values({ id: "contract-ref", companyId: "co", termId: "term", filename: "shared",
            storageObjectPath: "/bucket/.private/map-documents/co/cu/doc", mimeType: "application/pdf", kind: "other", version: 1 });
          await expect(repo.remove(scope, "doc", cleanup)).rejects.toMatchObject({ code: "DOCUMENT_SHARED_OBJECT" });
          expect(cleanup).toHaveBeenCalledTimes(1);
          // Separate customer holder protects its object too.
          await tx.insert(customerDocuments).values({ id: "duplicate", companyId: "co", customerId: "another", name: "Reference",
            filePath: "/bucket/.private/map-documents/co/cu/doc" });
          await expect(repo.remove(scope, "doc", cleanup)).rejects.toMatchObject({ code: "DOCUMENT_SHARED_OBJECT" });
          await tx.execute("DELETE FROM term_documents WHERE id='contract-ref'");
          await tx.execute("DELETE FROM customer_documents WHERE id='duplicate'");
          await repo.remove(scope, "doc", cleanup);
          expect(await repo.get(scope, "doc")).toBeUndefined();
          await repo.remove(scope, "doc", cleanup);
          expect(cleanup).toHaveBeenCalledTimes(2);
          expect(await repo.get(other, "foreign")).toBeDefined();
        });
        throw rollback;
      })).rejects.toBe(rollback);
    } finally { ObjectStorageService.prototype.getPrivateObjectDir = original; }
  });
});
