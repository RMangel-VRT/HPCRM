import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { companies, companyDocuments as documents, companyDocumentFiles as files, users, type CompanyDocument, type CompanyDocumentFile } from "@workspace/db";
import { db } from "../db";
import { companyDocumentStatus, type CompanyDocumentDto } from "../../../../lib/db/src/companyDocumentContracts";
import { companyToday } from "../lib/companyDay";
import { CustomerDocumentError } from "./customerDocumentContent";

export const companyDocumentMissing = () => new CustomerDocumentError(404, "COMPANY_DOCUMENT_NOT_FOUND");
export const documentWhere = (company: string, id?: string) => and(eq(documents.companyId, company), isNull(documents.archivedAt), id ? eq(documents.id, id) : undefined);
export function companyDocumentUrl(company: string, id: string, fileId?: string) {
  return `/api/company-documents/${encodeURIComponent(id)}${fileId ? `/files/${encodeURIComponent(fileId)}` : ""}/open?companyId=${encodeURIComponent(company)}`;
}
export function companyDocumentDto(d: CompanyDocument, f: CompanyDocumentFile | null, uploadedByName: string | null): CompanyDocumentDto {
  const openUrl = companyDocumentUrl(d.companyId, d.id);
  return { id: d.id, name: d.name, category: d.category as CompanyDocumentDto["category"], role: d.role as CompanyDocumentDto["role"],
    expiresOn: d.expiresOn, visibility: d.visibility as CompanyDocumentDto["visibility"], pinned: d.pinned,
    ...companyDocumentStatus(d.expiresOn, companyToday()), currentFile: f ? {
      fileName: f.fileName, fileType: f.fileType, fileSize: f.fileSize, uploadedAt: f.uploadedAt.toISOString(), uploadedByName,
    } : null, openUrl, downloadUrl: `${openUrl}&download=1`, updatedAt: d.updatedAt.toISOString() };
}
export const companyDocumentRepository = {
  async get(company: string, id: string, manage = true) {
    const [row] = await db.select().from(documents).where(and(documentWhere(company, id), manage ? undefined : eq(documents.visibility, "everyone")));
    if (!row) throw companyDocumentMissing();
    return row;
  },
  async file(company: string, document: string, fileId: string) {
    const [row] = await db.select().from(files).where(and(eq(files.companyId, company), eq(files.documentId, document), eq(files.id, fileId)));
    if (!row) throw companyDocumentMissing();
    return row;
  },
  async list(company: string, manage: boolean) {
    const rows = await db.select({ document: documents, file: files, name: users.name }).from(documents)
      .leftJoin(files, and(eq(files.id, documents.currentFileId), eq(files.companyId, documents.companyId), eq(files.documentId, documents.id)))
      .leftJoin(users, eq(users.id, files.uploadedById))
      .where(and(documentWhere(company), manage ? undefined : eq(documents.visibility, "everyone"))).orderBy(desc(documents.updatedAt));
    const [companyRow] = await db.select({ number: companies.pesticideLicenseNumber }).from(companies).where(eq(companies.id, company));
    const license = rows.find(r => r.document.role === "pesticide_license")?.document;
    return { documents: rows.map(r => companyDocumentDto(r.document, r.file, r.name)),
      license: { number: companyRow?.number ?? null, documentId: license?.id ?? null, expiresOn: license?.expiresOn ?? null } };
  },
  async history(company: string, id: string) {
    const document = await this.get(company, id);
    const rows = await db.select({ file: files, name: users.name }).from(files).leftJoin(users, eq(users.id, files.uploadedById))
      .where(and(eq(files.companyId, company), eq(files.documentId, id))).orderBy(desc(files.uploadedAt), desc(files.id));
    return rows.map(({ file, name }) => {
      const openUrl = companyDocumentUrl(company, id, file.id);
      return { id: file.id, fileName: file.fileName, fileSize: file.fileSize, uploadedAt: file.uploadedAt.toISOString(),
        uploadedByName: name, isCurrent: file.id === document.currentFileId, openUrl, downloadUrl: `${openUrl}&download=1` };
    });
  },
  async finalize(company: string, documentId: string, fileId: string, actor: string,
    metadata: Partial<typeof documents.$inferInsert>, replacing: boolean, build: () => Promise<Omit<typeof files.$inferInsert, "id" | "companyId" | "documentId">>) {
    return db.transaction(async tx => {
      // Same company gate serializes role assignment, archive, replacement and replay.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`company-documents:${company}`}, 0))`);
      const [existing] = await tx.select().from(files).where(eq(files.id, fileId));
      if (existing) {
        if (existing.companyId !== company || existing.documentId !== documentId) throw companyDocumentMissing();
        return documentId;
      }
      if (replacing) {
        const [doc] = await tx.select().from(documents).where(documentWhere(company, documentId)).for("update");
        if (!doc) throw companyDocumentMissing();
      }
      const file = await build();
      if (!replacing) await tx.insert(documents).values({
        ...metadata, id: documentId, companyId: company, name: metadata.name!, category: metadata.category!, createdById: actor, updatedById: actor,
      });
      await tx.insert(files).values({ ...file, id: fileId, companyId: company, documentId });
      await tx.update(documents).set({ ...metadata, currentFileId: fileId, updatedById: actor, updatedAt: new Date() }).where(documentWhere(company, documentId));
      return documentId;
    });
  },
  async patch(company: string, id: string, actor: string, changes: Partial<typeof documents.$inferInsert>) {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`company-documents:${company}`}, 0))`);
      const [row] = await tx.update(documents).set({ ...changes, updatedById: actor, updatedAt: new Date() }).where(documentWhere(company, id)).returning();
      if (!row) throw companyDocumentMissing();
    });
  },
  async license(company: string, number: string | null) {
    await db.update(companies).set({ pesticideLicenseNumber: number }).where(eq(companies.id, company));
  },
};
export type CompanyDocumentRepository = typeof companyDocumentRepository;
