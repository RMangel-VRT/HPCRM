import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { companies, customers, users, propertyManagementCompanies, qboConnections, qboCustomerCache, qboCustomerReviews,
  pool as schemaPool, type Customer, type QboReviewKind } from "@workspace/db";
import { db, pool } from "../db";
const remote = vi.hoisted(() => vi.fn());
const enabled = vi.hoisted(() => vi.fn());
vi.mock("./qboClient", () => ({ qboRequest: remote, isQboWriteEnabled: enabled }));
import { pushCustomer, customerFields, retryPendingCustomerPushes, qboCustomerRefFor } from "./qboCustomerPush";
import { ingestQboCustomers, raiseCustomerReview, withCustomerSyncLock, sweepQboCustomers } from "./qboCustomerSync";
import { resolveCustomerReview } from "./qboCustomerReviews";
import { normalize, qboToFields, toQboPayload } from "./qboCustomerMap";
import { writeCustomer } from "./qboCustomerWrites";
import { storage } from "../storage";
import { bindCustomer } from "./qboCustomerBinding";
import outbound from "../routes/qboCustomerOutbound";

const ids: string[] = [];
const actorIds: string[] = [];
let a: string, b: string, actor: string;
const address = { Line1: "1 Test St", Line2: "", City: "Denver", CountrySubDivisionCode: "CO", PostalCode: "80000" };
const raw = (extra: Record<string, unknown> = {}) => ({ Id: "q1", SyncToken: "1", DisplayName: "Test",
  BillAddr: address, ShipAddr: address, Active: true, BillWithParent: false, ...extra });
const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });
const get = async (id: string, companyId = a) => (await db.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, id))))[0];
const reviews = (companyId = a) => db.select().from(qboCustomerReviews).where(eq(qboCustomerReviews.companyId, companyId));
async function customer(extra: Partial<Customer> = {}, companyId = a) {
  return (await db.insert(customers).values({ companyId, name: "Test", street: "1 Test St", city: "Denver",
    state: "CO", zip: "80000", status: "active", qboSyncState: "pending_push", ...extra }).returning())[0];
}
async function linked(extra: Partial<Customer> = {}) {
  return customer({ qboCustomerId: "q1", qboSyncToken: "1", qboBaseline: normalize(qboToFields(raw())), ...extra });
}
async function review(kind: QboReviewKind, c?: Customer, qboId: string | null = c?.qboCustomerId ?? null, snapshot: unknown = null) {
  await withCustomerSyncLock(a, tx => raiseCustomerReview(tx, a, c?.id ?? null, qboId, kind, {}, snapshot));
  return (await reviews()).find(r => r.kind === kind && r.status === "open")!;
}
async function seedCache(record = raw(), companyId = a) { await ingestQboCustomers(companyId, [record]); }
async function flush() {
  if (!a) return;
  await new Promise<void>(r => setTimeout(r, 25));
  await withCustomerSyncLock(a, async () => {});
}
function app(role = "admin", companyId = a, tags: string[] = [], authenticated = true) {
  const result = express(); result.use(express.json());
  result.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = { id: actor, activeCompanyId: companyId, activeRole: role, activeTags: tags } as Express.User;
    next();
  });
  result.use("/api/qbo", outbound); return result;
}
beforeEach(async () => {
  await flush();
  remote.mockReset(); enabled.mockReset(); enabled.mockResolvedValue(true);
  remote.mockImplementation(() => { throw new Error("Unexpected remote request"); });
  a = `cq3-${randomUUID()}`; b = `cq3-${randomUUID()}`; actor = randomUUID(); ids.push(a, b); actorIds.push(actor);
  await db.insert(companies).values([a, b].map(id => ({ id, slug: id, name: "Synthetic CQ3" })));
  await db.insert(users).values({ id: actor, name: "Synthetic resolver", passwordHash: "not-a-login" });
  await db.insert(qboConnections).values([a, b].map(companyId => ({ companyId, realmId: "synthetic",
    accessTokenEnc: "not-a-token", refreshTokenEnc: "not-a-token", tokenExpiresAt: new Date(), status: "connected" as const,
    customerBaselineAt: new Date("2026-01-01Z") })));
});
afterAll(async () => {
  await flush();
  await db.delete(companies).where(inArray(companies.id, ids));
  // No real user or company is ever touched.
  await db.delete(users).where(inArray(users.id, actorIds));
  await pool.end(); await schemaPool.end();
});

describe("serialized customer outbound writes with mocked QuickBooks", () => {
  it("creates all mapped fields, service address, terms and no delivery/Active writes", async () => {
    const c = await customer({ billingName: "Billing", billingCompanyName: "Company", billingContactName: "Pat Smith",
      billingEmails: ["AP@example.test"], billingPhone: "(303) 555-1111", billingMobile: "303-555-2222", qboTermId: "7" });
    remote.mockResolvedValueOnce(response({ QueryResponse: {} })).mockImplementationOnce(async (_co, _verb, _path, payload) =>
      response({ Customer: { ...raw(), ...payload, Id: "created", SyncToken: "0" } }));
    expect(await pushCustomer(a, c.id, { reason: "activation" })).toMatchObject({ state: "in_sync", qboId: "created" });
    const payload = remote.mock.calls.find(call => call[1] === "POST")![3];
    expect(payload).toMatchObject({ PreferredDeliveryMethod: "None", DisplayName: "Billing", CompanyName: "Company",
      GivenName: "Pat", FamilyName: "Smith", PrimaryEmailAddr: { Address: "ap@example.test" },
      PrimaryPhone: { FreeFormNumber: "3035551111" }, Mobile: { FreeFormNumber: "3035552222" },
      SalesTermRef: { value: "7" }, BillAddr: address, ShipAddr: address });
    expect(payload).not.toHaveProperty("Active");
    expect((await get(c.id)).qboBaseline).toMatchObject({ emails: ["ap@example.test"] });
    expect((await db.select().from(qboCustomerCache).where(eq(qboCustomerCache.companyId, a)))[0].qboId).toBe("created");
    expect((await reviews()).filter(r => r.kind === "new_in_qbo")).toHaveLength(0);
  });
  it("updates only changed unreviewed keys and advances only their baseline", async () => {
    const c = await linked({ billingEmails: ["new@example.test"], billingPhone: "3035554444" });
    await withCustomerSyncLock(a, tx => raiseCustomerReview(tx, a, c.id, "q1", "changed_in_qbo",
      { phone: { qbo: "999", crm: "3035554444", baseline: null, bothChanged: true } }, {}));
    remote.mockResolvedValue(response({ Customer: raw({ SyncToken: "2", PrimaryEmailAddr: { Address: "new@example.test" } }) }));
    expect((await pushCustomer(a, c.id, { reason: "edit" })).state).toBe("review");
    expect(remote.mock.calls[0][3]).toEqual({ sparse: true, Id: "q1", SyncToken: "1", PrimaryEmailAddr: { Address: "new@example.test" } });
    expect((await get(c.id)).qboBaseline).toMatchObject({ phone: null, emails: ["new@example.test"] });
    expect((await reviews())[0].status).toBe("open");
  });
  it.each([["5010", "Stale"], ["other", "Stale Object Error"]])("ingests %s without retrying", async (code, Detail) => {
    const c = await linked({ billingEmails: ["crm@example.test"] });
    remote.mockResolvedValueOnce(response({ Fault: { Error: [{ code, Detail }] } }, false))
      .mockResolvedValueOnce(response({ Customer: raw({ SyncToken: "4", PrimaryEmailAddr: { Address: "remote@example.test" } }) }));
    expect((await pushCustomer(a, c.id, { reason: "edit" })).state).toBe("review");
    expect(remote.mock.calls.filter(call => call[1] === "POST")).toHaveLength(1);
    expect((await reviews()).find(r => r.kind === "changed_in_qbo")?.fields).toHaveProperty("emails");
    expect((await get(c.id)).qboSyncToken).toBe("1");
  });
  it.each(["baseline", "flag"])("keeps pending with the %s gate closed and spends no attempts", async gate => {
    const c = await customer();
    if (gate === "baseline") await db.update(qboConnections).set({ customerBaselineAt: null }).where(eq(qboConnections.companyId, a));
    else enabled.mockResolvedValue(false);
    for (let i = 0; i < 5; i++) expect((await pushCustomer(a, c.id, { reason: "scheduler" })).state).toBe("pending_push");
    expect(remote).not.toHaveBeenCalled();
  });
  it("does not automatically send prospects or intentionally unlinked active customers", async () => {
    await customer({ status: "prospect", qboSyncState: "not_linked" });
    const c = await customer({ qboSyncState: "not_linked" });
    await retryPendingCustomerPushes(a);
    expect((await pushCustomer(a, c.id, { reason: "queued" })).state).toBe("not_linked");
    expect(remote).not.toHaveBeenCalled();
  });
  it("skips master branches and exports their parent's invoice reference", async () => {
    const parent = await customer({ isParent: "true", branchBillingMode: "master", qboCustomerId: "parent" });
    const c = await customer({ parentCustomerId: parent.id });
    expect((await pushCustomer(a, c.id, { reason: "activation" })).state).toBe("via_parent");
    expect(await qboCustomerRefFor(c)).toBe("parent"); expect(remote).not.toHaveBeenCalled();
  });
  it("creates the separate parent before the branch with ParentRef and no parent billing", async () => {
    const parent = await customer({ name: "Parent", isParent: "true", branchBillingMode: "separate", qboSyncState: "not_linked" });
    const c = await customer({ name: "Branch", parentCustomerId: parent.id });
    let created = 0;
    remote.mockImplementation(async (_co, verb, _path, payload) => verb === "GET" ? response({ QueryResponse: {} }) :
      response({ Customer: { ...raw(), ...payload, Id: `created-${++created}`, SyncToken: "0" } }));
    expect((await pushCustomer(a, c.id, { reason: "activation" })).qboId).toBe("created-2");
    const posts = remote.mock.calls.filter(call => call[1] === "POST");
    expect(posts[0][3].DisplayName).toBe("Parent");
    expect(posts[1][3]).toMatchObject({ ParentRef: { value: "created-1" }, Job: true, BillWithParent: false });
  });
  it.each(["exact", "6240"])("holds %s name collisions without creating duplicates", async kind => {
    const c = await customer();
    if (kind === "6240") remote.mockResolvedValueOnce(response({ QueryResponse: {} }))
      .mockResolvedValueOnce(response({ Fault: { Error: [{ code: "6240", Detail: "Duplicate Name Exists" }] } }, false));
    remote.mockResolvedValue(response({ QueryResponse: { Customer: [raw({ Id: "existing" })] } }));
    expect((await pushCustomer(a, c.id, { reason: "send-now" })).review).toBe("name_taken");
    expect((await reviews()).find(r => r.kind === "name_taken")).toMatchObject({ qboId: "existing", message: expect.stringContaining("Test") });
    expect((await get(c.id)).qboCustomerId).toBeNull();
    expect(remote.mock.calls.filter(call => call[1] === "POST")).toHaveLength(kind === "exact" ? 0 : 1);
  });
  it("merges errors and limits retries to three attempts per hour", async () => {
    const c = await linked({ billingMobile: "3035551111" });
    remote.mockResolvedValue(response({ Fault: { Error: [{ Detail: "Synthetic unavailable" }] } }, false));
    for (let i = 0; i < 5; i++) await retryPendingCustomerPushes(a);
    expect(remote).toHaveBeenCalledTimes(3);
    expect((await reviews()).filter(r => r.kind === "push_failed")).toHaveLength(1);
    expect(await get(c.id)).toMatchObject({ qboSyncState: "error", qboLastError: "Synthetic unavailable " });
  });
  it("extends the CQ2 scheduler with gated pending work and the same attempt limit", async () => {
    const c = await linked({ billingMobile: "3035551111" });
    await db.update(qboConnections).set({ customerCdcCursor: new Date(), customerFullPullAt: new Date() })
      .where(eq(qboConnections.companyId, a));
    enabled.mockResolvedValue(false);
    await sweepQboCustomers([a]); expect(remote).not.toHaveBeenCalled();
    enabled.mockResolvedValue(true);
    remote.mockResolvedValue(response({ Fault: { Error: [{ Detail: "Retry later" }] } }, false));
    for (let i = 0; i < 5; i++) await sweepQboCustomers([a]);
    expect(remote).toHaveBeenCalledTimes(3);
    expect((await get(c.id)).qboSyncState).toBe("error");
  });
  it("commits pending state for active creation and discards outbound callbacks on rollback", async () => {
    enabled.mockResolvedValue(false);
    const fields = { companyId: a, name: "Created", street: "1 Test St", city: "Denver", state: "CO", zip: "80000",
      status: "active" as const, active: "true" as const, isParent: "false" as const, snowEnabled: false,
      ranking: "standard" as const, tags: [], customerType: "commercial" as const, includeInRoute: false };
    const created = await storage.createCustomer(fields);
    expect(created.qboSyncState).toBe("pending_push"); await flush();
    await expect(withCustomerSyncLock(a, async () => {
      await storage.createCustomer({ ...fields, name: "Rolled back" });
      throw new Error("Abort owner transaction");
    })).rejects.toThrow("Abort owner transaction");
    await flush();
    expect(await db.select().from(customers).where(and(eq(customers.companyId, a), eq(customers.name, "Rolled back")))).toHaveLength(0);
    expect(remote).not.toHaveBeenCalled();
  });
  it("keeps a concurrent edit queued after an earlier push succeeds", async () => {
    const c = await linked({ billingEmails: ["first@example.test"] });
    let release!: () => void, started!: () => void;
    const inFlight = new Promise<void>(r => { started = r; });
    remote.mockImplementationOnce(async () => { started(); await new Promise<void>(r => { release = r; });
      return response({ Customer: raw({ SyncToken: "2", PrimaryEmailAddr: { Address: "first@example.test" } }) }); });
    const pushing = pushCustomer(a, c.id, { reason: "edit" }); await inFlight;
    enabled.mockResolvedValue(false);
    const editing = withCustomerSyncLock(a, tx => writeCustomer(tx, c.id, a, { billingEmails: ["later@example.test"] }));
    release(); await pushing; await editing; await flush();
    expect(await get(c.id)).toMatchObject({ billingEmails: ["later@example.test"], qboSyncState: "pending_push" });
    expect((await get(c.id)).qboBaseline).toMatchObject({ emails: ["first@example.test"] });
  });
  it("recovers a remote success followed by local rollback without a duplicate create", async () => {
    const c = await customer();
    remote.mockResolvedValueOnce(response({ QueryResponse: {} })).mockResolvedValueOnce(response({ Customer: raw({ Id: "created" }) }));
    await expect(withCustomerSyncLock(a, async () => {
      await pushCustomer(a, c.id, { reason: "activation" });
      throw new Error("Synthetic local rollback");
    })).rejects.toThrow("Synthetic local rollback");
    expect((await get(c.id)).qboCustomerId).toBeNull();
    remote.mockResolvedValue(response({ QueryResponse: { Customer: [raw({ Id: "created" })] } }));
    expect((await pushCustomer(a, c.id, { reason: "scheduler" })).review).toBe("name_taken");
    expect(remote.mock.calls.filter(call => call[1] === "POST")).toHaveLength(1);
  });
  it("escapes quotes and backslashes in live duplicate queries", async () => {
    const c = await customer({ billingName: "O'Brien \\ Test" });
    remote.mockResolvedValueOnce(response({ QueryResponse: {} }))
      .mockResolvedValueOnce(response({ Customer: raw({ DisplayName: "O'Brien \\ Test" }) }));
    await pushCustomer(a, c.id, { reason: "activation" });
    const query = decodeURIComponent(remote.mock.calls[0][2]);
    expect(query).toContain("O\\'Brien \\\\ Test");
  });
  it("serializes concurrent branch binding before a mode switch can pass its guard", async () => {
    enabled.mockResolvedValue(false);
    const parent = await customer({ qboCustomerId: "parent", isParent: "true", branchBillingMode: "separate" });
    const c = await customer({ parentCustomerId: parent.id, qboSyncState: "not_linked" });
    await seedCache(raw({ ParentRef: { value: "parent" } }));
    let started!: () => void, release!: () => void;
    const ready = new Promise<void>(r => { started = r; });
    const binding = withCustomerSyncLock(a, async () => {
      started(); await new Promise<void>(r => { release = r; });
      await bindCustomer(a, c.id, "q1");
    });
    await ready;
    const changing = withCustomerSyncLock(a, tx => writeCustomer(tx, parent.id, a, { branchBillingMode: "master" }));
    release(); await binding;
    await expect(changing).rejects.toMatchObject({ status: 409 });
    expect((await get(parent.id)).branchBillingMode).toBe("separate");
  });
  it("atomically guards separate-to-master against a concurrent binding", async () => {
    const parent = await customer({ isParent: "true", branchBillingMode: "separate" });
    const c = await linked({ parentCustomerId: parent.id });
    await expect(withCustomerSyncLock(a, tx => writeCustomer(tx, parent.id, a, { branchBillingMode: "master" })))
      .rejects.toMatchObject({ status: 409, message: "Branches already exist in QuickBooks; un-link them first." });
    expect((await get(parent.id)).branchBillingMode).toBe("separate");
    expect((await get(c.id)).qboCustomerId).toBe("q1");
  });
  it("queues active branches on master-to-separate, not prospects", async () => {
    enabled.mockResolvedValue(false);
    const parent = await customer({ isParent: "true", branchBillingMode: "master" });
    const active = await customer({ parentCustomerId: parent.id, qboSyncState: "via_parent" });
    const prospect = await customer({ parentCustomerId: parent.id, status: "prospect", qboSyncState: "via_parent" });
    await withCustomerSyncLock(a, tx => writeCustomer(tx, parent.id, a, { branchBillingMode: "separate" }));
    await flush();
    expect((await get(active.id)).qboSyncState).toBe("pending_push");
    expect((await get(prospect.id)).qboSyncState).toBe("via_parent");
  });
  it("queues directory-billed linked customers and preserves other companies", async () => {
    enabled.mockResolvedValue(false);
    const [directory] = await db.insert(propertyManagementCompanies).values({ companyId: a, name: "Directory" }).returning();
    const affected = await linked({ propertyManagementCompanyId: directory.id, billToMode: "management_company", qboSyncState: "in_sync" });
    const foreign = await customer({ propertyManagementCompanyId: directory.id, billToMode: "management_company", qboSyncState: "in_sync", qboCustomerId: "foreign" }, b);
    await storage.updatePropertyManagementCompany(directory.id, a, { street: "New directory address" }); await flush();
    expect((await get(affected.id)).qboSyncState).toBe("pending_push");
    expect((await get(foreign.id, b)).qboSyncState).toBe("in_sync");
  });
});

describe("review reading and resolution", () => {
  it.each(["link", "unlink", "dismiss"])("resolves qbo_removed %s with binding semantics and actor/time", async action => {
    enabled.mockResolvedValue(false);
    const c = await linked();
    await seedCache(raw({ Id: "survivor", DisplayName: "Surviving account", SyncToken: "8" }));
    const r = await review("qbo_removed", c);
    const before = await get(c.id);
    remote.mockResolvedValue(response({ Customer: raw({ Id: "survivor", DisplayName: "Surviving account", SyncToken: "9" }) }));
    await resolveCustomerReview(a, r.id, actor, { action, ...(action === "link" ? { qboId: "survivor" } : {}) });
    const current = await get(c.id), resolved = (await reviews()).find(x => x.id === r.id)!;
    expect(resolved).toMatchObject({ resolution: action, resolvedById: actor,
      status: action === "dismiss" ? "dismissed" : "resolved", resolvedAt: expect.any(Date) });
    if (action === "link") expect(current).toMatchObject({ qboCustomerId: "survivor", qboDisplayName: "Surviving account",
      qboSyncToken: "9", qboBaseline: normalize(qboToFields(raw({ Id: "survivor", DisplayName: "Surviving account", SyncToken: "9" }))) });
    if (action === "unlink") {
      expect(current).toMatchObject({ qboCustomerId: null, qboDisplayName: null, qboSyncToken: null, qboBaseline: null, qboSyncState: "not_linked" });
      await storage.updateCustomer(c.id, a, { billingPhone: "3035550000" }); await flush();
      enabled.mockResolvedValue(true);
      await retryPendingCustomerPushes(a); await pushCustomer(a, c.id, { reason: "queued" });
      expect(remote).not.toHaveBeenCalled();
    }
    if (action === "dismiss") expect(current).toEqual(before);
  });
  it("serializes unlink after an in-flight push and suppresses stale queued work", async () => {
    const c = await linked({ billingEmails: ["sent@example.test"] });
    let start!: () => void, finish!: () => void;
    const started = new Promise<void>(r => { start = r; });
    remote.mockImplementationOnce(async () => { start(); await new Promise<void>(r => { finish = r; });
      return response({ Customer: raw({ SyncToken: "2", PrimaryEmailAddr: { Address: "sent@example.test" } }) }); });
    const pushing = pushCustomer(a, c.id, { reason: "queued" }); await started;
    const unlinking = (async () => {
      const r = await review("qbo_removed", c);
      return resolveCustomerReview(a, r.id, actor, { action: "unlink" });
    })();
    finish(); await pushing; await unlinking;
    await pushCustomer(a, c.id, { reason: "queued" }); await retryPendingCustomerPushes(a);
    expect((await get(c.id)).qboSyncState).toBe("not_linked"); expect(remote).toHaveBeenCalledTimes(1);
  });
  it("only explicit send-now or a new activation makes an unlinked customer eligible", async () => {
    enabled.mockResolvedValue(false);
    const c = await customer({ qboSyncState: "not_linked" });
    expect((await request(app()).post(`/api/qbo/customers/${c.id}/send-now`).send({})).status).toBe(202);
    await flush(); expect((await get(c.id)).qboSyncState).toBe("pending_push");
    await db.update(customers).set({ qboSyncState: "not_linked", status: "inactive" }).where(eq(customers.id, c.id));
    await storage.updateCustomer(c.id, a, { status: "active" }); await flush();
    expect((await get(c.id)).qboSyncState).toBe("pending_push"); expect(remote).not.toHaveBeenCalled();
  });
  it("does not recreate an unlinked parent through a queued separate-branch push", async () => {
    const parent = await linked({ isParent: "true", branchBillingMode: "separate" });
    const r = await review("qbo_removed", parent);
    await resolveCustomerReview(a, r.id, actor, { action: "unlink" });
    const c = await customer({ parentCustomerId: parent.id });
    expect((await pushCustomer(a, c.id, { reason: "queued" })).state).toBe("error");
    expect((await get(parent.id)).qboSyncState).toBe("not_linked");
    expect(remote).not.toHaveBeenCalled();
  });
  it("rejects absent, old, cross-company or already-bound survivor IDs", async () => {
    const c = await linked(), r = await review("qbo_removed", c);
    await seedCache(raw({ Id: "foreign" }), b);
    for (const qboId of ["missing", "foreign", "q1"]) await expect(resolveCustomerReview(a, r.id, actor, { action: "link", qboId }))
      .rejects.toBeInstanceOf(Error);
    const other = await customer({ qboCustomerId: "taken" });
    await seedCache(raw({ Id: "taken" }));
    remote.mockResolvedValue(response({ Customer: raw({ Id: "taken" }) }));
    await expect(resolveCustomerReview(a, r.id, actor, { action: "link", qboId: "taken" })).rejects.toMatchObject({ status: 409 });
    expect((await get(other.id)).qboCustomerId).toBe("taken");
    expect((await reviews()).find(x => x.id === r.id)?.status).toBe("open");
  });
  it("requires every changed key and sends CRM choices with a freshly fetched token", async () => {
    const c = await linked({ billingEmails: ["crm@example.test"] });
    await seedCache(raw({ SyncToken: "4", PrimaryEmailAddr: { Address: "qbo@example.test" } }));
    const r = (await reviews()).find(x => x.kind === "changed_in_qbo")!;
    await expect(resolveCustomerReview(a, r.id, actor, { choices: {} })).rejects.toMatchObject({ status: 400 });
    remote.mockImplementation(async (_co, verb) => verb === "GET" ?
      response({ Customer: raw({ SyncToken: "5", PrimaryEmailAddr: { Address: "qbo@example.test" } }) }) :
      response({ Customer: raw({ SyncToken: "6", PrimaryEmailAddr: { Address: "crm@example.test" } }) }));
    await resolveCustomerReview(a, r.id, actor, { choices: { emails: "crm" } }); await flush();
    const post = remote.mock.calls.find(call => call[1] === "POST");
    expect(post?.[3]).toEqual({ sparse: true, Id: "q1", SyncToken: "5", PrimaryEmailAddr: { Address: "crm@example.test" } });
    expect((await get(c.id)).billingEmails).toEqual(["crm@example.test"]);
  });
  it("adopts QBO address as custom and does not echo accepted fields", async () => {
    const c = await linked();
    const remoteRaw = raw({ SyncToken: "3", BillAddr: { ...address, Line1: "Accepted billing street" } });
    await seedCache(remoteRaw);
    const r = (await reviews()).find(x => x.kind === "changed_in_qbo")!;
    remote.mockResolvedValue(response({ Customer: remoteRaw }));
    await resolveCustomerReview(a, r.id, actor, { choices: { billAddr: "qbo" } }); await flush();
    expect(await get(c.id)).toMatchObject({ billToMode: "custom", billStreet: "Accepted billing street" });
    expect(remote.mock.calls.filter(call => call[1] === "POST")).toHaveLength(0);
  });
  it("refreshes evidence but does not resolve when QuickBooks changed again", async () => {
    const c = await linked();
    await seedCache(raw({ SyncToken: "3", Mobile: { FreeFormNumber: "111" } }));
    const r = (await reviews()).find(x => x.kind === "changed_in_qbo")!;
    remote.mockResolvedValue(response({ Customer: raw({ SyncToken: "4", Mobile: { FreeFormNumber: "222" } }) }));
    expect(await resolveCustomerReview(a, r.id, actor, { choices: { mobile: "crm" } })).toMatchObject({ stale: true });
    expect((await reviews()).find(x => x.id === r.id)).toMatchObject({ status: "open", fields: { mobile: { qbo: "222" } } });
    expect((await get(c.id)).qboSyncToken).toBe("1");
  });
  it.each(["promote", "link", "ignore"])("resolves new_in_qbo %s", async action => {
    enabled.mockResolvedValue(false);
    await seedCache(raw());
    const r = await review("new_in_qbo", undefined, "q1", normalize(qboToFields(raw())));
    const c = await customer({ status: "prospect", qboSyncState: "not_linked" });
    remote.mockResolvedValue(response({ Customer: raw() }));
    const result = await resolveCustomerReview(a, r.id, actor, { action, ...(action === "link" ? { customerId: c.id } : {}) });
    if (action === "promote") expect(result).toHaveProperty("prefill");
    expect((await get(c.id)).qboCustomerId).toBe(action === "link" ? "q1" : null);
    expect((await reviews()).find(x => x.id === r.id)?.resolution).toBe(action);
  });
  it("requires confirmation for sub_customer link and atomically switches its parent", async () => {
    enabled.mockResolvedValue(false);
    const parent = await customer({ isParent: "true", qboCustomerId: "parent", branchBillingMode: "master" });
    const c = await customer({ parentCustomerId: parent.id });
    const sub = raw({ ParentRef: { value: "parent" }, Job: true });
    await seedCache(sub); const r = await review("sub_customer", undefined, "q1");
    remote.mockResolvedValue(response({ Customer: sub }));
    await expect(resolveCustomerReview(a, r.id, actor, { action: "link", customerId: c.id })).rejects.toMatchObject({ status: 409 });
    await resolveCustomerReview(a, r.id, actor, { action: "link", customerId: c.id, confirmSeparate: true }); await flush();
    expect((await get(parent.id)).branchBillingMode).toBe("separate");
    expect((await get(c.id)).qboCustomerId).toBe("q1");
  });
  it.each(["promote", "ignore"])("resolves sub_customer %s without creating a CRM customer", async action => {
    await seedCache(raw({ ParentRef: { value: "parent" } }));
    const r = await review("sub_customer", undefined, "q1");
    const result = await resolveCustomerReview(a, r.id, actor, { action });
    if (action === "promote") expect(result).toMatchObject({ prefill: { qboId: "q1", parentQboId: "parent" } });
    expect((await db.select().from(customers).where(eq(customers.companyId, a)))).toHaveLength(0);
    expect((await reviews()).find(x => x.id === r.id)).toMatchObject({ resolution: action, resolvedById: actor, resolvedAt: expect.any(Date) });
  });
  it.each(["set_crm_inactive", "ignore"])("resolves qbo_inactive %s locally", async action => {
    const c = await linked(), r = await review("qbo_inactive", c);
    await resolveCustomerReview(a, r.id, actor, { action });
    expect((await get(c.id)).status).toBe(action === "ignore" ? "active" : "inactive"); expect(remote).not.toHaveBeenCalled();
  });
  it.each(["retry", "dismiss"])("resolves push_failed %s without losing review metadata", async action => {
    enabled.mockResolvedValue(false);
    const c = await linked({ qboSyncState: "error" }), r = await review("push_failed", c);
    await resolveCustomerReview(a, r.id, actor, { action }); await flush();
    expect((await get(c.id)).qboSyncState).toBe(action === "retry" ? "pending_push" : "error");
    expect((await reviews()).find(x => x.id === r.id)?.resolvedById).toBe(actor);
  });
  it("links name_taken or queues a validated renamed retry", async () => {
    enabled.mockResolvedValue(false);
    const c = await customer(); await seedCache(raw());
    let r = await review("name_taken", c, "q1", normalize(qboToFields(raw())));
    await expect(resolveCustomerReview(a, r.id, actor, { action: "renamed" })).rejects.toMatchObject({ status: 400 });
    await db.update(customers).set({ billingName: "Renamed" }).where(eq(customers.id, c.id));
    await resolveCustomerReview(a, r.id, actor, { action: "renamed" }); await flush();
    r = await review("name_taken", c, "q1");
    remote.mockResolvedValue(response({ Customer: raw() }));
    await resolveCustomerReview(a, r.id, actor, { action: "link" });
    expect((await get(c.id)).qboCustomerId).toBe("q1");
  });
  it("rejects wrong company, action, stale review versions and duplicate resolutions", async () => {
    const c = await linked(), r = await review("qbo_removed", c);
    await expect(resolveCustomerReview(b, r.id, actor, { action: "dismiss" })).rejects.toMatchObject({ status: 404 });
    await expect(resolveCustomerReview(a, r.id, actor, { action: "retry" })).rejects.toMatchObject({ status: 400 });
    await expect(resolveCustomerReview(a, r.id, actor, { action: "dismiss", expectedUpdatedAt: "2020-01-01T00:00:00Z" })).rejects.toMatchObject({ status: 409 });
    const results = await Promise.allSettled([resolveCustomerReview(a, r.id, actor, { action: "dismiss" }),
      resolveCustomerReview(a, r.id, actor, { action: "unlink" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("outbound and review API permissions and legacy compatibility", () => {
  it("persists validated legacy overrides before queued sending, even with the gate closed", async () => {
    enabled.mockResolvedValue(false);
    const c = await customer({ status: "prospect", qboSyncState: "not_linked" });
    const res = await request(app()).post("/api/qbo/customers/create").send({ customerId: c.id,
      displayNameOverride: "Owner billing name", streetOverride: "Custom St", emailOverride: "ap@example.test", phoneOverride: "3035551111" });
    expect(res.status).toBe(202); await flush();
    expect(await get(c.id)).toMatchObject({ billingName: "Owner billing name", billToMode: "custom", billStreet: "Custom St",
      billCity: "Denver", billingEmails: ["ap@example.test"], billingPhone: "3035551111", qboSyncState: "pending_push" });
    expect((await request(app()).post("/api/qbo/customers/create").send({ customerId: c.id, emailOverride: "invalid" })).status).toBe(400);
    expect(remote).not.toHaveBeenCalled();
  });
  it("allows billing-tag review access, but only admin/office can explicitly send", async () => {
    const c = await linked(), r = await review("qbo_removed", c);
    const billing = app("field", a, ["billing"]);
    expect((await request(billing).get("/api/qbo/customer-reviews/count")).body).toEqual({ open: 1 });
    expect((await request(billing).get("/api/qbo/customer-reviews?status=open")).body[0].customerName).toBe("Test");
    expect((await request(billing).post(`/api/qbo/customers/${c.id}/send-now`).send({})).status).toBe(403);
    expect((await request(billing).post(`/api/qbo/customer-reviews/${r.id}/resolve`).send({ action: "dismiss" })).status).toBe(200);
    for (const role of ["field", "crew_supervisor"]) {
      expect((await request(app(role)).get("/api/qbo/customer-reviews")).status).toBe(403);
      expect((await request(app(role)).post(`/api/qbo/customer-reviews/${r.id}/resolve`).send({ action: "dismiss" })).status).toBe(403);
    }
    expect((await request(app("admin", a, [], false)).get("/api/qbo/customer-reviews/count")).status).toBe(401);
    expect((await request(app()).get("/api/qbo/customer-reviews/count").set("X-Company-Id", b)).status).toBe(409);
    expect((await request(app("admin", b)).post(`/api/qbo/customers/${c.id}/send-now`).send({})).status).toBe(404);
    expect((await request(app("admin", b)).post(`/api/qbo/customer-reviews/${r.id}/resolve`).send({ action: "unlink" })).status).toBe(404);
  });
});
