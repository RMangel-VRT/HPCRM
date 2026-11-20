import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import { insertChemicalNotificationTemplateSchema } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { pickProvided } from "../lib/patchBody";
import { ObjectStorageService, signObjectURL } from "../objectStorage";
import { storage } from "../storage";
import { TEMPLATE_LABEL_TTL_SEC } from "../services/chemLabelService";
import { formatTimeWindow } from "../services/emailService";
import { emptyLegacyChemicalWording, renderChemicalEmail } from "../services/outgoingEmail/chemicalEmail";

const productFields = insertChemicalNotificationTemplateSchema.pick({
  name: true, productName: true, activeIngredient: true, epaRegNumber: true, purposeText: true,
  reentryInterval: true, wateringInstructions: true, mowingInstructions: true, postApplicationExpectation: true,
}).extend({ name: z.string().trim().min(1).max(200) });
const writeFields = productFields.extend({
  serviceType: insertChemicalNotificationTemplateSchema.shape.serviceType,
  isDefault: insertChemicalNotificationTemplateSchema.shape.isDefault,
});
const previewFields = productFields.extend({ emailType: z.enum(["pre", "post"]), templateId: z.string().optional() });

export function registerChemicalTemplateWrites(app: Express) {
  const route = "/api/chemical-notification-templates";
  const canEdit = (user: UserWithContext) => user.accessRole === "admin" || user.isSuperAdminBool;
  app.use(route, (req, res, next) => {
    const companyId = (req.user as UserWithContext | undefined)?.activeCompanyId;
    const expected = req.get("X-Company-Id");
    if (companyId && expected && companyId !== expected) {
      res.status(409).json({ error: "Active company changed. Reload and try again." });
      return;
    }
    next();
  });

  app.post(route, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEdit(user)) return res.status(403).json({ error: "Admin only" });
    try {
      const parsed = writeFields.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const result = await storage.createChemicalNotificationTemplate({
        ...parsed.data, ...emptyLegacyChemicalWording, companyId: user.activeCompanyId, createdBy: user.id,
      });
      return res.status(201).json(result);
    } catch (err) {
      console.error("Error creating chemical notification template:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.route(`${route}/:id`).patch(update).put(update);
  async function update(req: Request<{ id: string }>, res: Response) {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEdit(user)) return res.status(403).json({ error: "Admin only" });
    try {
      const parsed = writeFields.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const updates = pickProvided(parsed.data, req.body);
      const result = Object.keys(updates).length
        ? await storage.updateChemicalNotificationTemplate(req.params.id, user.activeCompanyId, updates)
        : await storage.getChemicalNotificationTemplate(req.params.id, user.activeCompanyId);
      if (!result) return res.status(404).json({ error: "Not found" });
      return res.json(result);
    } catch (err) {
      console.error("Error updating chemical notification template:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  app.post(`${route}/preview`, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Not authenticated");
    const user = req.user as UserWithContext;
    if (!canEdit(user) && user.accessRole !== "office") return res.status(403).json({ error: "Insufficient permissions" });
    const parsed = previewFields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const companyId = user.activeCompanyId;
      const { emailType, templateId, ...fields } = parsed.data;
      const company = await storage.getCompanyById(companyId);
      const saved = templateId ? await storage.getChemicalNotificationTemplate(templateId, companyId) : undefined;
      if (templateId && !saved) return res.status(404).json({ error: "Not found" });
      const labelKey = saved?.defaultLabelPdfStorageKey;
      let labelAttachmentUrl = "";
      if (saved && labelKey) {
        const directory = new ObjectStorageService().getPrivateObjectDir().replace(/\/$/, "");
        const expectedLabelKey = `${directory}/chemical-notification-template-labels/${companyId}/${saved.id}.pdf`;
        if (labelKey === expectedLabelKey) {
          const [bucketName, ...parts] = labelKey.replace(/^\//, "").split("/");
          labelAttachmentUrl = await signObjectURL({ bucketName, objectName: parts.join("/"), method: "GET", ttlSec: TEMPLATE_LABEL_TTL_SEC });
        }
      }
      const date = (days: number) => {
        const sample = new Date();
        sample.setUTCDate(sample.getUTCDate() + days);
        return sample.toLocaleDateString("en-US", { timeZone: "America/Denver", dateStyle: "long" });
      };
      const { subject, html, textBody } = await renderChemicalEmail({
        productName: null, activeIngredient: null, epaRegNumber: null, purposeText: null,
        reentryInterval: null, wateringInstructions: null, mowingInstructions: null, postApplicationExpectation: null,
        ...fields,
      }, companyId, emailType, {
        customerName: "Sample Property", campaignTitle: "Sample Lawn Care Round",
        targetDate: date(7), backupDate: date(14), timeWindow: formatTimeWindow("08:00", "12:00"),
        applicatorName: "Sample Applicator", pesticideLicenseNumber: company?.pesticideLicenseNumber ?? "",
        completionDate: date(0), completionTime: "10:40 AM", areasTreated: "Front lawn, north strip",
        applicationConditions: "52°F, calm", nextVisitTitle: "Next lawn treatment", nextVisitDate: date(28),
        notes: emailType === "pre" ? "Please leave the side gate unlocked." : "We closed the side gate when we left.",
        labelAttachmentName: saved?.defaultLabelPdfFilename ?? "", labelAttachmentUrl,
      });
      return res.json({ subject, htmlBody: html, textBody });
    } catch (err) {
      console.error("Error previewing chemical notification template:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
