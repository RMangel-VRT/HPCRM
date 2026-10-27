import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agreementTerms, agreements, termRates, termScopeLines, termBillingMonths, termStatusHistory } from "@workspace/db";
import { db, pool } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import { createAuditFixture, removeAuditFixture } from "./contractAuditFixture";
import { seedRenewalSource } from "./contractRenewalFixture";
import { fullDetail, listSummary, replaceRows } from "./contractCenterPersistence";
import * as persistence from "./contractCenterPersistence";
import { expandPayments } from "./contractCenterService";

const enabled = process.env.CONTRACT_RENEWAL_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("disposable contract-changing renewals", () => {
  let fixture: Awaited<ReturnType<typeof createAuditFixture>>;
  beforeAll(async () => { fixture = await createAuditFixture(); }, 30000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { if (fixture) await removeAuditFixture(fixture.companyId, fixture.userId); await pool.end(); });
  const path = "/api/contract-center";
  function server(company: string = fixture.companyId, role = "office") {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => true, user: { id: fixture.userId, activeRole: role,
        activeCompanyId: company, isSuperAdminBool: false } }); next();
    });
    registerContractCenterRoutes(app); return request(app);
  }
  async function source() {
    const f = await seedRenewalSource(fixture.companyId, fixture.userId, fixture.customerId);
    await db.update(agreementTerms).set({ form: "theirs" }).where(eq(agreementTerms.id, f.source.id));
    return f;
  }
  const requestBody = { increasePct: 3, roundTo: "dollar", laterYearPcts: [3, 3], form: "ours", line: "both", rates: "card" };
  it("creates seasonal fields only, and current-or-pending filters use season coverage", async () => {
    const api = server();
    const response = await api.post(`${path}/contracts`).send({ customerId: fixture.customerId, line: "snow", form: "theirs",
      term: { seasonLabel: "2026–27", startDate: "2026-10-01", endDate: "2027-09-30", snowPricing: "time_and_materials" },
      scope: [], rates: [], payments: [] });
    expect(response.status).toBe(201);
    const [relationship] = await db.select().from(agreements).where(eq(agreements.id, response.body.id));
    expect(relationship.line).toBeNull(); // The legacy form default may remain; no application write.
    expect(response.body.terms[0]).toMatchObject({ line: "snow", form: "theirs" });
    const f = await source();
    const draft = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send(requestBody);
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const snow = await api.get(`${path}/contracts?line=snow`);
    const item = snow.body.find((i: { id: string }) => i.id === f.agreement.id);
    expect(item).toMatchObject({ line: "landscape", form: "theirs", renewalDraft: { line: "both", form: "ours" } });
    expect((await api.get(`${path}/contracts?line=landscape`)).body.some((i: { id: string }) => i.id === f.agreement.id)).toBe(true);
  });
  it("previews without writes, atomically creates three years, and Sent→Signed survives reload", async () => {
    const f = await source(), api = server(), before = await fullDetail(db, fixture.companyId, f.agreement.id);
    const preview = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send({ ...requestBody, dryRun: true });
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body).toMatchObject({ changes: { form: ["theirs", "ours"], line: ["landscape", "both"] } });
    expect(preview.body.years).toHaveLength(3); expect(preview.body.scopeChanges.added).toContain("snow_walks");
    expect(await fullDetail(db, fixture.companyId, f.agreement.id)).toEqual(before);
    const created = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send(requestBody);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const terms = created.body.terms.filter((t: { id: string }) => t.id !== f.source.id);
    expect(created.body.renewalDraftId).toBe(terms[0].id);
    expect(terms.map((t: { renewedFromTermId: string }) => t.renewedFromTermId)).toEqual([f.source.id, terms[0].id, terms[1].id]);
    expect(new Set(terms.map((t: { createdAtExact: string }) => t.createdAtExact)).size).toBe(1);
    terms.forEach((t: { renewalNote: string; history: unknown; renewalSet: { length: number } }, i: number) => {
      expect(t.renewalNote, JSON.stringify(t.history)).toContain(`(year ${i + 1} of `);
      expect(t.renewalSet.length).toBe(3);
    });
    expect(terms.map((t: { annualPriceCents: number }) => t.annualPriceCents)).toEqual(preview.body.years.map((y: { annualPriceCents: number }) => y.annualPriceCents));
    const second = await api.post(`${path}/terms/${terms[1].id}/status`).send({ to: "sent" });
    expect(second.status).toBe(409); expect(second.body.message).toContain(`year 2 of a renewal; change its status from ${terms[0].seasonLabel}`);
    expect((await api.post(`${path}/terms/${terms[1].id}/documents`).send({
      uploadURL: "/objects/no-upload-needed", filename: "fixture.pdf", fileSize: 10, mimeType: "application/pdf", kind: "signed",
    })).status).toBe(409);
    expect((await api.patch(`${path}/terms/${terms[1].id}`).send({ notes: "Year two independent edits" })).status).toBe(200);
    expect((await api.post(`${path}/terms/${terms[0].id}/status`).send({ to: "sent" })).status).toBe(200);
    let detail = await fullDetail(db, fixture.companyId, f.agreement.id);
    expect(detail.terms.slice(1).every(t => t.status === "sent")).toBe(true);
    expect(new Set(detail.terms.slice(1).map(t => t.sentAt!.toISOString())).size).toBe(1);
    expect((await api.post(`${path}/terms/${terms[0].id}/status`).send({ to: "signed" })).status).toBe(200);
    detail = await fullDetail(db, fixture.companyId, f.agreement.id);
    expect(detail.terms.map(t => t.status)).toEqual(["renewed", "renewed", "renewed", "signed"]);
    expect(new Set(detail.terms.slice(1).map(t => t.signedAt!.toISOString())).size).toBe(1);
    expect(detail.terms.slice(1).map(t => t.renewalSet.year)).toEqual([1, 2, 3]);
    expect(detail.terms.slice(1).every(t => t.signedDocumentTermId === terms[0].id)).toBe(true);
    expect(detail.terms[2].allowedMoves).toEqual([]);
    expect(detail.terms[2].notes).toBe("Year two independent edits");
    expect(listSummary(detail.terms, detail.terms[1].startDate).current).toMatchObject({
      id: terms[0].id, displayStatus: "active", annualPriceCents: preview.body.years[0].annualPriceCents,
    });
    const first = detail.terms[0];
    for (const key of ["scope", "rates", "billingMonths", "documents", "line", "form"] as const) expect(first[key]).toEqual(before.terms[0][key]);
  });
  it("drops snow before exact repricing and preserves the original season", async () => {
    const f = await source(), api = server();
    await db.transaction(async tx => {
      await tx.update(agreementTerms).set({ line: "both", snowPricing: "flat_rate", snowFlatPriceCents: 240000 }).where(eq(agreementTerms.id, f.source.id));
      await replaceRows(tx, fixture.companyId, f.source.id, termBillingMonths, expandPayments([
        { component: "Grounds maintenance", months: [{ month: 10, amountCents: 1200000 }] },
        { component: "Snow", months: [{ month: 10, amountCents: 240000 }] },
      ], f.source.startDate, f.source.endDate));
      await tx.insert(termScopeLines).values({ companyId: fixture.companyId, termId: f.source.id, serviceKey: "snow_walks", line: "snow", included: true, sortOrder: 100 });
      await tx.insert(termRates).values({ companyId: fixture.companyId, termId: f.source.id, rateKey: "custom_snow", line: "snow", category: "Custom", label: "Snow custom", unit: "hour", priceCents: 12300 });
    });
    const before = await fullDetail(db, fixture.companyId, f.agreement.id);
    const response = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send({ targetAnnualCents: 1350017, roundTo: "dollar", line: "landscape" });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const term = response.body.terms[1];
    expect(term).toMatchObject({ line: "landscape", snowPricing: null, snowFlatPriceCents: null, annualPriceCents: 1350017 });
    expect(term.billingMonths.reduce((n: number, m: { amountCents: number }) => n + m.amountCents, 0)).toBe(1350017);
    expect(term.billingMonths.some((m: { component: string }) => m.component === "Snow")).toBe(false);
    expect(term.rates.some((r: { line: string }) => r.line === "snow")).toBe(false);
    expect(term.scope.some((s: { line: string }) => s.line === "snow")).toBe(false);
    expect((await fullDetail(db, fixture.companyId, f.agreement.id)).terms[0]).toEqual(before.terms[0]);
  });
  it.each([["both", "both", true], ["snow", "both", true], ["both", "landscape", false]] as const)(
    "persists custom Snow scope correctly on %s→%s renewal", async (from, to, retained) => {
      const f = await source(), api = server();
      await db.update(agreementTerms).set({ line: from, snowPricing: "time_and_materials", snowFlatPriceCents: null,
        ...(from === "snow" ? { annualPriceCents: null, billingType: "time_and_materials" } : {}) }).where(eq(agreementTerms.id, f.source.id));
      if (from === "snow") await db.delete(termBillingMonths).where(eq(termBillingMonths.termId, f.source.id));
      await db.delete(termScopeLines).where(eq(termScopeLines.termId, f.source.id));
      await db.insert(termScopeLines).values({ companyId: fixture.companyId, termId: f.source.id,
        serviceKey: "other:snow_watch", line: "snow", included: true, quantity: 7, details: { label: "Snow watch" }, sortOrder: 777 });
      const created = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send({ increasePct: 3, roundTo: "dollar", line: to });
      expect(created.status).toBe(201);
      const rows = await db.select().from(termScopeLines).where(eq(termScopeLines.termId, created.body.renewalDraftId));
      if (retained) expect(rows.find(s => s.serviceKey === "other:snow_watch")).toMatchObject({ line: "snow", quantity: 7, sortOrder: 777 });
      else expect(rows.some(s => s.serviceKey === "other:snow_watch")).toBe(false);
      const original = await db.select().from(termScopeLines).where(eq(termScopeLines.termId, f.source.id));
      expect(original[0]).toMatchObject({ line: "snow", quantity: 7 });
    });
  it("rolls back all years and children on write failure and serializes duplicate creation", async () => {
    const f = await source(), api = server(), original = persistence.writeTerm;
    let count = 0;
    vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      if (!args[3] && ++count === 2) throw new Error("Injected later-year failure");
      return original(...args);
    });
    const before = await fullDetail(db, fixture.companyId, f.agreement.id);
    expect((await api.post(`${path}/contracts/${f.agreement.id}/renew`).send(requestBody)).status).toBe(500);
    expect(await fullDetail(db, fixture.companyId, f.agreement.id)).toEqual(before);
    vi.restoreAllMocks();
    const responses = await Promise.all([1, 2].map(() => api.post(`${path}/contracts/${f.agreement.id}/renew`).send(requestBody)));
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
  });
  it.each(["draft", "lost", "cancelled"])("moves the set to %s atomically, with lost history only on the original source", async to => {
    const f = await source(), api = server();
    const created = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send(requestBody);
    const first = created.body.renewalDraftId;
    await api.post(`${path}/terms/${first}/status`).send({ to: "sent" });
    expect((await api.post(`${path}/terms/${first}/status`).send({ to })).status).toBe(to === "cancelled" ? 409 : 200);
    if (to === "cancelled") {
      await api.post(`${path}/terms/${first}/status`).send({ to: "draft" });
      expect((await api.post(`${path}/terms/${first}/status`).send({ to })).status).toBe(200);
    }
    const detail = await fullDetail(db, fixture.companyId, f.agreement.id);
    expect(detail.terms.slice(1).map(t => t.status)).toEqual([to, to, to]);
    const history = await db.select().from(termStatusHistory).where(eq(termStatusHistory.companyId, fixture.companyId));
    expect(history.filter(h => h.note === "Renewal lost" && detail.terms.some(t => t.id === h.termId)).map(h => h.termId))
      .toEqual(to === "lost" ? [f.source.id] : []);
  });
  it("rolls back partial set status changes", async () => {
    const f = await source(), api = server();
    const created = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send(requestBody);
    const before = await fullDetail(db, fixture.companyId, f.agreement.id), second = before.terms[2].id, original = persistence.writeTerm;
    vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      if (args[3]?.id === second) throw new Error("Injected status failure");
      return original(...args);
    });
    expect((await api.post(`${path}/terms/${created.body.renewalDraftId}/status`).send({ to: "sent" })).status).toBe(500);
    expect(await fullDetail(db, fixture.companyId, f.agreement.id)).toEqual(before);
  });
  it("successive one-year renewals from separate transactions never become a multi-year set", async () => {
    const f = await source(), api = server();
    const first = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send({ increasePct: 3, roundTo: "dollar" });
    await api.post(`${path}/terms/${first.body.renewalDraftId}/status`).send({ to: "sent" });
    await api.post(`${path}/terms/${first.body.renewalDraftId}/status`).send({ to: "signed" });
    const second = await api.post(`${path}/contracts/${f.agreement.id}/renew`).send({ increasePct: 3, roundTo: "dollar" });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    const detail = await fullDetail(db, fixture.companyId, f.agreement.id);
    expect(detail.terms.every(t => t.renewalSet.length === 1)).toBe(true);
    expect(detail.terms[2].signedDocumentTermId).toBe(detail.terms[2].id);
  });
  it("retains company scoping and role allow-lists", async () => {
    const f = await source();
    expect((await server("foreign").post(`${path}/contracts/${f.agreement.id}/renew`).send(requestBody)).status).toBe(404);
    expect((await server(fixture.companyId, "crew_supervisor").post(`${path}/contracts/${f.agreement.id}/renew`).send(requestBody)).status).toBe(403);
  });
});
