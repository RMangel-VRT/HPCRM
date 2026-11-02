import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { companies, users, customers, settings, invoices, invoiceEvents, companyDocumentSettings, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { readDocumentSettings, updateDocumentSettings } from "./documentSettings";
import { createDraftInvoice, createInvoiceLine } from "./invoices";
import { readInvoice } from "./invoiceReads";
import { renderInvoicePdf } from "./invoicePdf";
import { closeDocumentBrowser } from "./documents/browser";

const a = `documents-${randomUUID()}`, b = `documents-${randomUUID()}`, actor = randomUUID();
let customerA: string;
beforeAll(async () => {
  await db.insert(companies).values([{ id: a, name: "Document company A", slug: a }, { id: b, name: "Document company B", slug: b }]);
  await db.insert(users).values({ id: actor, name: "Document actor", passwordHash: "not-a-login" });
  [ { id: customerA } ] = await db.insert(customers).values({ companyId: a, name: "Document Customer A", street: "123 Example", city: "Denver", state: "CO", zip: "80000" }).returning();
  await db.insert(settings).values({ companyId: a, companyName: "Document Company A" });
}, 30_000);
afterAll(async () => {
  await closeDocumentBrowser();
  await db.delete(companies).where(inArray(companies.id, [a, b]));
  await db.delete(users).where(eq(users.id, actor));
  await pool.end(); await schemaPool.end();
}, 30_000);
it("company-scoped upserts preserve omissions, explicit clearing, defaults and actor attribution", async () => {
  const defaults = await readDocumentSettings(a);
  expect(defaults.estimateTerms).toBe(""); expect(defaults.paymentInstructions).toContain("{company name}");
  await updateDocumentSettings(a, actor, { phone: "A", estimateTerms: "Terms A" });
  await updateDocumentSettings(b, actor, { phone: "B" });
  await updateDocumentSettings(a, actor, { estimateTerms: "" });
  expect(await readDocumentSettings(a)).toMatchObject({ phone: "A", estimateTerms: "" });
  expect(await readDocumentSettings(b)).toMatchObject({ phone: "B", estimateTerms: "" });
  const [stored] = await db.select().from(companyDocumentSettings).where(eq(companyDocumentSettings.companyId, a));
  expect(stored.updatedById).toBe(actor); expect(stored.updatedAt).toBeInstanceOf(Date);
});
it("the guarded migration can be rerun without overwriting settings", async () => {
  const migration = await readFile(new URL("../../../../.migration-backup/migrations/0063_company_document_settings.sql", import.meta.url), "utf8");
  // Isolate DDL/seed replay from other suites replaying historical migrations.
  // Seeding every real company while another suite changes FK tables can deadlock.
  const schema = `doc_migration_${randomUUID().replaceAll("-", "")}`;
  await db.transaction(async tx => {
    await tx.execute(sql.raw(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}", public;
      CREATE TABLE companies(id varchar PRIMARY KEY); CREATE TABLE users(id varchar PRIMARY KEY);
      INSERT INTO companies VALUES ('fixture');`));
    await tx.execute(sql.raw(migration));
    await tx.execute(sql.raw("UPDATE company_document_settings SET phone='preserved' WHERE company_id='fixture'"));
    await tx.execute(sql.raw(migration)); await tx.execute(sql.raw(migration));
    const rows = await tx.execute(sql.raw("SELECT phone FROM company_document_settings"));
    expect(rows.rows).toEqual([{ phone: "preserved" }]);
    await tx.execute(sql.raw(`DROP SCHEMA "${schema}" CASCADE`));
  });
}, 30_000);
it("draft render uses a read-only snapshot, rejects a foreign company and leaves commercial/QBO/event data unchanged", async () => {
  let detail = await createDraftInvoice(a, actor, { customerId: customerA, kind: "standalone", title: "Document fixture", prefix: "MA" });
  detail = await createInvoiceLine(a, actor, detail.id, { category: "plants", description: "Captured line", unit: "ea", quantity: "2.5", rateCents: 33 });
  const before = await readInvoice(a, detail.id);
  const events = await db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, detail.id));
  await expect(renderInvoicePdf(b, detail.id)).rejects.toMatchObject({ status: 404 });
  const result = await renderInvoicePdf(a, detail.id);
  expect(result.filename).toBe("MA-1001.pdf"); expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF");
  expect(await readInvoice(a, detail.id)).toEqual(before);
  expect(await db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, detail.id))).toEqual(events);
  expect(before.billToSnapshot).toBeNull(); expect(before.qboInvoiceId).toBeNull();
  await db.update(invoices).set({ status: "issued" }).where(eq(invoices.id, detail.id));
  await expect(renderInvoicePdf(a, detail.id)).rejects.toMatchObject({ status: 409, error: "INVOICE_NOT_DRAFT" });
}, 30_000);
