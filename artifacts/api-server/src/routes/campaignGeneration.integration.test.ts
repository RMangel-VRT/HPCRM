import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  companies, users, customers, agreements, agreementTerms, termScopeLines, servicePrograms,
  campaigns, campaignItems, visits, campaignGenerationYears, campaignChecklistTasks, campaignItemTaskCompletions,
  tickets, ticketTypes, ticketTypeStatuses, campaignChecklistAuditLog,
  pool as schemaPool,
} from "@workspace/db";
import { db, pool } from "../db";
import { registerCampaignGenerationRoutes, campaignGenerationYear } from "./campaignGeneration";
import { reconcileCampaigns, runCampaignGeneration } from "../lib/campaignReconcile";
import { companyToday } from "../lib/companyDay";
import { campaignItemRow } from "../lib/campaignItemRow";
import { storage } from "../storage";
const a = `cg2-test-${randomUUID()}`, b = `cg2-test-${randomUUID()}`, uid = randomUUID();
const p = randomUUID(), agreement = randomUUID(), term = randomUUID();
const year = Number(companyToday().slice(0, 4)) + 1;
const month = `${year}-06-01`, today = `${year - 1}-11-10`;
const spread = [0,0,0,0,0,1,0,0,0,0,0,0];
const opts = { dryRun: false, userId: uid, today };
function app(role = "admin", companyId: string | null = a, authenticated = true) {
  const instance = express(); instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated,
      user: { id: uid, accessRole: role, activeRole: role, activeCompanyId: companyId, isSuperAdminBool: false } }); next();
  });
  registerCampaignGenerationRoutes(instance); return instance;
}
async function fixture() {
  await db.insert(companies).values([{ id: a, name: "Disposable CG2 A", slug: a }, { id: b, name: "Disposable CG2 B", slug: b }]);
  await db.insert(customers).values({ id: p, companyId: a, name: "Fixture property", street: "Test", city: "Test", state: "CO", zip: "00000" });
  await db.insert(agreements).values({ id: agreement, companyId: a, customerId: p });
  await db.insert(agreementTerms).values({ id: term, companyId: a, agreementId: agreement, line: "landscape", form: "ours",
    seasonLabel: "CG2 fixture", startDate: `${year}-01-01`, endDate: `${year}-12-31`, status: "sent", billingType: "seasonal" });
  await db.insert(termScopeLines).values({ companyId: a, termId: term, serviceKey: "chemical", line: "landscape", included: true, quantity: 1 });
  await db.insert(servicePrograms).values({ companyId: a, serviceKey: "chemical", rounds: 1, monthSpread: spread, isStandard: true });
}
async function rows() {
  return {
    campaigns: await db.select().from(campaigns).where(eq(campaigns.companyId, a)),
    items: await db.select().from(campaignItems).where(eq(campaignItems.companyId, a)),
    years: await db.select().from(campaignGenerationYears).where(eq(campaignGenerationYears.companyId, a)),
  };
}
describe("CG2 disposable development fixtures: rollback, generation and authorization", () => {
  beforeAll(async () => {
    await db.insert(users).values({ id: uid, name: "Disposable CG2", passwordHash: "unused-fixture" });
    const ddl = readFileSync(new URL("../../../../.migration-backup/migrations/0075_campaign_generation_years.sql", import.meta.url), "utf8");
    await db.execute(sql.raw(ddl)); await db.execute(sql.raw(ddl));
  });
  beforeEach(fixture);
  afterEach(async () => {
    await db.delete(visits).where(inArray(visits.companyId, [a, b]));
    await db.delete(companies).where(inArray(companies.id, [a, b]));
  });
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, uid)); await Promise.all([pool.end(), schemaPool.end()]);
  });
  it("preview reports identical changes but leaves no rows, including on repeated previews", async () => {
    const r = await runCampaignGeneration(a, year, { ...opts, dryRun: true });
    expect(r.created).toHaveLength(1); expect(r.added).toHaveLength(1); expect(r.waitingOnSignature).toBe(1);
    expect(r.created[0].campaignId).toBeNull(); expect(r.added[0].itemId).toBeNull();
    expect(await rows()).toEqual({ campaigns: [], items: [], years: [] });
    const again = await runCampaignGeneration(a, year, { ...opts, dryRun: true });
    expect(again).toEqual(r);
    // Preview savepoint rollback does not poison the caller's transaction.
    await db.transaction(async tx => {
      await reconcileCampaigns(tx, a, year, { ...opts, dryRun: true });
      expect((await tx.select().from(campaigns).where(eq(campaigns.companyId, a)))).toEqual([]);
    });
  });
  it("generates valid chemical rows, enables the year once and is idempotent including timestamps", async () => {
    const first = await runCampaignGeneration(a, year, opts), snapshot = await rows();
    expect(first.enabledAt).toBeTruthy();
    expect(snapshot.campaigns[0]).toMatchObject({ source: "contract", serviceKey: "chemical", category: "chemical", subtype: null, roundMonth: month, roundSeq: 1 });
    expect(snapshot.items[0]).toMatchObject({ customerName: "Fixture property", customerCity: "Test", workflowStep: "pre_communication", servicePlanCategory: null });
    const second = await runCampaignGeneration(a, year, opts);
    expect([second.created, second.added, second.removed, second.deleted]).toEqual([[], [], [], []]);
    expect(await rows()).toEqual(snapshot);
  });
  it("serializes concurrent generation under the company lock without duplicate rounds or items", async () => {
    const result = await Promise.all(Array.from({ length: 4 }, () => runCampaignGeneration(a, year, opts)));
    expect(result.reduce((sum, r) => sum + r.created.length, 0)).toBe(1);
    const state = await rows(); expect(state.campaigns).toHaveLength(1); expect(state.items).toHaveLength(1);
  });
  it("deletes only unworked pending items and empty future active rounds, preview removal rolls back", async () => {
    await runCampaignGeneration(a, year, opts);
    const before = await rows();
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    const preview = await runCampaignGeneration(a, year, { ...opts, dryRun: true });
    expect(preview.removed).toHaveLength(1); expect(preview.deleted).toHaveLength(1);
    expect(await rows()).toEqual(before);
    const actual = await runCampaignGeneration(a, year, opts);
    expect(actual.removed).toHaveLength(1); expect((await rows()).campaigns).toEqual([]);
  });
  it.each([
    { status: "completed" as const }, { status: "skipped" as const }, { preCommSentAt: new Date() },
    { workCompletedAt: new Date() }, { postCommSentAt: new Date() }, { workflowStep: "work_in_progress" as const },
    { photos: ["fixture-photo"] }, { completionPhotoStorageKeys: ["fixture-completion"] },
    { targetDate: month }, { completionNotes: "Work recorded" },
  ])("retains protected work %j", async progress => {
    await runCampaignGeneration(a, year, opts);
    const [item] = (await rows()).items;
    await db.update(campaignItems).set(progress).where(eq(campaignItems.id, item.id));
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    const r = await runCampaignGeneration(a, year, opts);
    expect(r.keptNotOwed).toHaveLength(1); expect(r.removed).toEqual([]);
    expect((await rows()).items).toHaveLength(1);
  });
  it("protects any-status visits and checklist completions", async () => {
    await runCampaignGeneration(a, year, opts);
    const [item] = (await rows()).items;
    await db.insert(visits).values({ companyId: a, sourceType: "campaign_item", campaignItemId: item.id, visitDate: month, status: "cancelled" });
    const [task] = await db.insert(campaignChecklistTasks).values({ campaignId: item.campaignId, label: "Fixture checklist" }).returning();
    await db.insert(campaignItemTaskCompletions).values({ campaignItemId: item.id, campaignChecklistTaskId: task.id });
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    expect((await runCampaignGeneration(a, year, opts)).keptNotOwed).toHaveLength(1);
    await db.delete(visits).where(eq(visits.campaignItemId, item.id));
    expect((await runCampaignGeneration(a, year, opts)).keptNotOwed).toHaveLength(1);
  });
  it("retains linked tickets without moving or rewriting the item", async () => {
    await runCampaignGeneration(a, year, opts);
    const [type] = await db.insert(ticketTypes).values({ companyId: a, name: "Fixture ticket type" }).returning();
    const [status] = await db.insert(ticketTypeStatuses).values({ ticketTypeId: type.id, name: "Fixture status", displayOrder: 0 }).returning();
    const [ticket] = await db.insert(tickets).values({ companyId: a, ticketTypeId: type.id, currentStatusId: status.id, title: "Fixture ticket", createdById: uid }).returning();
    const [item] = (await rows()).items;
    await db.update(campaignItems).set({ ticketId: ticket.id }).where(eq(campaignItems.id, item.id));
    const before = (await rows()).items[0];
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    expect((await runCampaignGeneration(a, year, opts)).keptNotOwed).toHaveLength(1);
    expect((await rows()).items[0]).toEqual(before);
  });
  it("retains unchecked checklist history in both preview and Generate after contract removal", async () => {
    await runCampaignGeneration(a, year, opts);
    const [item] = (await rows()).items;
    const [task] = await db.insert(campaignChecklistTasks).values({ campaignId: item.campaignId, label: "Recorded then unchecked" }).returning();
    await storage.toggleCampaignChecklistTaskTx({ campaignItemId: item.id, taskId: task.id, userId: uid, currentlyCompleted: false });
    await storage.toggleCampaignChecklistTaskTx({ campaignItemId: item.id, taskId: task.id, userId: uid, currentlyCompleted: true });
    expect(await db.select().from(campaignItemTaskCompletions).where(eq(campaignItemTaskCompletions.campaignItemId, item.id))).toEqual([]);
    const history = await db.select().from(campaignChecklistAuditLog).where(eq(campaignChecklistAuditLog.campaignItemId, item.id))
      .orderBy(campaignChecklistAuditLog.id);
    expect(history.map(h => h.action).sort()).toEqual(["completed", "uncompleted"]);
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    const before = await rows();
    for (const dryRun of [true, false]) {
      const report = await runCampaignGeneration(a, year, { ...opts, dryRun });
      expect(report.keptNotOwed).toMatchObject([{ itemId: item.id }]);
      expect(report.removed).toEqual([]); expect(report.deleted).toEqual([]);
      expect(await rows()).toEqual(before);
      expect(await db.select().from(campaignChecklistAuditLog).where(eq(campaignChecklistAuditLog.campaignItemId, item.id))
        .orderBy(campaignChecklistAuditLog.id)).toEqual(history);
    }
  });
  it.each(["Office recorded a follow-up instruction", " "])("retains pending notes %j in preview and Generate", async notes => {
    await runCampaignGeneration(a, year, opts);
    const [item] = (await rows()).items;
    await db.update(campaignItems).set({ notes }).where(eq(campaignItems.id, item.id));
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    const before = await rows();
    for (const dryRun of [true, false]) {
      const report = await runCampaignGeneration(a, year, { ...opts, dryRun });
      expect(report.keptNotOwed).toMatchObject([{ itemId: item.id }]);
      expect(report.removed).toEqual([]); expect(report.deleted).toEqual([]);
      expect(await rows()).toEqual(before);
      expect((await rows()).items[0].notes).toBe(notes);
    }
  });
  it("creates general/irrigation identities and sequences multiple rounds in one month", async () => {
    await db.delete(termScopeLines).where(eq(termScopeLines.termId, term));
    for (const serviceKey of ["aeration", "irrigation_open", "irrigation_winterization"]) {
      await db.insert(termScopeLines).values({ companyId: a, termId: term, serviceKey,
        line: serviceKey === "aeration" ? "landscape" : "irrigation", included: true,
        quantity: 2, monthSpread: spread.map(n => n * 2) });
    }
    const r = await runCampaignGeneration(a, year, opts);
    expect(r.created).toHaveLength(6);
    const state = await rows();
    for (const campaign of state.campaigns) {
      expect(campaign.title).toContain(`(${campaign.roundSeq} of 2)`);
      expect(campaign).toMatchObject(campaign.serviceKey === "aeration" ? { category: "general", subtype: null } :
        { category: "irrigation", subtype: campaign.serviceKey === "irrigation_open" ? "spring_turn_on" : "winterization" });
    }
    expect(state.items.every(i => i.servicePlanCategory === null && i.workflowStep === null)).toBe(true);
  });
  it("reports missed demand and never creates an already-passed round", async () => {
    const r = await runCampaignGeneration(a, year, { ...opts, today: `${year}-07-01` });
    expect(r.missed).toHaveLength(1); expect(r.created).toEqual([]); expect((await rows()).items).toEqual([]);
  });
  it("keeps elapsed pending items and empty started/closed campaigns", async () => {
    await runCampaignGeneration(a, year, opts);
    const [campaign] = (await rows()).campaigns;
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    const elapsed = await runCampaignGeneration(a, year, { ...opts, today: `${year}-07-01` });
    expect(elapsed.keptNotOwed).toHaveLength(1);
    await db.delete(campaignItems).where(eq(campaignItems.campaignId, campaign.id));
    expect((await runCampaignGeneration(a, year, { ...opts, today: month })).deleted).toEqual([]);
    await db.update(campaigns).set({ status: "archived" }).where(eq(campaigns.id, campaign.id));
    expect((await runCampaignGeneration(a, year, opts)).deleted).toEqual([]);
  });
  it("adds to closed rounds without reopening them, and reports it", async () => {
    await runCampaignGeneration(a, year, opts);
    const [campaign] = (await rows()).campaigns;
    await db.delete(campaignItems).where(eq(campaignItems.campaignId, campaign.id));
    await db.update(campaigns).set({ status: "completed" }).where(eq(campaigns.id, campaign.id));
    const r = await runCampaignGeneration(a, year, opts);
    expect(r.addedToClosedRound).toHaveLength(1);
    expect((await rows()).campaigns[0].status).toBe("completed");
  });
  it("never changes manual campaigns/items and isolates overlapping campaign projections by company", async () => {
    const [manual] = await db.insert(campaigns).values({ companyId: a, title: "Manual overlap", windowStart: month, windowEnd: `${year}-06-30` }).returning();
    const [customer] = await db.select().from(customers).where(eq(customers.id, p));
    const [item] = await db.insert(campaignItems).values(campaignItemRow(manual, customer)).returning();
    await db.insert(campaigns).values({ companyId: b, title: "Other company", windowStart: month, windowEnd: `${year}-06-30` });
    const r = await runCampaignGeneration(a, year, opts);
    expect(r.manualCampaigns.map(c => c.id)).toEqual([manual.id]);
    expect((await db.select().from(campaigns).where(eq(campaigns.id, manual.id)))[0]).toEqual(manual);
    expect((await db.select().from(campaignItems).where(eq(campaignItems.id, item.id)))[0]).toEqual(item);
    const foreign = await runCampaignGeneration(b, year, opts); expect(foreign.created).toEqual([]); expect(foreign.rounds).toEqual([]);
  });
  it("returns actionable real fixture gaps and refuses public company/user/dry-run overrides", async () => {
    await db.delete(servicePrograms).where(eq(servicePrograms.companyId, a));
    const preview = await request(app("office")).get(`/api/campaign-generation/${year}/preview`).set("X-Company-Id", a);
    expect(preview.status).toBe(200); expect(preview.headers["cache-control"]).toBe("no-store");
    expect(preview.body.gaps).toMatchObject([{ propertyId: p, termId: term, agreementId: agreement, kind: "no_timing" }]);
    expect((await request(app()).post(`/api/campaign-generation/${year}`).set("X-Company-Id", a).send({ confirm: true, companyId: b })).status).toBe(400);
    expect((await request(app()).post(`/api/campaign-generation/${year}`).send({ confirm: true })).status).toBe(409);
    expect((await rows()).years).toEqual([]);
  });
  it("enforces role, year, confirmation and initiating-company gates", async () => {
    for (const role of ["office", "account_manager", "field_manager", "field", "crew_supervisor"]) {
      expect((await request(app(role)).post(`/api/campaign-generation/${year}`).set("X-Company-Id", a).send({ confirm: true })).status).toBe(403);
    }
    expect((await request(app("field")).get(`/api/campaign-generation/${year}/preview`)).status).toBe(403);
    expect((await request(app("admin", null)).get(`/api/campaign-generation/${year}/preview`)).status).toBe(403);
    expect((await request(app("admin", a, false)).get(`/api/campaign-generation/${year}/preview`)).status).toBe(401);
    expect((await request(app()).get(`/api/campaign-generation/${year + 1}/preview`)).status).toBe(400);
    expect((await request(app()).get(`/api/campaign-generation/${year}/preview`).set("X-Company-Id", b)).status).toBe(409);
    expect((await request(app()).post(`/api/campaign-generation/${year}`).set("X-Company-Id", a).send({})).status).toBe(400);
    const generated = await request(app()).post(`/api/campaign-generation/${year}`).set("X-Company-Id", a).send({ confirm: true });
    expect(generated.status).toBe(200); expect(generated.body.enabledAt).toBeTruthy();
    expect(generated.headers["cache-control"]).toBe("no-store");
    expect(campaignGenerationYear("2026", "2026-12-31")).toBe(2026);
    expect(() => campaignGenerationYear("2028", "2026-12-31")).toThrow();
  });
  it("rolls back generation entirely on failure, including year opt-in", async () => {
    await expect(runCampaignGeneration(a, year, { ...opts, userId: "nonexistent-fixture-user" })).rejects.toThrow();
    expect(await rows()).toEqual({ campaigns: [], items: [], years: [] });
  });
});
