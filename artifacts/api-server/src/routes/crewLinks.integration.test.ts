import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  companies, users, companyUsers, crews, maintenanceCrews, campaignCrews, campaigns,
  customers, weeklyScheduleTemplates, maintenanceVisitConfigs, scheduleBlocks,
  insertMaintenanceCrewSchema, insertCampaignCrewSchema, CREW_COLORS,
} from "@workspace/db";
import { db } from "../db";
import { storage } from "../storage";
import { registerCrewsAndMobileRoutes } from "./crewsAndMobile";
import { linkCrewsByName } from "../lib/linkCrews";
import { CrewLinkError, lockCrewCompany, validatePlannerOwner, recordCrewLinkChoice } from "../lib/crewLinks";
import { pickProvided } from "../lib/patchBody";

// Exercise the actual main-module handlers without unrelated bootstrap DML.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
function mountRange(app: express.Express, start: string, end: string) {
  const i = source.indexOf(start), j = source.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error("Crew handler registration block moved");
  new Function("deps", `const {app,storage,db,and,eq,insertMaintenanceCrewSchema,insertCampaignCrewSchema,pickProvided,CrewLinkError,lockCrewCompany,validatePlannerOwner,recordCrewLinkChoice,maintenanceCrews}=deps;
    ${transformSync(source.slice(i, j), { loader: "ts", target: "es2022" }).code}`)({
    app, storage, db, and, eq, insertMaintenanceCrewSchema, insertCampaignCrewSchema,
    pickProvided, CrewLinkError, lockCrewCompany, validatePlannerOwner, recordCrewLinkChoice, maintenanceCrews,
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
  it("maintenance PATCH ignores unknown/immutable fields and preserves omitted defaults", async () => {
    const before = await plannerRow();
    const r = await request(app()).patch(`/api/maintenance-crews/${plannerId}`).send({
      name: "Updated planner", companyId: otherCompanyId, id: "hijack", createdAt: "2000-01-01", surprise: true,
    });
    expect(r.status).toBe(200);
    expect(await plannerRow()).toMatchObject({ companyId, id: plannerId, color: before.color, defaultHoursPerDay: before.defaultHoursPerDay, isActive: before.isActive, crewId: before.crewId });
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
  it("campaign POST/PATCH persist nullable standing selection and preserve omitted auto-link", async () => {
    const path = `/api/campaigns/${campaignId}/crews`;
    const body = { name: "Team", leaderUserId: userId, crewId: standingId };
    expect((await request(app()).post(path).send({ ...body, crewId: foreignId })).status).toBe(400);
    const created = await request(app()).post(path).send(body);
    expect(created.status).toBe(200);
    expect(created.body.crewId).toBe(standingId);
    const edit = `${path}/${created.body.id}`;
    expect((await request(app()).patch(edit).send({ name: "Renamed" })).body.crewId).toBe(standingId);
    expect((await request(app()).patch(edit).send({ crewId: foreignId })).status).toBe(400);
    expect((await request(app()).patch(edit).send({ crewId: null })).body.crewId).toBeNull();
    expect((await request(app()).patch(edit).send({ crewId: secondId })).body.crewId).toBe(secondId);
  });
  it("reads bulk planner metadata and active campaign counts", async () => {
    await db.insert(campaignCrews).values({ companyId, campaignId, name: "Another team", leaderUserId: userId, crewId: secondId });
    const r = await request(app()).get("/api/crews");
    expect(r.status).toBe(200);
    expect(r.body.find((c: { id: string }) => c.id === secondId).campaignTeamCount).toBe(2);
    const linked = r.body.find((c: { plannerCrew: unknown }) => c.plannerCrew);
    expect(linked.plannerCrew).toHaveProperty("name");
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
  it("deletion SET NULL clears both links without deleting planner schedule blocks", async () => {
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.companyId, companyId));
    await db.update(maintenanceCrews).set({ crewId: standingId }).where(eq(maintenanceCrews.id, plannerId));
    await db.update(campaignCrews).set({ crewId: standingId }).where(eq(campaignCrews.companyId, companyId));
    const [customer] = await db.insert(customers).values({ companyId, name: "Test property", street: "test", city: "test", state: "CO", zip: "00000" }).returning();
    const [config] = await db.insert(maintenanceVisitConfigs).values({ companyId, customerId: customer.id, estimatedDurationMinutes: 60 }).returning();
    const [template] = await db.insert(weeklyScheduleTemplates).values({ companyId, name: "Test template" }).returning();
    const [block] = await db.insert(scheduleBlocks).values({ templateId: template.id, visitConfigId: config.id, crewId: plannerId, dayOfWeek: "monday" }).returning();
    expect((await request(app()).delete(`/api/crews/${standingId}`)).status).toBe(204);
    expect((await plannerRow()).crewId).toBeNull();
    expect((await db.select().from(campaignCrews).where(eq(campaignCrews.companyId, companyId))).every(t => t.crewId === null)).toBe(true);
    expect((await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, block.id)))[0].crewId).toBe(plannerId);
    const fk = await db.execute(sql`SELECT confdeltype FROM pg_constraint WHERE conrelid='schedule_blocks'::regclass AND confrelid='maintenance_crews'::regclass`);
    expect(fk.rows[0]?.confdeltype).toBe("c");
  });
});
