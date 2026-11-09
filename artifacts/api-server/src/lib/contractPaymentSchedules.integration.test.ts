import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { agreementTerms, termBillingMonths, termStatusHistory } from "@workspace/db";
import { db, pool } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import { createNonRenewalFixture, removeNonRenewalFixture } from "./contractNonRenewalFixture";
import { currentCsvTables } from "./contractAuditExport";
import { loadAuditData } from "./contractAuditData";
import { parseAuditFiles } from "./contractAuditFiles";
import { planAuditImport } from "./contractAuditPlan";
import { executeAuditImport } from "./contractAuditExecution";
import { planRenewalImport } from "./contractRenewalPlan";
import { executeRenewalImport } from "./contractRenewalExecution";
import { monthAt, monthIndex } from "./contractCenterService";
import { customerContractProjector, loadCustomerContractInputs } from "./customerContractSummary";
import * as companyDay from "./companyDay";

const enabled = process.env.CONTRACT_PAYMENTS_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("isolated development fee and exact-schedule verification", () => {
  afterAll(async () => { await pool.end(); });
  it("verifies named examples, exact persistence, lifecycle protection, fee renewal, CSV preview/execution and history", async () => {
    const f = await createNonRenewalFixture();
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-11-06");
    try {
      const app = express(); app.use(express.json());
      app.use((req, _res, next) => {
        Object.assign(req, { isAuthenticated: () => true, user: { id: f.userId, activeCompanyId: f.companyId,
          accessRole: "admin", activeRole: "admin", isSuperAdminBool: false } }); next();
      });
      registerContractCenterRoutes(app);
      const api = request(app), base = "/api/contract-center";
      const pattern = (annual: number) => [
        { component: "Grounds", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: annual / 12 })) },
        { component: "Mobilization", fee: true, months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 3995 })) },
      ];
      const create = (payments: unknown, term = { startDate: "2026-01-01", endDate: "2026-12-31", seasonLabel: "2026" }, extra = {}) =>
        api.post(`${base}/contracts`).send({ customerId: f.customerId, line: "landscape", form: "theirs", term, payments, scope: [], rates: [], ...extra });
      for (const [name, annual] of [["Jewell Ridge", 2224800], ["Westfield", 2472000]] as const) {
        const response = await create(pattern(annual));
        expect(response.status, JSON.stringify(response.body)).toBe(201);
        const t = response.body.terms[0];
        expect(t).toMatchObject({ annualPriceCents: annual, feesAnnualCents: 47940, contractTotalCents: annual });
        expect(t.billingMonths.filter((r: any) => r.isFee)).toHaveLength(12);
        if (name === "Jewell Ridge") {
          await api.post(`${base}/terms/${t.id}/status`).send({ to: "sent" });
          await api.post(`${base}/terms/${t.id}/status`).send({ to: "signed" });
          const renew = await api.post(`${base}/contracts/${response.body.id}/renew`).send({ increasePct: 3, roundTo: "dollar" });
          expect(renew.status, JSON.stringify(renew.body)).toBe(201);
          const next = renew.body.terms.find((r: any) => r.id !== t.id);
          expect(next.feesAnnualCents).toBe(47940);
          expect(next.billingMonths.filter((r: any) => r.isFee).every((r: any) => r.amountCents === 3995)).toBe(true);
        }
      }
      const rows = [
        ...Array.from({ length: 18 }, (_, i) => {
          const month = monthAt(monthIndex("2026-04-01") + i), m = Number(month.slice(5, 7));
          return { component: "Grounds", month, amountCents: (m >= 4 && m <= 9 ? 3000 : m === 3 ? 1500 : 2100) * 100, fee: false };
        }),
        ...[2026, 2027].flatMap(y => Array.from({ length: 7 }, (_, i) => ({
          component: "Chemical", month: `${y}-${String(i + 3).padStart(2, "0")}-01`, amountCents: 164500, fee: false,
        }))),
      ];
      const dates = { startDate: "2026-04-01", endDate: "2027-09-30", seasonLabel: "College Hills fixture" };
      expect((await create({ schedule: "explicit", rows }, dates)).status).toBe(400);
      const created = await create({ schedule: "explicit", rows, allowPreStart: true }, dates);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const term = created.body.terms[0], id = term.id;
      expect(term).toMatchObject({ paymentSchedule: "explicit", annualPriceCents: 4151500, contractTotalCents: 7103000, durationMonths: 18 });
      const billing = () => db.select().from(termBillingMonths).where(eq(termBillingMonths.termId, id)).orderBy(termBillingMonths.component, termBillingMonths.month);
      const before = await billing();
      expect(before.filter(r => r.component === "Grounds")).toHaveLength(18);
      expect(before.filter(r => r.component === "Chemical")).toHaveLength(14);
      expect((await db.select().from(termStatusHistory).where(eq(termStatusHistory.termId, id))).some(h => h.note?.startsWith("Authorized pre-start"))).toBe(true);
      const replacementSeason = await create([], dates);
      const replacementId = replacementSeason.body.terms[0].id;
      expect((await api.put(`${base}/terms/${replacementId}/payments`).send({ schedule: "explicit", rows })).status).toBe(400);
      expect(await db.select().from(termBillingMonths).where(eq(termBillingMonths.termId, replacementId))).toHaveLength(0);
      expect((await api.put(`${base}/terms/${replacementId}/payments`).send({ schedule: "explicit", rows, allowPreStart: true })).status).toBe(200);
      const replacementRead = await api.get(`${base}/contracts/${replacementSeason.body.id}`);
      expect(replacementRead.body.terms[0]).toMatchObject({ paymentSchedule: "explicit", contractTotalCents: 7103000, annualPriceCents: 4151500 });
      expect(replacementRead.body.terms[0].billingMonths).toHaveLength(32);
      expect((await db.select().from(termStatusHistory).where(eq(termStatusHistory.termId, replacementId))).some(h => h.note?.startsWith("Authorized pre-start"))).toBe(true);
      expect((await api.patch(`${base}/terms/${id}`).send({ notes: "Unrelated edit" })).status).toBe(200);
      expect(await billing()).toEqual(before);
      for (const edit of [{ startDate: "2026-05-01" }, { endDate: "2027-08-31" }]) {
        const result = await api.patch(`${base}/terms/${id}`).send(edit);
        expect(result.status).toBe(400); expect(result.body.message).toMatch(/Grounds|Chemical/);
        expect(await billing()).toEqual(before);
      }
      await api.post(`${base}/terms/${id}/status`).send({ to: "sent" });
      await api.post(`${base}/terms/${id}/status`).send({ to: "signed" });
      const requestRenewal = { increasePct: 3, roundTo: "dollar", dryRun: true };
      expect((await api.post(`${base}/contracts/${created.body.id}/renew`).send(requestRenewal)).status).toBe(400);
      const preview = await api.post(`${base}/contracts/${created.body.id}/renew`).send({ ...requestRenewal, rebuildSchedule: true });
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body.before.find((p: any) => p.component === "Chemical").months).toHaveLength(7);
      expect(preview.body.startDate).toBe("2027-10-01"); expect(preview.body.endDate).toBe("2028-09-30");
      expect(preview.body.before.reduce((n: number, p: any) => n + p.months.reduce((s: number, m: any) => s + m.amountCents, 0), 0)).toBe(4151500);
      const projected = customerContractProjector(await loadCustomerContractInputs(db, f.companyId), "2026-11-06")(f.customerId)!;
      expect(projected.current.find(t => t.termId === id)).toMatchObject({ annualCents: 4151500, contractTotalCents: 7103000 });
      const snow = await create(pattern(0).slice(1), { startDate: "2026-11-01", endDate: "2027-04-30", seasonLabel: "Snow" },
        { line: "snow", term: { startDate: "2026-11-01", endDate: "2027-04-30", seasonLabel: "Snow", snowPricing: "time_and_materials" } });
      expect(snow.status, JSON.stringify(snow.body)).toBe(201);
      expect(snow.body.terms[0]).toMatchObject({ annualPriceCents: null, feesAnnualCents: 47940 });
      // Export -> dry run keeps fee/dates. Audit execution uses exactly the same validator.
      const data = await loadAuditData(f.companyId);
      const files = await parseAuditFiles(Object.entries(currentCsvTables(data)).map(([name, text]) => ({ name, data: Buffer.from(text) })));
      expect(files.errors).toEqual([]);
      const plan = planAuditImport(files, data);
      expect(plan.errors).toEqual([]);
      expect(plan.customers.flatMap(c => c.agreements).flatMap(a => a.terms).find(t => t.contractRef === id)?.billing).toHaveLength(32);
      const importFiles = await parseAuditFiles([
        { name: "contracts.csv", data: Buffer.from(`contract_ref,agreement_ref,customer_id,line,form,start_date,end_date,status,allow_pre_start\nexact,isolated-exact-import,${f.customerId},landscape,theirs,2028-04-01,2029-09-30,draft,yes`) },
        { name: "payments.csv", data: Buffer.from("contract_ref,payment_line,month,amount,fee\nexact,Grounds,2028-04,100,\nexact,Mobilization,2028-03,39.95,yes") },
        { name: "rates.csv", data: Buffer.from("contract_ref,rate_key") },
        { name: "scope.csv", data: Buffer.from("contract_ref,service_key,included") },
        { name: "documents.csv", data: Buffer.from("contract_ref,document_id,kind") },
      ]);
      delete importFiles.tables["contracts.csv"][0].values.allow_pre_start;
      expect(planAuditImport(importFiles, await loadAuditData(f.companyId)).errors.some(e => e.message.includes("pre-start"))).toBe(true);
      expect((await executeAuditImport(importFiles, f.companyId, f.userId)).errors.some(e => e.message.includes("pre-start"))).toBe(true);
      importFiles.tables["contracts.csv"][0].values.allow_pre_start = "yes";
      const imported = await executeAuditImport(importFiles, f.companyId, f.userId);
      expect(imported.errors).toEqual([]); expect(imported.failures).toEqual([]);
      const [importTerm] = await db.select().from(agreementTerms).where(and(eq(agreementTerms.companyId, f.companyId), eq(agreementTerms.startDate, "2028-04-01")));
      expect(importTerm.paymentSchedule).toBe("explicit");
      expect((await db.select().from(termStatusHistory).where(eq(termStatusHistory.termId, importTerm.id))).some(h => h.note?.startsWith("Authorized pre-start"))).toBe(true);
      const renewalFiles = await parseAuditFiles([
        { name: "renewals.csv", data: Buffer.from(`contract_ref,renews_term_id,start_date,end_date,status,rebuild_schedule,allow_pre_start\nrenew,${importTerm.id},2029-10-01,2030-09-30,draft,yes,yes`) },
        { name: "payments.csv", data: Buffer.from("contract_ref,payment_line,month,amount,fee\nrenew,Grounds,2029-10,103,\nrenew,Mobilization,2029-09,39.95,yes") },
      ]);
      expect(planRenewalImport(renewalFiles, await loadAuditData(f.companyId)).errors).toEqual([]);
      const renewed = await executeRenewalImport(renewalFiles, f.companyId, f.userId);
      expect(renewed.errors).toEqual([]); expect(renewed.failures).toEqual([]);
      const [renewedTerm] = await db.select().from(agreementTerms).where(eq(agreementTerms.renewedFromTermId, importTerm.id));
      expect(renewedTerm.paymentSchedule).toBe("explicit");
      expect((await db.select().from(termBillingMonths).where(eq(termBillingMonths.termId, renewedTerm.id))).map(r => [r.amountCents, r.isFee]).sort()).toEqual([[10300, false], [3995, true]].sort());
    } finally {
      vi.restoreAllMocks(); await removeNonRenewalFixture(f.companyId, f.userId);
    }
  }, 60000);
});
