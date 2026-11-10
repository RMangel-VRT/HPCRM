import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { customerDocuments, customers, termDocuments, users, type CustomerDocument } from "@workspace/db";
import { db } from "../db";
import type { CustomerDocumentDto } from "../../../../lib/db/src/customerDocumentContracts";
import { CustomerDocumentError } from "./customerDocumentContent";
import { ObjectStorageService } from "../objectStorage";
import { customerDocumentRelativePath } from "./customerDocumentObjects";

export type DocumentScope = { companyId: string; customerId: string };
const where = (scope: DocumentScope) => and(eq(customerDocuments.companyId, scope.companyId), eq(customerDocuments.customerId, scope.customerId));
export function documentDto(row: CustomerDocument, uploadedByName: string | null = null): CustomerDocumentDto {
  const base = `/api/customers/${encodeURIComponent(row.customerId)}/documents/${encodeURIComponent(row.id)}/open?companyId=${encodeURIComponent(row.companyId)}`;
  return { id: row.id, companyId: row.companyId, customerId: row.customerId, name: row.name,
    category: row.category as CustomerDocumentDto["category"], note: row.note, mimeType: row.mimeType,
    fileType: row.fileType, fileSize: row.fileSize, uploadedByName,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    openUrl: base, downloadUrl: `${base}&download=1` };
}

export const customerDocumentRepository = {
  async customer(scope: DocumentScope) {
    const [row] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, scope.customerId), eq(customers.companyId, scope.companyId)));
    return !!row;
  },
  async list(scope: DocumentScope, category?: string) {
    const rows = await db.select({ document: customerDocuments, uploadedByName: users.name })
      .from(customerDocuments).leftJoin(users, eq(customerDocuments.uploadedBy, users.id))
      .where(and(where(scope), category ? eq(customerDocuments.category, category) : undefined))
      .orderBy(desc(customerDocuments.createdAt), desc(customerDocuments.id));
    return rows.map(r => documentDto(r.document, r.uploadedByName));
  },
  async get(scope: DocumentScope, id: string) {
    const [row] = await db.select().from(customerDocuments).where(and(where(scope), eq(customerDocuments.id, id)));
    return row;
  },
  async patch(scope: DocumentScope, id: string, changes: Partial<Pick<CustomerDocument, "name" | "category" | "note">>) {
    const [row] = await db.update(customerDocuments).set({ ...changes, updatedAt: new Date() })
      .where(and(where(scope), eq(customerDocuments.id, id))).returning();
    if (!row) throw new CustomerDocumentError(404, "DOCUMENT_NOT_FOUND");
    const [actor] = row.uploadedBy ? await db.select({ name: users.name }).from(users).where(eq(users.id, row.uploadedBy)) : [];
    return documentDto(row, actor?.name ?? null);
  },
  async finalize(scope: DocumentScope, id: string, build: () => Promise<typeof customerDocuments.$inferInsert>) {
    return db.transaction(async tx => {
      // Stable token identity serializes retries (including concurrent sessions).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`customer-document:${id}`}, 0))`);
      const [existing] = await tx.select().from(customerDocuments).where(and(where(scope), eq(customerDocuments.id, id)));
      if (existing) return existing;
      const [row] = await tx.insert(customerDocuments).values({ ...await build(), id, ...scope }).returning();
      return row;
    });
  },
  async remove(scope: DocumentScope, id: string, cleanup: (path: string) => Promise<void>) {
    await db.transaction(async tx => {
      const [row] = await tx.select().from(customerDocuments).where(and(where(scope), eq(customerDocuments.id, id))).for("update");
      if (!row) {
        const [mismatched] = await tx.select({ id: customerDocuments.id }).from(customerDocuments).where(eq(customerDocuments.id, id)).limit(1);
        if (mismatched) throw new CustomerDocumentError(404, "DOCUMENT_NOT_FOUND");
        return; // retries after a successful deletion are idempotent
      }
      const privateDir = new ObjectStorageService().getPrivateObjectDir().replace(/\/$/, "");
      const relative = customerDocumentRelativePath(row.filePath, scope.companyId, scope.customerId, privateDir);
      const paths = [`/objects/${relative}`, `${privateDir}/${relative}`];
      const [otherCustomer] = await tx.select({ id: customerDocuments.id }).from(customerDocuments)
        .where(and(inArray(customerDocuments.filePath, paths), ne(customerDocuments.id, id))).limit(1);
      const [contract] = await tx.select({ id: termDocuments.id }).from(termDocuments).where(inArray(termDocuments.storageObjectPath, paths)).limit(1);
      if (otherCustomer || contract) throw new CustomerDocumentError(409, "DOCUMENT_SHARED_OBJECT");
      // Storage first: failure rolls back DB and retains row for retry. Missing
      // objects are safe; a DB failure after cleanup also retries safely.
      await cleanup(row.filePath);
      await tx.delete(customerDocuments).where(and(where(scope), eq(customerDocuments.id, id)));
    });
  },
};
export type CustomerDocumentRepository = typeof customerDocumentRepository;
