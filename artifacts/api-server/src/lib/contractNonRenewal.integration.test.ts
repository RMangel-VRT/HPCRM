import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agreementTerms, customers, termStatusHistory, termScopeLines, termBillingMonths, termRates } from "@workspace/db";
import { db, pool } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import { recordNonRenewal, undoNonRenewal } from "./contractNonRenewal";
import { fullDetail, loadContractList, loadRenewalsDue, lockContractCompany, writeTerm } from "./contractCenterPersistence";
import { runContractNonRenewalSweep } from "./contractNonRenewalSweep";
import { companyToday, addCalendarDays } from "./companyDay";
import { createNonRenewalFixture, addNonRenewalLine, resetNonRenewalFixture, removeNonRenewalFixture } from "./contractNonRenewalFixture";
import { storage } from "../storage";
import * as persistence from "./contractCenterPersistence";

const enabled = process.env.CONTRACT_NON_RENEWAL_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("non-renewal disposable database transactions", () => {
  let f: Awaited<ReturnType<typeof createNonRenewalFixture>>;
  let line: Awaited<ReturnType<typeof addNonRenewalLine>>;
  const today = companyToday();
  const decision = { decidedOn: today, reason: "competitor" as const, competitor: "Surfaces", note: "Fixture only", deactivateCustomer: true };
  beforeAll(async () => { f = await createNonRenewalFixture(); }, 30000);
  beforeEach(async () => {
    await resetNonRenewalFixture(f.companyId, f.customerId);
    line = await addNonRenewalLine(f.companyId, f.userId, f.customerId);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { if (f) await removeNonRenewalFixture(f.companyId, f.userId); await pool.end(); });
  const record = (termId = line.term.id) => db.transaction(tx => recordNonRenewal(tx, f.companyId, f.userId, termId, decision));
  const undo = () => db.transaction(tx => undoNonRenewal(tx, f.companyId, f.userId, line.term.id));
  const term = async () => (await db.select().from(agreementTerms).where(eq(agreementTerms.id, line.term.id)))[0];
  const customer = async () => (await db.select().from(customers).where(eq(customers.id, f.customerId)))[0];
  const histories = async () => db.select().from(termStatusHistory).where(and(eq(termStatusHistory.companyId, f.companyId), eq(termStatusHistory.termId, line.term.id)));
  function app(role = "office", companyId?: string) {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => true,
      user: { id: f.userId, activeRole: role, activeCompanyId: companyId ?? f.companyId } }); next(); });
    registerContractCenterRoutes(a);
    return request(a);
  }
  it("records exactly one attributed outcome without changing operating facts; undo clears all six fields", async () => {
    await db.insert(termScopeLines).values({ termId: line.term.id, companyId: f.companyId, serviceKey: "mowing", line: "landscape", included: true, quantity: 26 });
    await db.insert(termBillingMonths).values({ termId: line.term.id, companyId: f.companyId, component: "Contract", month: `${today.slice(0, 7)}-01`, amountCents: 100000 });
    await db.insert(termRates).values({ termId: line.term.id, companyId: f.companyId, rateKey: "labor", line: "landscape", category: "Labor", label: "Labor", unit: "hour", priceCents: 5000 });
    const before = await fullDetail(db, f.companyId, line.agreement.id);
    expect((await app().post(`/api/contract-center/terms/${line.term.id}/non-renewal`).send(decision)).status).toBe(200);
    await record();
    const after = await fullDetail(db, f.companyId, line.agreement.id);
    expect(after.terms[0]).toMatchObject({ status: before.terms[0].status, displayStatus: "active", editable: true,
      nonRenewalOn: today, nonRenewalReason: "competitor", nonRenewalByName: "Non-Renewal Verification" });
    for (const key of ["scope", "rates", "billingMonths"] as const) expect(after.terms[0][key]).toEqual(before.terms[0][key]);
    expect((await histories()).filter(h => h.note === `Not renewing: Lost to another contractor (decided ${today}) — Surfaces`)).toHaveLength(1);
    expect((await histories()).some(h => h.note?.startsWith("Edited after signing"))).toBe(false);
    const [summary] = await loadContractList(db, f.companyId, {}, today);
    expect(summary).toMatchObject({ notRenewing: true, renewalDue: false, current: { nonRenewalByName: "Non-Renewal Verification" },
      renewalSource: { nonRenewalNote: "Fixture only", deactivateCustomerOnEnd: true }, renewalProgress: { due: true, notRenewing: true } });
    expect(await loadRenewalsDue(db, f.companyId, today)).toHaveLength(0);
    expect(await loadRenewalsDue(db, f.companyId, addCalendarDays(line.term.endDate, 1))).toHaveLength(0);
    expect(await undo()).toEqual({ customerStillInactive: false });
    await undo();
    expect(await term()).toMatchObject({ nonRenewalOn: null, nonRenewalReason: null, nonRenewalCompetitor: null,
      nonRenewalNote: null, nonRenewalBy: null, deactivateCustomerOnEnd: false, status: "signed" });
    expect((await histories()).filter(h => h.note === "Not renewing undone")).toHaveLength(1);
  });
  it("validates dates, text limits, roles and company scope; renew and preview refuse marked sources", async () => {
    const path = `/api/contract-center/terms/${line.term.id}/non-renewal`;
    for (const body of [{ ...decision, decidedOn: addCalendarDays(today, 1) }, { ...decision, decidedOn: "2026-02-30" },
      { ...decision, reason: "unknown" }, { ...decision, competitor: "x".repeat(121) }, { ...decision, note: "x".repeat(1001) }])
      expect((await app().post(path).send(body)).status).toBe(400);
    expect((await app("field").post(path).send(decision)).status).toBe(403);
    expect((await app("office", "foreign-company").post(path).send(decision)).status).toBe(404);
    expect((await app("office", "foreign-company").delete(path)).status).toBe(404);
    await record();
    for (const dryRun of [true, false]) {
      const res = await app().post(`/api/contract-center/contracts/${line.agreement.id}/renew`).send({ increasePct: 3, roundTo: "dollar", dryRun });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("This contract is marked not renewing; undo that first");
    }
    expect((await app().post(`/api/contract-center/terms/${line.term.id}/status`).send({ to: "lost" })).status).toBe(409);
  });
  it("closes an entire pending set through lifecycle history; undo never restores lost drafts", async () => {
    const drafts = await db.transaction(async tx => {
      await lockContractCompany(tx, f.companyId);
      const first = await writeTerm(tx, f.companyId, f.userId, null, { agreementId: line.agreement.id, line: "landscape", form: "ours",
        createdAt: new Date(),
        seasonLabel: "Next", startDate: addCalendarDays(line.term.endDate, 1), endDate: addCalendarDays(line.term.endDate, 365),
        status: "draft", billingType: "equal_monthly", renewedFromTermId: line.term.id }, "Renewed from Fixture season (year 1 of 2027–2028 renewal, +3%)");
      const second = await writeTerm(tx, f.companyId, f.userId, null, { ...first, id: undefined, seasonLabel: "Next year two",
        startDate: addCalendarDays(first.endDate, 1), endDate: addCalendarDays(first.endDate, 365), renewedFromTermId: first.id },
      "Renewed from Next (year 2 of 2027–2028 renewal, +3%)");
      return [first, second];
    });
    await record();
    for (const draft of drafts) expect((await db.select().from(agreementTerms).where(eq(agreementTerms.id, draft.id)))[0].status).toBe("lost");
    expect((await term()).status).toBe("signed");
    await undo();
    expect((await fullDetail(db, f.companyId, line.agreement.id)).renewalDraftId).toBeNull();
    for (const draft of drafts) expect((await db.select().from(agreementTerms).where(eq(agreementTerms.id, draft.id)))[0].status).toBe("lost");
  });
  it("rejects a multi-year year-one target with the last-year message and marks only its final source", async () => {
    const last = await db.transaction(async tx => {
      const first = await writeTerm(tx, f.companyId, f.userId, await term(), { status: "renewed" }, "First signed year");
      const next = await writeTerm(tx, f.companyId, f.userId, null, { ...first, id: undefined, seasonLabel: "Final year",
        startDate: addCalendarDays(first.endDate, 1), endDate: addCalendarDays(first.endDate, 365), status: "signed", renewedFromTermId: first.id },
      "Renewed from Fixture season (year 2 of fixture renewal, +3%)");
      await tx.insert(termStatusHistory).values({ companyId: f.companyId, termId: first.id, newStatus: "renewed", changedBy: f.userId,
        note: "Renewed from Earlier (year 1 of fixture renewal, +3%)" });
      return next;
    });
    // Grouping is explicit timestamp evidence; both rows were initially created in
    // separate transactions, so align this disposable imported set's timestamp.
    await db.update(agreementTerms).set({ createdAt: last.createdAt }).where(eq(agreementTerms.agreementId, line.agreement.id));
    const rejected = await app().post(`/api/contract-center/terms/${line.term.id}/non-renewal`).send(decision);
    expect(rejected.status).toBe(409); expect(rejected.body.message).toContain("last year");
    await record(last.id);
    expect((await term()).nonRenewalOn).toBeNull();
    const detail = await fullDetail(db, f.companyId, line.agreement.id);
    expect(detail.currentTermId).toBe(line.term.id); expect(detail.notRenewing).toBe(true);
    expect(detail.renewalSourceId).toBe(last.id);
  });
  it("refuses record and undo after a signed successor", async () => {
    await record();
    await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, { ...line.term, id: undefined,
      startDate: addCalendarDays(line.term.endDate, 1), endDate: addCalendarDays(line.term.endDate, 365), renewedFromTermId: line.term.id }, "Fixture signed successor"));
    await expect(undo()).rejects.toMatchObject({ status: 409 });
    await expect(record()).rejects.toMatchObject({ status: 409 });
  });
  it("runs only after the inclusive end day, is concurrent-idempotent, and undo never reactivates", async () => {
    await db.update(agreementTerms).set({ endDate: today }).where(eq(agreementTerms.id, line.term.id));
    await record();
    await runContractNonRenewalSweep(today);
    expect((await customer()).status).toBe("active");
    await Promise.all([runContractNonRenewalSweep(addCalendarDays(today, 1)), runContractNonRenewalSweep(addCalendarDays(today, 1))]);
    expect((await customer()).status).toBe("inactive");
    expect((await term()).deactivateCustomerOnEnd).toBe(false);
    expect((await histories()).filter(h => h.note === "Customer set inactive — contract ended, not renewing")).toHaveLength(1);
    await runContractNonRenewalSweep(addCalendarDays(today, 1));
    expect(await undo()).toEqual({ customerStillInactive: true });
    expect((await customer()).status).toBe("inactive");
  });
  it.each(["signed", "active", "renewed", "draft", "sent"] as const)("skips another open %s line and counts lines rather than years", async status => {
    await db.update(agreementTerms).set({ endDate: addCalendarDays(today, -1) }).where(eq(agreementTerms.id, line.term.id));
    await record();
    await addNonRenewalLine(f.companyId, f.userId, f.customerId, today, status);
    expect((await fullDetail(db, f.companyId, line.agreement.id)).otherOpenLines).toBe(1);
    await runContractNonRenewalSweep(today);
    expect((await customer()).status).toBe("active"); expect((await term()).deactivateCustomerOnEnd).toBe(true);
  });
  it("skips unticked and already-inactive customers", async () => {
    await db.update(agreementTerms).set({ endDate: addCalendarDays(today, -1) }).where(eq(agreementTerms.id, line.term.id));
    await db.transaction(tx => recordNonRenewal(tx, f.companyId, f.userId, line.term.id, { ...decision, deactivateCustomer: false }));
    await runContractNonRenewalSweep(today); expect((await customer()).status).toBe("active");
    await undo(); await record();
    await db.update(customers).set({ status: "inactive" }).where(eq(customers.id, f.customerId));
    await runContractNonRenewalSweep(today);
    expect((await term()).deactivateCustomerOnEnd).toBe(true);
    expect((await histories()).filter(h => h.note === "Customer set inactive — contract ended, not renewing")).toHaveLength(0);
  });
  it("rolls back customer status and retains the flag on failure, then retries successfully", async () => {
    await db.update(agreementTerms).set({ endDate: addCalendarDays(today, -1) }).where(eq(agreementTerms.id, line.term.id));
    await record();
    const update = storage.updateCustomer.bind(storage);
    const failure = vi.spyOn(storage, "updateCustomer").mockImplementationOnce(async (...args) => {
      await update(...args); throw new Error("Injected transactional failure");
    });
    await runContractNonRenewalSweep(today);
    expect((await customer()).status).toBe("active"); expect((await term()).deactivateCustomerOnEnd).toBe(true);
    expect((await histories()).filter(h => h.note === "Customer set inactive — contract ended, not renewing")).toHaveLength(0);
    failure.mockRestore();
    await runContractNonRenewalSweep(today); expect((await customer()).status).toBe("inactive");
  });
  it.each(["draft", "signed"] as const)("serializes a concurrent new %s season ahead of the sweep's eligibility check", async status => {
    await db.update(agreementTerms).set({ endDate: addCalendarDays(today, -1) }).where(eq(agreementTerms.id, line.term.id));
    await record();
    let sweep: ReturnType<typeof runContractNonRenewalSweep> | undefined;
    await db.transaction(async tx => {
      await lockContractCompany(tx, f.companyId);
      sweep = runContractNonRenewalSweep(today);
      await writeTerm(tx, f.companyId, f.userId, null, { agreementId: line.agreement.id, line: "landscape", form: "ours",
        seasonLabel: "Concurrent business", startDate: today, endDate: addCalendarDays(today, 365), billingType: "equal_monthly", status },
      "Concurrent fixture season");
    });
    await sweep;
    expect((await customer()).status).toBe("active"); expect((await term()).deactivateCustomerOnEnd).toBe(true);
  });
  it("a concurrent undo cannot leave the customer inactive after clearing the decision ahead of the sweep", async () => {
    await db.update(agreementTerms).set({ endDate: addCalendarDays(today, -1) }).where(eq(agreementTerms.id, line.term.id));
    await record();
    let sweep: ReturnType<typeof runContractNonRenewalSweep> | undefined;
    await db.transaction(async tx => {
      await lockContractCompany(tx, f.companyId);
      sweep = runContractNonRenewalSweep(today);
      await undoNonRenewal(tx, f.companyId, f.userId, line.term.id);
    });
    await sweep;
    expect((await customer()).status).toBe("active"); expect((await term()).nonRenewalOn).toBeNull();
  });
  it("rolls back pending renewal closure if the outcome write fails", async () => {
    const draft = await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, {
      agreementId: line.agreement.id, line: "landscape", form: "ours", seasonLabel: "Pending",
      startDate: addCalendarDays(line.term.endDate, 1), endDate: addCalendarDays(line.term.endDate, 365),
      status: "sent", billingType: "equal_monthly", renewedFromTermId: line.term.id }, "Pending fixture"));
    const original = persistence.writeTerm;
    vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      const row = await original(...args);
      if (args[6] === "outcome") throw new Error("Injected outcome history failure");
      return row;
    });
    await expect(record()).rejects.toThrow("Injected outcome history failure");
    expect((await term()).nonRenewalOn).toBeNull();
    expect((await db.select().from(agreementTerms).where(eq(agreementTerms.id, draft.id)))[0].status).toBe("sent");
    expect((await histories()).filter(h => h.note?.startsWith("Not renewing") || h.note === "Renewal lost")).toHaveLength(0);
  });
});
