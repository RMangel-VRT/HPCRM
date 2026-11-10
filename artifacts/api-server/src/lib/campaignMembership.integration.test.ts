import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { companies, customers, agreements, agreementTerms, termScopeLines, servicePrograms,
  campaignGenerationYears, campaigns, campaignItems, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { campaignMembershipStatus, reconcileEnabledCampaignYears, scheduleCampaignMembership } from "./campaignMembership";
import { withCampaignContractStates } from "./campaignContractState";
import { registerCampaignGenerationRoutes } from "../routes/campaignGeneration";
import { companyToday } from "./companyDay";

let a: string, b: string, property: string, agreement: string, term: string;
const year = Number(companyToday().slice(0, 4)) + 1;
const today = `${year - 1}-11-10`, june = `${year}-06-01`;
const spread = (month: number) => Array.from({ length: 12 }, (_, i) => i + 1 === month ? 1 : 0);
const items = () => db.select().from(campaignItems).where(eq(campaignItems.companyId, a));
const rounds = () => db.select().from(campaigns).where(eq(campaigns.companyId, a));
async function enable(companyId = a, y = year) {
  await db.insert(campaignGenerationYears).values({ companyId, year: y });
}
async function project() {
  const round = (await rounds()).find(r => r.source === "contract")!;
  return withCampaignContractStates(round, await items(), today);
}
describe("CG3 membership on disposable development companies, without Generate", () => {
  beforeEach(async () => {
    a = `cg3-${randomUUID()}`; b = `cg3-${randomUUID()}`;
    property = randomUUID(); agreement = randomUUID(); term = randomUUID();
    await db.insert(companies).values([{ id: a, slug: a, name: "Disposable CG3 A" }, { id: b, slug: b, name: "Disposable CG3 B" }]);
    await db.insert(customers).values({ id: property, companyId: a, name: "CG3 fixture property", street: "Test", city: "Test", state: "CO", zip: "00000" });
    await db.insert(agreements).values({ id: agreement, companyId: a, customerId: property });
    await db.insert(agreementTerms).values({ id: term, companyId: a, agreementId: agreement, line: "landscape",
      form: "ours", seasonLabel: "CG3 fixture", startDate: `${year}-01-01`, endDate: `${year}-12-31`, status: "sent", billingType: "seasonal" });
    await db.insert(termScopeLines).values({ companyId: a, termId: term, serviceKey: "chemical", line: "landscape", included: true, quantity: 1 });
    await db.insert(servicePrograms).values({ companyId: a, serviceKey: "chemical", rounds: 1, monthSpread: spread(6), isStandard: true });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete(companies).where(inArray(companies.id, [a, b]));
  });
  afterAll(async () => { await Promise.all([pool.end(), schemaPool.end()]); });

  it("never enables or generates a disabled year", async () => {
    await scheduleCampaignMembership(a, today);
    expect(await rounds()).toEqual([]); expect(await items()).toEqual([]);
    expect((await campaignMembershipStatus(a, year)).enabledAt).toBeNull();
  });
  it("serializes rapid reconciliations, preserves opt-in time, and leaves manual campaigns unchanged", async () => {
    await enable();
    const [manual] = await db.insert(campaigns).values({ companyId: a, title: "Handmade", category: "chemical",
      windowStart: june, windowEnd: `${year}-06-30` }).returning();
    const initial = await campaignMembershipStatus(a, year);
    await Promise.all(Array.from({ length: 5 }, () => scheduleCampaignMembership(a, today)));
    expect(await items()).toHaveLength(1);
    expect((await rounds()).find(r => r.id === manual.id)).toEqual(manual);
    expect(await campaignMembershipStatus(a, year)).toMatchObject({ enabledAt: initial.enabledAt, changes: 0, error: null });
    expect((await campaignMembershipStatus(a, year)).succeededAt).toBeTruthy();
  });
  it("shows sent membership immediately and clears the warning on signature without rewriting the item", async () => {
    await enable(); await scheduleCampaignMembership(a, today);
    const original = await items();
    expect((await project())[0].contractState).toMatchObject({ state: "waiting_on_signature", agreementId: agreement, termId: term });
    await db.update(agreementTerms).set({ status: "signed" }).where(eq(agreementTerms.id, term));
    expect((await project())[0].contractState?.state).toBe("owed");
    await scheduleCampaignMembership(a, today);
    expect(await items()).toEqual(original);
  });
  it.each(["draft", "lost", "cancelled"] as const)("removes unworked future membership after status becomes %s", async status => {
    await enable(); await scheduleCampaignMembership(a, today);
    await db.update(agreementTerms).set({ status }).where(eq(agreementTerms.id, term));
    await scheduleCampaignMembership(a, today);
    expect(await items()).toEqual([]); expect(await rounds()).toEqual([]);
    expect((await campaignMembershipStatus(a, year)).changes).toBe(2);
  });
  it("retains recorded work and projects no-longer-in-contract without stored flags", async () => {
    await enable(); await scheduleCampaignMembership(a, today);
    const [item] = await items();
    await db.update(campaignItems).set({ notes: "Recorded work" }).where(eq(campaignItems.id, item.id));
    const protectedRows = await items();
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    await scheduleCampaignMembership(a, today);
    expect(await items()).toEqual(protectedRows);
    expect((await project())[0].contractState?.state).toBe("no_longer_in_contract");
    expect(await campaignMembershipStatus(a, year)).toMatchObject({ keptNotOwed: 1, error: null });
  });
  it("moves only unworked membership after service-program timing changes", async () => {
    await enable(); await scheduleCampaignMembership(a, today);
    await db.update(servicePrograms).set({ monthSpread: spread(9) }).where(eq(servicePrograms.companyId, a));
    await scheduleCampaignMembership(a, today);
    expect((await rounds()).map(r => r.roundMonth)).toEqual([`${year}-09-01`]);
    expect(await items()).toHaveLength(1);
  });
  it.each(["completed", "skipped", "chemical_progress"] as const)("never deletes or moves %s work after contract removal", async kind => {
    await enable(); await scheduleCampaignMembership(a, today);
    const [item] = await items();
    await db.update(campaignItems).set(kind === "chemical_progress"
      ? { preCommSentAt: new Date() } : { status: kind }).where(eq(campaignItems.id, item.id));
    const before = await items();
    await db.update(termScopeLines).set({ included: false }).where(eq(termScopeLines.termId, term));
    await scheduleCampaignMembership(a, today);
    expect(await items()).toEqual(before);
    expect((await project())[0].contractState?.state).toBe("no_longer_in_contract");
  });
  it("respects changed contract months ahead of program timing", async () => {
    await enable(); await scheduleCampaignMembership(a, today);
    await db.update(termScopeLines).set({ monthSpread: spread(10) }).where(eq(termScopeLines.termId, term));
    await scheduleCampaignMembership(a, today);
    expect((await rounds()).map(r => r.roundMonth)).toEqual([`${year}-10-01`]);
  });
  it("handles parent changes and never adds parents as campaign items", async () => {
    const parent = randomUUID();
    await db.insert(customers).values({ id: parent, companyId: a, name: "Parent", isParent: "true", street: "Test", city: "Test", state: "CO", zip: "00000" });
    await db.update(agreements).set({ customerId: parent }).where(eq(agreements.id, agreement));
    await db.update(customers).set({ parentCustomerId: parent }).where(eq(customers.id, property));
    await enable(); await scheduleCampaignMembership(a, today);
    expect((await items()).map(i => i.customerId)).toEqual([property]);
    await db.update(customers).set({ parentCustomerId: null }).where(eq(customers.id, property));
    await scheduleCampaignMembership(a, today);
    expect(await items()).toEqual([]);
  });
  it("ignores ended years and reports missed rounds without adding past work", async () => {
    await enable(a, year - 2);
    await reconcileEnabledCampaignYears(a, today);
    expect(await rounds()).toEqual([]);
    expect((await campaignMembershipStatus(a, year - 2)).checkedAt).toBeNull();
    await enable();
    await scheduleCampaignMembership(a, `${year}-07-01`);
    expect(await rounds()).toEqual([]);
    expect(await campaignMembershipStatus(a, year)).toMatchObject({ missed: 1, changes: 0 });
  });
  it("keeps company data and latest-run state isolated", async () => {
    await enable(); await enable(b);
    await scheduleCampaignMembership(b, today);
    expect(await rounds()).toEqual([]);
    expect((await campaignMembershipStatus(a, year)).checkedAt).toBeNull();
    expect((await campaignMembershipStatus(b, year)).checkedAt).toBeTruthy();
    await scheduleCampaignMembership(a, today);
    expect(await db.select().from(campaignItems).where(eq(campaignItems.companyId, b))).toEqual([]);
  });
  it("records a transaction failure and a subsequent retry succeeds", async () => {
    await enable();
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("Disposable transaction failure"));
    await scheduleCampaignMembership(a, today);
    expect(await items()).toEqual([]);
    expect((await campaignMembershipStatus(a, year)).error).toContain("hourly");
    await scheduleCampaignMembership(a, today);
    expect(await items()).toHaveLength(1);
    expect((await campaignMembershipStatus(a, year)).error).toBeNull();
  });
  it("status is company-bound, no-store, and restricted to admin/office", async () => {
    await enable();
    const app = express();
    app.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => req.get("role") !== "anonymous",
        user: { id: "unused", activeCompanyId: a, accessRole: req.get("role") ?? "office" } }); next();
    });
    registerCampaignGenerationRoutes(app);
    const response = await request(app).get(`/api/campaign-generation/${year}/status`).set("X-Company-Id", a);
    expect(response.status).toBe(200); expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({ checkedAt: null, error: null });
    expect(response.body.enabledAt).toBeTruthy();
    expect((await request(app).get(`/api/campaign-generation/${year}/status`).set("X-Company-Id", b)).status).toBe(409);
    expect((await request(app).get(`/api/campaign-generation/${year}/status`).set("role", "field")).status).toBe(403);
    expect((await request(app).get(`/api/campaign-generation/${year}/status`).set("role", "anonymous")).status).toBe(401);
    expect((await request(app).get(`/api/campaign-generation/${year + 4}/status`)).status).toBe(400);
  });
});
