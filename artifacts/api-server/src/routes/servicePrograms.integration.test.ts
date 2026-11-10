import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  companies, users, customers, agreements, agreementTerms, termScopeLines, servicePrograms,
  campaigns, campaignItems, visits, insertVisitSchema, pool as schemaPool,
} from "@workspace/db";
import { db, pool } from "../db";
import { storage } from "../storage";
import { registerServiceProgramRoutes } from "./servicePrograms";
import { registerCampaignIdentityGuards, campaignWriteConflict } from "../lib/campaignIdentity";
import { registerVisitRoutes } from "./visits";
import { saveServiceProgram } from "../services/servicePrograms";
import { companyToday } from "../lib/companyDay";
import { ListVisitsResponse } from "@workspace/api-zod";

const a = `cg1-${randomUUID()}`, b = `cg1-${randomUUID()}`, uid = randomUUID();
const property = randomUUID(), agreement = randomUUID();
const generated = randomUUID(), manual = randomUUID(), item = randomUUID(), manualItem = randomUUID();
const months = [0,0,1,0,0,1,0,0,1,0,0,0];
const body = { monthSpread: months, isStandard: false };
function app(role = "admin", companyId: string | null = a, superAdmin = false, authenticated = true) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated, user: { id: uid, activeCompanyId: companyId, accessRole: role, activeRole: role, isSuperAdminBool: superAdmin } });
    next();
  });
  registerServiceProgramRoutes(instance);
  registerCampaignIdentityGuards(instance);
  registerVisitRoutes(instance);
  // The legacy handlers follow these guards; echoes prove permitted requests pass through.
  instance.post("/api/campaigns", (_req, res) => { res.json({ manual: true }); });
  instance.patch("/api/campaigns/:id", (_req, res) => { res.json({ allowed: true }); });
  instance.patch("/api/campaigns/:id/season", (_req, res) => { res.json({ allowed: true }); });
  instance.post("/api/campaigns/:id/items", (_req, res) => { res.json({ allowed: true }); });
  instance.delete("/api/campaigns/:id/items/:itemId", (_req, res) => { res.json({ allowed: true }); });
  instance.patch("/api/campaigns/:id/items/:itemId", (_req, res) => { res.json({ allowed: true }); });
  instance.delete("/api/campaigns/:id", (_req, res) => { res.json({ allowed: true }); });
  return instance;
}
describe("CG1 development database, HTTP isolation and durable identity", () => {
  beforeAll(async () => {
    await db.insert(companies).values([{ id: a, name: "Disposable CG1 A", slug: a }, { id: b, name: "Disposable CG1 B", slug: b }]);
    await db.insert(users).values({ id: uid, passwordHash: "test-only", name: "Disposable CG1 user" });
    await db.insert(customers).values({ id: property, companyId: a, name: "Disposable CG1 property", street: "Test", city: "Test", state: "CO", zip: "00000" });
    await db.insert(agreements).values({ id: agreement, companyId: a, customerId: property });
    for (const [status, endDate] of [
      ["signed", "2099-12-31"], ["active", "2099-12-31"], ["renewed", "2099-12-31"], ["sent", "2099-12-31"],
      ["up_for_renewal", companyToday()], ["draft", "2099-12-31"], ["lost", "2099-12-31"], ["cancelled", "2099-12-31"],
      ["active", "2000-01-01"],
    ] as const) {
      const termId = randomUUID();
      await db.insert(agreementTerms).values({ id: termId, companyId: a, agreementId: agreement, line: "landscape", form: "ours",
        seasonLabel: "CG1 fixture", startDate: "2026-01-01", endDate, status, billingType: "seasonal" });
      await db.insert(termScopeLines).values({ companyId: a, termId, serviceKey: "chemical", line: "landscape", included: true, quantity: 3, monthSpread: null });
      await db.insert(termScopeLines).values({ companyId: a, termId, serviceKey: "aeration", line: "landscape", included: false, quantity: 1 });
    }
    await db.insert(campaigns).values([
      { id: generated, companyId: a, title: "Disposable CG1 generated", windowStart: "2099-03-01", windowEnd: "2099-03-31", source: "contract", serviceKey: "chemical", roundMonth: "2099-03-01", roundSeq: 1, category: "chemical" },
      { id: manual, companyId: a, title: "Disposable CG1 manual", windowStart: "2099-03-01", windowEnd: "2099-03-31" },
    ]);
    await db.insert(campaignItems).values([
      { id: item, campaignId: generated, companyId: a, customerId: property, propertyId: property, customerName: "Disposable CG1 property" },
      { id: manualItem, campaignId: manual, companyId: a, customerId: property, propertyId: property, customerName: "Disposable CG1 property" },
    ]);
  }, 30000);
  afterAll(async () => {
    await db.delete(visits).where(inArray(visits.companyId, [a,b]));
    await db.delete(companies).where(inArray(companies.id, [a,b]));
    await db.delete(users).where(eq(users.id, uid));
    await Promise.all([pool.end(), schemaPool.end()]);
  });
  it("reapplies the additive migration safely", async () => {
    const ddl = readFileSync(new URL("../../../../.migration-backup/migrations/0074_campaign_service_timing.sql", import.meta.url), "utf8");
    await db.execute(sql.raw(ddl));
  });
  it("enforces allow-list, active company, expected company, and server-owned input fields", async () => {
    expect((await request(app("office")).get("/api/service-programs")).status).toBe(200);
    for (const role of ["office", "account_manager", "field_manager", "field", "crew_supervisor"]) {
      expect((await request(app(role)).put("/api/service-programs/chemical/3").send(body)).status).toBe(403);
    }
    expect((await request(app("field")).get("/api/service-programs")).status).toBe(403);
    expect((await request(app("admin", null)).get("/api/service-programs")).status).toBe(403);
    expect((await request(app("admin", a, false, false)).get("/api/service-programs")).status).toBe(401);
    expect((await request(app()).put("/api/service-programs/chemical/3").set("X-Company-Id", b).send(body)).status).toBe(409);
    expect((await request(app()).put("/api/service-programs/chemical/3").send({ ...body, companyId: b, updatedById: "foreign" })).status).toBe(400);
    expect((await request(app("field", a, true)).put("/api/service-programs/chemical/3").send(body)).status).toBe(200);
    expect((await request(app("admin", b)).get("/api/service-programs")).body.rows).toEqual([]);
    expect((await request(app()).put("/api/service-programs/mowing/3").send(body)).status).toBe(400);
  });
  it("counts five eligible raw seasons exactly once, includes today/up-for-renewal, excludes drafts/ended/excluded", async () => {
    const result = await request(app()).get("/api/service-programs");
    expect(result.body.countsInUse.find((s: { serviceKey: string }) => s.serviceKey === "chemical"))
      .toMatchObject({ seasons: 5, counts: [{ rounds: 3, seasons: 5, withoutMonths: 5 }] });
    expect(result.body.countsInUse.find((s: { serviceKey: string }) => s.serviceKey === "aeration").seasons).toBe(0);
    expect((await request(app()).delete("/api/service-programs/chemical/3")).status).toBe(409);
  });
  it("serializes simultaneous standard switches, preserves one row, clears without deleting and handles deletion", async () => {
    const two = { serviceKey: "tree_pruning", rounds: 2, monthSpread: [0,0,0,1,0,0,0,0,0,1,0,0], isStandard: true };
    const three = { serviceKey: "tree_pruning", rounds: 3, monthSpread: months, isStandard: true };
    await Promise.all(Array.from({ length: 8 }, (_, i) => saveServiceProgram(a, uid, i % 2 ? two : three)));
    let rows = await db.select().from(servicePrograms).where(and(eq(servicePrograms.companyId, a), eq(servicePrograms.serviceKey, "tree_pruning")));
    expect(rows.filter(r => r.isStandard)).toHaveLength(1);
    expect((await request(app()).delete(`/api/service-programs/tree_pruning/${rows.find(r => r.isStandard)!.rounds}`)).status).toBe(409);
    expect((await request(app()).delete("/api/service-programs/tree_pruning/standard")).status).toBe(204);
    rows = await db.select().from(servicePrograms).where(and(eq(servicePrograms.companyId, a), eq(servicePrograms.serviceKey, "tree_pruning")));
    expect(rows).toHaveLength(2);
    expect(rows.some(r => r.isStandard)).toBe(false);
    expect((await request(app()).delete("/api/service-programs/tree_pruning/2")).status).toBe(204);
  });
  it("rejects malformed programs at SQL, including empty/null/multidimensional/non-one-based arrays", async () => {
    for (const spread of ["'{}'::smallint[]", "ARRAY[NULL,3,0,0,0,0,0,0,0,0,0,0]::smallint[]",
      "ARRAY[[3,0,0,0,0,0],[0,0,0,0,0,0]]::smallint[]", "'[0:11]={3,0,0,0,0,0,0,0,0,0,0,0}'::smallint[]",
      "ARRAY[5,0,0,0,0,0,0,0,0,0,0,0]::smallint[]", "ARRAY[-1,4,0,0,0,0,0,0,0,0,0,0]::smallint[]"]) {
      await expect(db.execute(sql`INSERT INTO service_programs(company_id,service_key,rounds,month_spread) VALUES (${a},'aeration',3,${sql.raw(spread)})`)).rejects.toBeDefined();
    }
  });
  it("blocks generated shape, deletion, membership and identity writes before legacy allow-lists", async () => {
    for (const field of ["title","windowStart","window_end","category","subtype","seasonId","source","serviceKey","roundMonth","round_seq"])
      expect((await request(app()).patch(`/api/campaigns/${generated}`).send({ [field]: "changed" })).status, field).toBe(409);
    expect((await request(app()).patch(`/api/campaigns/${generated}/season`).send({ seasonId: null })).status).toBe(409);
    expect((await request(app()).delete(`/api/campaigns/${generated}`)).status).toBe(409);
    expect((await request(app()).post(`/api/campaigns/${generated}/items`).send({ customerIds: [property] })).status).toBe(409);
    expect((await request(app()).delete(`/api/campaigns/${generated}/items/${item}`)).status).toBe(409);
    expect((await request(app()).patch(`/api/campaigns/${generated}/items/${item}`).send({ servicePlanCategory: "aeration" })).status).toBe(409);
    expect((await request(app()).patch(`/api/campaigns/${generated}`).send({ status: "archived", description: "ok", assignedToId: null })).status).toBe(200);
    expect((await request(app()).patch(`/api/campaigns/${manual}`).send({ title: "Manual changed" })).status).toBe(200);
    expect((await request(app()).post(`/api/campaigns/${manual}/items`).send({ customerIds: [property] })).status).toBe(200);
    expect((await request(app()).post("/api/campaigns").send({ source: "manual" })).status).toBe(409);
    expect(campaignWriteConflict("manual", { service_key: null }, "patch")).toBeDefined();
  });
  it("mirrors campaign shape checks and unique round identity in SQL", async () => {
    const base = { companyId: a, title: "Invalid generated fixture", windowStart: "2099-03-01", windowEnd: "2099-03-31", source: "contract" as const, serviceKey: "aeration", roundMonth: "2099-03-01", roundSeq: 1 };
    for (const patch of [{ serviceKey: "mowing" }, { roundMonth: "2099-03-02" }, { roundSeq: 0 }, { category: "extra_billable" as const }, { source: "manual" as const }])
      await expect(db.insert(campaigns).values({ ...base, ...patch })).rejects.toBeDefined();
    await expect(db.insert(campaigns).values({ ...base, serviceKey: "chemical", category: "chemical" })).rejects.toBeDefined();
  });
  it("exposes engine identity in every existing joined item projection", async () => {
    expect((await storage.getCampaignItemsByCustomerId(property,a)).find(i => i.id === item)?.campaign).toMatchObject({ source: "contract", serviceKey: "chemical" });
    for (const rows of [await storage.getCampaignItemsByCustomer(property,a), await storage.getCampaignItemsByProperty(property,a), await storage.getCampaignItemsGlobal(a)])
      expect(rows.find(i => i.id === item)).toMatchObject({ campaignSource: "contract", campaignServiceKey: "chemical", campaignRoundMonth: "2099-03-01", campaignRoundSeq: 1 });
  });
  it("enforces the bidirectional visit link, one done plus cancelled, and same company", async () => {
    const base = { companyId: a, visitDate: "2099-03-05", sourceType: "campaign_item" as const, campaignItemId: item, status: "done" as const };
    expect(insertVisitSchema.safeParse({ ...base, campaignItemId: null }).success).toBe(false);
    expect(insertVisitSchema.safeParse({ ...base, sourceType: "internal", title: "x" }).success).toBe(false);
    await expect(db.insert(visits).values({ ...base, campaignItemId: null })).rejects.toBeDefined();
    await expect(db.insert(visits).values({ ...base, sourceType: "internal" })).rejects.toBeDefined();
    await expect(db.insert(visits).values({ ...base, companyId: b })).rejects.toBeDefined();
    await db.insert(visits).values(base);
    await expect(db.insert(visits).values(base)).rejects.toBeDefined();
    await db.insert(visits).values({ ...base, status: "cancelled" });
    const rows = await db.select().from(visits).where(eq(visits.campaignItemId, item));
    expect(ListVisitsResponse.parse(rows.map(r => ({ ...r, ticket: null, customer: null, crew: null }))).every(r => r.campaignItemId === item)).toBe(true);
  });
  it("prevents generic visit creation/edit/deletion and retains linked work through parent deletes", async () => {
    const [visit] = await db.select().from(visits).where(eq(visits.campaignItemId, item));
    expect((await request(app()).post("/api/visits").send({ campaignItemId: item })).status).toBe(400);
    expect((await request(app()).patch(`/api/visits/${visit.id}`).send({ campaign_item_id: manualItem })).status).toBe(400);
    expect((await request(app()).patch(`/api/visits/${visit.id}`).send({ notes: "not through generic API" })).status).toBe(409);
    expect((await request(app()).delete(`/api/visits/${visit.id}`)).status).toBe(409);
    await expect(storage.deleteCampaign(generated,a)).rejects.toMatchObject({ statusCode: 409 });
    await expect(storage.deleteCampaignItem(item,a)).rejects.toMatchObject({ statusCode: 409 });
    await expect(storage.deleteCustomer(property,a)).rejects.toMatchObject({ statusCode: 409 });
    await expect(db.delete(campaignItems).where(eq(campaignItems.id, item))).rejects.toBeDefined();
    await expect(db.delete(customers).where(eq(customers.id, property))).rejects.toBeDefined();
    await db.insert(visits).values({ companyId: a, campaignItemId: manualItem, visitDate: "2099-03-05", sourceType: "campaign_item", status: "done" });
    await expect(storage.deleteCampaign(manual,a)).rejects.toMatchObject({ statusCode: 409 });
    await expect(storage.deleteCampaignItem(manualItem,a)).rejects.toMatchObject({ statusCode: 409 });
  });
});
