import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import type { UserWithContext } from "../auth";
import { COMPANY_DOCUMENT_MAX_BYTES, companyDocumentCreate, companyDocumentPatch, companyDocumentReplace } from "../../../../lib/db/src/companyDocumentContracts";
import { CustomerDocumentError, validateCustomerDocument } from "../services/customerDocumentContent";
import { signDocumentGrant, readDocumentGrant } from "../services/customerDocumentGrants";
import { CompanyDocumentObjects } from "../services/companyDocumentObjects";
import { companyDocumentRepository, companyDocumentMissing, type CompanyDocumentRepository } from "../services/companyDocuments";
import { emailCompanyDocuments, previewCompanyDocuments, companyDocumentSends, companyDocumentEmailOptions } from "../services/companyDocumentEmail";
import { registerCompanyDocumentReconciliation, scheduleCompanyDocumentExpiry } from "../lib/companyDocumentExpiryFlags";

export const canManageCompanyDocuments = (user: UserWithContext) => ["admin", "office"].includes(user.accessRole);
export function registerCompanyDocuments(app: Express, dependencies: { repository?: CompanyDocumentRepository; objects?: CompanyDocumentObjects;
  email?: typeof emailCompanyDocuments; sends?: typeof companyDocumentSends; emailOptions?: typeof companyDocumentEmailOptions;
  emailPreview?: typeof previewCompanyDocuments;
  reconcile?: typeof scheduleCompanyDocumentExpiry } = {}) {
  registerCompanyDocumentReconciliation(app, dependencies.reconcile);
  const repo = dependencies.repository ?? companyDocumentRepository, objects = dependencies.objects ?? new CompanyDocumentObjects();
  const root = "/api/company-documents";
  const handle = (write: boolean, fn: (req: Request, res: Response, user: UserWithContext, company: string) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "private, no-store");
      if (!req.isAuthenticated?.()) { res.status(401).json({ code: "COMPANY_DOCUMENT_SIGN_IN", message: "Not authenticated" }); return; }
      const user = req.user as UserWithContext, company = user.activeCompanyId;
      if (!company || (write && !canManageCompanyDocuments(user))) { res.status(403).json({ code: "COMPANY_DOCUMENT_FORBIDDEN", message: "Insufficient permissions" }); return; }
      if ((req.get("X-Company-Id") && req.get("X-Company-Id") !== company) || (req.query.companyId !== undefined && req.query.companyId !== company)) {
        res.status(409).json({ code: "COMPANY_DOCUMENT_COMPANY_CHANGED", message: "Active company changed. Reload and try again." }); return;
      }
      try { await fn(req, res, user, company); }
      catch (error) {
        if (error instanceof z.ZodError) { res.status(400).json({ code: "COMPANY_DOCUMENT_INVALID_METADATA", message: "Invalid document details" }); return; }
        const databaseError = (error as { cause?: unknown })?.cause ?? error;
        if ((databaseError as { code?: string; constraint?: string })?.code === "23505" &&
          /company_documents.*role/.test((databaseError as { constraint?: string }).constraint ?? "")) {
          res.status(409).json({ code: "COMPANY_DOCUMENT_ROLE_TAKEN", message: "Another document is already the pesticide license." }); return;
        }
        if (error instanceof CustomerDocumentError) { res.status(error.status).json({ code: error.code.replace(/^DOCUMENT_/, "COMPANY_DOCUMENT_"),
          message: error.code === "COMPANY_DOCUMENT_EMAIL_FAILED" ? "Email could not be sent. Check the mailbox connection. Nothing was retried automatically." : error.code.replace(/^DOCUMENT_/, "COMPANY_DOCUMENT_") }); return; }
        if ((error as { code?: number })?.code === 404) { res.status(404).json({ code: "COMPANY_DOCUMENT_FILE_MISSING", message: "Stored file not found" }); return; }
        req.log?.error({ err: error }, "Company document operation failed");
        res.status(500).json({ code: "COMPANY_DOCUMENT_OPERATION_FAILED", message: "Document operation failed. Reload and try again." });
      }
    };
  app.get(root, handle(false, async (_req, res, user, company) => { res.json(await repo.list(company, canManageCompanyDocuments(user))); }));
  app.post(`${root}/email`, handle(true, async (req, res, user, company) => {
    res.status(201).json(await (dependencies.email ?? emailCompanyDocuments)(company, user, req.body));
  }));
  app.post(`${root}/email-preview`, handle(true, async (req, res, user, company) => {
    res.json(await (dependencies.emailPreview ?? previewCompanyDocuments)(company, user, req.body));
  }));
  app.get(`${root}/email-options`, handle(true, async (_req, res, _user, company) => {
    res.json(await (dependencies.emailOptions ?? companyDocumentEmailOptions)(company));
  }));
  app.get(`${root}/:id/sends`, handle(true, async (req, res, _user, company) => {
    res.json(await (dependencies.sends ?? companyDocumentSends)(company, String(req.params.id)));
  }));
  app.put(`${root}/license-number`, handle(true, async (req, res, _user, company) => {
    const { number } = z.object({ number: z.string().trim().max(50).nullable() }).strict().parse(req.body);
    await repo.license(company, number || null); res.json({ number: number || null });
  }));
  app.post(`${root}/upload-url`, handle(true, async (req, res, user, company) => {
    if (req.body?.fileSize > COMPANY_DOCUMENT_MAX_BYTES) throw new CustomerDocumentError(413, "COMPANY_DOCUMENT_TOO_LARGE");
    const input = z.object({ fileName: z.string().trim().min(1).max(255), contentType: z.string().max(150).optional(),
      fileSize: z.number().int().min(1).max(COMPANY_DOCUMENT_MAX_BYTES).optional(), documentId: z.string().min(1).optional() }).strict().parse(req.body);
    if (!/\.(pdf|jpe?g|png|heic)$/i.test(input.fileName)) throw new CustomerDocumentError(422, "COMPANY_DOCUMENT_UNSUPPORTED_TYPE");
    if (input.documentId) await repo.get(company, input.documentId);
    const id = randomUUID(), documentId = input.documentId ?? randomUUID();
    const upload = await objects.upload(`company-documents/${company}/${documentId}/pending/${id}`);
    // Reuse the proven signed/session-bound envelope; namespace prevents customer-grant substitution.
    const uploadToken = signDocumentGrant({ id, companyId: company, customerId: documentId, userId: user.id,
      path: upload.objectPath, filename: input.fileName, expires: Date.now() + 3600000 }, req.sessionID);
    // Replacement intent is part of the signature via a session-bound wrapper.
    const token = signDocumentGrant({ id, companyId: company, customerId: input.documentId ? `replace:${documentId}` : `create:${documentId}`,
      userId: user.id, path: uploadToken, filename: input.fileName, expires: Date.now() + 3600000 }, req.sessionID);
    res.json({ uploadURL: upload.uploadURL, uploadToken: token });
  }));
  const finalize = (replacing: boolean) => handle(true, async (req, res, user, company) => {
    const input = replacing ? companyDocumentReplace.parse(req.body) : companyDocumentCreate.parse(req.body);
    const wrapper = readDocumentGrant(input.uploadToken, req.sessionID);
    const grant = readDocumentGrant(wrapper.path, req.sessionID);
    const documentId = grant.customerId;
    if (grant.companyId !== company || wrapper.companyId !== company || grant.userId !== user.id || wrapper.userId !== user.id ||
      grant.expires < Date.now() || wrapper.expires < Date.now() || wrapper.id !== grant.id ||
      wrapper.customerId !== `${replacing ? "replace" : "create"}:${documentId}` ||
      (replacing && String(req.params.id) !== documentId)) throw companyDocumentMissing();
    const { uploadToken: _token, ...metadata } = input;
    await repo.finalize(company, documentId, grant.id, user.id, metadata, replacing, async () => {
      const validated = await validateCustomerDocument(await objects.read(grant.path, company, documentId));
      if (!["pdf", "jpg", "png"].includes(validated.fileType)) throw new CustomerDocumentError(422, "COMPANY_DOCUMENT_UNSUPPORTED_TYPE");
      // Fresh immutable path even after transaction rollback; no accepted identity ever had a signed PUT.
      const path = await objects.save(`company-documents/${company}/${documentId}/accepted/${grant.id}/${randomUUID()}`, validated.buffer, validated.mimeType);
      return { fileName: grant.filename, filePath: path, fileType: validated.fileType, mimeType: validated.mimeType,
        fileSize: validated.buffer.length, uploadedById: user.id };
    });
    // Cleanup cannot turn a committed operation into a failed finalize.
    try { await objects.remove(grant.path, company, documentId); }
    catch (err) { req.log?.warn({ err }, "Company document staging cleanup failed"); }
    const result = await repo.list(company, true);
    const document = result.documents.find(d => d.id === documentId);
    if (!document) throw companyDocumentMissing();
    res.status(201).json(document);
  });
  app.post(root, finalize(false));
  app.post(`${root}/:id/files`, finalize(true));
  app.patch(`${root}/:id`, handle(true, async (req, res, user, company) => {
    const id = String(req.params.id);
    await repo.patch(company, id, user.id, companyDocumentPatch.parse(req.body));
    res.json((await repo.list(company, true)).documents.find(d => d.id === id));
  }));
  app.delete(`${root}/:id`, handle(true, async (req, res, user, company) => {
    await repo.patch(company, String(req.params.id), user.id, { archivedAt: new Date() }); res.sendStatus(204);
  }));
  app.get(`${root}/:id/files`, handle(true, async (req, res, _user, company) => { res.json(await repo.history(company, String(req.params.id))); }));
  const open = handle(false, async (req, res, user, company) => {
    const doc = await repo.get(company, String(req.params.id), canManageCompanyDocuments(user));
    const fileId = req.params.fileId ? String(req.params.fileId) : doc.currentFileId;
    if (!fileId || (!canManageCompanyDocuments(user) && fileId !== doc.currentFileId)) throw companyDocumentMissing();
    const file = await repo.file(company, doc.id, fileId);
    const bytes = await objects.read(file.filePath, company, doc.id);
    const inline = ["application/pdf", "image/jpeg", "image/png"].includes(file.mimeType ?? "");
    const name = file.fileName.replace(/[\r\n"\\/\u0000-\u001f\u007f]/g, "_");
    res.set({ "Content-Type": file.mimeType ?? "application/octet-stream", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox", "Content-Disposition": `${req.query.download === "1" || !inline ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}` });
    res.send(bytes);
  });
  app.get(`${root}/:id/open`, open);
  app.get(`${root}/:id/files/:fileId/open`, open);
}
