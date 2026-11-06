import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { companies, companyUsers, customers, users, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { accessRole, ROLE_VALUES } from "../../../../lib/db/src/accessRole";
import { bulkAssignAccountManager, loadAccountManagerContext, resolveAccountManager, ACCOUNT_MANAGER_INVALID } from "./accountManagers";
import { saveCustomerSetup, setupEnvelope } from "./customerSetup";
import { createCustomerRequest, customerSetupRouter } from "../routes/customerSetup";
import { registerAccountManagerRoutes } from "../routes/accountManagers";
import { customerEditNeedsPush } from "./qboCustomerWrites";
import { sendSyncErrorNotification } from "./emailSyncService";
import { notifyOfficeOfNewFlag } from "../routes/flags";
import { sendEmail } from "./emailService";
import { readFileSync } from "node:fs";
import { customerPatchApp } from "../test/customerPatchApp";

vi.mock("./propertyGeocoder", () => ({ geocodeProperty: vi.fn().mockResolvedValue(null) }));
vi.mock("./emailService", () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("./qboClient", () => ({ qboRequest: vi.fn(() => { throw new Error("No remote QBO calls allowed"); }), isQboWriteEnabled: vi.fn().mockResolvedValue(false) }));
const company = randomUUID(), other = randomUUID();
const manager = randomUUID(), ordinary = randomUUID(), suspended = randomUUID(), foreign = randomUUID();
let parent: typeof customers.$inferSelect, standalone: typeof customers.$inferSelect, branch: typeof customers.$inferSelect, outside: typeof customers.$inferSelect;
const input = (customer: object, extra = {}) => setupEnvelope.parse({ customer, ...extra });
function app(role = "admin") {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: ordinary, activeCompanyId: company, activeRole: role, accessRole: accessRole(role) } as Express.User;
    next();
  });
  registerAccountManagerRoutes(a);
  a.post("/api/customers", (req, res) => createCustomerRequest(req, res, true));
  a.use("/api/customers", customerSetupRouter); return a;
}
beforeAll(async () => {
  await db.insert(companies).values([{ id: company, name: "AM1 synthetic", slug: `am1-${company}` },
    { id: other, name: "AM1 other synthetic", slug: `am1-${other}` }]);
  await db.insert(users).values([manager, ordinary, suspended, foreign].map(id => ({ id, name: `Synthetic ${id}`, email: `${id}@example.invalid`, passwordHash: "not-a-login" })));
  await db.insert(companyUsers).values([
    { companyId: company, userId: manager, role: "account_manager", status: "active" },
    { companyId: company, userId: ordinary, role: "admin", status: "active" },
    { companyId: company, userId: suspended, role: "account_manager", status: "suspended" },
    { companyId: other, userId: foreign, role: "account_manager", status: "active" },
  ]);
  const create = async (name: string, companyId = company, parentCustomerId: string | null = null) =>
    (await db.insert(customers).values({ companyId, name, street: "", city: "", state: "", zip: "", status: "prospect", parentCustomerId }).returning())[0];
  parent = await create("Parent"); standalone = await create("Standalone");
  branch = await create("Branch", company, parent.id); outside = await create("Outside", other);
});
afterAll(async () => {
  await db.delete(companies).where(inArray(companies.id, [company, other]));
  await db.delete(users).where(inArray(users.id, [manager, ordinary, suspended, foreign]));
  await pool.end(); await schemaPool.end();
});
describe("customer-owned account manager", () => {
  it.each(ROLE_VALUES)("enforces assignment authorization for %s on every public writer, including legacy set and clear", async role => {
    const allowed = ["admin", "office"].includes(accessRole(role));
    for (const value of [manager, null]) {
      const legacy = await request(customerPatchApp(company, role)).patch(`/api/customers/${standalone.id}`)
        .set("X-Company-Id", company).send({ accountManagerId: value });
      expect(legacy.status).toBe(allowed ? 200 : 403);
      standalone = (await db.select().from(customers).where(eq(customers.id, standalone.id)))[0];
      const setup = await request(app(role)).patch(`/api/customers/${standalone.id}/setup`)
        .set("X-Company-Id", company).send(input({ accountManagerId: value }, { expectedUpdatedAt: standalone.updatedAt.toISOString() }));
      expect(setup.status).toBe(allowed ? 200 : 403);
      const bulk = await request(app(role)).post("/api/customers/account-manager").set("X-Company-Id", company)
        .send({ customerIds: [standalone.id], accountManagerId: value });
      expect(bulk.status).toBe(allowed ? 200 : 403);
      const customer = { name: `Synthetic ${role} ${value === null ? "clear" : "set"}`, status: "prospect",
        street: "", city: "", state: "", zip: "", accountManagerId: value };
      expect((await request(app(role)).post("/api/customers/wizard").set("X-Company-Id", company)
        .send(input({ ...customer, name: `${customer.name} wizard` }))).status).toBe(allowed ? 200 : 403);
      expect((await request(app(role)).post("/api/customers").set("X-Company-Id", company)
        .send({ ...customer, name: `${customer.name} legacy` })).status).toBe(allowed ? 200 : 403);
    }
    standalone = (await db.select().from(customers).where(eq(customers.id, standalone.id)))[0];
  });
  it.each(["crew_supervisor", "shop_manager", "mapping"] as const)("preserves %s legacy access to unrelated customer fields", async role => {
    const response = await request(customerPatchApp(company, role)).patch(`/api/customers/${standalone.id}`)
      .set("X-Company-Id", company).send({ gateCode: "Synthetic AM1" });
    expect(response.status).toBe(200);
    standalone = (await db.select().from(customers).where(eq(customers.id, standalone.id)))[0];
  });
  it("keeps every notification query's approved recipient rule separate", async () => {
    vi.mocked(sendEmail).mockClear();
    await sendSyncErrorNotification("synthetic", company, "mailbox@example.invalid", suspended);
    expect(vi.mocked(sendEmail).mock.calls.map(c => c[0])).toEqual([`${suspended}@example.invalid`]);
    vi.mocked(sendEmail).mockClear();
    await sendSyncErrorNotification("synthetic", company, "mailbox@example.invalid", null);
    const emails = vi.mocked(sendEmail).mock.calls.map(c => c[0]);
    expect(emails).toHaveLength(1);
    expect([`${manager}@example.invalid`, `${ordinary}@example.invalid`]).toContain(emails[0]);
    // Remove only the ordinary admin membership to prove an active AM is a valid single fallback.
    await db.update(companyUsers).set({ status: "suspended" }).where(and(eq(companyUsers.companyId, company), eq(companyUsers.userId, ordinary)));
    vi.mocked(sendEmail).mockClear();
    await sendSyncErrorNotification("synthetic", company, "mailbox@example.invalid", null);
    expect(vi.mocked(sendEmail).mock.calls.map(c => c[0])).toEqual([`${manager}@example.invalid`]);
    await db.update(companyUsers).set({ status: "active" }).where(and(eq(companyUsers.companyId, company), eq(companyUsers.userId, ordinary)));
    vi.mocked(sendEmail).mockClear();
    await notifyOfficeOfNewFlag({ flag: { id: "synthetic", companyId: company, note: "", createdByUserId: ordinary } as any,
      createdByName: "Synthetic", propertyName: null, crewName: null, tagLabel: "Test", photoCount: 0, firstPhotoUrl: null });
    expect(vi.mocked(sendEmail).mock.calls.map(c => c[0]).sort()).toEqual([`${manager}@example.invalid`, `${ordinary}@example.invalid`].sort());
    // The separate fallback-owner query must remain admin-only, never projected.
    const fallback = readFileSync(new URL("../lib/ticketStatusChange.ts", import.meta.url), "utf8");
    expect(fallback).toContain('.find(c => c.role === "admin")');
    expect(fallback).not.toContain("account_manager");
  });
  it("rejects inactive, wrong-role, foreign and missing users with the exact 422 contract", async () => {
    for (const id of [ordinary, suspended, foreign, randomUUID()]) {
      const result = await request(app()).patch(`/api/customers/${standalone.id}/setup`).set("X-Company-Id", company)
        .send(input({ accountManagerId: id }, { expectedUpdatedAt: standalone.updatedAt.toISOString() }));
      expect(result.status).toBe(422); expect(result.body.message).toBe(ACCOUNT_MANAGER_INVALID);
    }
  });
  it("round-trips through shared setup, preserves omission, explicitly clears, and queues no QBO push", async () => {
    const before = standalone;
    let result = await saveCustomerSetup(company, ordinary, input({ accountManagerId: manager }, { expectedUpdatedAt: before.updatedAt.toISOString() }), before.id);
    expect(result.customer.accountManagerId).toBe(manager);
    expect(customerEditNeedsPush(before, { ...result.customer, qboCustomerId: before.qboCustomerId })).toBe(false);
    const get = await request(app()).get(`/api/customers/${before.id}/setup`).set("X-Company-Id", company);
    expect(get.body.customer.accountManagerId).toBe(manager);
    result = await saveCustomerSetup(company, ordinary, input({ customerNumber: "AM1" }, { expectedUpdatedAt: result.customer.updatedAt.toISOString() }), before.id);
    expect(result.customer.accountManagerId).toBe(manager);
    result = await saveCustomerSetup(company, ordinary, input({ accountManagerId: null }, { expectedUpdatedAt: result.customer.updatedAt.toISOString() }), before.id);
    expect(result.customer.accountManagerId).toBeNull();
    expect(result.customer.qboSyncState).toBe(before.qboSyncState);
  });
  it("rejects every branch write including null and atomically rolls back mixed-company/branch bulk requests", async () => {
    for (const value of [null, manager, 42, {}]) {
      await expect(saveCustomerSetup(company, ordinary, input({ accountManagerId: value }, { expectedUpdatedAt: branch.updatedAt.toISOString() }), branch.id)).rejects.toMatchObject({ status: 422 });
      expect((await request(customerPatchApp(company)).patch(`/api/customers/${branch.id}`).set("X-Company-Id", company)
        .send({ accountManagerId: value })).status).toBe(422);
    }
    for (const ids of [[standalone.id, branch.id], [standalone.id, outside.id]]) {
      await expect(bulkAssignAccountManager(company, ids, manager)).rejects.toMatchObject({ status: 422 });
      expect((await db.select().from(customers).where(eq(customers.id, standalone.id)))[0].accountManagerId).toBeNull();
    }
  });
  it("bulk changes only changed eligible rows, resolves parents live and retains IDs through demotion/suspension/removal", async () => {
    expect(await bulkAssignAccountManager(company, [parent.id, standalone.id], manager)).toEqual({ changedCount: 2 });
    expect(await bulkAssignAccountManager(company, [parent.id, standalone.id], manager)).toEqual({ changedCount: 0 });
    let ctx = await loadAccountManagerContext(company);
    expect(resolveAccountManager(branch, ctx)?.id).toBe(manager);
    expect(resolveAccountManager({ ...branch, accountManagerId: foreign }, ctx)?.id).toBe(manager);
    expect(resolveAccountManager({ ...branch, parentCustomerId: outside.id }, ctx)).toBeNull();
    for (const change of [{ role: "office" as const }, { role: "account_manager" as const, status: "suspended" as const }]) {
      await db.update(companyUsers).set(change).where(and(eq(companyUsers.companyId, company), eq(companyUsers.userId, manager)));
      ctx = await loadAccountManagerContext(company);
      expect(resolveAccountManager(branch, ctx)).toBeNull();
      expect((await db.select().from(customers).where(eq(customers.id, parent.id)))[0].accountManagerId).toBe(manager);
    }
    await db.delete(companyUsers).where(and(eq(companyUsers.companyId, company), eq(companyUsers.userId, manager)));
    expect(resolveAccountManager(branch, await loadAccountManagerContext(company))).toBeNull();
  });
  it("binds one bulk request to its initiating company and enforces projected admin parity", async () => {
    for (const role of ["admin", "account_manager", "office"]) {
      const response = await request(app(role)).post("/api/customers/account-manager").set("X-Company-Id", company)
        .send({ customerIds: [standalone.id], accountManagerId: null });
      expect(response.status).toBe(200);
    }
    expect((await request(app()).post("/api/customers/account-manager").set("X-Company-Id", other)
      .send({ customerIds: [standalone.id], accountManagerId: null })).status).toBe(409);
    expect((await request(app("field")).post("/api/customers/account-manager").set("X-Company-Id", company)
      .send({ customerIds: [standalone.id], accountManagerId: null })).status).toBe(403);
  });
});
