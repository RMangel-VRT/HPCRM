import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agreements, agreementTerms, customers, propertyManagementCompanies } from "@workspace/db";
import { db, pool } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import { createRfpFixture, removeRfpFixture } from "./rfpContractFixture";
import { fullDetail, lockContractCompany, writeTerm } from "./contractCenterPersistence";
import * as persistence from "./contractCenterPersistence";
import { loadLinkedContracts } from "./rfpContracts";

const enabled = process.env.CONTRACT_NEXT_SEASON_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("new contracts as next seasons in a disposable company", () => {
  vi.setConfig({ testTimeout: 30000 });
  let f: Awaited<ReturnType<typeof createRfpFixture>>;
  let agreement: typeof agreements.$inferSelect;
  let source: typeof agreementTerms.$inferSelect;
  beforeAll(async () => { f = await createRfpFixture(); }, 30000);
  beforeEach(async () => {
    await db.delete(agreements).where(eq(agreements.companyId, f.companyId));
    await db.transaction(async tx => {
      await lockContractCompany(tx, f.companyId);
      [agreement] = await tx.insert(agreements).values({ companyId: f.companyId, customerId: f.customerId }).returning();
      source = await writeTerm(tx, f.companyId, f.userId, null, {
        agreementId: agreement.id, line: "landscape", form: "ours", seasonLabel: "2026",
        startDate: "2026-04-01", endDate: "2026-10-31", status: "signed", billingType: "equal_monthly",
        annualPriceCents: 100000,
      }, "Disposable source");
    });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { if (f) await removeRfpFixture(f.companyId, f.userId); await pool.end(); });
  function api(role = "office", companyId?: string, authenticated = true, superAdmin = false) {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => authenticated, user: {
      id: f.userId, activeCompanyId: companyId ?? f.companyId, accessRole: role, activeRole: role, isSuperAdminBool: superAdmin,
    } }); next(); });
    registerContractCenterRoutes(a); return request(a);
  }
  const payload = () => ({
    customerId: f.customerId, agreementId: agreement.id, line: "landscape", form: "theirs",
    term: { seasonLabel: "Entered 2027", startDate: "2027-02-01", endDate: "2027-12-31", notes: "Entirely new shape", legalName: "New legal name" },
    scope: [{ serviceKey: "other:new", included: true, quantity: 9, monthSpread: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], details: { label: "New scope" } }],
    rates: [{ rateKey: "custom", line: "landscape", category: "Labor", label: "New labor", unit: "hour", priceCents: 12345 }],
    payments: { schedule: "explicit", rows: [{ component: "Entered price", month: "2027-03-01", amountCents: 222222 }] },
  });
  const create = (body: object = payload()) => api().post("/api/contract-center/contracts").set("X-Company-Id", f.companyId).send(body);
  const update = (values: Partial<typeof agreementTerms.$inferInsert>) => db.update(agreementTerms).set(values).where(eq(agreementTerms.id, source.id));
  async function refusal(body: object, message: string, status = 409) {
    const before = await fullDetail(db, f.companyId, agreement.id);
    const r = await create(body);
    expect(r.status, JSON.stringify(r.body)).toBe(status); expect(r.body.message).toBe(message);
    expect(await fullDetail(db, f.companyId, agreement.id)).toEqual(before);
    expect(await db.select().from(agreements).where(eq(agreements.companyId, f.companyId))).toHaveLength(1);
  }
  it("keeps every submitted field and child, returns exact ID despite later cancelled seasons, and signs normally", async () => {
    await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, { ...source, id: undefined, status: "cancelled",
      seasonLabel: "Cancelled future", startDate: "2030-01-01", endDate: "2030-12-31" }, "Disposable cancelled future"));
    const before = await fullDetail(db, f.companyId, agreement.id);
    const r = await create(); expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.id).toBe(agreement.id);
    const term = r.body.terms.find((t: { id: string }) => t.id === r.body.createdTermId);
    expect(term).toMatchObject({ ...payload().term, status: "draft", form: "theirs", renewedFromTermId: source.id,
      annualPriceCents: 222222, paymentSchedule: "explicit" });
    expect(term.scope).toMatchObject(payload().scope);
    expect(term.rates).toMatchObject(payload().rates);
    expect(term.billingMonths).toMatchObject([{ component: "Entered price", month: "2027-03-01", amountCents: 222222 }]);
    expect(term.history[0].note).toBe("Added as the next season after 2026 (entered as a new contract)");
    expect(r.body.terms.at(-1).id).not.toBe(term.id);
    expect(await db.select().from(agreements).where(eq(agreements.companyId, f.companyId))).toHaveLength(1);
    const after = await fullDetail(db, f.companyId, agreement.id);
    expect(after.terms.find(t => t.id === source.id)).toEqual(before.terms.find(t => t.id === source.id));
    for (const to of ["sent", "signed"]) expect((await api().post(`/api/contract-center/terms/${term.id}/status`).send({ to })).status).toBe(200);
    expect((await fullDetail(db, f.companyId, agreement.id)).terms.find(t => t.id === source.id)?.status).toBe("renewed");
  });
  it("keeps RFP links season-owned and resolves to the destination agreement", async () => {
    const bid = await f.createRfp();
    const r = await create({ ...payload(), bidTicketId: bid.id }); expect(r.status, JSON.stringify(r.body)).toBe(201);
    const linked = await loadLinkedContracts(db, f.companyId, [bid.id]);
    expect(linked).toMatchObject([{ agreementId: agreement.id, termId: r.body.createdTermId, bidTicketId: bid.id }]);
    expect(r.body.terms.find((t: { id: string }) => t.id === r.body.createdTermId).history[0].note)
      .toBe(`Created from RFP ${bid.title}\nAdded as the next season after 2026 (entered as a new contract)`);
    expect((await fullDetail(db, f.companyId, agreement.id)).terms.find(t => t.id === source.id)?.bidTicketId).toBeNull();
    for (const to of ["sent", "signed"]) expect((await api().post(`/api/contract-center/terms/${r.body.createdTermId}/status`).send({ to })).status).toBe(200);
    expect((await fullDetail(db, f.companyId, agreement.id)).terms.find(t => t.id === source.id)?.status).toBe("renewed");
  });
  it("allows a changed line and keeps the submitted pattern schedule rather than copying the source", async () => {
    const r = await create({ ...payload(), line: "both", term: { ...payload().term, snowPricing: "time_and_materials" },
      payments: [{ component: "New grounds", months: [{ month: 3, amountCents: 456789 }] }] });
    expect(r.status).toBe(201);
    expect(r.body.terms.find((t: { id: string }) => t.id === r.body.createdTermId)).toMatchObject({
      line: "both", paymentSchedule: "pattern", annualPriceCents: 456789,
      billingMonths: [{ component: "New grounds", month: "2027-03-01", amountCents: 456789 }],
    });
  });
  it("preserves agreement management and records both company names", async () => {
    const rows = await db.insert(propertyManagementCompanies).values(["Original management", "Entered management"]
      .map(name => ({ name, companyId: f.companyId }))).returning();
    await db.update(agreements).set({ propertyManagementCompanyId: rows[0].id }).where(eq(agreements.id, agreement.id));
    const r = await create({ ...payload(), propertyManagementCompanyId: rows[1].id });
    expect(r.status).toBe(201); expect(r.body.propertyManagementCompanyId).toBe(rows[0].id);
    expect(r.body.terms.find((t: { id: string }) => t.id === r.body.createdTermId).history.some((h: { note: string }) =>
      h.note === "Entered management company: Entered management; agreement management company retained: Original management.")).toBe(true);
  });
  it("refuses missing source and not-renewing sources", async () => {
    await update({ status: "cancelled" });
    await refusal(payload(), "This contract has no season to renew.");
    await update({ status: "signed", nonRenewalOn: "2026-10-01", nonRenewalReason: "board" });
    await refusal(payload(), "Undo Not renewing on 2026 first.");
  });
  it.each(["draft", "sent"] as const)("refuses an existing %s renewal", async status => {
    await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, {
      ...source, id: undefined, renewedFromTermId: source.id, status, seasonLabel: "Pending",
      startDate: "2028-01-01", endDate: "2028-12-31",
    }, "Disposable pending"));
    await refusal(payload(), `2026 already has a ${status} renewal. Cancel it or use it instead.`);
  });
  it("refuses inclusive overlaps and starts on or before source start", async () => {
    const b = payload();
    await refusal({ ...b, term: { ...b.term, startDate: source.endDate } }, "Entered 2027 overlaps 2026.");
    await refusal({ ...b, term: { ...b.term, startDate: source.startDate, endDate: source.endDate }, payments: [] }, "Entered 2027 overlaps 2026.");
    await refusal({ ...b, term: { ...b.term, startDate: "2025-01-01", endDate: "2025-12-31" }, payments: [] }, "Entered 2027 must start after 2026.");
  });
  it("rechecks eligibility after lock and serializes competing creations", async () => {
    const original = persistence.lockAgreement;
    const spy = vi.spyOn(persistence, "lockAgreement").mockImplementationOnce(async (tx, company, id) => {
      const a = await original(tx, company, id);
      await tx.update(agreementTerms).set({ nonRenewalOn: "2026-10-01", nonRenewalReason: "board" }).where(eq(agreementTerms.id, source.id));
      return a;
    });
    await refusal(payload(), "Undo Not renewing on 2026 first."); spy.mockRestore();
    const responses = await Promise.all([create(), create()]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await fullDetail(db, f.companyId, agreement.id)).terms).toHaveLength(2);
  });
  it("requires a nonblank reason independently and records the reason on a separate agreement", async () => {
    const { agreementId: _id, ...b } = payload();
    for (const separateReason of [undefined, "", "   "]) {
      const r = await create({ ...b, separateReason }); expect(r.status).toBe(409);
      expect(r.body).toEqual({ message: "Disposable RFP Property already has a Landscape contract. Add this as its next season or give a reason for a separate contract.",
        allowed: ["next_season", "separate"] });
    }
    expect((await create({ ...b, separateReason: "x".repeat(201) })).status).toBe(400);
    const r = await create({ ...b, separateReason: "  Separate parcel  " }); expect(r.status).toBe(201);
    expect(r.body.id).not.toBe(agreement.id);
    expect(r.body.terms[0].id).toBe(r.body.createdTermId);
    expect(r.body.terms[0].history[0].note).toBe("Created as a separate contract: Separate parcel");
  });
  it("does not match Snow against Landscape, or closed/not-renewing agreements", async () => {
    const { agreementId: _id, ...b } = payload();
    await update({ line: "snow", snowPricing: "time_and_materials" });
    expect((await create(b)).status).toBe(201);
    // Remove only the newly-created fixture agreement.
    await db.delete(agreements).where(eq(agreements.id, (await persistence.loadContractList(db, f.companyId)).find(a => a.id !== agreement.id)!.id));
    await update({ line: "landscape", snowPricing: null, nonRenewalOn: "2026-10-01", nonRenewalReason: "board" });
    expect((await create(b)).status).toBe(201);
  });
  it.each(["cancelled", "lost"] as const)("does not require a reason for a %s agreement", async status => {
    await update({ status });
    const { agreementId: _id, ...b } = payload();
    expect((await create(b)).status).toBe(201);
  });
  it("matches either side Both and ignores later lost seasons when matching", async () => {
    // A lost bid against an older source does not close a later signed recovery.
    await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, { ...source, id: undefined,
      renewedFromTermId: source.id, seasonLabel: "Signed recovery", startDate: "2027-01-01", endDate: "2027-12-31" }, "Disposable recovery"));
    await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, { ...source, id: undefined, status: "lost",
      renewedFromTermId: source.id, line: "snow", seasonLabel: "Lost future", startDate: "2028-01-01", endDate: "2028-12-31" }, "Disposable lost"));
    const { agreementId: _id, ...b } = payload();
    expect((await create(b)).status).toBe(409);
    expect((await create({ ...b, line: "both", term: { ...b.term, snowPricing: "time_and_materials" } })).status).toBe(409);
    await db.update(agreementTerms).set({ line: "both", snowPricing: "time_and_materials" }).where(eq(agreementTerms.agreementId, agreement.id));
    expect((await create(b)).status).toBe(409);
  });
  it("preserves authentication, create roles, customer/management/RFP checks and company guards", async () => {
    for (const role of ["field_manager", "crew_supervisor", "mapping", "shop_manager"])
      expect((await api(role).post("/api/contract-center/contracts").send(payload())).status).toBe(403);
    expect((await api("office", undefined, false).post("/api/contract-center/contracts").send(payload())).status).toBe(401);
    expect((await api().post("/api/contract-center/contracts").set("X-Company-Id", "other").send(payload())).body.message)
      .toBe("Active company changed. Reload and try again.");
    expect((await api("office", "foreign").post("/api/contract-center/contracts").send(payload())).status).toBe(404);
    const [otherCustomer] = await db.insert(customers).values({ companyId: f.companyId, name: "Other disposable", street: "2 Test", city: "Denver", state: "CO", zip: "80000" }).returning();
    await refusal({ ...payload(), customerId: otherCustomer.id }, "Contract not found", 404);
    await refusal({ ...payload(), agreementId: "foreign" }, "Contract not found", 404);
    await refusal({ ...payload(), propertyManagementCompanyId: "foreign" }, "Management company not found", 404);
    expect((await create({ ...payload(), bidTicketId: "foreign" })).status).toBe(400);
    const foreign = await createRfpFixture();
    try {
      const [foreignAgreement] = await db.insert(agreements).values({ companyId: foreign.companyId, customerId: foreign.customerId }).returning();
      await refusal({ ...payload(), agreementId: foreignAgreement.id }, "Contract not found", 404);
      const [foreignManagement] = await db.insert(propertyManagementCompanies).values({ companyId: foreign.companyId, name: "Foreign disposable" }).returning();
      await refusal({ ...payload(), propertyManagementCompanyId: foreignManagement.id }, "Management company not found", 404);
    } finally { await removeRfpFixture(foreign.companyId, foreign.userId); }
    expect((await api("admin").post("/api/contract-center/contracts").send(payload())).status).toBe(201);
  });
});
