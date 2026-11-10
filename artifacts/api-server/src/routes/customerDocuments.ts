import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Session } from "express-session";
import { z } from "zod/v4";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { ObjectNotFoundError, ObjectStorageService } from "../objectStorage";
import { CUSTOMER_DOCUMENT_CATEGORIES, CUSTOMER_DOCUMENT_MAX_BYTES, customerDocumentMetadata, customerDocumentPatch } from "../../../../lib/db/src/customerDocumentContracts";
import { CustomerDocumentError, validateCustomerDocument } from "../services/customerDocumentContent";
import { CustomerDocumentObjects } from "../services/customerDocumentObjects";
import { customerDocumentRepository, documentDto, type CustomerDocumentRepository, type DocumentScope } from "../services/customerDocuments";
import { loadCustomerContractDocuments } from "../services/customerContractDocuments";
import { signDocumentGrant, readDocumentGrant } from "../services/customerDocumentGrants";

type Grant = DocumentScope & { userId: string; path: string; filename: string; expires: number };
type UploadSession = Session & { customerDocumentUploads?: Record<string, Grant> };
const uploadInput = z.object({ fileName: z.string().trim().min(1).max(255),
  contentType: z.string().max(150).optional(), fileSize: z.number().int().min(1).max(CUSTOMER_DOCUMENT_MAX_BYTES).optional() }).strict();
const createInput = customerDocumentMetadata.extend({ uploadToken: z.string().max(4096).optional(),
  // Old routes accept their prior filePath envelope, but it must match this session's grant.
  filePath: z.string().optional(), fileType: z.string().optional(), fileSize: z.number().int().optional() });

const privileged = (user: UserWithContext) => ["admin", "office"].includes(user.accessRole);
export function registerCustomerDocuments(app: Express, dependencies: {
  repository?: CustomerDocumentRepository; objects?: CustomerDocumentObjects;
  contracts?: typeof loadCustomerContractDocuments;
} = {}) {
  const repo = dependencies.repository ?? customerDocumentRepository;
  const objects = dependencies.objects ?? new CustomerDocumentObjects();
  const contracts = dependencies.contracts ?? loadCustomerContractDocuments;
  const handle = (write: boolean, fn: (req: Request, res: Response, user: UserWithContext, scope: DocumentScope) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      if (!req.isAuthenticated?.()) { res.status(401).json({ code: "DOCUMENT_SIGN_IN", message: "Not authenticated" }); return; }
      const user = req.user as UserWithContext;
      if (!user.activeCompanyId || (write && !privileged(user))) {
        res.status(403).json({ code: "DOCUMENT_FORBIDDEN", message: "Insufficient permissions" }); return;
      }
      const company = req.get("X-Company-Id"), queryCompany = req.query.companyId;
      if ((company && company !== user.activeCompanyId) || (queryCompany !== undefined && queryCompany !== user.activeCompanyId)) {
        res.status(409).json({ code: "DOCUMENT_COMPANY_CHANGED", message: "Active company changed. Reload and try again." }); return;
      }
      const scope = { companyId: user.activeCompanyId, customerId: String(req.params.customerId) };
      res.set("Cache-Control", "private, no-store");
      try {
        if (!await repo.customer(scope)) throw new CustomerDocumentError(404, "DOCUMENT_NOT_FOUND");
        await fn(req, res, user, scope);
      } catch (error) {
        if (error instanceof z.ZodError) { res.status(400).json({ code: "DOCUMENT_INVALID_METADATA", message: "Invalid document metadata" }); return; }
        if (error instanceof CustomerDocumentError) { res.status(error.status).json({ code: error.code, message: error.code }); return; }
        if (error instanceof ObjectNotFoundError || (error as { code?: number })?.code === 404) {
          res.status(404).json({ code: "DOCUMENT_FILE_MISSING", message: "Stored file not found" }); return;
        }
        req.log?.error({ err: error }, "Customer document operation failed");
        res.status(500).json({ code: "DOCUMENT_OPERATION_FAILED", message: "Document operation could not be completed. Reload and try again." });
      }
    };
  const roots = ["/api/customers/:customerId/documents", "/api/customers/:customerId/map-documents"];
  const paths = (suffix: string) => roots.map(r => r + suffix);
  app.get(roots, handle(false, async (req, res, _user, scope) => {
    const category = z.enum(CUSTOMER_DOCUMENT_CATEGORIES).optional().parse(req.query.category);
    res.json(await repo.list(scope, category));
  }));
  app.post(paths("/upload-url"), handle(true, async (req, res, user, scope) => {
    if (typeof req.body?.fileSize === "number" && req.body.fileSize > CUSTOMER_DOCUMENT_MAX_BYTES)
      throw new CustomerDocumentError(413, "DOCUMENT_TOO_LARGE");
    const input = uploadInput.parse(req.body);
    if (!/\.(pdf|jpe?g|png|hei[cf]|docx|xlsx)$/i.test(input.fileName)) throw new CustomerDocumentError(422, "DOCUMENT_UNSUPPORTED_TYPE");
    const id = randomUUID(), session = req.session as UploadSession;
    const relative = `map-documents/${scope.companyId}/${scope.customerId}/pending/${id}`;
    const upload = await objects.upload(relative);
    const prior = session.customerDocumentUploads ?? {};
    session.customerDocumentUploads = Object.fromEntries(Object.entries(prior).filter(([, g]) => g.expires > Date.now()).slice(-99));
    const grant = { id, ...scope, userId: user.id, path: upload.objectPath, filename: input.fileName, expires: Date.now() + 60 * 60 * 1000 };
    session.customerDocumentUploads[id] = grant;
    // Persist before responding: parallel PUT/finalization must see the grant.
    await new Promise<void>((resolve, reject) => session.save(error => error ? reject(error) : resolve()));
    res.json({ ...upload, uploadToken: signDocumentGrant(grant, req.sessionID) });
  }));
  app.post(roots, handle(true, async (req, res, user, scope) => {
    const input = createInput.parse({ category: "map", note: null, ...req.body });
    const grants = (req.session as UploadSession).customerDocumentUploads ?? {};
    const signed = input.uploadToken ? readDocumentGrant(input.uploadToken, req.sessionID) : undefined;
    const id = signed?.id ?? Object.keys(grants).find(key => grants[key].path === input.filePath);
    const grant = signed ?? (id && grants[id]);
    if (!id || !grant || grant.companyId !== scope.companyId || grant.customerId !== scope.customerId ||
      grant.userId !== user.id || grant.expires < Date.now()) throw new CustomerDocumentError(404, "DOCUMENT_UPLOAD_EXPIRED");
    const relative = `map-documents/${scope.companyId}/${scope.customerId}/${id}`;
    let acceptedPath: string | undefined;
    try {
      const row = await repo.finalize(scope, id, async () => {
        const validated = await validateCustomerDocument(await objects.read(grant.path, scope.companyId, scope.customerId));
        // The accepted path has NEVER had a signed PUT URL.
        acceptedPath = `/objects/${relative}`;
        await objects.save(relative, validated.buffer, validated.mimeType, user.id, scope.companyId);
        return { ...scope, name: input.name, category: input.category, note: input.note,
          filePath: acceptedPath, fileType: validated.fileType, mimeType: validated.mimeType,
          fileSize: validated.buffer.length, uploadedBy: user.id };
      });
      // Keep grant for idempotent create retries until expiry; unique token is DB ID.
      await objects.remove(grant.path, scope.companyId, scope.customerId);
      res.status(201).json(documentDto(row, user.name));
    } catch (error) {
      // Never remove a committed accepted file on a staging-cleanup failure.
      if (acceptedPath && !await repo.get(scope, id)) {
        try { await objects.remove(acceptedPath, scope.companyId, scope.customerId); }
        catch { throw new CustomerDocumentError(500, "DOCUMENT_CLEANUP_FAILED"); }
      }
      throw error;
    }
  }));
  app.patch(paths("/:id"), handle(true, async (req, res, _user, scope) => {
    res.json(await repo.patch(scope, String(req.params.id), customerDocumentPatch.parse(req.body)));
  }));
  app.delete(paths("/:id"), handle(true, async (req, res, _user, scope) => {
    await repo.remove(scope, String(req.params.id), path => objects.remove(path, scope.companyId, scope.customerId));
    res.sendStatus(204);
  }));
  app.get(paths("/:id/open"), handle(false, async (req, res, _user, scope) => {
    const row = await repo.get(scope, String(req.params.id));
    if (!row) throw new CustomerDocumentError(404, "DOCUMENT_NOT_FOUND");
    const bytes = await objects.read(row.filePath, scope.companyId, scope.customerId);
    const inline = row.mimeType === "application/pdf" || ["image/jpeg", "image/png"].includes(row.mimeType ?? "");
    const filename = `${row.name.replace(/[\r\n"\\/\u0000-\u001f]/g, "_")}.${/^[a-z0-9]+$/i.test(row.fileType) ? row.fileType : "bin"}`;
    res.set({ "Content-Type": row.mimeType ?? "application/octet-stream", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox", "Content-Disposition": `${req.query.download === "1" || !inline ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}` });
    res.send(bytes);
  }));
  app.get(paths("/from-contracts"), handle(false, async (_req, res, user, scope) => {
    if (!privileged(user)) throw new CustomerDocumentError(403, "DOCUMENT_FORBIDDEN");
    res.json((await contracts(db, scope.companyId, scope.customerId)).projected);
  }));
  app.get(paths("/from-contracts/:id/open"), handle(false, async (req, res, user, scope) => {
    if (!privileged(user)) throw new CustomerDocumentError(403, "DOCUMENT_FORBIDDEN");
    const data = await contracts(db, scope.companyId, scope.customerId);
    const id = String(req.params.id);
    if (!data.projected.some(d => d.id === id)) throw new CustomerDocumentError(404, "DOCUMENT_NOT_FOUND");
    const document = data.documents.find(d => d.id === id)!;
    const service = new ObjectStorageService(), file = await service.getObjectEntityFile(document.storageObjectPath);
    const inline = document.mimeType === "application/pdf" || ["image/png", "image/jpeg"].includes(document.mimeType);
    res.set({ "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" });
    await service.downloadObject(file, res, 0);
  }));
}
