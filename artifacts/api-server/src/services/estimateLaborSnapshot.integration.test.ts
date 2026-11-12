import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { companies, customers, users, rateCardItems, estimateLines, pool as schemaPool } from "@workspace/db";
import { db, inTransaction, pool } from "../db";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";
import { createEstimate } from "./estimates";
import { registerEstimateRoutes } from "../routes/estimates";

afterAll(async () => { await Promise.all([pool.end(), schemaPool.end()]); });

it("inserts labor from the seeded standard per-hour rate card without altering rates or guessing unknown units", async () => {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1")
    throw new Error("Disposable development transaction only");
  const rollback = new Error("Rollback labor snapshot fixture");
  const companyId = `labor-snapshot-${randomUUID()}`, userId = randomUUID();
  try {
    await db.transaction(tx => inTransaction(tx, async () => {
      await tx.insert(companies).values({id: companyId, name: "Disposable labor snapshot", slug: companyId});
      await tx.insert(users).values({id: userId, name: "Disposable estimate editor", passwordHash: "unusable"});
      const [customer] = await tx.insert(customers).values({companyId, name: "Disposable property",
        street: "Test", city: "Test", state: "CO", zip: "00000"}).returning();
      // Identical input to the existing standard-card seed operation.
      await tx.insert(rateCardItems).values(RATE_CARD_DEFAULTS.map(({key, ...rate}, sortOrder) =>
        ({...rate, rateKey: key, companyId, sortOrder})));
      // This seeded labor key has no company price until the office sets one.
      await tx.update(rateCardItems).set({priceCents: 7500}).where(and(eq(rateCardItems.companyId, companyId),
        eq(rateCardItems.rateKey, "rate_general_labor")));
      const draft = await createEstimate(companyId, userId, {customerId: customer.id, title: "Hourly labor"});
      const input = {lineType: "labor" as const, sectionId: draft.version.sections[0].id, quantity: "2", rateKey: "rate_general_labor"};
      const app = express(); app.use(express.json());
      app.use((req, _res, next) => {
        req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
        req.user = {id: userId, activeCompanyId: companyId, activeRole: "admin"} as Express.User;
        next();
      });
      registerEstimateRoutes(app);
      const path = `/api/estimates/${draft.id}/versions/${draft.version.id}/lines`;
      const inserted = await request(app).post(path).send(input);
      expect(inserted.status).toBe(201);
      const [line] = await tx.select().from(estimateLines).where(eq(estimateLines.versionId, draft.version.id));
      expect(line).toMatchObject({unit: "HR", quantity: "2.00", unitPriceCents: 7500, extendedCents: 15000,
        rateKey: "rate_general_labor", priceSource: "rate_card"});
      const [rate] = await tx.select().from(rateCardItems).where(and(eq(rateCardItems.companyId, companyId),
        eq(rateCardItems.rateKey, input.rateKey)));
      expect(rate).toMatchObject({unit: "per hour", priceCents: 7500});
      await tx.update(rateCardItems).set({unit: "per mystery"}).where(eq(rateCardItems.id, rate.id));
      const rejected = await request(app).post(path).send(input);
      expect(rejected.status).toBe(422);
      expect(rejected.body).toMatchObject({error: "INVALID_CATALOG_UNIT"});
      expect(await tx.select().from(estimateLines).where(eq(estimateLines.versionId, draft.version.id))).toHaveLength(1);
      throw rollback;
    }));
  } catch (error) {
    if (error !== rollback) throw error;
  }
  expect(await db.select().from(companies).where(eq(companies.id, companyId))).toHaveLength(0);
}, 60_000);
