import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { eq, ne, sql } from "drizzle-orm";
import { companies, companyUsers, users, customers, agreements, agreementTerms, contracts, termLegacySources, rateCardItems, hashPassword, pool } from "@workspace/db";
import { db } from "../db";
import { registerContractCenterRoutes } from "../routes/contractCenter";

/**
 * Explicit development-only verification; never part of normal tests or startup.
 * CC_DEV_VERIFY=yes pnpm --filter @workspace/api-server exec vitest run src/lib/contractCenterDevelopment.test.ts
 * Creates one disposable company and removes all its records in finally.
 * Also explicitly adds missing standards to the existing development rate card.
 */
describe.skipIf(process.env.CC_DEV_VERIFY !== "yes")("Contract Center real development database", () => {
  it("reapplies guarded SQL and verifies Pavilion creation, renewal, concurrency, tenant reads and both histories", async () => {
    if (process.env.NODE_ENV === "production") throw new Error("Development verification cannot run in production");
    const tag = randomUUID();
    let companyId: string | undefined, userId: string | undefined;
    try {
      const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0046_contract_center_payment_lines.sql", import.meta.url), "utf8");
      await db.execute(sql.raw(migration)); await db.execute(sql.raw(migration));
      const [company] = await db.insert(companies).values({ name: "Contract Center disposable verification", slug: `cc-verify-${tag}` }).returning();
      companyId = company.id;
      const password = randomUUID(), email = `cc-verify-${tag}@example.invalid`;
      const [actor] = await db.insert(users).values({ name: "Disposable verifier", email, defaultCompanyId: company.id, passwordHash: await hashPassword(password) }).returning();
      userId = actor.id;
      await db.insert(companyUsers).values({ companyId: company.id, userId: actor.id, role: "admin", status: "active" });
      const [customer] = await db.insert(customers).values({ companyId, name: "Pavilion Villas verification", street: "Test address", city: "Denver", state: "CO", zip: "80000" }).returning();
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        Object.assign(req, { isAuthenticated: () => true, user: { id: actor.id, activeCompanyId: company.id, activeRole: "office", isSuperAdminBool: false } });
        next();
      });
      registerContractCenterRoutes(app);
      const agent = request(app), base = "/api/contract-center";
      const legacyBefore = await db.select().from(contracts).where(eq(contracts.companyId, companyId));
      const seeded = await agent.post(`${base}/rate-card/seed-defaults`);
      expect(seeded.status).toBe(403); // office cannot seed
      // Switch only this development request context to an admin for the explicit seed.
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use((req, _res, next) => {
        Object.assign(req, { isAuthenticated: () => true, user: { id: actor.id, activeCompanyId: company.id, activeRole: "admin", isSuperAdminBool: false } }); next();
      });
      registerContractCenterRoutes(adminApp);
      expect((await request(adminApp).post(`${base}/rate-card/seed-defaults`)).body).toEqual({ inserted: 43, skipped: 0 });
      expect((await request(adminApp).post(`${base}/rate-card/seed-defaults`)).body).toEqual({ inserted: 0, skipped: 43 });
      const body = { customerId: customer.id, line: "landscape", form: "theirs",
        term: { seasonLabel: "2026–27", startDate: "2026-10-01", endDate: "2027-09-30", legalName: "Pavilion Villas" },
        scope: [{ serviceKey: "chemical", included: true, quantity: 7 }, { serviceKey: "mowing", included: true, quantity: 26 }],
        rates: [{ rateKey: "rate_additional_mowing", priceCents: 61000 }],
        payments: [
          { component: "Grounds maintenance", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: [11,12,1,2].includes(i + 1) ? 58750 : 117500 })) },
          { component: "Fertilization", months: Array.from({ length: 7 }, (_, i) => ({ month: i + 3, amountCents: i === 6 ? 34284 : 34286 })) },
        ] };
      const created = await agent.post(`${base}/contracts`).send(body);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const agreementId = created.body.id, termId = created.body.terms[0].id;
      const legacyId = randomUUID();
      await db.insert(termLegacySources).values({ companyId, termId, legacyContractId: legacyId });
      expect((await agent.get(`${base}/contracts/by-legacy/${legacyId}`)).body).toEqual({ agreementId });
      expect(created.body.terms[0].annualPriceCents).toBe(1415000);
      expect(created.body.terms[0].scope.map((s: any) => s.serviceKey)).toEqual(["mowing", "chemical"]);
      const billing = created.body.terms[0].billingMonths;
      expect(billing).toHaveLength(19); expect(billing[0].component).toBe("Fertilization");
      expect((await agent.post(`${base}/terms/${termId}/status`).send({ to: "sent" })).status).toBe(200);
      expect((await agent.post(`${base}/terms/${termId}/status`).send({ to: "signed" })).status).toBe(200);
      const before = await db.select().from(agreementTerms).where(eq(agreementTerms.agreementId, agreementId));
      const preview = await agent.post(`${base}/contracts/${agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar", dryRun: true });
      expect(preview.status).toBe(200); expect(preview.body.annualPriceCents).toBe(1457500);
      expect(await db.select().from(agreementTerms).where(eq(agreementTerms.agreementId, agreementId))).toEqual(before);
      // Actual PostgreSQL agreement lock must serialize both simultaneous requests.
      const attempts = await Promise.all([1,2].map(() => agent.post(`${base}/contracts/${agreementId}/renew`).send({ increasePct: 3, roundTo: "dollar" })));
      expect(attempts.map(r => r.status).sort()).toEqual([201,409]);
      const renewed = attempts.find(r => r.status === 201)!;
      const renewal = renewed.body.terms.find((t: any) => t.id !== termId);
      expect(renewal.startDate).toBe("2027-10-01"); expect(renewal.annualPriceCents).toBe(1457500);
      const list = await agent.get(`${base}/contracts?line=landscape&q=Pavilion`);
      expect(list.status).toBe(200); expect(list.body).toHaveLength(1);
      expect(list.body[0].current.id).toBe(termId); expect(list.body[0].renewalDraft.id).toBe(renewal.id);
      expect((await agent.get(`${base}/contracts?line=snow`)).body).toEqual([]);
      expect((await agent.get(`${base}/contracts?customerId=${randomUUID()}`)).status).toBe(404);
      expect((await agent.get(`${base}/contracts/by-legacy/${randomUUID()}`)).status).toBe(404);
      expect((await agent.post(`${base}/terms/${renewal.id}/status`).send({ to: "sent" })).status).toBe(200);
      expect((await agent.post(`${base}/terms/${renewal.id}/status`).send({ to: "signed" })).status).toBe(200);
      const detail = await agent.get(`${base}/contracts/${agreementId}`);
      expect(detail.status).toBe(200);
      const old = detail.body.terms.find((t: any) => t.id === termId), next = detail.body.terms.find((t: any) => t.id === renewal.id);
      expect(old.status).toBe("renewed");
      expect(old.history[0]).toMatchObject({ note: "Renewed by 2027–28", changedBy: userId, newStatus: "renewed" });
      expect(next.history).toHaveLength(3); expect(next.history.some((h: any) => h.note === "Renewed from 2026–27 at +3%")).toBe(true);
      expect(next.rates.find((r: any) => r.rateKey === "rate_additional_mowing")).toMatchObject({ priceCents: 61000, cardPriceCents: 60000 });
      expect((await agent.get(`${base}/contracts`)).body[0].current.id).toBe(renewal.id);
      expect(await db.select().from(contracts).where(eq(contracts.companyId, companyId))).toEqual(legacyBefore);
      // Smoke-check the built, running development API through the shared proxy.
      // No credential or session value is logged or persisted.
      const url = "http://localhost:80";
      const login = await fetch(`${url}/api/auth/login`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: email, password }) });
      expect(login.status).toBe(200);
      const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
      expect(cookie.length).toBeGreaterThan(0);
      const headers = { Cookie: cookie };
      const legacyRead = await fetch(`${url}/api/contracts`, { headers });
      expect(legacyRead.status).toBe(200); expect(await legacyRead.json()).toEqual([]);
      const customerRead = await fetch(`${url}/api/contracts?customerId=${customer.id}`, { headers });
      expect(customerRead.status).toBe(200); expect(await customerRead.json()).toEqual([]);
      const centerRead = await fetch(`${url}${base}/contracts/${agreementId}`, { headers });
      expect(centerRead.status).toBe(200); expect((await centerRead.json() as any).terms).toHaveLength(2);
      const seedRead = await fetch(`${url}${base}/rate-card/seed-defaults`, { method: "POST", headers });
      expect(seedRead.status).toBe(200); expect(await seedRead.json()).toEqual({ inserted: 0, skipped: 43 });
      // The requested explicit development "Add missing standard rates" action.
      // Never change or remove any pre-existing rate row.
      const [existingCard] = await db.select().from(rateCardItems).where(ne(rateCardItems.companyId, companyId)).limit(1);
      const [existingCompany] = existingCard ? [] : await db.select().from(companies).where(ne(companies.id, companyId)).orderBy(companies.createdAt).limit(1);
      const existingCompanyId = existingCard?.companyId ?? existingCompany?.id;
      if (existingCompanyId) {
        const beforeRates = await db.select().from(rateCardItems).where(eq(rateCardItems.companyId, existingCompanyId));
        await db.insert(companyUsers).values({ userId: actor.id, companyId: existingCompanyId, role: "admin", status: "active" });
        const switched = await fetch(`${url}/api/user/switch-company`, { method: "POST",
          headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ companyId: existingCompanyId }) });
        expect(switched.status).toBe(200);
        const switchedCookie = switched.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") || cookie;
        const seedExisting = await fetch(`${url}${base}/rate-card/seed-defaults`, { method: "POST", headers: { Cookie: switchedCookie } });
        expect(seedExisting.status).toBe(200);
        const result = await seedExisting.json() as { inserted: number; skipped: number };
        expect(result.inserted + result.skipped).toBe(43);
        const afterRates = await db.select().from(rateCardItems).where(eq(rateCardItems.companyId, existingCompanyId));
        for (const oldRate of beforeRates) expect(afterRates.find(rate => rate.id === oldRate.id)).toEqual(oldRate);
        console.info(`Explicit existing development card seed: ${result.inserted} inserted, ${result.skipped} skipped; all existing rows unchanged`);
        await fetch(`${url}/api/auth/logout`, { method: "POST", headers: { Cookie: switchedCookie } });
      }
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
