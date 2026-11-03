import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { companies, customers, contacts, qboCustomerCache, qboCustomerReviews, qboConnections,
  propertyManagementCompanies, propertyManagers, insertCustomerSchema, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
const remote = vi.hoisted(() => vi.fn());
vi.mock("./qboClient", () => ({ qboRequest: remote, isQboWriteEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("./propertyGeocoder", () => ({ geocodeProperty: vi.fn().mockResolvedValue(null) }));
import { saveCustomerSetup, setupEnvelope } from "./customerSetup";
import { customerSetupRouter, createCustomerRequest, setupFailure } from "../routes/customerSetup";
import { assertActivationComplete } from "./customerSetupValidation";
import { billingInputProblem, protectedBillingWrite } from "./customerBillingInput";
import { storage } from "../storage";
import { pickProvided } from "../lib/patchBody";
import { normalize, qboToFields } from "./qboCustomerMap";
import { withCustomerSyncLock } from "./qboCustomerSync";
import { bindCustomerLocked } from "./qboCustomerBinding";
import { isQboWriteEnabled } from "./qboClient";
import { geocodeProperty } from "./propertyGeocoder";

const ids: string[] = [];
let companyId: string;
const address = { street: "1 Synthetic St", city: "Denver", state: "CO", zip: "80202" };
const complete = { name: "Synthetic setup", ...address, billingName: "Synthetic AP", billingEmails: ["ap@example.test"],
  status: "active" };
const parse = (customer: object, extra: object = {}) => setupEnvelope.parse({ customer, ...extra });
const context = (co: string) => ({ companyId: co, getCustomerById: (id: string) => storage.getCustomerById(id, co),
  getPropertyManagementCompanyById: (id: string) => storage.getPropertyManagementCompanyById(id, co) });
function app(role = "admin", authenticated = true) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = { activeCompanyId: companyId, activeRole: role } as unknown as Express.User;
    next();
  });
  app.use("/api/customers", customerSetupRouter);
  app.post("/api/customers", (req, res) => createCustomerRequest(req, res, true));
  // Run the actual legacy PATCH handler without boot backfills or other routes.
  const source = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
  const start = source.indexOf('  app.patch("/api/customers/:id",');
  const end = source.indexOf('  app.delete("/api/customers/:id",', start);
  new Function("app", "storage", "insertCustomerSchema", "pickProvided", "billingInputProblem",
    "protectedBillingWrite", "storageBillingContext", "assertActivationComplete", "setupFailure",
    transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code)(
      app, storage, insertCustomerSchema, pickProvided, billingInputProblem, protectedBillingWrite, context,
      assertActivationComplete, setupFailure);
  return app;
}
async function rows() { return db.select().from(customers).where(eq(customers.companyId, companyId)); }
async function seedCache(qboId = "qb1") {
  const normalized = normalize(qboToFields({ Id: qboId, DisplayName: "Remote AP", SyncToken: "1",
    PrimaryEmailAddr: { Address: "remote@example.test" }, BillAddr: { Line1: "2 Bill St",
      City: "Denver", CountrySubDivisionCode: "CO", PostalCode: "80202" }, Active: true }));
  await db.insert(qboCustomerCache).values({ companyId, qboId, displayName: "Remote AP", normalized, syncToken: "1" });
}
beforeEach(async () => {
  companyId = `cq5-${randomUUID()}`; ids.push(companyId);
  await db.insert(companies).values({ id: companyId, name: "Synthetic wizard test", slug: companyId });
  remote.mockReset(); remote.mockImplementation(() => { throw new Error("No remote calls authorized"); });
  vi.mocked(geocodeProperty).mockResolvedValue(null);
  vi.mocked(isQboWriteEnabled).mockResolvedValue(false);
});
afterEach(async () => {
  // Drain post-commit jobs before the next test changes shared remote mocks.
  await new Promise<void>(resolve => setImmediate(resolve));
  await withCustomerSyncLock(companyId, async () => {});
});
afterAll(async () => {
  for (const id of ids) await withCustomerSyncLock(id, tx => tx.delete(companies).where(eq(companies.id, id)));
  await pool.end(); await schemaPool.end();
});
describe("atomic customer setup", () => {
  it("allows gate and contact edits on incomplete already-active customers without altering omitted facts", async () => {
    const [customer] = await db.insert(customers).values({ companyId, name: "Existing active", status: "active", ...address }).returning();
    const response = await request(app("office")).patch(`/api/customers/${customer.id}/setup`).send({
      customer: {}, siteNotes: { gateCode: "updated gate" }, contacts: [{ name: "New contact", emails: ["site@example.test"] }],
      expectedUpdatedAt: customer.updatedAt.toISOString(),
    });
    expect(response.status).toBe(200);
    expect(response.body.customer).toMatchObject({ status: "active", billingEmails: [], gateCode: "updated gate", name: "Existing active" });
    expect(await storage.getContactsByCustomerId(customer.id, companyId)).toMatchObject([{ name: "New contact" }]);
    const advisory = await request(app()).get(`/api/customers/${customer.id}/setup`);
    expect(advisory.body.missingFields).toContain("billingEmails");
    expect(remote).not.toHaveBeenCalled();
  });
  it("still rejects incomplete setup transitions from any non-active persisted status", async () => {
    for (const status of ["prospect", "inactive"] as const) {
      const [customer] = await db.insert(customers).values({ companyId, name: "Not active", status, ...address }).returning();
      const response = await request(app()).patch(`/api/customers/${customer.id}/setup`).send({
        customer: { status: "active" }, siteNotes: { gateCode: "not saved" }, expectedUpdatedAt: customer.updatedAt.toISOString(),
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("ACTIVATION_INCOMPLETE");
      expect(await storage.getCustomerById(customer.id, companyId)).toMatchObject({ status, gateCode: null });
    }
  });
  it("creates a CRM-only prospect with omitted addresses, contacts and site owner fields", async () => {
    const result = await request(app()).post("/api/customers/wizard").send({
      customer: { name: "Synthetic prospect", status: "prospect" },
      contacts: [{ name: "Site contact", emails: ["contact@example.test"], phones: ["3035550101"], isPrimary: "true" }],
      siteNotes: { gateCode: "synthetic", accessNotes: "Test access", petStationCount: 2, includeInRoute: true },
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ customer: { status: "prospect", street: "", qboSyncState: "not_linked",
      gateCode: "synthetic", includeInRoute: true }, qbo: { state: "not_linked" } });
    const saved = await storage.getContactsByCustomerId(result.body.customer.id, companyId);
    expect(saved).toHaveLength(1); expect(saved[0].name).toBe("Site contact");
    expect(remote).not.toHaveBeenCalled();
  });
  it("active completeness rejects before any customer or contact is written on both endpoints", async () => {
    for (const endpoint of ["/api/customers", "/api/customers/wizard"]) {
      const customer = { name: "Incomplete", status: "active" };
      const response = await request(app()).post(endpoint).send(endpoint.endsWith("wizard") ? { customer } : customer);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "ACTIVATION_INCOMPLETE",
        missingFields: ["street", "city", "state", "zip", "billingName", "billingEmails", "billTo"] });
    }
    expect(await rows()).toHaveLength(0); expect(remote).not.toHaveBeenCalled();
  });
  it("legacy create shares active gating and preserves the legacy Customer response", async () => {
    const response = await request(app()).post("/api/customers").send(complete);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: complete.name, qboSyncState: "pending_push" });
    expect(response.body.customer).toBeUndefined(); expect(remote).not.toHaveBeenCalled();
  });
  it.each(["shop_manager", "mapping", "field", "crew_supervisor", "field_manager"])("rejects %s creation and setup", async role => {
    expect((await request(app(role)).post("/api/customers/wizard").send({ customer: complete })).status).toBe(403);
    expect((await request(app(role)).post("/api/customers").send(complete)).status).toBe(403);
    expect((await request(app(role)).get("/api/customers/wizard/options")).status).toBe(403);
  });
  it("rejects stale company headers and unauthenticated requests before saving", async () => {
    expect((await request(app()).post("/api/customers/wizard").set("X-Company-Id", "foreign")
      .send({ customer: complete })).status).toBe(409);
    expect((await request(app("admin", false)).post("/api/customers/wizard").send({ customer: complete })).status).toBe(401);
    expect(await rows()).toHaveLength(0);
  });
  it("offers only a scoped, unambiguous most-used payment term", async () => {
    const options = () => request(app()).get("/api/customers/wizard/options");
    expect((await options()).body).toMatchObject({ writeEnabled: false, baselineAt: null, mostUsedTermId: null });
    for (const qboTermId of ["term-a", "term-b"])
      await saveCustomerSetup(companyId, "", parse({ name: `Terms ${qboTermId}`, status: "prospect", qboTermId }));
    expect((await options()).body.mostUsedTermId).toBeNull();
    await saveCustomerSetup(companyId, "", parse({ name: "Second A", status: "prospect", qboTermId: "term-a" }));
    expect((await options()).body.mostUsedTermId).toBe("term-a");
    expect(remote).not.toHaveBeenCalled();
  });
  it("prefills from the scoped cache without binding or resolving review evidence", async () => {
    await seedCache("prefill-qbo");
    const before = await rows();
    const response = await request(app()).get("/api/customers/wizard/prefill/prefill-qbo");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ customer: { name: "Remote AP", billingName: "Remote AP",
      billingEmails: ["remote@example.test"], billToMode: "custom", billStreet: "2 Bill St" },
      qbo: { linkQboId: "prefill-qbo" }, linkedCustomerId: null });
    expect(await rows()).toEqual(before);
    expect((await request(app()).get("/api/customers/wizard/prefill/foreign-or-absent")).status).toBe(404);
    expect(remote).not.toHaveBeenCalled();
  });
  it("rejects invalid contacts, names and aggregate billing emails without writes", async () => {
    const requests = [
      { customer: complete, contacts: [{ name: "", emails: ["bad"] }] },
      { customer: { ...complete, billingName: "Parent:Child" } },
      { customer: { ...complete, billingEmails: [`${"a".repeat(60)}@example.test`, `${"b".repeat(60)}@example.test`] } },
    ];
    for (const body of requests) expect((await request(app()).post("/api/customers/wizard").send(body)).status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });
  it("rolls back parent marking, customer and contacts on binding failure", async () => {
    const parent = await saveCustomerSetup(companyId, "", parse({ name: "Parent", status: "prospect" }));
    await expect(saveCustomerSetup(companyId, "", parse({ name: "Child", status: "prospect",
      parentCustomerId: parent.customer.id }, { contacts: [{ name: "Contact" }], qbo: { linkQboId: "absent" } }))).rejects.toThrow();
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0].isParent).toBe("false");
    expect(await db.select().from(contacts).where(eq(contacts.companyId, companyId))).toHaveLength(0);
  });
  it("rolls back all writes if a contact insert fails after customer/parent insertion", async () => {
    const parent = await saveCustomerSetup(companyId, "", parse({ name: "Parent", status: "prospect" }));
    const spy = vi.spyOn(storage, "createContact").mockRejectedValueOnce(new Error("synthetic contact failure"));
    try {
      await expect(saveCustomerSetup(companyId, "", parse({ name: "Child", status: "prospect",
        parentCustomerId: parent.customer.id }, { contacts: [{ name: "Contact" }] }))).rejects.toThrow("synthetic contact failure");
      expect(await rows()).toHaveLength(1); expect((await rows())[0].isParent).toBe("false");
    } finally { spy.mockRestore(); }
  });
  it("successful link shares baseline hydration and closes reviews only at commit", async () => {
    await seedCache();
    await db.insert(qboCustomerReviews).values({ companyId, qboId: "qb1", kind: "new_in_qbo", fields: {}, qboSnapshot: {} });
    const saved = await saveCustomerSetup(companyId, "", parse({ name: "Linked prospect", status: "prospect" },
      { qbo: { linkQboId: "qb1" } }));
    expect(saved.customer).toMatchObject({ qboCustomerId: "qb1", billingName: "Remote AP", qboSyncToken: "1", qboSyncState: "in_sync" });
    expect(saved.customer.qboBaseline).toBeTruthy();
    expect((await db.select().from(qboCustomerReviews).where(eq(qboCustomerReviews.companyId, companyId)))[0].status).toBe("resolved");
    expect(remote).not.toHaveBeenCalled();
  });
  it("a foreign cache id cannot bind and a parent from another company cannot be selected", async () => {
    const foreignId = `cq5-${randomUUID()}`; ids.push(foreignId);
    await db.insert(companies).values({ id: foreignId, slug: foreignId, name: "Foreign" });
    const parent = await saveCustomerSetup(foreignId, "", parse({ name: "Foreign parent", status: "prospect" }));
    await expect(saveCustomerSetup(companyId, "", parse({ name: "Child", status: "prospect",
      parentCustomerId: parent.customer.id }))).rejects.toThrow("PARENT_INVALID");
    await expect(saveCustomerSetup(companyId, "", parse({ name: "Prospect", status: "prospect" },
      { qbo: { linkQboId: "foreign" } }))).rejects.toThrow("QBO_LINK_CONFLICT");
    expect(await rows()).toHaveLength(0);
  });
  it("keeps both independent initial-sync and write-disabled gates without a remote call", async () => {
    await db.insert(qboConnections).values({ companyId, realmId: "synthetic", accessTokenEnc: "not-token",
      refreshTokenEnc: "not-token", tokenExpiresAt: new Date(), status: "connected" });
    const a = await saveCustomerSetup(companyId, "", parse(complete));
    expect(a.qbo.state).toBe("pending_push");
    await db.update(qboConnections).set({ customerBaselineAt: new Date() }).where(eq(qboConnections.companyId, companyId));
    const b = await saveCustomerSetup(companyId, "", parse({ ...complete, name: "Other", billingName: "Other AP" }));
    expect(b.qbo.state).toBe("pending_push"); expect(remote).not.toHaveBeenCalled();
  });
  it.each(["active", "send-now", "legacy"] as const)("%s creation acknowledges queued work without awaiting remote services", async mode => {
    const fixtureCompanyId = companyId;
    await db.insert(qboConnections).values({ companyId, realmId: "synthetic", accessTokenEnc: "not-token",
      refreshTokenEnc: "not-token", tokenExpiresAt: new Date(), status: "connected", customerBaselineAt: new Date() });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let checkedCommittedFacts = false;
    vi.mocked(isQboWriteEnabled).mockImplementation(async requestedCompany => {
      if (requestedCompany !== fixtureCompanyId) return false;
      // Independent reads prove that all local facts committed before QBO work.
      const observed = await db.select().from(customers).where(eq(customers.companyId, fixtureCompanyId));
      expect(observed).toHaveLength(1);
      expect(await storage.getContactsByCustomerId(observed[0].id, fixtureCompanyId)).toHaveLength(mode === "legacy" ? 0 : 1);
      checkedCommittedFacts = true;
      await gate;
      throw new Error("synthetic post-commit failure");
    });
    vi.mocked(geocodeProperty).mockImplementation(async () => { await gate; return null; });
    try {
      const response = await request(app()).post(mode === "legacy" ? "/api/customers" : "/api/customers/wizard")
        .send(mode === "legacy" ? complete : {
          customer: mode === "send-now" ? { ...complete, status: "prospect" } : complete,
          contacts: [{ name: "Committed contact" }], qbo: { sendNow: mode === "send-now" },
        }).timeout({ deadline: 3000 });
      expect(response.status).toBe(200);
      expect(mode === "legacy" ? response.body.qboSyncState : response.body.qbo.state).toBe("pending_push");
      await vi.waitFor(() => expect(checkedCommittedFacts).toBe(true));
    } finally { release(); }
    expect(await rows()).toHaveLength(1);
  });
  it("setup PATCH permits unchanged legacy ZIPs but rejects a newly invalid ZIP", async () => {
    const created = await saveCustomerSetup(companyId, "", parse({ ...complete, status: "prospect" }));
    await db.update(customers).set({ zip: "SW1A 1AA", billToMode: "custom", billStreet: "1 Billing St",
      billCity: "Montreal", billState: "QC", billZip: "H2X 1Y4" }).where(eq(customers.id, created.customer.id));
    const current = (await rows())[0];
    const response = await request(app()).patch(`/api/customers/${current.id}/setup`).send({
      customer: { name: "Renamed property" }, siteNotes: { accessNotes: "Updated access" },
      expectedUpdatedAt: current.updatedAt.toISOString(),
    });
    expect(response.status).toBe(200);
    expect(response.body.customer).toMatchObject({ name: "Renamed property", zip: "SW1A 1AA", billZip: "H2X 1Y4", accessNotes: "Updated access" });
    const rejected = await request(app()).patch(`/api/customers/${current.id}/setup`).send({
      customer: { zip: "new invalid ZIP" }, expectedUpdatedAt: response.body.customer.updatedAt,
    });
    expect(rejected.status).toBe(400);
    expect((await rows())[0].zip).toBe("SW1A 1AA");
  });
  it("parent-master branches require service address and parent billing, not their own billing", async () => {
    const parent = await saveCustomerSetup(companyId, "", parse({ ...complete, isParent: "true", branchBillingMode: "master" }));
    const child = await saveCustomerSetup(companyId, "", parse({ name: "Branch", status: "active", ...address, parentCustomerId: parent.customer.id }));
    expect(child.qbo.state).toBe("via_parent"); expect(remote).not.toHaveBeenCalled();
    await expect(saveCustomerSetup(companyId, "", parse({ name: "No service", status: "active", parentCustomerId: parent.customer.id })))
      .rejects.toMatchObject({ code: "ACTIVATION_INCOMPLETE", missingFields: ["street", "city", "state", "zip"] });
  });
  it("manager selection creates a single deliberate channel snapshot and setup retains it", async () => {
    const [pmCompany] = await db.insert(propertyManagementCompanies).values({ companyId, name: "Management", ...address }).returning();
    const [manager] = await db.insert(propertyManagers).values({ companyId, propertyManagementCompanyId: pmCompany.id,
      name: "Manager", email: "manager@example.test" }).returning();
    const created = await saveCustomerSetup(companyId, "", parse({ name: "Managed", status: "prospect",
      propertyManagementCompanyId: pmCompany.id, propertyManagerId: manager.id }));
    const people = await storage.getContactsByCustomerId(created.customer.id, companyId);
    expect(people).toHaveLength(1); expect(people[0].propertyManagerId).toBe(manager.id);
    const edited = await saveCustomerSetup(companyId, "", parse({ name: "Managed edited" },
      { expectedUpdatedAt: created.customer.updatedAt.toISOString(), contacts: people.map(p => ({
        id: p.id, name: p.name, emails: p.emails ?? [], phones: p.phones ?? [], propertyManagerId: manager.id })) }), created.customer.id);
    expect(edited.customer.status).toBe("prospect");
    expect(await storage.getContactsByCustomerId(created.customer.id, companyId)).toHaveLength(1);
  });
  it("all prospect activations reject structured missing fields before any legacy PATCH mutation", async () => {
    const created = await saveCustomerSetup(companyId, "", parse({ name: "Incomplete prospect", status: "prospect" }));
    const response = await request(app()).patch(`/api/customers/${created.customer.id}`).send({ status: "active" });
    expect(response.status).toBe(400); expect(response.body.code).toBe("ACTIVATION_INCOMPLETE");
    expect((await rows())[0].status).toBe("prospect"); expect(remote).not.toHaveBeenCalled();
    await expect(storage.updateCustomer(created.customer.id, companyId, { status: "active" }))
      .rejects.toMatchObject({ code: "ACTIVATION_INCOMPLETE" });
  });
  it("edit mode updates existing rows with concurrency and scoped-contact guards", async () => {
    const created = await saveCustomerSetup(companyId, "", parse({ name: "Edit prospect", status: "prospect" },
      { contacts: [{ name: "Keep" }] }));
    const response = await request(app()).patch(`/api/customers/${created.customer.id}/setup`).send({
      customer: { name: "Edited" }, expectedUpdatedAt: created.customer.updatedAt.toISOString(), siteNotes: { gateCode: "new" },
    });
    expect(response.status).toBe(200); expect(await rows()).toHaveLength(1);
    expect(await storage.getContactsByCustomerId(created.customer.id, companyId)).toHaveLength(1);
    expect((await request(app()).patch(`/api/customers/${created.customer.id}/setup`).send({
      customer: { name: "Stale" }, expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
    })).status).toBe(409);
    expect((await request(app()).patch(`/api/customers/${created.customer.id}/setup`).send({
      customer: { name: "Invalid" }, expectedUpdatedAt: response.body.customer.updatedAt,
      deletedContactIds: ["foreign"],
    })).status).toBe(400);
    expect((await rows())[0].name).toBe("Edited");
  });
});
