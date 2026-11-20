import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { companies, companyDocumentSettings, communicationAuditLog, emailRules, emailTemplates, users,
  LEGACY_CHEMICAL_TEMPLATE_NAMES } from "@workspace/db";
import { expect, it } from "vitest";
import { db, inTransaction } from "../db";
import { estimateWordingSample, chemicalWordingSample } from "../services/outgoingEmail/wordingPreview";
import { loadEmailCompany } from "../services/outgoingEmail/company";
import { buildEstimateEmail } from "../services/outgoingEmail/estimateEmail";
import { renderChemicalEmail } from "../services/outgoingEmail/chemicalEmail";
import { DEFAULT_WORDING, getEmailWording } from "../services/outgoingEmail/wording";
import { migrateRemoveChemicalEmailTemplates } from "../services/legacyChemEmailCleanup";
import { registerEmailWording } from "./emailWording";

it("scopes wording, audits writes and uses the real estimate and chemical renderers", async () => {
  const a = randomUUID(), b = randomUUID(), actorId = randomUUID();
  const rollback = Symbol("rollback");
  await expect(db.transaction(async tx => {
    await tx.insert(companies).values([{ id: a, slug: a, name: "A & Lawn" }, { id: b, slug: b, name: "B Lawn" }]);
    await tx.insert(users).values({ id: actorId, name: "Wording Tester", passwordHash: "not-a-login-fixture" });
    await tx.insert(companyDocumentSettings).values({ companyId: a, addressLine1: "123 Sample St", phone: "303-555-0100", email: "office@example.test" });
    const [template] = await tx.insert(emailTemplates).values({ companyId: a, name: "Work Completed Notification", subject: "Legacy", htmlBody: "" }).returning();
    const [rule] = await tx.insert(emailRules).values({ companyId: a, eventKey: "ticket.work_completed", templateId: template.id, isEnabled: false }).returning();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const role = req.get("x-role") ?? "admin";
      Object.assign(req, {
        isAuthenticated: () => role !== "guest",
        user: { id: actorId, name: "Wording Tester", activeCompanyId: req.get("x-test-tenant") === "B" ? b : a,
          activeRole: role, accessRole: role },
      });
      inTransaction(tx, async () => { next(); }).catch(next);
    });
    registerEmailWording(app);
    const api = request(app), root = "/api/email-wording";
    const original = DEFAULT_WORDING.estimate;
    const draft = { ...original, subject: "Review {estimateNumber} — {customerName}", intro: "A note from {companyName}." };
    const list = await api.get(root).set("x-role", "office").expect(200);
    expect(list.body).toHaveLength(14);
    expect(new Set(list.body.map((e: { key: string }) => e.key))).toEqual(new Set(Object.keys(DEFAULT_WORDING)));
    for (const { key, wording } of list.body) {
      const result = await api.post(`${root}/${key}/preview`).set("x-role", "office").send(wording).expect(200);
      expect(result.body).toMatchObject({ subject: expect.any(String), preview: expect.any(String), html: expect.any(String),
        text: expect.stringContaining("123 Sample St"), fieldErrors: null });
    }
    await api.get(`${root}/work-completed-rule`).set("x-role", "office").expect(200, { rule: { id: rule.id, isEnabled: false } });
    await api.get(root).set("x-role", "field").expect(403);
    await api.get(root).set("x-role", "guest").expect(401);
    await api.get(root).set("X-Company-Id", b).expect(409);
    await api.put(`${root}/estimate`).set("X-Company-Id", b).send(draft).expect(409);
    await api.delete(`${root}/estimate`).set("X-Company-Id", b).expect(409);
    await api.post(`${root}/estimate/preview`).set("X-Company-Id", b).send(draft).expect(409);
    await api.put(`${root}/estimate`).set("x-role", "office").send(draft).expect(403);
    await api.delete(`${root}/estimate`).set("x-role", "office").expect(403);
    await api.put(`${root}/constructor`).send(draft).expect(404);
    await api.delete(`${root}/unknown`).expect(404);
    await api.post(`${root}/unknown/preview`).send(draft).expect(404);
    const invalid = { ...draft, subject: "Invalid {dueDate}", intro: "<b>Hi</b>" };
    const error = await api.put(`${root}/estimate`).send(invalid).expect(422);
    expect(error.body).toMatchObject({ message: "Fix the highlighted fields.", fieldErrors: { subject: expect.any(String), intro: expect.any(String) } });
    await api.post(`${root}/estimate/preview`).send(invalid).expect(200, { fieldErrors: error.body.fieldErrors });

    const draftPreview = await api.post(`${root}/estimate/preview`).send(draft).expect(200);
    const company = await inTransaction(tx, () => loadEmailCompany(a));
    const input = estimateWordingSample(a, false, company);
    expect(draftPreview.body).toEqual({ ...await buildEstimateEmail({ ...input, wording: draft }), fieldErrors: null });
    expect(draftPreview.body.html).toContain("A note from A &amp; Lawn.");
    expect(await getEmailWording(a, "estimate", tx)).toEqual(original);
    const saved = await api.put(`${root}/estimate`).send({ ...draft, companyId: b, updatedById: "someone-else" }).expect(200);
    expect(saved.body).toMatchObject({ isCustom: true, updatedAt: expect.any(String), updatedBy: "Wording Tester", wording: draft });
    expect(await getEmailWording(a, "estimate", tx)).toEqual(draft);
    expect(await getEmailWording(b, "estimate", tx)).toEqual(original);
    expect((await buildEstimateEmail({ ...input, connection: tx })).subject).toBe("Review EST-2026-0001 — Sample Customer");
    const other = await api.get(root).set("x-test-tenant", "B").expect(200);
    expect(other.body.find((e: { key: string }) => e.key === "estimate")).toMatchObject({ isCustom: false, wording: original });
    await api.delete(`${root}/estimate`).set("x-test-tenant", "B").expect(204);
    expect(await getEmailWording(a, "estimate", tx)).toEqual(draft);

    const revised = { ...draft, intro: "Updated wording." };
    await api.put(`${root}/estimate`).send(revised).expect(200);
    expect(await getEmailWording(a, "estimate", tx)).toEqual(revised);
    const chemical = { ...DEFAULT_WORDING.chemical_upcoming, intro: "A heads-up from {companyName} about {treatmentName}." };
    await api.put(`${root}/chemical_upcoming`).send(chemical).expect(200);
    const { treatment, visit } = chemicalWordingSample(false);
    const realChemical = await inTransaction(tx, () => renderChemicalEmail(treatment, a, "pre", visit));
    expect(realChemical.html).toContain("A heads-up from A &amp; Lawn about Broadleaf Weed Control.");
    await api.post(`${root}/chemical_upcoming/preview`).send(chemical).expect(200, {
      subject: realChemical.subject, preview: realChemical.preview, html: realChemical.html, text: realChemical.textBody, fieldErrors: null,
    });

    await api.delete(`${root}/estimate`).expect(204);
    await api.delete(`${root}/estimate`).expect(204);
    expect(await getEmailWording(a, "estimate", tx)).toEqual(original);
    const audit = await tx.select().from(communicationAuditLog).where(eq(communicationAuditLog.companyId, a));
    expect(audit.map(row => row.actionDetails)).toEqual([
      { kind: "email_wording", emailKey: "estimate", operation: "save" },
      { kind: "email_wording", emailKey: "estimate", operation: "save" },
      { kind: "email_wording", emailKey: "chemical_upcoming", operation: "save" },
      { kind: "email_wording", emailKey: "estimate", operation: "reset" },
    ]);
    expect(audit.every(row => row.actionByUserId === actorId)).toBe(true);
    throw rollback;
  })).rejects.toBe(rollback);
});

it("removes only named, unreferenced legacy rows and leaves existing rules intact", async () => {
  const a = randomUUID(), b = randomUUID();
  const rollback = Symbol("rollback");
  await expect(db.transaction(async tx => {
    await tx.insert(companies).values([{ id: a, slug: a, name: "A" }, { id: b, slug: b, name: "B" }]);
    const [notice, referenced, unrelated, other] = await tx.insert(emailTemplates).values([
      { companyId: a, name: LEGACY_CHEMICAL_TEMPLATE_NAMES[0] },
      { companyId: a, name: LEGACY_CHEMICAL_TEMPLATE_NAMES[1] },
      { companyId: a, name: "Unrelated legacy wording" },
      { companyId: b, name: LEGACY_CHEMICAL_TEMPLATE_NAMES[0] },
    ].map(row => ({ ...row, subject: "", htmlBody: "" }))).returning();
    await tx.insert(emailRules).values({ companyId: b, templateId: referenced.id, eventKey: "previous.legacy.rule", isEnabled: false });
    expect(await inTransaction(tx, () => migrateRemoveChemicalEmailTemplates(a))).toBe(1);
    expect(await inTransaction(tx, () => migrateRemoveChemicalEmailTemplates(a))).toBe(0);
    const rows = await tx.select().from(emailTemplates).where(eq(emailTemplates.companyId, a));
    expect(rows.map(row => row.id).sort()).toEqual([referenced.id, unrelated.id].sort());
    expect((await tx.select().from(emailTemplates).where(eq(emailTemplates.id, other.id)))[0]?.id).toBe(other.id);
    expect((await tx.select().from(emailRules).where(eq(emailRules.templateId, referenced.id)))[0]?.isEnabled).toBe(false);
    expect(rows.some(row => row.id === notice.id)).toBe(false);
    throw rollback;
  })).rejects.toBe(rollback);
});
