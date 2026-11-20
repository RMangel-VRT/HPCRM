import { Router, type Express } from "express";
import type { UserWithContext } from "../auth";
import { invoiceAccess } from "../lib/invoiceAccess";
import { requireCommPermission } from "../lib/communicationPermissions";
import { storage } from "../storage";
import { isEmailKey } from "../../../../lib/db/src/emailWordingContracts";
import { validateWording, type EmailKey, type EmailWording } from "../services/outgoingEmail/wording";
import { listCompanyWording, resetCompanyWording, saveCompanyWording } from "../services/outgoingEmail/wordingAdmin";
import { renderWordingPreview } from "../services/outgoingEmail/wordingPreview";

export function registerEmailWording(app: Express) {
  const router = Router();
  router.use(invoiceAccess);
  const admin = requireCommPermission("manage_automations");
  router.param("key", (_req, res, next, key: string) => {
    if (!isEmailKey(key)) { res.status(404).json({ message: "Unknown email wording key." }); return; }
    next();
  });

  router.get("/", async (req, res) => {
    res.json(await listCompanyWording((req.user as UserWithContext).activeCompanyId));
  });
  router.get("/work-completed-rule", async (req, res) => {
    const rules = await storage.getEmailRules((req.user as UserWithContext).activeCompanyId);
    const rule = rules.filter(rule => rule.eventKey === "ticket.work_completed")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0];
    res.json({ rule: rule ? { id: rule.id, isEnabled: rule.isEnabled } : null });
  });
  router.put("/:key", admin, async (req, res) => {
    const key = req.params.key as EmailKey;
    const fieldErrors = validateWording(key, req.body);
    if (fieldErrors) { res.status(422).json({ message: "Fix the highlighted fields.", fieldErrors }); return; }
    const user = req.user as UserWithContext;
    res.json(await saveCompanyWording(user.activeCompanyId, user, key, req.body as EmailWording));
  });
  router.delete("/:key", admin, async (req, res) => {
    const user = req.user as UserWithContext;
    await resetCompanyWording(user.activeCompanyId, user.id, req.params.key as EmailKey);
    res.status(204).end();
  });
  router.post("/:key/preview", async (req, res) => {
    const key = req.params.key as EmailKey;
    const fieldErrors = validateWording(key, req.body);
    if (fieldErrors) { res.json({ fieldErrors }); return; }
    res.json({ ...await renderWordingPreview(key, req.body as EmailWording, (req.user as UserWithContext).activeCompanyId), fieldErrors: null });
  });
  app.use("/api/email-wording", router);
}
