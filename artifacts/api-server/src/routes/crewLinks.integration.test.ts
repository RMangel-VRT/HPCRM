import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  companies, users, companyUsers, crews, maintenanceCrews, campaignCrews, campaigns,
  customers, weeklyScheduleTemplates, maintenanceVisitConfigs, scheduleBlocks,
  crewWorksheets,
  insertMaintenanceCrewSchema, insertCampaignCrewSchema, CREW_COLORS,
} from "@workspace/db";
import { db } from "../db";
import { storage } from "../storage";
import { registerCrewsAndMobileRoutes } from "./crewsAndMobile";
import { linkCrewsByName } from "../lib/linkCrews";
import { CrewLinkError, CrewPlacementError, lockCrewCompany, validatePlannerOwner, recordCrewLinkChoice } from "../lib/crewLinks";
import { pickProvided } from "../lib/patchBody";

// Exercise the actual main-module handlers without unrelated bootstrap DML.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
function mountRange(app: express.Express, start: string, end: string) {
  const i = source.indexOf(start), j = source.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error("Crew handler registration block moved");
  new Function("deps", `const {app,storage,db,and,eq,z,standingCrews,isCrewUniqueViolation,insertMaintenanceCrewSchema,insertCampaignCrewSchema,pickProvided,CrewLinkError,CrewPlacementError,lockCrewCompany,validatePlannerOwner,recordCrewLinkChoice,maintenanceCrews}=deps;
    ${transformSync(source.slice(i, j), { loader: "ts", target: "es2022" }).code}`)({
    app, storage, db, and, eq, z, standingCrews: crews, isCrewUniqueViolation: (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "23505", insertMaintenanceCrewSchema, insertCampaignCrewSchema,
    pickProvided, CrewLinkError, CrewPlacementError, lockCrewCompany, validatePlannerOwner, recordCrewLinkChoice, maintenanceCrews,
  });
}

const suffix = randomUUID();
let companyId: string, otherCompanyId: string, userId: string;
let standingId: string, secondId: string, foreignId: string;
let plannerId: string, secondPlannerId: string, foreignPlannerId: string, campaignId: string;
function app(role = "admin", authenticated = true, activeCompanyId = companyId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = { id: userId, activeCompanyId, activeRole: role } as Express.User;
    next();
  });
  registerCrewsAndMobileRoutes(app);
  mountRange(app, '  app.post("/api/maintenance-crews",', '  app.delete("/api/maintenance-crews/:id",');
  mountRange(app, '  app.delete("/api/maintenance-crews/:id",', '  // Maintenance Visit Config routes');
  mountRange(app, '  app.post("/api/campaigns/:id/crews",', '  app.delete("/api/campaigns/:id/crews/:crewId",');
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: err.message }));
  return app;
}
async function plannerRow(id = plannerId) {
  const [row] = await db.select().from(maintenanceCrews).where(eq(maintenanceCrews.id, id));
  return row;
}
beforeAll(async () => {
  [companyId, otherCompanyId] = (await db.insert(companies).values([
    { name: `Crew test ${suffix}`, slug: `crew-test-${suffix}` },
    { name: `Foreign test ${suffix}`, slug: `foreign-test-${suffix}` },
  ]).returning()).map(c => c.id);
  [userId] = (await db.insert(users).values({ name: `Crew test supervisor ${suffix}`, passwordHash: "test-only-no-login" }).returning()).map(u => u.id);
  await db.insert(companyUsers).values([
    { companyId, userId, role: "field_manager" },
    { companyId: otherCompanyId, userId, role: "field_manager" },
  ]);
  [standingId, secondId, foreignId] = (await db.insert(crews).values([
    { companyId, name: "North", supervisorUserId: userId },
    { companyId, name: "South", supervisorUserId: userId, color: "#ffffff", defaultHoursPerDay: 0 },
    { companyId: otherCompanyId, name: "Foreign", supervisorUserId: userId },
  ]).returning()).map(c => c.id);
  [plannerId, secondPlannerId, foreignPlannerId] = (await db.insert(maintenanceCrews).values([
    { companyId, name: " NORTH ", color: "#16a34a", defaultHoursPerDay: 6 },
    { companyId, name: "South", color: "#dc2626", defaultHoursPerDay: 9 },
    { companyId: otherCompanyId, name: "Foreign" },
  ]).returning()).map(c => c.id);
  [campaignId] = (await db.insert(campaigns).values({
    companyId, title: "Crew test campaign", category: "extra_billable", status: "active",
    windowStart: "2026-10-01", windowEnd: "2026-10-31", createdById: userId,
  }).returning()).map(c => c.id);
}, 30_000);
afterAll(async () => {
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  if (otherCompanyId) await db.delete(companies).where(eq(companies.id, otherCompanyId));
  if (userId) await db.delete(users).where(eq(users.id, userId));
}, 30_000);

describe("crew links against real PostgreSQL", () => {
  it("loads eligible supervisors for the actual form without malformed array SQL", async () => {
    const r = await request(app()).get("/api/crews/eligible-supervisors");
    expect(r.status).toBe(200);
    expect(r.body.some((u: { id: string }) => u.id === userId)).toBe(true);
    expect((await request(app("field")).get("/api/crews/eligible-supervisors")).status).toBe(403);
  });
  it("guarded linker copies only null values and reruns without changes", async () => {
    await linkCrewsByName(companyId);
    expect((await plannerRow()).crewId).toBe(standingId);
    const rows = await db.select().from(crews).where(eq(crews.companyId, companyId));
    expect(rows.find(c => c.id === standingId)).toMatchObject({ color: "#16a34a", defaultHoursPerDay: 6 });
    expect(rows.find(c => c.id === secondId)).toMatchObject({ color: "#ffffff", defaultHoursPerDay: 0 });
    await linkCrewsByName(companyId);
    expect(await db.select().from(crews).where(eq(crews.companyId, companyId))).toEqual(rows);
  });
  it("rejects cross-company planner links with 400 and rolls back other edits", async () => {
    const response = await request(app()).patch(`/api/crews/${standingId}`).send({ name: "Must roll back", plannerCrewId: foreignPlannerId });
    expect(response.status).toBe(400);
    const [row] = await db.select().from(crews).where(eq(crews.id, standingId));
    expect(row.name).toBe("North");
    expect((await plannerRow()).crewId).toBe(standingId);
  });
  it("rejects another crew claiming an owned planner with 409", async () => {
    const r = await request(app()).patch(`/api/crews/${secondId}`).send({ plannerCrewId: plannerId });
    expect(r.status).toBe(409);
    expect((await plannerRow(secondPlannerId)).crewId).toBe(secondId);
  });
  it("preserves omitted PATCH fields and explicitly clears a link with null", async () => {
    expect((await request(app()).patch(`/api/crews/${standingId}`).send({ displayOrder: 4 })).status).toBe(200);
    expect((await plannerRow()).crewId).toBe(standingId);
    expect((await request(app()).patch(`/api/crews/${standingId}`).send({ plannerCrewId: null })).status).toBe(200);
    expect((await plannerRow()).crewId).toBeNull();
  });
  it("atomically replaces a standing crew's previous planner", async () => {
    await request(app()).patch(`/api/crews/${secondId}`).send({ plannerCrewId: null });
    const r = await request(app()).patch(`/api/crews/${standingId}`).send({ plannerCrewId: secondPlannerId });
    expect(r.status).toBe(200);
    expect((await plannerRow()).crewId).toBeNull();
    expect((await plannerRow(secondPlannerId)).crewId).toBe(standingId);
  });
  it("concurrent claims return one success, one conflict, with no partial standing edit", async () => {
    const responses = await Promise.all([
      request(app()).patch(`/api/crews/${standingId}`).send({ plannerCrewId: plannerId, defaultHoursPerDay: 11 }),
      request(app()).patch(`/api/crews/${secondId}`).send({ plannerCrewId: plannerId, defaultHoursPerDay: 12 }),
    ]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const winnerId = responses[0].status === 200 ? standingId : secondId;
    expect((await plannerRow()).crewId).toBe(winnerId);
    if (winnerId === secondId) expect((await plannerRow(secondPlannerId)).crewId).toBe(standingId);
    else expect((await plannerRow(secondPlannerId)).crewId).toBeNull();
    const loserId = winnerId === standingId ? secondId : standingId;
    const [loser] = await db.select().from(crews).where(eq(crews.id, loserId));
    expect(loser.defaultHoursPerDay).toBe(loserId === standingId ? 6 : 0);
  });
  it("maintenance PATCH freezes copied fields and preserves omitted defaults", async () => {
    const before = await plannerRow();
    const r = await request(app()).patch(`/api/maintenance-crews/${plannerId}`).send({
      name: "Updated planner", companyId: otherCompanyId, id: "hijack", createdAt: "2000-01-01", surprise: true,
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("CREW_FIELDS_MOVED");
    expect(await plannerRow()).toMatchObject({ companyId, id: plannerId, name: before.name, color: before.color, defaultHoursPerDay: before.defaultHoursPerDay, isActive: before.isActive, crewId: before.crewId });
    expect((await request(app()).patch(`/api/maintenance-crews/${plannerId}`).send({ surprise: true })).status).toBe(200);
  });
  it("maintenance PATCH rejects foreign standing crews, enforces ownership and clears null", async () => {
    expect((await request(app()).patch(`/api/maintenance-crews/${plannerId}`).send({ crewId: foreignId })).status).toBe(400);
    const owner = (await plannerRow()).crewId!;
    expect((await request(app()).patch(`/api/maintenance-crews/${secondPlannerId}`).send({ crewId: owner })).status).toBe(409);
    expect((await request(app()).patch(`/api/maintenance-crews/${plannerId}`).send({ crewId: null })).status).toBe(200);
    expect((await plannerRow()).crewId).toBeNull();
  });
  it("standing POST links a planner atomically and rolls back invalid creates", async () => {
    const body = { name: "Created crew", supervisorUserId: userId, plannerCrewId: plannerId, color: "#123456", defaultHoursPerDay: 5 };
    const response = await request(app()).post("/api/crews").send(body);
    expect(response.status).toBe(201);
    expect((await plannerRow()).crewId).toBe(response.body.id);
    const conflict = await request(app()).post("/api/crews").send({ ...body, name: "Should not exist" });
    expect(conflict.status).toBe(409);
    expect((await request(app()).get("/api/crews")).body.some((c: { name: string }) => c.name === "Should not exist")).toBe(false);
  });
  it("campaign POST/PATCH project standing identity and reject copied edits and duplicate teams", async () => {
    const path = `/api/campaigns/${campaignId}/crews`;
    const body = { crewId: standingId };
    expect((await request(app()).post(path).send({ name: "Team", leaderUserId: userId })).status).toBe(400);
    expect((await request(app()).post(path).send({ ...body, crewId: foreignId })).status).toBe(400);
    const created = await request(app()).post(path).send(body);
    expect(created.status).toBe(200);
    expect(created.body.crewId).toBe(standingId);
    const edit = `${path}/${created.body.id}`;
    expect((await request(app()).patch(edit).send({ name: "Renamed" })).status).toBe(409);
    expect((await request(app()).post(path).send(body)).status).toBe(409);
    expect((await request(app()).patch(edit).send({ crewId: foreignId })).status).toBe(400);
    expect((await request(app()).patch(edit).send({ crewId: null })).body.crewId).toBeNull();
    expect((await request(app()).patch(edit).send({ crewId: secondId })).body.crewId).toBe(secondId);
    await db.update(crews).set({ name: "South renamed", color: "#aabbcc" }).where(eq(crews.id, secondId));
    expect((await storage.getCampaignCrews(campaignId, companyId)).find(t => t.id === created.body.id)).toMatchObject({ name: "South renamed", color: "#aabbcc", leaderUserId: userId });
    await db.update(crews).set({ name: "South", color: "#ffffff" }).where(eq(crews.id, secondId));
  });
  it("planner projection is linked to standing fields and unlinked fallback remains frozen", async () => {
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.companyId, companyId));
    await db.update(maintenanceCrews).set({ crewId: standingId }).where(eq(maintenanceCrews.id, plannerId));
    await db.update(crews).set({ name: "Owner renamed", color: "#334455", defaultHoursPerDay: 3, isActive: false }).where(eq(crews.id, standingId));
    const select = vi.spyOn(db, "select");
    const list = await storage.getMaintenanceCrews(companyId);
    expect(select).toHaveBeenCalledTimes(1);
    select.mockRestore();
    expect(list.find(c => c.id === plannerId)).toMatchObject({ name: "Owner renamed", color: "#334455", defaultHoursPerDay: 3, isActive: false, linked: true });
    expect(await storage.getMaintenanceCrewById(plannerId, companyId)).toMatchObject({ name: "Owner renamed", linked: true });
    expect(list.find(c => c.id === secondPlannerId)).toMatchObject({ name: "South", linked: false });
    expect((await plannerRow()).name).toBe(" NORTH ");
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.id, plannerId));
    await db.update(crews).set({ name: "North", color: null, defaultHoursPerDay: null, isActive: true }).where(eq(crews.id, standingId));
  });
  it("requires an available company crew when creating planner columns", async () => {
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.companyId, companyId));
    expect((await request(app()).post("/api/maintenance-crews").send({ name: "Old" })).status).toBe(400);
    expect((await request(app()).post("/api/maintenance-crews").send({ crewId: foreignId })).status).toBe(400);
    const created = await request(app()).post("/api/maintenance-crews").send({ crewId: standingId });
    expect(created.status).toBe(200);
    expect((await request(app()).post("/api/maintenance-crews").send({ crewId: standingId })).status).toBe(409);
    await db.delete(maintenanceCrews).where(eq(maintenanceCrews.id, created.body.id));
  });
  it("refuses to cascade any scheduled placements and permits removing empty columns", async () => {
    const [customer] = await db.insert(customers).values({ companyId, name: "Safety property", street: "test", city: "test", state: "CO", zip: "00000" }).returning();
    const [config] = await db.insert(maintenanceVisitConfigs).values({ companyId, customerId: customer.id, estimatedDurationMinutes: 60 }).returning();
    const [template] = await db.insert(weeklyScheduleTemplates).values({ companyId, name: "Safety template" }).returning();
    const [block] = await db.insert(scheduleBlocks).values({ templateId: template.id, visitConfigId: config.id, crewId: plannerId, dayOfWeek: "monday" }).returning();
    const response = await request(app()).delete(`/api/maintenance-crews/${plannerId}`);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "CREW_HAS_PLACEMENTS", count: 1 });
    expect((await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, block.id))).length).toBe(1);
    const [empty] = await db.insert(maintenanceCrews).values({ companyId, name: "Disposable empty" }).returning();
    expect((await request(app()).delete(`/api/maintenance-crews/${empty.id}`)).status).toBe(200);
    await db.delete(weeklyScheduleTemplates).where(eq(weeklyScheduleTemplates.id, template.id));
    await db.delete(maintenanceVisitConfigs).where(eq(maintenanceVisitConfigs.id, config.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
  });
  it("create-from both sources is scoped, atomic and records manual initialization", async () => {
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.companyId, companyId));
    const body = { name: `Created from planner ${suffix}`, supervisorUserId: userId, color: "#123456", defaultHoursPerDay: 6 };
    const foreign = await request(app()).post(`/api/crews/from-planner/${foreignPlannerId}`).send(body);
    expect(foreign.status).toBe(400);
    const created = await request(app()).post(`/api/crews/from-planner/${plannerId}`).send(body);
    expect(created.status).toBe(201);
    expect((await plannerRow()).crewId).toBe(created.body.id);
    expect((await request(app()).post(`/api/crews/from-planner/${plannerId}`).send({ ...body, name: `Should roll back ${suffix}` })).status).toBe(409);
    expect((await db.select().from(crews).where(eq(crews.name, `Should roll back ${suffix}`))).length).toBe(0);
    const [team] = await db.insert(campaignCrews).values({ companyId, campaignId, name: `Unlinked ${suffix}`, leaderUserId: userId }).returning();
    const campaign = await request(app()).post(`/api/crews/from-campaign-team/${team.id}`).send({ ...body, name: `Created from team ${suffix}` });
    expect(campaign.status).toBe(201);
    expect((await storage.getCampaignCrewById(team.id, companyId))?.crewId).toBe(campaign.body.id);
    expect((await request(app()).post(`/api/crews/from-campaign-team/${team.id}`).send({ ...body, name: `Should also roll back ${suffix}` })).status).toBe(409);
    expect((await db.select().from(crews).where(eq(crews.name, `Should also roll back ${suffix}`))).length).toBe(0);
    await db.delete(campaignCrews).where(eq(campaignCrews.id, team.id));
    await db.delete(crews).where(eq(crews.id, campaign.body.id));
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.id, plannerId));
    await db.delete(crews).where(eq(crews.id, created.body.id));
  });
  it("captures worksheet crew and supervisor once; Custom stays editable", async () => {
    const [customer] = await db.insert(customers).values({ companyId, name: "Worksheet property", street: "test", city: "test", state: "CO", zip: "00000" }).returning();
    const [ws] = await db.insert(crewWorksheets).values({ companyId, customerId: customer.id, worksheetNumber: `TEST-${suffix}`, worksheetDate: "2026-10-27" }).returning();
    const picked = await storage.updateCrewWorksheet(ws.id, companyId, { crewId: standingId });
    expect(picked).toMatchObject({ crewId: standingId, crewLabel: "North", assignedCrewLeadId: userId });
    await db.update(crews).set({ name: "Now renamed" }).where(eq(crews.id, standingId));
    expect((await db.select().from(crewWorksheets).where(eq(crewWorksheets.id, ws.id)))[0].crewLabel).toBe("North");
    await storage.updateCrewWorksheet(ws.id, companyId, { crewId: null, crewLabel: "One-off team" });
    expect((await db.select().from(crewWorksheets).where(eq(crewWorksheets.id, ws.id)))[0]).toMatchObject({ crewId: null, crewLabel: "One-off team", assignedCrewLeadId: null });
    await db.update(crewWorksheets).set({ status: "finalized" }).where(eq(crewWorksheets.id, ws.id));
    await expect(storage.updateCrewWorksheet(ws.id, companyId, { crewId: standingId })).rejects.toMatchObject({ status: 409 });
    expect((await db.select().from(crewWorksheets).where(eq(crewWorksheets.id, ws.id)))[0].crewLabel).toBe("One-off team");
    await db.update(crews).set({ name: "North" }).where(eq(crews.id, standingId));
    await db.delete(crewWorksheets).where(eq(crewWorksheets.id, ws.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
  });
  it("reads bulk planner metadata and active campaign counts", async () => {
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.companyId, companyId));
    await db.update(maintenanceCrews).set({ crewId: standingId }).where(eq(maintenanceCrews.id, plannerId));
    await db.insert(campaignCrews).values({ companyId, campaignId, name: "Another team", leaderUserId: userId, crewId: null });
    const r = await request(app()).get("/api/crews");
    expect(r.status).toBe(200);
    expect(r.body.find((c: { id: string }) => c.id === secondId).campaignTeamCount).toBe(1);
    const linked = r.body.find((c: { plannerCrew: unknown }) => c.plannerCrew);
    expect(linked.plannerCrew).toHaveProperty("name");
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.id, plannerId));
    await db.update(campaigns).set({ status: "completed" }).where(eq(campaigns.id, campaignId));
    expect((await request(app()).get("/api/crews")).body.find((c: { id: string }) => c.id === secondId).campaignTeamCount).toBe(0);
  });
  it("board permits admin, office and field_manager, denies field and anonymous", async () => {
    for (const role of ["admin", "office", "field_manager"]) expect((await request(app(role)).get("/api/crews/board")).status).toBe(200);
    expect((await request(app("field")).get("/api/crews/board")).status).toBe(403);
    expect((await request(app("admin", false)).get("/api/crews/board")).status).toBe(401);
    expect((await request(app("field_manager")).get("/api/crews")).status).toBe(403);
  });
  it("board orders active crews, scopes company and falls back to palette/8 but not over zero", async () => {
    await db.update(crews).set({ color: null, defaultHoursPerDay: null, displayOrder: -1 }).where(eq(crews.id, standingId));
    await db.update(crews).set({ defaultHoursPerDay: 0, displayOrder: 0 }).where(eq(crews.id, secondId));
    const r = await request(app("field_manager")).get("/api/crews/board");
    expect(r.body[0]).toMatchObject({ id: standingId, color: CREW_COLORS[0], defaultHoursPerDay: 8 });
    expect(r.body[1]).toMatchObject({ id: secondId, defaultHoursPerDay: 0 });
    expect(r.body.some((c: { id: string }) => c.id === foreignId)).toBe(false);
    await db.update(crews).set({ isActive: false }).where(eq(crews.id, secondId));
    expect((await request(app()).get("/api/crews/board")).body.some((c: { id: string }) => c.id === secondId)).toBe(false);
  });
  it("up/down order persists as one transaction and rejects stale or foreign lists", async () => {
    const list = (await request(app()).get("/api/crews")).body as Array<{ id: string }>;
    const ids = list.map(c => c.id).reverse();
    expect((await request(app()).post("/api/crews/order").send({ ids })).status).toBe(204);
    expect((await request(app()).get("/api/crews")).body.map((c: { id: string }) => c.id)).toEqual(ids);
    expect((await request(app()).post("/api/crews/order").send({ ids: [foreignId, ...ids.slice(1)] })).status).toBe(409);
    expect((await request(app()).get("/api/crews")).body.map((c: { id: string }) => c.id)).toEqual(ids);
  });
  it("explicitly cleared auto-linked planner and team stay unlinked after startup reruns", async () => {
    const [campaign] = await db.insert(campaigns).values({
      companyId: otherCompanyId, title: "Restart test", category: "extra_billable", status: "active",
      windowStart: "2026-10-01", windowEnd: "2026-10-31", createdById: userId,
    }).returning();
    const [team] = await db.insert(campaignCrews).values({
      companyId: otherCompanyId, campaignId: campaign.id, name: "Restart team", leaderUserId: userId,
    }).returning();
    await linkCrewsByName(otherCompanyId);
    expect((await plannerRow(foreignPlannerId)).crewId).toBe(foreignId);
    expect((await storage.getCampaignCrewById(team.id, otherCompanyId))?.crewId).toBe(foreignId);
    const [initialized] = await db.select().from(companies).where(eq(companies.id, otherCompanyId));
    expect(initialized.crewLinksInitializedAt).not.toBeNull();
    expect((await request(app("admin", true, otherCompanyId)).patch(`/api/crews/${foreignId}`).send({ plannerCrewId: null })).status).toBe(200);
    expect((await request(app("admin", true, otherCompanyId)).patch(`/api/campaigns/${campaign.id}/crews/${team.id}`).send({ crewId: null })).status).toBe(200);
    await linkCrewsByName(otherCompanyId);
    await linkCrewsByName(otherCompanyId);
    expect((await plannerRow(foreignPlannerId)).crewId).toBeNull();
    expect((await storage.getCampaignCrewById(team.id, otherCompanyId))?.crewId).toBeNull();
    expect((await db.select().from(companies).where(eq(companies.id, otherCompanyId)))[0].crewLinksInitializedAt).toEqual(initialized.crewLinksInitializedAt);
  });
  it("a manual None before first automatic matching also survives startup", async () => {
    // Reset only our disposable company's marker to simulate a newly created company.
    await db.update(companies).set({ crewLinksInitializedAt: null }).where(eq(companies.id, otherCompanyId));
    const r = await request(app("admin", true, otherCompanyId)).patch(`/api/maintenance-crews/${foreignPlannerId}`).send({ crewId: null });
    expect(r.status).toBe(200);
    await linkCrewsByName(otherCompanyId);
    expect((await plannerRow(foreignPlannerId)).crewId).toBeNull();
    expect((await db.select().from(companies).where(eq(companies.id, otherCompanyId)))[0].crewLinksInitializedAt).not.toBeNull();
  });
  it("refuses standing crew deletion for planner and active-team links, preserving every placement", async () => {
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.companyId, companyId));
    await db.update(maintenanceCrews).set({ crewId: standingId }).where(eq(maintenanceCrews.id, plannerId));
    const [teamToClear] = await db.select().from(campaignCrews).where(eq(campaignCrews.companyId, companyId));
    await db.update(campaigns).set({ status: "active", title: "Fall Aeration" }).where(eq(campaigns.id, teamToClear.campaignId));
    await db.update(campaignCrews).set({ crewId: null }).where(eq(campaignCrews.id, teamToClear.id));
    const emptyLinked = await request(app()).delete(`/api/crews/${standingId}`);
    expect(emptyLinked.status).toBe(409);
    expect(emptyLinked.body).toMatchObject({ code: "CREW_IN_USE", plannerColumns: [{ id: plannerId, placementCount: 0 }], campaignTeams: [] });
    await db.update(campaignCrews).set({ crewId: standingId }).where(eq(campaignCrews.id, teamToClear.id));
    const [customer] = await db.insert(customers).values({ companyId, name: "Test property", street: "test", city: "test", state: "CO", zip: "00000" }).returning();
    const [config] = await db.insert(maintenanceVisitConfigs).values({ companyId, customerId: customer.id, estimatedDurationMinutes: 60 }).returning();
    const [template] = await db.insert(weeklyScheduleTemplates).values({ companyId, name: "Test template" }).returning();
    const [block] = await db.insert(scheduleBlocks).values(Array.from({ length: 61 }, () => ({ templateId: template.id, visitConfigId: config.id, crewId: plannerId, dayOfWeek: "monday" as const }))).returning();
    const response = await request(app()).delete(`/api/crews/${standingId}`);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "CREW_IN_USE", message: "Linked to planner column with 61 placements; Fall Aeration team", plannerColumns: [{ id: plannerId, placementCount: 61 }], campaignTeams: [{ id: teamToClear.id, campaignTitle: "Fall Aeration" }] });
    expect((await plannerRow()).crewId).toBe(standingId);
    expect((await db.select().from(campaignCrews).where(eq(campaignCrews.id, teamToClear.id)))[0].crewId).toBe(standingId);
    expect((await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, block.id)))[0].crewId).toBe(plannerId);
    expect((await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.crewId, plannerId))).length).toBe(61);
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.id, plannerId));
    const setup = await request(app()).get("/api/crews/setup");
    expect(setup.body.planners.find((p: { id: string }) => p.id === plannerId)).toMatchObject({ placementCount: 61 });
    await db.update(maintenanceCrews).set({ crewId: standingId }).where(eq(maintenanceCrews.id, plannerId));
    expect((await request(app()).patch(`/api/crews/${standingId}`).send({ isActive: false })).status).toBe(200);
    expect((await db.select().from(crews).where(eq(crews.id, standingId)))[0].isActive).toBe(false);
    expect((await request(app()).delete(`/api/crews/${standingId}`)).status).toBe(409);
    const fk = await db.execute(sql`SELECT confdeltype FROM pg_constraint WHERE conrelid='schedule_blocks'::regclass AND confrelid='maintenance_crews'::regclass`);
    expect(fk.rows[0]?.confdeltype).toBe("c");
  });
  it("deletes an unlinked standing crew as before and scopes DELETE to the company", async () => {
    const [unused] = await db.insert(crews).values({ companyId, name: `Unused ${suffix}`, supervisorUserId: userId }).returning();
    expect((await request(app("admin", true, otherCompanyId)).delete(`/api/crews/${unused.id}`)).status).toBe(404);
    expect((await request(app()).delete(`/api/crews/${unused.id}`)).status).toBe(204);
    expect((await db.select().from(crews).where(eq(crews.id, unused.id))).length).toBe(0);
    expect((await request(app()).delete(`/api/crews/${unused.id}`)).status).toBe(404);
  });
  it("blocks an active campaign team alone, but permits deletion for a completed team", async () => {
    const [owner] = await db.insert(crews).values({ companyId, name: `Campaign only ${suffix}`, supervisorUserId: userId }).returning();
    const [team] = await db.insert(campaignCrews).values({ companyId, campaignId, crewId: owner.id, name: "Frozen team", leaderUserId: userId }).returning();
    await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaignId));
    const response = await request(app()).delete(`/api/crews/${owner.id}`);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("CREW_IN_USE");
    expect(response.body.plannerColumns).toEqual([]);
    expect(response.body.campaignTeams).toHaveLength(1);
    await db.update(campaigns).set({ status: "completed" }).where(eq(campaigns.id, campaignId));
    expect((await request(app()).delete(`/api/crews/${owner.id}`)).status).toBe(204);
    expect((await db.select().from(campaignCrews).where(eq(campaignCrews.id, team.id)))[0]).toMatchObject({ crewId: null, name: "Frozen team" });
  });
});
