import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agreements, agreementTerms, customers, propertyManagementCompanies, termLegacySources, termStatusHistory } from "@workspace/db";
import { db, pool } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import { createMergeFixture, seedMergePair } from "./contractMergeFixture";
import { removeNonRenewalFixture, resetNonRenewalFixture } from "./contractNonRenewalFixture";
import { mergeSeparateAgreement, loadMergeCandidates } from "./contractMerge";
import { fullDetail, loadContractList, loadRenewalsDue, writeTerm } from "./contractCenterPersistence";
import * as persistence from "./contractCenterPersistence";
import { loadContractRevenueRows, monthlyTotals } from "./contractRevenue";
import { incomeForecast } from "./incomeStreams";

const enabled = process.env.CONTRACT_MERGE_DB_TEST === "1" && process.env.NODE_ENV !== "production";
const pipeline = { acceptedLast12Cents: 0, sentOpenCents: 0, winRatePct: null };
describe.skipIf(!enabled)("separate renewal merge in disposable PostgreSQL company", () => {
  let f: Awaited<ReturnType<typeof createMergeFixture>>;
  let pair: Awaited<ReturnType<typeof seedMergePair>>;
  beforeAll(async () => { f = await createMergeFixture(); }, 30000);
  beforeEach(async () => {
    await resetNonRenewalFixture(f.companyId, f.customerId);
    pair = await seedMergePair(f.companyId, f.userId, f.customerId);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { if (f) await removeNonRenewalFixture(f.companyId, f.userId); await pool.end(); });
  const path = () => `/api/contract-center/contracts/${pair.target.id}`;
  function app(role = "office", companyId?: string, authenticated = true, superAdmin = false) {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => authenticated, user: {
      id: f.userId, activeCompanyId: companyId ?? f.companyId, accessRole: role, activeRole: role, isSuperAdminBool: superAdmin,
    } }); next(); });
    registerContractCenterRoutes(a); return request(a);
  }
  const merge = () => db.transaction(tx => mergeSeparateAgreement(tx, f.companyId, f.userId, pair.target.id, pair.source.id));
  const detail = () => fullDetail(db, f.companyId, pair.target.id, true);
  const legacy = () => db.select().from(termLegacySources).where(eq(termLegacySources.companyId, f.companyId));
  const update = (id: string, values: Partial<typeof agreementTerms.$inferInsert>) => db.update(agreementTerms).set(values).where(eq(agreementTerms.id, id));
  async function refused(message: string, status = 409, sourceId = pair.source.id) {
    const before = await detail(), source = await fullDetail(db, f.companyId, pair.source.id);
    const r = await app().post(`${path()}/merge`).set("X-Company-Id", f.companyId).send({ sourceAgreementId: sourceId });
    expect(r.status).toBe(status); expect(r.body.message).toBe(message);
    expect(await detail()).toEqual(before); expect(await fullDetail(db, f.companyId, pair.source.id)).toEqual(source);
  }
  it("repairs Vista West shape preserving every child and history id, and removes pending revenue without changing signed totals", async () => {
    const before = await detail(), source = await fullDetail(db, f.companyId, pair.source.id), legacyBefore = await legacy();
    const billsBefore = await loadContractRevenueRows(db, f.companyId, "2026-01-01", "2027-12-01");
    const forecast = async () => {
      const list = await loadContractList(db, f.companyId, {}, "2026-11-25");
      const terms = await db.select().from(agreementTerms).where(eq(agreementTerms.companyId, f.companyId));
      return incomeForecast({ today: "2026-11-25", bills: await loadContractRevenueRows(db, f.companyId, "2026-01-01", "2027-12-01"),
        histories: list.map(a => ({ id: a.id, customerId: a.customerId, customerName: a.customerName, terms: terms.filter(t => t.agreementId === a.id) })),
        earned: [], fetchedYears: [], mappings: [], plans: [], targets: [] });
    };
    expect((await forecast()).planProjection(2027, await loadRenewalsDue(db, f.companyId, "2026-11-25"), pipeline)!.renewalsPending.map(r => r.agreementId)).toContain(pair.target.id);
    const response = await app().post(`${path()}/merge`).set("X-Company-Id", f.companyId).send({ sourceAgreementId: pair.source.id });
    expect(response.status).toBe(200);
    const after = await detail();
    expect(after.terms).toHaveLength(3); expect(after.importRef).toBe(before.importRef);
    expect(after.notes).toBe("Original agreement notes\n\nFrom merged contract:\nSeparate agreement notes");
    expect(after.terms.find(t => t.id === pair.cancelled.id)).toEqual(before.terms.find(t => t.id === pair.cancelled.id));
    expect(after.terms.find(t => t.id === pair.predecessor.id)?.status).toBe("renewed");
    expect(after.terms.find(t => t.id === pair.first.id)).toMatchObject({ renewedFromTermId: pair.predecessor.id, agreementId: pair.target.id });
    for (const old of [...before.terms, ...source.terms]) {
      const moved = after.terms.find(t => t.id === old.id)!;
      for (const key of ["scope", "rates", "billingMonths", "documents"] as const) expect(moved[key]).toEqual(old[key]);
      for (const history of old.history) expect(moved.history).toContainEqual(history);
      for (const key of ["startDate", "endDate", "line", "annualPriceCents", "signedAt"] as const) expect(moved[key]).toEqual(old[key]);
    }
    expect(await legacy()).toEqual(legacyBefore);
    expect(after.terms.find(t => t.id === pair.first.id)?.history.map(h => h.note)).toEqual(expect.arrayContaining([
      `Moved from separate contract ${pair.source.id} (merged into this contract)`, "Linked as the renewal of 2026",
    ]));
    expect(after.terms.find(t => t.id === pair.predecessor.id)?.history.map(h => h.note)).toContain("Renewed by 2026–27 (merged from separate contract)");
    expect(await db.select().from(agreements).where(eq(agreements.companyId, f.companyId))).toHaveLength(1);
    expect((await app().get(`/api/contract-center/contracts/${pair.source.id}`)).status).toBe(404);
    const [item] = await loadContractList(db, f.companyId, {}, "2026-11-25");
    expect(item.state).not.toBe("ended_no_decision"); expect(item.allowedActions).not.toContain("renew"); expect(item.allowedActions).not.toContain("not_renewing");
    expect(monthlyTotals(await loadContractRevenueRows(db, f.companyId, "2026-01-01", "2027-12-01"), 2027)).toEqual(monthlyTotals(billsBefore, 2027));
    const income = await forecast();
    expect(income.planProjection(2027, await loadRenewalsDue(db, f.companyId, "2026-11-25"), pipeline)!.renewalsPending).toEqual([]);
    expect(income.income(2027).streams.contract.months.filter(m => m.month <= "2027-10-01").every(m => m.estimatedCents === 0)).toBe(true);
  });
  it.each(["draft", "sent"] as const)("links %s as pending without changing predecessor status", async status => {
    await update(pair.first.id, { status });
    const result = await merge();
    expect(result.renewalDraftId).toBe(pair.first.id);
    expect(result.terms.find(t => t.id === pair.predecessor.id)?.status).toBe("signed");
    expect(result.terms.find(t => t.id === pair.predecessor.id)?.history.map(h => h.note)).toContain("Renewal 2026–27 merged from separate contract");
  });
  it.each(["active", "renewed"] as const)("marks the predecessor renewed for a moved %s season", async status => {
    await update(pair.first.id, { status });
    const result = await merge();
    expect(result.terms.find(t => t.id === pair.predecessor.id)?.status).toBe("renewed");
    expect(result.terms.find(t => t.id === pair.first.id)?.status).toBe(status);
  });
  it("ignores a lost target renewal just like a cancelled draft", async () => {
    await update(pair.cancelled.id, { status: "lost" });
    expect((await merge()).terms.find(t => t.id === pair.cancelled.id)?.status).toBe("lost");
  });
  it("moves cancelled/lost source seasons and keeps their existing renewal pointers", async () => {
    const moved = await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, {
      ...pair.first, id: undefined, status: "lost", renewedFromTermId: pair.first.id, seasonLabel: "Lost future",
      startDate: "2027-11-01", endDate: "2028-10-31",
    }, "Fixture lost"));
    const cancelled = await db.transaction(tx => writeTerm(tx, f.companyId, f.userId, null, {
      ...pair.first, id: undefined, status: "cancelled", renewedFromTermId: moved.id, seasonLabel: "Cancelled earlier",
      startDate: "2025-01-01", endDate: "2026-12-31",
    }, "Fixture cancelled"));
    const result = await merge();
    for (const t of [moved, cancelled]) expect(result.terms.find(s => s.id === t.id)).toMatchObject({
      agreementId: pair.target.id, status: t.status, renewedFromTermId: t.renewedFromTermId,
    });
  });
  it("carries newer non-null management with both names in history and preserves target import reference", async () => {
    const [old, newer] = await db.insert(propertyManagementCompanies).values([
      { companyId: f.companyId, name: "Previous Management" }, { companyId: f.companyId, name: "Newer Management" },
    ]).returning();
    await db.update(agreements).set({ propertyManagementCompanyId: old.id }).where(eq(agreements.id, pair.target.id));
    await db.update(agreements).set({ propertyManagementCompanyId: newer.id }).where(eq(agreements.id, pair.source.id));
    expect((await loadMergeCandidates(db, f.companyId, pair.target.id))[0]).toMatchObject({ managementCompanyName: newer.name, targetManagementCompanyName: old.name });
    const result = await merge();
    expect(result.propertyManagementCompanyId).toBe(newer.id);
    expect(result.terms.find(t => t.id === pair.first.id)?.history.some(h => h.note?.includes(old.name) && h.note.includes(newer.name))).toBe(true);
  });
  it("keeps target management and notes when source values are null", async () => {
    const [m] = await db.insert(propertyManagementCompanies).values({ companyId: f.companyId, name: "Retained" }).returning();
    await db.update(agreements).set({ propertyManagementCompanyId: m.id }).where(eq(agreements.id, pair.target.id));
    await db.update(agreements).set({ notes: null }).where(eq(agreements.id, pair.source.id));
    expect(await merge()).toMatchObject({ propertyManagementCompanyId: m.id, notes: "Original agreement notes" });
  });
  it("refuses a non-renewal decision", async () => {
    await update(pair.predecessor.id, { nonRenewalOn: "2026-10-01", nonRenewalReason: "board" });
    await refused("Undo Not renewing on 2026 first.");
  });
  it.each(["draft", "sent"] as const)("refuses a target %s renewal", async status => {
    await update(pair.cancelled.id, { status });
    await refused(`2026 already has a ${status} renewal. Cancel it or use it instead.`);
  });
  it("refuses inclusive overlap", async () => {
    await update(pair.first.id, { startDate: "2026-10-31" });
    await refused("2026–27 overlaps 2026.");
  });
  it("refuses imported sources", async () => {
    await db.update(agreements).set({ importRef: "fixture-source-import" }).where(eq(agreements.id, pair.source.id));
    await refused("This contract came from the contract audit import and can't be merged away. Merge in the other direction or contact support.");
  });
  it("refuses the same agreement", async () => { await refused("Choose a separate contract to merge.", 409, pair.target.id); });
  it.each(["internal", "external"])("refuses an already linked first season (%s)", async kind => {
    await update(pair.first.id, { renewedFromTermId: kind === "internal" ? pair.first.id : pair.predecessor.id });
    await refused("2026–27 is already a renewal of another season.");
  });
  it("refuses a missing target source or source qualifying season", async () => {
    await update(pair.predecessor.id, { status: "cancelled" });
    await refused("This contract has no season to renew.");
    await update(pair.predecessor.id, { status: "signed" }); await update(pair.first.id, { status: "lost" });
    await refused("The separate contract has no season to merge as a renewal.");
  });
  it("refuses invalid ordering even without overlap", async () => {
    await update(pair.first.id, { startDate: "2025-01-01", endDate: "2025-12-31" });
    await refused("2026–27 must start after 2026.");
  });
  it("returns 404 across customers and companies", async () => {
    const [c] = await db.insert(customers).values({ companyId: f.companyId, name: "Different disposable customer", street: "", city: "", state: "CO", zip: "" }).returning();
    await db.update(agreements).set({ customerId: c.id }).where(eq(agreements.id, pair.source.id));
    await refused("Contract not found", 404);
    expect((await loadMergeCandidates(db, f.companyId, pair.target.id))).toEqual([]);
    expect((await app("office", "foreign-company").post(`${path()}/merge`).set("X-Company-Id", "foreign-company").send({ sourceAgreementId: pair.source.id })).status).toBe(404);
    const foreign = await createMergeFixture();
    try { await refused("Contract not found", 404, foreign.source.id); }
    finally { await removeNonRenewalFixture(foreign.companyId, foreign.userId); }
  });
  it("enforces roles, company header and body; exposes cheap eligible detail hint even for an in-effect source", async () => {
    for (const role of ["crew_supervisor", "field_manager", "mapping"]) {
      expect((await app(role).get(`${path()}/merge-candidates`)).status).toBe(403);
      expect((await app(role).post(`${path()}/merge`).send({ sourceAgreementId: pair.source.id })).status).toBe(403);
    }
    expect((await app("crew_supervisor", undefined, true, true).get(`${path()}/merge-candidates`)).status).toBe(403);
    expect((await app("crew_supervisor", undefined, true, true).get(path())).body.canMergeSeparate).toBe(false);
    expect((await app("admin", undefined, false).get(`${path()}/merge-candidates`)).status).toBe(401);
    for (const header of [undefined, "changed"]) {
      let req = app().post(`${path()}/merge`);
      if (header) req = req.set("X-Company-Id", header);
      expect((await req.send({ sourceAgreementId: pair.source.id })).body.message).toBe("Active company changed. Reload and try again.");
    }
    expect((await app().post(`${path()}/merge`).set("X-Company-Id", f.companyId).send({})).status).toBe(400);
    for (const role of ["admin", "office"]) expect((await app(role).get(path())).body.canMergeSeparate).toBe(true);
    await update(pair.predecessor.id, { endDate: "2026-11-30" });
    await update(pair.first.id, { startDate: "2026-12-01" });
    expect((await app().get(path())).body.canMergeSeparate).toBe(true);
  });
  it("sorts qualifying candidates; blocked reasons match write validation; closed-only and earlier agreements are excluded", async () => {
    const later = await seedMergePair(f.companyId, f.userId, f.customerId);
    await update(later.first.id, { startDate: "2028-01-01", endDate: "2028-12-31" });
    await db.update(agreements).set({ importRef: "blocked-import" }).where(eq(agreements.id, later.source.id));
    const candidates = await loadMergeCandidates(db, f.companyId, pair.target.id);
    expect(candidates.map(c => c.agreementId)).toEqual([pair.source.id, later.source.id]);
    expect(candidates[0].blockedReason).toBeNull(); expect(candidates[1].blockedReason).toContain("audit import");
    await update(pair.first.id, { status: "cancelled" });
    expect((await detail()).canMergeSeparate).toBe(false);
  });
  it("serializes reverse merges without deadlock or data loss", async () => {
    await db.update(agreements).set({ importRef: null }).where(eq(agreements.id, pair.target.id));
    const results = await Promise.allSettled([merge(), db.transaction(tx => mergeSeparateAgreement(tx, f.companyId, f.userId, pair.source.id, pair.target.id))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect([404, 409]).toContain(rejection.reason.status);
    expect(await db.select().from(agreements).where(eq(agreements.companyId, f.companyId))).toHaveLength(1);
    expect(await db.select().from(agreementTerms).where(eq(agreementTerms.companyId, f.companyId))).toHaveLength(3);
  }, 15000);
  it("locks company then agreements in sorted order and rereads changed seasons", async () => {
    const events: string[] = [], originalLock = persistence.lockAgreement;
    vi.spyOn(persistence, "lockAgreement").mockImplementation(async (tx, company, id) => {
      events.push(id);
      const row = await originalLock(tx, company, id);
      // A competing editor changed eligibility after an earlier candidates read.
      if (events.length === 2) await tx.update(agreementTerms).set({ nonRenewalOn: "2026-10-01", nonRenewalReason: "board" }).where(eq(agreementTerms.id, pair.predecessor.id));
      return row;
    });
    expect((await loadMergeCandidates(db, f.companyId, pair.target.id))[0].blockedReason).toBeNull();
    const gate = vi.spyOn(persistence, "lockContractCompany");
    await expect(merge()).rejects.toMatchObject({ status: 409, message: "Undo Not renewing on 2026 first." });
    expect(events).toEqual([pair.target.id, pair.source.id].sort());
    expect(gate.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(persistence.lockAgreement).mock.invocationCallOrder[0]);
    expect((await detail()).terms.find(t => t.id === pair.predecessor.id)?.nonRenewalOn).toBeNull();
  });
  it("rolls back moves, fields, links and histories on failure", async () => {
    const before = await detail(), source = await fullDetail(db, f.companyId, pair.source.id);
    const original = persistence.writeTerm;
    vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      const result = await original(...args);
      if (args[5].startsWith("Linked")) throw new Error("Injected link failure");
      return result;
    });
    await expect(merge()).rejects.toThrow("Injected link failure");
    expect(await detail()).toEqual(before); expect(await fullDetail(db, f.companyId, pair.source.id)).toEqual(source);
  });
  it("asserts zero source seasons before deletion and rolls back if any remain", async () => {
    const before = await detail(), original = persistence.writeTerm;
    vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      if (args[5].startsWith("Moved")) return args[3]!;
      return original(...args);
    });
    await expect(merge()).rejects.toThrow("Source contract still contains seasons");
    expect(await detail()).toEqual(before);
    expect(await db.select().from(termStatusHistory).where(and(eq(termStatusHistory.companyId, f.companyId), eq(termStatusHistory.termId, pair.first.id)))).toHaveLength(1);
  });
});
