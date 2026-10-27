import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { companies, users, customers, agreements, agreementTerms, termBillingMonths, termStatusHistory } from "@workspace/db";
import { db, pool } from "../db";
import * as companyDay from "./companyDay";
import { fullDetail, listSummary } from "./contractCenterPersistence";
import { expandPayments } from "./contractCenterService";
import { registerContractCenterRoutes } from "../routes/contractCenter";

// Opt-in, isolated development data only. No imports, storage or real customer histories.
const enabled = process.env.CONTRACT_SEASON_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("current season — disposable production-like persistence and endpoints", () => {
  const companyId = randomUUID(), userId = randomUUID(), today = "2026-11-15";
  const base = "/api/contract-center";
  let created = false;
  const fixtures: Array<{ name: string; agreementId: string; terms: typeof agreementTerms.$inferSelect[]; monthly: number; label: string }> = [];
  beforeAll(async () => {
    await db.insert(companies).values({ id: companyId, name: "Disposable current season verification", slug: `season-${companyId}` });
    created = true;
    await db.insert(users).values({ id: userId, name: "Disposable season verifier", email: `season-${userId}@example.invalid`,
      defaultCompanyId: companyId, passwordHash: "disabled-disposable-fixture-login" });
    for (const spec of [
      { name: "Huntington Trails", years: [2026, 2027, 2028, 2029, 2030], month: "01", endMonth: "12", endDay: "31", offset: 0,
        prices: [460000, 469500, 479000, 488500, 498000], currentIndex: 0 },
      { name: "Summerfield North", years: [2026, 2027], month: "10", endMonth: "09", endDay: "30", offset: 1,
        prices: [1350000, 1417500], currentIndex: 0 },
      { name: "Third Villa West", years: [2024, 2025, 2026], month: "10", endMonth: "09", endDay: "30", offset: 1,
        prices: [3200000, 3350000, 3495000], currentIndex: 2 },
    ]) {
      const [customer] = await db.insert(customers).values({ companyId, name: `Disposable ${spec.name}`,
        street: "1 Fixture Way", city: "Denver", state: "CO", zip: "80000" }).returning();
      const [agreement] = await db.insert(agreements).values({ companyId, customerId: customer.id }).returning();
      const terms: typeof agreementTerms.$inferSelect[] = [];
      for (const [i, year] of spec.years.entries()) {
        const [term] = await db.insert(agreementTerms).values({
          companyId, agreementId: agreement.id, createdBy: userId, line: "landscape", form: "ours",
          seasonLabel: spec.offset ? `${year}–${String(year + 1).slice(-2)}` : String(year),
          startDate: `${year}-${spec.month}-01`, endDate: `${year + spec.offset}-${spec.endMonth}-${spec.endDay}`,
          status: i === spec.years.length - 1 ? "signed" : "renewed", renewedFromTermId: terms.at(-1)?.id ?? null,
          annualPriceCents: spec.prices[i] * 12, billingType: "equal_monthly", signedAt: new Date("2026-01-01T19:00:00Z"),
        }).returning();
        terms.push(term);
        await db.insert(termBillingMonths).values(expandPayments([{ component: "Grounds maintenance",
          months: Array.from({ length: 12 }, (_, m) => ({ month: m + 1, amountCents: spec.prices[i] })) }],
          term.startDate, term.endDate).map(b => ({ ...b, companyId, termId: term.id })));
      }
      fixtures.push({ name: spec.name, agreementId: agreement.id, terms, monthly: spec.prices[spec.currentIndex],
        label: terms[spec.currentIndex].seasonLabel });
    }
  }, 30000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      if (created) await db.delete(companies).where(eq(companies.id, companyId));
      await db.delete(users).where(eq(users.id, userId));
    } finally { await pool.end(); }
  });
  function server() {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => true, user: { id: userId, activeCompanyId: companyId, activeRole: "admin" } }); next();
    });
    registerContractCenterRoutes(app); return app;
  }
  async function snapshot() {
    return {
      terms: await db.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId)),
      billing: await db.select().from(termBillingMonths).where(eq(termBillingMonths.companyId, companyId)),
      history: await db.select().from(termStatusHistory).where(eq(termStatusHistory.companyId, companyId)),
    };
  }
  it("returns the in-effect prices/statuses and complete timelines through persistence, list and detail without writes", async () => {
    vi.spyOn(companyDay, "companyToday").mockReturnValue(today);
    const before = await snapshot(), agent = request(server()), list = await agent.get(`${base}/contracts`);
    expect(list.status).toBe(200); expect(list.body).toHaveLength(3);
    for (const fixture of fixtures) {
      const summary = listSummary(fixture.terms, today);
      const current = summary.current!;
      expect(current).toMatchObject({ seasonLabel: fixture.label, displayStatus: "active", annualPriceCents: fixture.monthly * 12 });
      expect(summary.renewalDue).toBe(false);
      expect(list.body.find((a: any) => a.id === fixture.agreementId)).toMatchObject({
        current: { id: current.id, seasonLabel: fixture.label, annualPriceCents: fixture.monthly * 12, displayStatus: "active" },
        renewalDue: false, companyDay: today,
      });
      const detail = await fullDetail(db, companyId, fixture.agreementId);
      const response = await agent.get(`${base}/contracts/${fixture.agreementId}`);
      expect(response.status).toBe(200);
      expect(detail.currentTermId).toBe(current.id);
      expect(response.body).toMatchObject({ currentTermId: current.id, renewalDue: false });
      expect(detail.terms.map(t => t.seasonLabel)).toEqual(fixture.terms.map(t => t.seasonLabel));
      expect(response.body.terms.map((t: any) => t.id)).toEqual(detail.terms.map(t => t.id));
      expect(response.body.terms.find((t: any) => t.id === current.id)).toMatchObject({
        displayStatus: "active", annualPriceCents: fixture.monthly * 12,
        editable: current.status !== "renewed", ...(current.status === "renewed" ? { allowedMoves: [] } : {}),
      });
    }
    expect(await snapshot()).toEqual(before);
    console.info(`Disposable fixtures verified on explicit Colorado day ${today}: Huntington 2026 $4,600/mo; Summerfield 2026–27 $13,500/mo not due; Third Villa West 2026–27 $34,950/mo, all Active. Full Huntington 2026–2030 timeline retained.`);
  });
  it("previews and creates renewal from year 5 dates/prices, never the displayed year 1", async () => {
    vi.spyOn(companyDay, "companyToday").mockReturnValue(today);
    const fixture = fixtures[0], final = fixture.terms[4], before = await snapshot(), agent = request(server());
    const preview = await agent.post(`${base}/contracts/${fixture.agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar", dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ renewedFromTermId: final.id, startDate: "2031-01-01", endDate: "2031-12-31",
      seasonLabel: "2031", annualPriceCents: 6155300, status: "draft" });
    // Dollar rounding reconciles the final month: eleven $5,129 payments and $5,134.
    expect(preview.body.payments[0].before.every((m: any) => m.amountCents === 498000)).toBe(true);
    expect(preview.body.payments[0].after.slice(0, 11).every((m: any) => m.amountCents === 512900)).toBe(true);
    expect(preview.body.payments[0].after[11].amountCents).toBe(513400);
    expect(await snapshot()).toEqual(before);
    const committed = await agent.post(`${base}/contracts/${fixture.agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar" });
    expect(committed.status).toBe(201);
    expect(committed.body.currentTermId).toBe(fixture.terms[0].id);
    expect(committed.body.terms).toHaveLength(6);
    const draft = committed.body.terms.find((t: any) => t.status === "draft");
    expect(draft).toMatchObject({
      renewedFromTermId: final.id, startDate: "2031-01-01", endDate: "2031-12-31", annualPriceCents: preview.body.annualPriceCents,
      editable: true, allowedMoves: ["sent", "cancelled", "lost"],
    });
    expect(committed.body.renewalDraftId).toBe(draft.id);
    const list = await agent.get(`${base}/contracts`);
    expect(list.body.find((a: any) => a.id === fixture.agreementId)).toMatchObject({
      current: { id: fixture.terms[0].id, displayStatus: "active" }, renewalDraft: { id: draft.id, status: "draft" },
    });
    const detail = await agent.get(`${base}/contracts/${fixture.agreementId}`);
    expect(detail.body.renewalDraftId).toBe(draft.id);
    expect(detail.body.terms.find((t: any) => t.id === draft.id)).toMatchObject({ editable: true });
    expect(detail.body.terms.find((t: any) => t.id === fixture.terms[0].id)).toMatchObject({ editable: false, allowedMoves: [] });
    expect((await agent.patch(`${base}/terms/${draft.id}`).send({ notes: "Continue disposable renewal" })).status).toBe(200);
    expect((await agent.post(`${base}/terms/${draft.id}/status`).send({ to: "sent" })).status).toBe(200);
    const continued = await agent.get(`${base}/contracts/${fixture.agreementId}`);
    expect(continued.body.renewalDraftId).toBe(draft.id);
    expect(continued.body.terms.find((t: any) => t.id === draft.id)).toMatchObject({
      status: "sent", editable: true, notes: "Continue disposable renewal",
    });
    const after = await snapshot();
    for (const dryRun of [true, false]) {
      expect((await agent.post(`${base}/contracts/${fixture.agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar", dryRun })).status).toBe(409);
    }
    expect(await snapshot()).toEqual(after);
  });
});
