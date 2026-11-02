import { Router, type Express, type RequestHandler } from "express";
import { patchDocumentSettingsSchema } from "@workspace/db/document-contracts";
import type { UserWithContext } from "../auth";
import { invoiceAccess } from "../lib/invoiceAccess";
import { logger } from "../lib/logger";
import { readDocumentSettings, updateDocumentSettings } from "../services/documentSettings";

export function registerDocumentSettingsRoutes(app: Express) {
  const router = Router();
  router.use(invoiceAccess);
  router.use(((req, res, next) => {
    if ((req.user as UserWithContext).activeRole !== "admin") { res.status(403).json({ error: "ACCESS_DENIED" }); return; }
    next();
  }) as RequestHandler);
  router.get("/", async (req, res): Promise<void> => {
    try { res.json(await readDocumentSettings((req.user as UserWithContext).activeCompanyId)); }
    catch { (req.log ?? logger).error("DOCUMENT_SETTINGS_READ_FAILED"); res.status(500).json({ error: "INTERNAL_ERROR" }); }
  });
  router.patch("/", async (req, res): Promise<void> => {
    const parsed = patchDocumentSettingsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "INVALID_REQUEST" }); return; }
    try {
      const user = req.user as UserWithContext;
      res.json(await updateDocumentSettings(user.activeCompanyId, user.id, parsed.data));
    } catch { (req.log ?? logger).error("DOCUMENT_SETTINGS_WRITE_FAILED"); res.status(500).json({ error: "INTERNAL_ERROR" }); }
  });
  app.use("/api/settings/documents", router);
}
