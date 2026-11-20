import type { Express, RequestHandler } from "express";
import { insertCommunicationTemplateSchema, type InsertCommunicationAuditLog } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { pickProvided } from "../lib/patchBody";
import { isRetiredTemplate, normalizeTemplateText } from "../services/communicationTemplateCleanup";
import { storage } from "../storage";

type Audit = (company: string, actor: string, action: InsertCommunicationAuditLog["actionType"],
  details: { templateId: string; actionDetails: Record<string, unknown> }) => Promise<void>;
const root = "/api/communication-templates";
const editable = insertCommunicationTemplateSchema.omit({ companyId: true, createdById: true }).partial();

export function registerCommunicationTemplates(app: Express, view: RequestHandler, manage: RequestHandler, audit: Audit, repo = storage) {
  app.get(root, view, async (req, res) => {
    const { activeCompanyId } = req.user as UserWithContext;
    const includeArchived = req.query.includeArchived === "true" || req.query.includeInactive === "true";
    const rows = await repo.getCommunicationTemplates(activeCompanyId, includeArchived);
    res.json(includeArchived ? rows : rows.filter(row => row.isActive && !isRetiredTemplate(row)));
  });
  app.get(`${root}/:id`, view, async (req, res) => {
    const row = await repo.getCommunicationTemplateById(String(req.params.id), (req.user as UserWithContext).activeCompanyId);
    if (!row) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(row);
  });
  app.post(root, manage, async (req, res) => {
    const user = req.user as UserWithContext;
    const parsed = insertCommunicationTemplateSchema.safeParse({ ...req.body, companyId: user.activeCompanyId, createdById: user.id });
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const values = parsed.data;
    if (isRetiredTemplate(values)) { res.status(422).json({ error: "This template is retired" }); return; }
    const row = await repo.createCommunicationTemplate({ ...values, body: normalizeTemplateText(values.body),
      subject: values.subject == null ? values.subject : normalizeTemplateText(values.subject) });
    await audit(user.activeCompanyId, user.id, "template_created", { templateId: row.id, actionDetails: { templateName: row.name, subject: row.subject } });
    res.status(201).json(row);
  });
  app.patch(`${root}/:id`, manage, async (req, res) => {
    const user = req.user as UserWithContext;
    const parsed = editable.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const updates = pickProvided(parsed.data, req.body);
    const id = String(req.params.id);
    const existing = await repo.getCommunicationTemplateById(id, user.activeCompanyId);
    if (!existing) { res.status(404).json({ error: "Template not found" }); return; }
    if (typeof updates.body === "string") updates.body = normalizeTemplateText(updates.body);
    if (typeof updates.subject === "string") updates.subject = normalizeTemplateText(updates.subject);
    const next = { ...existing, ...updates };
    if (!next.isArchived && (isRetiredTemplate(existing) || isRetiredTemplate(next))) {
      res.status(422).json({ error: "This template is retired" }); return;
    }
    const row = await repo.updateCommunicationTemplate(id, user.activeCompanyId, updates);
    if (!row) { res.status(404).json({ error: "Template not found" }); return; }
    await audit(user.activeCompanyId, user.id, "template_edited", { templateId: row.id, actionDetails: { templateName: row.name, subject: row.subject } });
    res.json(row);
  });
  const archive = (deleting: boolean): RequestHandler<{ id: string }> => async (req, res) => {
    const user = req.user as UserWithContext;
    const existing = await repo.getCommunicationTemplateById(req.params.id, user.activeCompanyId);
    if (!existing) { res.status(404).json({ error: "Template not found" }); return; }
    const archived = deleting || req.body?.archive !== false;
    if (!archived && isRetiredTemplate(existing)) { res.status(422).json({ error: "This template is retired" }); return; }
    const row = await repo.updateCommunicationTemplate(req.params.id, user.activeCompanyId, { isArchived: archived });
    if (!row) { res.status(404).json({ error: "Template not found" }); return; }
    await audit(user.activeCompanyId, user.id, "template_archived", { templateId: row.id, actionDetails: { templateName: row.name, archived } });
    if (deleting) res.sendStatus(204);
    else res.json(row);
  };
  app.delete(`${root}/:id`, manage, archive(true));
  app.post(`${root}/:id/archive`, manage, archive(false));
}
