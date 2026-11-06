import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { companies, users, companyUsers, customers, agreements, agreementTerms, termBillingMonths, flags, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { registerCustomerContractSummary } from "../routes/customerContractSummary";
import { reconcileContractQuestions, registerContractQuestionReconciliation, scheduleContractQuestions, NO_TERM_NOTE } from "./contractQuestionFlags";
import { accessRole } from "../../../../lib/db/src/accessRole";
import { companyToday, addCalendarDays } from "./companyDay";
import { expandPayments } from "./contractCenterService";
import { saveCustomerSetup, setupEnvelope } from "../services/customerSetup";

const companyId = `cp1-${randomUUID()}`, otherId = `cp1-${randomUUID()}`;
const manager = randomUUID(), nextManager = randomUUID(), parent = randomUUID(), branch = randomUUID(), uncovered = randomUUID();
const agreement = randomUUID(), termId = randomUUID(), today = companyToday();
const open = () => db.select().from(flags).where(and(eq(flags.companyId, companyId),
  // Filters in JS below retain resolved history for lifecycle assertions.
  eq(flags.tag, "contract_question")));
const app = (role = "admin", company = companyId) => {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => true, user: {
    id: manager, activeRole: role, accessRole: accessRole(role), activeCompanyId: company,
  } }); next(); });
  registerCustomerContractSummary(a);
  return request(a);
};
describe.skipIf(process.env.NODE_ENV === "production")("CP1 isolated company API and flag lifecycle", () => {
  beforeAll(async () => {
    await db.insert(companies).values([{ id: companyId, name: "CP1 isolated fixture", slug: companyId },
      { id: otherId, name: "CP1 other fixture", slug: otherId }]);
    await db.insert(users).values([manager, nextManager].map(id => ({
      id, name: "CP1 fixture manager", email: `${id}@example.invalid`, passwordHash: "fixture-no-login",
    })));
    await db.insert(companyUsers).values([manager, nextManager].map(userId => ({ companyId, userId, role: "account_manager" as const })));
    await db.insert(customers).values([
      { id: parent, companyId, name: "CP1 Ute Creek", street: "", city: "", state: "", zip: "", isParent: "true", accountManagerId: manager },
      { id: branch, companyId, name: "CP1 Branch", street: "1 Fixture", city: "Denver", state: "CO", zip: "80000", parentCustomerId: parent },
      { id: uncovered, companyId, name: "CP1 No term", street: "2 Fixture", city: "Denver", state: "CO", zip: "80000", accountManagerId: manager },
    ]);
    await db.insert(agreements).values({ id: agreement, companyId, customerId: parent });
    await db.insert(agreementTerms).values({
      id: termId, agreementId: agreement, companyId, line: "both", form: "ours", status: "signed", seasonLabel: "2026–27",
      startDate: `${today.slice(0, 7)}-01`, endDate: addCalendarDays(today, 354), snowPricing: "flat_rate",
      snowFlatPriceCents: 0, snowTriggers: "   ", annualPriceCents: 1353600, billingType: "equal_monthly",
    });
    await db.insert(termBillingMonths).values(expandPayments([{
      component: "Contract", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 112800 })),
    }], `${today.slice(0, 7)}-01`, addCalendarDays(`${Number(today.slice(0, 4)) + 1}-${today.slice(5, 7)}-01`, -1)).map(r => ({ ...r, companyId, termId })));
  }, 30000);
  afterAll(async () => {
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(companies).where(eq(companies.id, otherId));
    await db.delete(users).where(eq(users.id, manager));
    await db.delete(users).where(eq(users.id, nextManager));
    await pool.end(); await schemaPool.end();
  });
  it.each(["admin", "office", "account_manager"])("%s receives exact Contract Center commercial fields", async role => {
    const res = await app(role).get(`/api/customers/${parent}/contract-summary`).expect(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.current[0]).toMatchObject({ annualCents: 1353600, termId, agreementId: agreement });
    expect(res.body.current[0].billingMonths).toHaveLength(12);
  });
  it.each(["field_manager", "chemical_manager", "irrigation_manager", "field", "mapping", "landscape_supervisor", "crew_supervisor"])("%s gets only allowlisted coverage and current dates", async role => {
    const res = await app(role).get(`/api/customers/${branch}/contract-summary`).expect(200);
    expect(res.body.coverage).toEqual({ landscape: true, snow: true });
    expect(Object.keys(res.body).sort()).toEqual(["asOf", "coverage", "current"]);
    expect(Object.keys(res.body.current[0]).sort()).toEqual(["endDate", "label", "line", "startDate"]);
  });
  it("company isolation and initiating company header are enforced", async () => {
    await app("admin", otherId).get(`/api/customers/${parent}/contract-summary`).expect(404);
    await app().get(`/api/customers/${parent}/contract-summary`).set("X-Company-Id", otherId).expect(409);
    expect((await app("admin", otherId).get("/api/customers/snow-covered")).body.customerIds).toEqual([]);
  });
  it("no term never falls back; branch inherits and snow lists share projection", async () => {
    await db.update(customers).set({ snowEnabled: true }).where(eq(customers.id, uncovered)); // Comparison fixture only.
    const none = await app().get(`/api/customers/${uncovered}/contract-summary`).expect(200);
    expect(none.body.current).toEqual([]); expect(none.body.coverage.snow).toBe(false);
    const snow = await app().get("/api/customers/snow-covered").expect(200);
    expect(snow.body.customerIds.sort()).toEqual([parent, branch].sort());
  });
  it("concurrent sweeps dedupe both rules and resolve account-manager inheritance", async () => {
    await Promise.all(Array.from({ length: 4 }, () => reconcileContractQuestions(companyId, today)));
    const rows = (await open()).filter(f => f.status === "new");
    expect(rows).toHaveLength(2);
    expect(rows.find(f => f.sourceKey === `no-term:${uncovered}`)).toMatchObject({ note: NO_TERM_NOTE, assignedToUserId: manager, createdByUserId: null });
    expect(rows.find(f => f.sourceKey === `snow-triggers:${termId}`)?.assignedToUserId).toBe(manager);
    expect(rows.some(f => f.sourceKey === `no-term:${branch}`)).toBe(false);
  });
  it("new flags follow assignment changes, picked-up flags remain assigned", async () => {
    await db.update(flags).set({ status: "acknowledged" }).where(and(eq(flags.companyId, companyId), eq(flags.sourceKey, `no-term:${uncovered}`)));
    await db.update(customers).set({ accountManagerId: nextManager }).where(eq(customers.companyId, companyId));
    await reconcileContractQuestions(companyId, today);
    const rows = await open();
    expect(rows.find(f => f.sourceKey === `snow-triggers:${termId}`)?.assignedToUserId).toBe(nextManager);
    expect(rows.find(f => f.sourceKey === `no-term:${uncovered}`)?.assignedToUserId).toBe(manager);
    await db.update(companyUsers).set({ status: "suspended" }).where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, nextManager)));
    await reconcileContractQuestions(companyId, today);
    expect((await open()).find(f => f.sourceKey === `snow-triggers:${termId}`)?.assignedToUserId).toBeNull();
  });
  it("adding triggers resolves; ending term raises missing-term flags, inactive/prospect resolves", async () => {
    await db.update(agreementTerms).set({ snowTriggers: "2 inches" }).where(eq(agreementTerms.id, termId));
    await reconcileContractQuestions(companyId, today);
    expect((await open()).find(f => f.sourceKey === `snow-triggers:${termId}`)).toMatchObject({ status: "resolved", resolution: "Triggers added on contract" });
    await reconcileContractQuestions(companyId, addCalendarDays(today, 355));
    expect((await open()).filter(f => f.status === "new").map(f => f.sourceKey).sort()).toEqual([`no-term:${parent}`, `no-term:${branch}`].sort());
    await db.update(customers).set({ status: "inactive" }).where(eq(customers.companyId, companyId));
    await reconcileContractQuestions(companyId, addCalendarDays(today, 355));
    expect((await open()).every(f => f.status === "resolved")).toBe(true);
  });
  it.each([false, null, true])("wizard rejects provided snowEnabled=%s at the service boundary", async snowEnabled => {
    await expect(saveCustomerSetup(companyId, manager, setupEnvelope.parse({ customer: { snowEnabled } }), uncovered))
      .rejects.toMatchObject({ status: 422, message: "Snow coverage comes from the customer's contract." });
  });
  it("successful committed term changes reconcile flags; failed requests do not", async () => {
    const c = randomUUID(), child = randomUUID(), a = randomUUID(), t = randomUUID();
    await db.insert(customers).values({ id: c, companyId, name: "CP1 lifecycle parent", street: "", city: "", state: "", zip: "",
      status: "active", active: "true", accountManagerId: manager });
    await db.insert(customers).values({ id: child, companyId, name: "CP1 lifecycle branch", street: "", city: "", state: "", zip: "",
      status: "active", active: "true", parentCustomerId: c });
    await db.insert(agreements).values({ id: a, companyId, customerId: c });
    await db.insert(agreementTerms).values({ id: t, companyId, agreementId: a, line: "snow", form: "ours", status: "signed",
      seasonLabel: "Future", startDate: addCalendarDays(today, 1), endDate: addCalendarDays(today, 10), billingType: "equal_monthly" });
    await reconcileContractQuestions(companyId, today);
    const related = async () => (await open()).filter(f => [c, child].some(id => id === f.propertyId));
    expect((await related()).filter(f => f.status === "new")).toHaveLength(3);
    const http = express(); http.use(express.json());
    http.use((req, _res, next) => { req.user = { activeCompanyId: companyId } as Express.User; next(); });
    registerContractQuestionReconciliation(http);
    http.patch("/api/contract-center/terms/:id", async (req, res) => {
      if (req.body.fail) { res.status(422).json({ message: "not committed" }); return; }
      await db.update(agreementTerms).set({ startDate: today, snowTriggers: "2 inches" }).where(eq(agreementTerms.id, t));
      res.json({ ok: true });
    });
    await request(http).patch(`/api/contract-center/terms/${t}`).send({ fail: true }).expect(422);
    expect((await related()).filter(f => f.status === "new")).toHaveLength(3);
    await request(http).patch(`/api/contract-center/terms/${t}`).send({}).expect(200);
    for (let attempt = 0; attempt < 40 && (await related()).some(f => f.status === "new"); attempt++)
      await new Promise(resolve => setTimeout(resolve, 50));
    expect((await related()).every(f => f.status === "resolved")).toBe(true);
    // Colorado day-driven end closes the trigger question and creates one no-term question per active property.
    await reconcileContractQuestions(companyId, addCalendarDays(today, 11));
    expect((await related()).filter(f => f.status === "new").map(f => f.sourceKey).sort()).toEqual([`no-term:${c}`, `no-term:${child}`].sort());
    await db.update(customers).set({ active: "false" }).where(eq(customers.id, c));
    await db.update(customers).set({ status: "prospect" }).where(eq(customers.id, child));
    await reconcileContractQuestions(companyId, addCalendarDays(today, 11));
    expect((await related()).every(f => f.status === "resolved")).toBe(true);
  }, 15000);
});
