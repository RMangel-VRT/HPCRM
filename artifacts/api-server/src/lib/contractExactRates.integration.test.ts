import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { agreementTerms, agreements, rateCardItems, termRates, termStatusHistory } from "@workspace/db";
import { db, pool } from "../db";
import { createAuditFixture, removeAuditFixture } from "./contractAuditFixture";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import * as companyDay from "./companyDay";
import { loadAuditData } from "./contractAuditData";
import { executeAuditImport } from "./contractAuditExecution";
import { currentCsvTables } from "./contractAuditExport";
import { parseAuditFiles } from "./contractAuditFiles";
import { planAuditImport } from "./contractAuditPlan";
import { planRenewalImport } from "./contractRenewalPlan";
import { renewalZip } from "./contractRenewalFixture";
import { loadEstimateRateContext, resolveFromRows } from "../services/estimateRates";

const enabled = process.env.CONTRACT_EXACT_RATES_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("isolated exact contract rate development examples", () => {
  afterAll(async () => { await pool.end(); });
  it("creates three, carries three, edits one history, resolves stated/fallback prices, and imports exactly two", async () => {
    const f = await createAuditFixture();
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-11-06");
    try {
      const app = express(); app.use(express.json());
      app.use((req, _res, next) => {
        Object.assign(req, { isAuthenticated: () => true, user: { id: f.userId, activeCompanyId: f.companyId,
          accessRole: "admin", activeRole: "admin", isSuperAdminBool: false } });
        next();
      });
      registerContractCenterRoutes(app);
      const api = request(app), base = "/api/contract-center";
      const supplied = [{ rateKey: "rate_general_labor", priceCents: 7500 },
        { rateKey: "rate_irrigation_labor", priceCents: 8500 },
        { rateKey: "custom_mobilization", label: "Mobilization", unit: "visit", category: "Custom", line: "general", priceCents: 3995 }];
      const created = await api.post(`${base}/contracts`).send({ customerId: f.customerId, line: "landscape", form: "theirs",
        term: { seasonLabel: "2026", startDate: "2026-01-01", endDate: "2026-12-31" }, scope: [], payments: [], rates: supplied });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const id = created.body.id, sourceId = created.body.terms[0].id;
      const commercial = (rows: any[]) => rows.map(({ rateKey, priceCents, label, unit, minimum, priceText, category, line, sortOrder }) =>
        ({ rateKey, priceCents, label, unit, minimum, priceText, category, line, sortOrder }));
      const stated = commercial(created.body.terms[0].rates);
      expect(stated.map(r => [r.rateKey, r.priceCents, r.sortOrder])).toEqual(supplied.map((r, i) => [r.rateKey, r.priceCents, i]));
      expect((await api.post(`${base}/terms/${sourceId}/status`).send({ to: "sent" })).status).toBe(200);
      expect((await api.post(`${base}/terms/${sourceId}/status`).send({ to: "signed" })).status).toBe(200);
      await db.update(rateCardItems).set({ priceCents: 99999 }).where(and(
        eq(rateCardItems.companyId, f.companyId), eq(rateCardItems.rateKey, "rate_general_labor")));
      const renewed = await api.post(`${base}/contracts/${id}/renew`).send({ increasePct: 3, roundTo: "dollar" });
      expect(renewed.status, JSON.stringify(renewed.body)).toBe(201);
      const next = renewed.body.terms.find((t: any) => t.id !== sourceId);
      expect(commercial(next.rates)).toEqual(stated);
      const before = await db.select().from(termStatusHistory).where(eq(termStatusHistory.termId, next.id));
      const edited = await api.put(`${base}/terms/${next.id}/rates`).send([
        supplied[1], { ...supplied[2], minimum: "One visit" }, { rateKey: "rate_operator_labor", priceCents: 9000 },
      ]);
      expect(edited.status).toBe(200);
      const after = await db.select().from(termStatusHistory).where(eq(termStatusHistory.termId, next.id));
      expect(after).toHaveLength(before.length + 1);
      expect(after.find(h => h.note?.startsWith("Rates updated:"))?.note).toMatch(/added.*removed|removed.*added/s);
      const context = await loadEstimateRateContext(f.companyId, f.customerId);
      expect(resolveFromRows(context.card.find(r => r.rateKey === "rate_irrigation_labor"), context.terms, context.rates,
        "rate_irrigation_labor", "2026-11-06")).toMatchObject({ rateCents: 8500, source: "contract" });
      expect(resolveFromRows(context.card.find(r => r.rateKey === "rate_skid_loader"), context.terms, context.rates,
        "rate_skid_loader", "2026-11-06")).toMatchObject({ source: "rate_card", rateCents: 24500 });
      expect(commercial((await db.select().from(termRates).where(eq(termRates.termId, sourceId))).sort((a, b) => a.sortOrder - b.sortOrder))).toEqual(stated);
      // Current export/re-import keeps all rows, including matches, custom metadata and order.
      const data = await loadAuditData(f.companyId);
      const files = await parseAuditFiles(Object.entries(currentCsvTables(data)).map(([name, text]) => ({ name, data: Buffer.from(text) })));
      expect(files.errors).toEqual([]);
      const plan = planAuditImport(files, data);
      expect(plan.errors).toEqual([]);
      const exportedSource = plan.customers.flatMap(c => c.agreements).flatMap(a => a.terms).find(t => t.contractRef === sourceId)!;
      expect(commercial(exportedSource.rates)).toEqual(stated);
      const two = await parseAuditFiles([{ name: "exact-rates.zip", data: await renewalZip([
        { name: "contracts.csv", data: Buffer.from(`contract_ref,agreement_ref,customer_id,line,form,start_date,end_date,status\nimport-two,exact-two,${f.customerId},landscape,theirs,2028-01-01,2028-12-31,draft\nimport-zero,exact-zero,${f.customerId},landscape,theirs,2028-01-01,2028-12-31,draft`) },
        { name: "rates.csv", data: Buffer.from("contract_ref,rate_key,price\nimport-two,rate_general_labor,75\nimport-two,rate_irrigation_labor,85") },
        { name: "scope.csv", data: Buffer.from("contract_ref,service_key,included") },
        { name: "payments.csv", data: Buffer.from("contract_ref,payment_line") },
        { name: "documents.csv", data: Buffer.from("contract_ref,document_id,kind") },
      ]) }]);
      const result = await executeAuditImport(two, f.companyId, f.userId);
      expect(result.errors).toEqual([]); expect(result.failures).toEqual([]);
      const [imported] = await db.select().from(agreements).where(and(eq(agreements.companyId, f.companyId), eq(agreements.importRef, "exact-two")));
      const [term] = await db.select().from(agreementTerms).where(eq(agreementTerms.agreementId, imported.id));
      expect(await db.select().from(termRates).where(eq(termRates.termId, term.id))).toHaveLength(2);
      const [zeroAgreement] = await db.select().from(agreements).where(and(eq(agreements.companyId, f.companyId), eq(agreements.importRef, "exact-zero")));
      const [zeroTerm] = await db.select().from(agreementTerms).where(eq(agreementTerms.agreementId, zeroAgreement.id));
      expect(await db.select().from(termRates).where(eq(termRates.termId, zeroTerm.id))).toHaveLength(0);
      // Renewal CSV absence carries, explicit replace+zero rows clears, and replacement doesn't overlay.
      const renewalFiles = await parseAuditFiles([{ name: "renewals.csv", data: Buffer.from(
        `contract_ref,renews_term_id,start_date,end_date,status,rates_mode\nreplacement,${term.id},2029-01-01,2029-12-31,draft,replace`) },
        { name: "payments.csv", data: Buffer.from("contract_ref,payment_line,jan\nreplacement,Grounds maintenance,1") }]);
      const cleared = planRenewalImport(renewalFiles, await loadAuditData(f.companyId));
      expect(cleared.errors).toEqual([]);
      expect(cleared.customers[0].terms[0].rates).toEqual([]);
      expect(cleared.customers[0].terms[0].rateChanges.filter(c => c.reason === "removed")).toHaveLength(2);
    } finally {
      vi.restoreAllMocks();
      await removeAuditFixture(f.companyId, f.userId);
    }
  }, 60000);
});
