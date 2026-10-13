import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, users, companyUsers, customers, agreements, agreementTerms, contracts, hashPassword, pool } from "@workspace/db";
import { db } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";

/**
 * Opt-in, isolated development verification of the create/renew acceptance scenarios.
 * CC_CREATE_VERIFY=yes pnpm --filter @workspace/api-server exec vitest run src/lib/contractCenterCreateRenewDevelopment.test.ts
 * No migrations, existing-company writes, login changes or object uploads.
 */
describe.skipIf(process.env.CC_CREATE_VERIFY !== "yes")("create/renew real development scenarios", () => {
  it("preserves Pavilion billing and history, snow T&M, Both flat snow, and renewal preview agreement", async () => {
    if (process.env.NODE_ENV === "production") throw new Error("Development verification cannot run in production");
    let companyId: string | undefined;
    let userId: string | undefined;
    try {
      const tag = randomUUID();
      const [company] = await db.insert(companies).values({ name: "Disposable create/renew verification", slug: `cc-create-${tag}` }).returning();
      companyId = company.id;
      const [actor] = await db.insert(users).values({ name: "Disposable verifier", defaultCompanyId: companyId,
        passwordHash: await hashPassword(randomUUID()) }).returning();
      userId = actor.id;
      await db.insert(companyUsers).values({ companyId, userId, role: "admin", status: "active" });
      const [customer] = await db.insert(customers).values({ companyId, name: "Pavilion Villas verification", street: "Test address",
        city: "Denver", state: "CO", zip: "80000" }).returning();
      let role = "admin";
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        Object.assign(req, { isAuthenticated: () => true, user: { id: actor.id, activeCompanyId: company.id, activeRole: role, isSuperAdminBool: false } });
        next();
      });
      registerContractCenterRoutes(app);
      const client = request(app), base = "/api/contract-center";
      expect((await client.post(`${base}/rate-card/seed-defaults`)).status).toBe(200);
      role = "office";
      const grounds = { component: "Grounds maintenance", months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1, amountCents: [1, 2, 11, 12].includes(i + 1) ? 58750 : 117500,
      })) };
      const fertilization = { component: "Fertilization", months: Array.from({ length: 7 }, (_, i) => ({
        month: i + 3, amountCents: i === 6 ? 34284 : 34286,
      })) };
      const body = { customerId: customer.id, line: "landscape", form: "theirs",
        term: { seasonLabel: "2026–27", startDate: "2026-10-01", endDate: "2027-09-30" },
        scope: [{ serviceKey: "mowing", included: true, quantity: 26 }],
        rates: [{ rateKey: "rate_additional_mowing", priceCents: 61000 }],
        payments: [grounds, fertilization] };
      const pavilion = await client.post(`${base}/contracts`).send(body);
      expect(pavilion.status, JSON.stringify(pavilion.body)).toBe(201);
      const source = pavilion.body.terms[0];
      expect(source.annualPriceCents).toBe(1415000);
      expect(source.billingMonths).toHaveLength(19);
      expect(source.billingMonths.find((r: { component: string; month: string }) => r.component === "Fertilization" && r.month.startsWith("2027-09")).amountCents).toBe(34284);
      expect(source.rates.find((r: { rateKey: string }) => r.rateKey === "rate_additional_mowing").priceCents).toBe(61000);
      const multiYear = await client.post(`${base}/contracts`).send({ ...body, term: { ...body.term, endDate: "2028-09-30", seasonLabel: "2026–28" } });
      expect(multiYear.status).toBe(201);
      expect(multiYear.body.terms[0].annualPriceCents).toBe(1415000);
      expect(multiYear.body.terms[0].billingMonths).toHaveLength(38);
      const snow = await client.post(`${base}/contracts`).send({ ...body, line: "snow", rates: [], payments: [],
        scope: [{ serviceKey: "snow_walks", included: true }],
        term: { ...body.term, endDate: "2027-05-01", snowPricing: "time_and_materials" } });
      expect(snow.status).toBe(201);
      expect(snow.body.terms[0].annualPriceCents).toBeNull();
      expect(snow.body.terms[0].billingMonths).toEqual([]);
      expect(snow.body.terms[0].rates.some((r: { rateKey: string }) => r.rateKey === "rate_plow_truck")).toBe(true);
      const snowLine = { component: "Snow", months: [12, 1, 2, 3, 4].map(month => ({ month, amountCents: 100000 })) };
      const both = await client.post(`${base}/contracts`).send({ ...body, line: "both", payments: [grounds, snowLine],
        term: { ...body.term, snowPricing: "flat_rate", snowFlatPriceCents: 500000 } });
      expect(both.status).toBe(201);
      const bothTerm = both.body.terms[0];
      expect(bothTerm.annualPriceCents).toBe(1675000);
      expect((await client.patch(`${base}/terms/${bothTerm.id}`).send({ snowFlatPriceCents: 600000 })).status).toBe(200);
      expect((await client.put(`${base}/terms/${bothTerm.id}/payments`).send([grounds, { ...snowLine, months: snowLine.months.map(m => ({ ...m, amountCents: 120000 })) }])).status).toBe(200);
      const editedBoth = await client.get(`${base}/contracts/${both.body.id}`);
      expect(editedBoth.body.terms[0].annualPriceCents).toBe(1775000);
      expect(editedBoth.body.terms[0].snowFlatPriceCents).toBe(600000);
      expect((await client.post(`${base}/terms/${source.id}/status`).send({ to: "sent" })).status).toBe(200);
      expect((await client.post(`${base}/terms/${source.id}/status`).send({ to: "signed" })).status).toBe(200);
      const before = (await client.get(`${base}/contracts/${pavilion.body.id}`)).body.terms[0];
      for (const roundTo of ["dollar", "twelve"]) {
        const p = await client.post(`${base}/contracts/${pavilion.body.id}/renew`).send({ increasePct: 3, roundTo, dryRun: true });
        expect(p.status).toBe(200);
        expect(p.body.startDate).toBe("2027-10-01");
        expect(p.body.rateChanges.find((r: { rateKey: string }) => r.rateKey === "rate_additional_mowing").reason).toBe("kept override");
      }
      const preview = await client.post(`${base}/contracts/${pavilion.body.id}/renew`).send({ increasePct: 3, roundTo: "dollar", dryRun: true });
      expect(preview.body.annualPriceCents).toBe(1457500);
      expect((await db.select().from(agreementTerms).where(eq(agreementTerms.agreementId, pavilion.body.id)))).toHaveLength(1);
      const committed = await client.post(`${base}/contracts/${pavilion.body.id}/renew`).send({ increasePct: 3, roundTo: "dollar" });
      expect(committed.status).toBe(201);
      const next = committed.body.terms.find((t: { id: string }) => t.id !== source.id);
      expect(next.annualPriceCents).toBe(preview.body.annualPriceCents);
      expect(next.seasonLabel).toBe(preview.body.seasonLabel);
      expect(committed.body.terms.find((t: { id: string }) => t.id === source.id)).toEqual(before);
      expect((await client.post(`${base}/contracts/${pavilion.body.id}/renew`).send({ increasePct: 3, roundTo: "dollar" })).status).toBe(409);
      expect((await db.select().from(agreementTerms).where(eq(agreementTerms.agreementId, pavilion.body.id)))).toHaveLength(2);
      const list = await client.get(`${base}/contracts?line=landscape`);
      expect(list.body.find((a: { id: string }) => a.id === pavilion.body.id).renewalDraft.id).toBe(next.id);
      expect((await db.select().from(contracts).where(eq(contracts.companyId, companyId)))).toEqual([]);
    } finally {
      if (companyId) {
        await db.delete(agreements).where(eq(agreements.companyId, companyId));
        await db.delete(companies).where(eq(companies.id, companyId));
      }
      if (userId) await db.delete(users).where(eq(users.id, userId));
      await pool.end();
    }
  }, 60000);
});
