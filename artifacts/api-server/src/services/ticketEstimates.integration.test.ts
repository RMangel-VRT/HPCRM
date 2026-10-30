import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, customers, users, tickets, ticketTypes, ticketTypeStatuses, ticketTypeFields,
  ticketFieldValues, ticketStatusHistory, estimateLines, insertTicketSchema, insertTicketFieldValueSchema, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { storage } from "../storage";
import { createEstimate, createLine } from "./estimates";
import { transitionEstimate } from "./estimateLifecycle";
import { readTicketEstimate, loadTicketEstimateSummaries } from "./ticketEstimates";
import { registerEstimateRoutes } from "../routes/estimates";
import { registerTicketExpectedCompany } from "../lib/ticketExpectedCompany";
import { transactionalTicketPatch } from "../lib/ticketPatchTransaction";
import { applyTicketStatus } from "../lib/ticketStatusChange";
import { applySchedulingTransition } from "../lib/schedulingTransition";
import { applyVisitTicketEdit } from "../lib/visitTicketCompatibility";
import { maintainScheduleBy } from "../lib/scheduleByMaintenance";
import { pickProvided } from "../lib/patchBody";
import { isSeededTicketType, isSeededStatus, findSeededStatus } from "../shared/ticketCapabilities";
import { maybeAutoCreateInvoiceOnRfb } from "../lib/rfbInvoiceAutoCreate";
import { canSeeBilling, isBillingInvoiceAction } from "../lib/billing";
import { assertNotParentCustomer } from "../utils/parentGuard";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
const company = `ticket-estimate-${randomUUID()}`, foreign = `ticket-estimate-${randomUUID()}`, actor = randomUUID();
let customer: string, type: string, custom: string;
const source = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
// Run the real unchanged handlers and transaction, excluding unrelated startup backfills.
const patchStart = source.indexOf('  app.patch("/api/tickets/:id",');
const patchEnd = source.indexOf("\n  }));", patchStart) + "\n  }));".length;
const putStart = source.indexOf('  app.put("/api/tickets/:ticketId/field-values/:fieldId",');
const putEnd = source.indexOf("\n  });", putStart) + "\n  });".length;
if (patchStart < 0 || putStart < 0) throw new Error("Ticket handlers not found");
const approved = source.match(/const APPROVED_BILLING_STATUS_KEYS = \[[\s\S]*?\] as const;/)![0];
function mountTicketWrites(app: ReturnType<typeof express>) {
  const deps = { storage, db, sql, and, insertTicketSchema, insertTicketFieldValueSchema, transactionalTicketPatch,
    applyTicketStatus, applySchedulingTransition, applyVisitTicketEdit, maintainScheduleBy, pickProvided,
    isSeededTicketType, isSeededStatus, findSeededStatus, maybeAutoCreateInvoiceOnRfb, canSeeBilling, isBillingInvoiceAction, assertNotParentCustomer,
    ensureInvoiceTicketType: async () => { throw new Error("Approved status must not create invoice tickets"); } };
  const mount = new Function(...Object.keys(deps), "app", transformSync(
    `${approved}\n${source.slice(patchStart, patchEnd)}\n${source.slice(putStart, putEnd)}`, { loader: "ts", target: "es2022" }).code);
  mount(...Object.values(deps), app);
}
function appFor(activeCompanyId = company, role = "admin") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: actor, activeCompanyId, activeRole: role, activeTags: [] } as unknown as Express.User; next();
  });
  registerTicketExpectedCompany(app); registerEstimateRoutes(app); mountTicketWrites(app);
  return app;
}
async function ticket(ticketTypeId = type) {
  const [row] = await db.insert(tickets).values({ companyId: company, customerId: customer, ticketTypeId,
    title: "Disposable integration", workType: "estimate_request", createdById: actor,
    currentStatusId: `${type}-proposal_sent`, billingBehavior: "internal" }).returning();
  return row;
}
async function draft() {
  const t = await ticket();
  const e = await createEstimate(company, actor, { ticketId: t.id, customerId: customer, title: t.title });
  return { ticket: t, estimate: await createLine(company, e.id, e.version.id, { sectionId: e.version.sections[0].id,
    lineType: "custom", name: "Fixture", unit: "ea", quantity: "2.5", unitPriceCents: 33, umbrellaKey: "landscape_materials" }) };
}
beforeAll(async () => {
  await db.insert(companies).values([{ id: company, slug: company, name: "Disposable ticket estimate" }, { id: foreign, slug: foreign, name: "Disposable foreign estimate" }]);
  await db.insert(users).values({ id: actor, name: "Disposable actor", passwordHash: "not-a-login" });
  [customer] = (await db.insert(customers).values({ companyId: company, name: "Disposable property", street: "Test", city: "Test", state: "CO", zip: "00000" }).returning()).map(r => r.id);
  [type, custom] = (await db.insert(ticketTypes).values([
    { companyId: company, name: "Renamed seeded", typeKey: "estimate_request" }, { companyId: company, name: "Estimate Request" },
  ]).returning()).map(r => r.id);
  await db.insert(ticketTypeStatuses).values(["proposal_sent", "decision_received", "ready_to_schedule", "closed_lost"].map((key, i) => ({
    id: `${type}-${key}`, ticketTypeId: type, statusKey: key, name: `Renamed ${key}`, displayOrder: i,
    isFinal: key === "closed_lost" ? "true" as const : "false" as const, actionType: "needs_action" as const,
  })));
});
afterAll(async () => {
  await db.delete(tickets).where(eq(tickets.companyId, company));
  await db.delete(companies).where(inArray(companies.id, [company, foreign]));
  await db.delete(users).where(eq(users.id, actor));
  await Promise.all([pool.end(), schemaPool.end()]);
});
describe("real PostgreSQL ticket estimate integration", () => {
  it("returns null only for owned no-estimate tickets and never leaks foreign tickets/estimates", async () => {
    const t = await ticket();
    expect(await readTicketEstimate(company, t.id)).toBeNull();
    const data = await draft();
    expect((await request(appFor()).get(`/api/estimates/by-ticket/${data.ticket.id}`)).body.estimateNumber).toBe(data.estimate.estimateNumber);
    expect((await request(appFor(foreign)).get(`/api/estimates/by-ticket/${data.ticket.id}`)).status).toBe(404);
    expect((await request(appFor()).get(`/api/estimates/by-ticket/${data.ticket.id}`).set("X-Company-Id", foreign)).status).toBe(409);
    for (const role of ["field", "field_manager", "crew_supervisor", "mapping", "shop_manager", "landscape_supervisor", "chemical_manager", "irrigation_manager"])
      expect((await request(appFor(company, role)).get(`/api/estimates/by-ticket/${data.ticket.id}`)).status).toBe(403);
  });
  it("batch totals reuse exact snapshot math, frozen totals never refresh, and void is excluded", async () => {
    const { ticket: t, estimate: e } = await draft();
    expect((await loadTicketEstimateSummaries(company, [t.id])).get(t.id)?.subtotalCents).toBe(83);
    expect((await loadTicketEstimateSummaries(foreign, [t.id])).size).toBe(0);
    await transitionEstimate(company, actor, e.id, e.version.id, "send", { method: "email" });
    // Prove frozen non-draft authority even if an external writer damaged the line.
    await db.update(estimateLines).set({ unitPriceCents: 1000 }).where(eq(estimateLines.versionId, e.version.id));
    expect((await loadTicketEstimateSummaries(company, [t.id])).get(t.id)?.subtotalCents).toBe(83);
    expect((await readTicketEstimate(company, t.id))?.subtotalCents).toBe(83);
    await transitionEstimate(company, actor, e.id, undefined, "void", { reason: "Fixture" });
    expect((await loadTicketEstimateSummaries(company, [t.id])).size).toBe(0);
    expect(await readTicketEstimate(company, t.id)).toBeNull();
  });
  it("retains accepted history beside a change-order draft in the ticket summary", async () => {
    const { ticket: t, estimate: e } = await draft();
    await transitionEstimate(company, actor, e.id, e.version.id, "send", { method: "email" });
    await transitionEstimate(company, actor, e.id, e.version.id, "accept", { method: "phone", acceptedOn: "2026-10-29", poNumber: "PO-test" });
    await transitionEstimate(company, actor, e.id, e.version.id, "revise", {});
    const summary = await readTicketEstimate(company, t.id);
    expect(summary?.version).toMatchObject({ versionNumber: 2, status: "draft" });
    expect(summary?.versions.find(v => v.status === "accepted")).toMatchObject({ versionNumber: 1, poNumber: "PO-test", acceptedOn: "2026-10-29" });
    expect(summary?.subtotalCents).toBe(83);
  });
  it("acceptance from proposal_sent runs the real transactional PATCH with invoice_required and history before Approved PUT", async () => {
    const { ticket: t, estimate: e } = await draft();
    await transitionEstimate(company, actor, e.id, e.version.id, "send", { method: "email" });
    await transitionEstimate(company, actor, e.id, e.version.id, "accept", { method: "email_approval", acceptedOn: "2026-10-29" });
    const [field] = await db.insert(ticketTypeFields).values({ ticketTypeId: type, fieldKey: "decision_outcome",
      fieldLabel: "Decision", fieldType: "select", options: ["Approved", "Denied"], displayOrder: 0 }).returning();
    const app = appFor();
    const patched = await request(app).patch(`/api/tickets/${t.id}`).set("X-Company-Id", company)
      .send({ currentStatusId: `${type}-ready_to_schedule` });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body).toMatchObject({ currentStatusId: `${type}-ready_to_schedule`, billingBehavior: "invoice_required" });
    expect((await db.select().from(ticketStatusHistory).where(eq(ticketStatusHistory.ticketId, t.id)))).toContainEqual(
      expect.objectContaining({ fromStatusId: `${type}-proposal_sent`, toStatusId: `${type}-ready_to_schedule` }));
    const put = await request(app).put(`/api/tickets/${t.id}/field-values/${field.id}`).set("X-Company-Id", company).send({ value: "Approved" });
    expect(put.status).toBe(200);
    expect((await storage.getTicketById(t.id, company))?.billingBehavior).toBe("invoice_required");
    expect((await request(app).patch(`/api/tickets/${t.id}`).set("X-Company-Id", foreign).send({ currentStatusId: `${type}-closed_lost` })).status).toBe(409);
  });
  it("legacy-field DML is scoped, rerunnable and preserves captured values and custom exact-name fields", async () => {
    const t = await ticket();
    const fields = await db.insert(ticketTypeFields).values([type, custom].map(ticketTypeId => ({
      ticketTypeId, fieldKey: "qb_estimate_number", fieldLabel: "QuickBooks Estimate #", fieldType: "text" as const, isRequired: "true" as const, displayOrder: 1,
    }))).returning();
    await db.insert(ticketFieldValues).values({ ticketId: t.id, fieldId: fields[0].id, value: "QBO-historical", capturedById: actor });
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0059_legacy_qb_estimate_number.sql", import.meta.url), "utf8");
    expect(migration).not.toMatch(/\b(CREATE|ALTER|DROP|DELETE)\b/i);
    // Add a fixture-company restriction so no actual company fields are changed by this assertion.
    const fixtureMigration = sql`${sql.raw(migration.replace(/;\s*$/, ""))} AND type.company_id = ${company}`;
    await db.transaction(async tx => {
      await tx.execute(fixtureMigration); await tx.execute(fixtureMigration);
      expect((await tx.select().from(ticketTypeFields).where(eq(ticketTypeFields.id, fields[0].id)))[0])
        .toMatchObject({ fieldLabel: "Legacy QuickBooks Estimate #", isRequired: "false" });
      expect((await tx.select().from(ticketTypeFields).where(eq(ticketTypeFields.id, fields[1].id)))[0])
        .toMatchObject({ fieldLabel: "QuickBooks Estimate #", isRequired: "true" });
      expect((await tx.select().from(ticketFieldValues).where(and(eq(ticketFieldValues.ticketId, t.id), eq(ticketFieldValues.fieldId, fields[0].id))))[0].value).toBe("QBO-historical");
    });
    expect(source).toContain('fieldKey: "qb_estimate_number", fieldLabel: "Legacy QuickBooks Estimate #", fieldType: "text", isRequired: "false"');
  });
});
