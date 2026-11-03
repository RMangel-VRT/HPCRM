import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { companies, customers, users, qboConnections, qboCustomerReviews, qboCustomerCache, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
const remote = vi.hoisted(() => vi.fn());
vi.mock("./qboClient", () => ({
  qboRequest: remote, isQboWriteEnabled: vi.fn().mockResolvedValue(false), isQboConfigured: vi.fn().mockReturnValue(true),
  getAuthorizeUrl: vi.fn(), exchangeCodeForTokens: vi.fn(), revokeConnection: vi.fn(), getCompanyInfo: vi.fn(),
}));
import qbo from "../routes/qbo";
import { bindCustomer } from "./qboCustomerBinding";
import { promoteQboCustomer } from "./qboCustomerPromotion";
import { resolveCustomerReview } from "./qboCustomerReviews";
import { ingestQboCustomers, raiseCustomerReview, withCustomerSyncLock } from "./qboCustomerSync";
import { normalize, qboToFields } from "./qboCustomerMap";

const companiesCreated: string[] = [], usersCreated: string[] = [];
let companyId: string, actor: string;
const address = { Line1: "1 Test St", City: "Denver", CountrySubDivisionCode: "CO", PostalCode: "80000" };
const raw = (extra: Record<string, unknown> = {}) => ({ Id: "qb1", DisplayName: "Synthetic AP",
  CompanyName: "Synthetic Company", GivenName: "Accounts", FamilyName: "Payable",
  PrimaryEmailAddr: { Address: "ap@example.test" }, PrimaryPhone: { FreeFormNumber: "3035551111" },
  Mobile: { FreeFormNumber: "3035552222" }, SalesTermRef: { value: "term1" },
  SyncToken: "5", BillAddr: address, ShipAddr: address, Active: true, ...extra });
function app(role = "admin", tags: string[] = []) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: actor, activeCompanyId: companyId, activeRole: role, activeTags: tags } as Express.User;
    next();
  });
  app.use("/api/qbo", qbo); return app;
}
async function open(kind: "new_in_qbo" | "sub_customer" = "new_in_qbo") {
  await withCustomerSyncLock(companyId, tx => raiseCustomerReview(tx, companyId, null, "qb1", kind, {}, normalize(qboToFields(raw()))));
  return (await db.select().from(qboCustomerReviews).where(eq(qboCustomerReviews.companyId, companyId)))[0];
}
async function getReview(id: string) {
  return (await db.select().from(qboCustomerReviews).where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.id, id))))[0];
}
beforeEach(async () => {
  remote.mockReset();
  remote.mockImplementation(() => { throw new Error("No external requests allowed during promotion"); });
  companyId = `cq4-${randomUUID()}`; actor = randomUUID(); companiesCreated.push(companyId); usersCreated.push(actor);
  await db.insert(companies).values({ id: companyId, name: "Synthetic promotion", slug: companyId });
  await db.insert(users).values({ id: actor, name: "Synthetic actor", passwordHash: "not-a-login" });
  await db.insert(qboConnections).values({ companyId, realmId: "synthetic", accessTokenEnc: "not-a-token",
    refreshTokenEnc: "not-a-token", tokenExpiresAt: new Date(), status: "connected", customerBaselineAt: new Date("2026-01-01Z") });
  await ingestQboCustomers(companyId, [raw()]);
});
afterAll(async () => {
  await db.delete(companies).where(inArray(companies.id, companiesCreated));
  await db.delete(users).where(inArray(users.id, usersCreated));
  await pool.end(); await schemaPool.end();
});
describe("shared explicit linking and transactional promotion", () => {
  it("mapping promotion returns the same Customer shape with owner billing/baseline/token and closes the review", async () => {
    const r = await open();
    const result = await request(app()).post("/api/qbo/customers/promote")
      .set("X-Company-Id", companyId).send({ qboId: "qb1" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ name: "Synthetic AP", status: "prospect", qboCustomerId: "qb1",
      billingName: "Synthetic AP", billingCompanyName: "Synthetic Company", billingContactName: "Accounts Payable",
      billingEmails: ["ap@example.test"], billingPhone: "3035551111", billingMobile: "3035552222",
      qboTermId: "term1", qboSyncState: "in_sync", qboSyncToken: "5", qboBaseline: normalize(qboToFields(raw())) });
    expect(await getReview(r.id)).toMatchObject({ status: "resolved", resolution: "link", customerId: result.body.id, resolvedById: actor });
    expect(remote).not.toHaveBeenCalled();
  });
  it("review prefill leaves review open and creates nothing until actual promotion succeeds", async () => {
    const r = await open();
    expect(await resolveCustomerReview(companyId, r.id, actor, { action: "promote" }))
      .toMatchObject({ prefill: { qboId: "qb1", parentQboId: null } });
    expect(await getReview(r.id)).toMatchObject({ status: "open", resolvedAt: null });
    expect(await db.select().from(customers).where(eq(customers.companyId, companyId))).toHaveLength(0);
    await promoteQboCustomer(companyId, "qb1", {}, actor);
    expect(await getReview(r.id)).toMatchObject({ status: "resolved", resolution: "link" });
  });
  it("missing address leaves review open, and supplying the legacy overrides makes retry succeed", async () => {
    const r = await open();
    await db.update(qboCustomerCache).set({ billAddrLine1: null }).where(eq(qboCustomerCache.companyId, companyId));
    const failed = await request(app()).post("/api/qbo/customers/promote").send({ qboId: "qb1" });
    expect(failed.status).toBe(400); expect(failed.body.missingFields).toContain("street");
    expect(await getReview(r.id)).toMatchObject({ status: "open" });
    expect(await db.select().from(customers).where(eq(customers.companyId, companyId))).toHaveLength(0);
    const retried = await request(app()).post("/api/qbo/customers/promote").send({ qboId: "qb1", overrides: { street: "2 Test St" } });
    expect(retried.status).toBe(200);
    expect(await getReview(r.id)).toMatchObject({ status: "resolved", customerId: retried.body.id });
  });
  it("sub-customer creation stays out of scope and preserves both review and CRM on failure", async () => {
    await ingestQboCustomers(companyId, [raw({ ParentRef: { value: "parent" }, Job: true })]);
    const r = await open("sub_customer");
    const result = await request(app()).post("/api/qbo/customers/promote").send({ qboId: "qb1" });
    expect(result.status).toBe(409); expect(result.body.message).toContain("matching CRM branch");
    expect(await getReview(r.id)).toMatchObject({ status: "open" });
    expect(await db.select().from(customers).where(eq(customers.companyId, companyId))).toHaveLength(0);
  });
  it("rolls prospect creation back if shared linking cannot establish a baseline/token", async () => {
    const r = await open();
    await db.update(qboCustomerCache).set({ syncToken: null }).where(eq(qboCustomerCache.companyId, companyId));
    const result = await request(app()).post("/api/qbo/customers/promote").send({ qboId: "qb1" });
    expect(result.status).toBe(409); expect(result.body.message).toContain("Refresh");
    expect(await getReview(r.id)).toMatchObject({ status: "open" });
    expect(await db.select().from(customers).where(eq(customers.companyId, companyId))).toHaveLength(0);
  });
  it("every explicit link hydrates only empty owner facts, preserves existing billing and closes all matching new/sub reviews", async () => {
    const r = await open();
    const [c] = await db.insert(customers).values({ companyId, name: "Keep CRM", street: "2 CRM", city: "Denver", state: "CO", zip: "80000",
      billingName: "Keep billing", billingEmails: ["keep@example.test"], billingPhone: "existing" }).returning();
    await bindCustomer(companyId, c.id, "qb1", actor);
    const [linked] = await db.select().from(customers).where(eq(customers.id, c.id));
    expect(linked).toMatchObject({ billingName: "Keep billing", billingEmails: ["keep@example.test"], billingPhone: "existing",
      billingMobile: "3035552222", billToMode: "custom", billStreet: "1 Test St", qboSyncToken: "5" });
    expect(await getReview(r.id)).toMatchObject({ status: "resolved", resolvedById: actor, customerId: c.id });
    expect(remote).not.toHaveBeenCalled();
  });
  it("denies promotion to billing-only reviewers and rejects a switched company without writes", async () => {
    const r = await open();
    expect((await request(app("field", ["billing"])).post("/api/qbo/customers/promote").send({ qboId: "qb1" })).status).toBe(403);
    expect((await request(app()).post("/api/qbo/customers/promote").set("X-Company-Id", "other").send({ qboId: "qb1" })).status).toBe(409);
    expect(await getReview(r.id)).toMatchObject({ status: "open" });
  });
  it("serializes concurrent promotions so only one customer can be created", async () => {
    const r = await open();
    const results = await Promise.all([promoteQboCustomer(companyId, "qb1", {}, actor), promoteQboCustomer(companyId, "qb1", {}, actor)]);
    expect(results.filter(r => "conflict" in r)).toHaveLength(1);
    expect(await db.select().from(customers).where(eq(customers.companyId, companyId))).toHaveLength(1);
    expect(await getReview(r.id)).toMatchObject({ status: "resolved" });
  });
  it("does not duplicate link bookkeeping in storage, promotion or review resolution", () => {
    const promotion = readFileSync(new URL("./qboCustomerPromotion.ts", import.meta.url), "utf8");
    expect(promotion).toContain("bindCustomerLocked(tx, companyId, created.id, qboId, actorId)");
    expect(promotion).not.toMatch(/qboBaseline:|qboSyncToken:|qboCustomerId:/);
    const storage = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");
    const method = storage.slice(storage.indexOf("async promoteQboCustomerToCrm("), storage.indexOf("async countActiveUnboundCustomers("));
    expect(method).toContain("return promoteQboCustomer(");
    expect(method).not.toContain(".insert(");
    const review = readFileSync(new URL("./qboCustomerReviews.ts", import.meta.url), "utf8");
    expect(review).toContain("bindCustomerLocked(tx, companyId, customerId, qboId, actorId)");
  });
});
