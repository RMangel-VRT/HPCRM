import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { companies, routeStops, routeImportDecisions, visits, scheduleBlocks, termScopeLines } from "@workspace/db";
import { db } from "../db";
import { createRouteFixture, removeRouteFixture } from "./routeTestFixture";
import { registerRouteStopRoutes } from "../routes/routeStops";
import { registerVisitRoutes } from "../routes/visits";
import { registerPlannerFreeze } from "./plannerFreeze";
import { PLANNER_REPLACED_MESSAGE } from "./routeReporting";
import { fillRouteVisits } from "./routeFill";
import { importPlannerRoutes } from "./importPlannerRoutes";
import { routeImportApprovals } from "./routeImportApproval";
import { storage } from "../storage";
import { lockVisitCompany } from "./visitSync";
import * as visitMutations from "../routes/visits";

const enabled = process.env.ROUTES_DB_TESTS === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("R2 real database and authorization", () => {
  let f: Awaited<ReturnType<typeof createRouteFixture>>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-09T18:00:00Z"));
    f = await createRouteFixture();
  }, 30_000);
  afterEach(async () => {
    vi.restoreAllMocks(); vi.useRealTimers();
    if (f) { delete routeImportApprovals[f.companyId]; await removeRouteFixture(f.companyId, f.userId); }
  }, 30_000);
  function app(role = "admin", companyId: string = f.companyId, authenticated = true) {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => authenticated, user: { id: f.userId, activeCompanyId: companyId, activeRole: role } }); next();
    });
    registerRouteStopRoutes(a); registerVisitRoutes(a); registerPlannerFreeze(a);
    a.use((_req, res) => { res.json({ legacy: true }); });
    return a;
  }
  async function stop(overrides = {}) {
    const [s] = await db.insert(routeStops).values({ companyId: f.companyId, customerId: f.properties[1].id,
      serviceKey: "mowing", crewId: f.standing[0].id, weekday: 2, everyWeeks: 1,
      anchorDate: "2027-03-02", minutes: 30, ...overrides }).returning();
    return s;
  }
  async function rows() { return db.select().from(visits).where(eq(visits.companyId, f.companyId)); }
  it("protects every Routes action and initiating company; customer summaries keep customer-read permissions", async () => {
    const urls = ["/api/routes/status", "/api/routes/stops", "/api/routes/needs", "/api/routes/decisions", "/api/routes/progress?customerId=x"];
    for (const role of ["field", "irrigation_manager", "crew_supervisor", "chemical_manager"]) for (const url of urls)
      expect((await request(app(role)).get(url)).status).toBe(403);
    for (const role of ["admin", "office", "field_manager"]) {
      expect((await request(app(role)).get("/api/routes/status")).status).toBe(200);
      expect((await request(app(role)).post("/api/routes/fill").send({})).status).toBe(200);
    }
    expect((await request(app("admin", f.companyId, false)).get("/api/routes/status")).status).toBe(401);
    expect((await request(app()).post("/api/routes/fill").set("X-Company-Id", "foreign").send({})).status).toBe(409);
    expect((await request(app("field")).get(`/api/customers/${f.properties[1].id}/route-summary`)).body).toEqual({ imported: false, stops: [] });
    expect((await request(app("field", "foreign")).get(`/api/customers/${f.properties[1].id}/route-summary`)).status).toBe(404);
  });
  it("reports governing contract facts, actual month spread, upcoming season and latest existing visit", async () => {
    const s = await stop(); await fillRouteVisits(f.companyId);
    const response = await request(app()).get("/api/routes/stops?service=mowing");
    expect(response.body[0]).toMatchObject({ id: s.id, reportYear: 2027,
      contract: { agreementId: f.agreement.id, termId: f.term.id, quantity: 26, monthSpread: Array(12).fill(1) } });
    expect((await request(app()).get("/api/routes/status?service=mowing")).body).toMatchObject({
      imported: false, plannerReadOnly: false, latestVisitDate: "2027-03-30", season: { year: 2027, start: "2027-01-01", end: "2027-12-31" },
    });
    const need = (await request(app()).get("/api/routes/needs?service=mowing")).body.find((n: { customerId: string }) => n.customerId === f.properties[2].id);
    expect(need).toMatchObject({ minutes: null, contract: { quantity: 26, monthSpread: Array(12).fill(1) } });
    expect((await request(app()).get(`/api/routes/progress?customerId=${f.properties[1].id}&service=mowing&season=2027`)).body).toMatchObject({ quantity: 26, planned: 4, done: 0 });
  });
  it("replaces the imported dashboard preview without granting Routes management access", async () => {
    const s = await stop({ weekday: 4, everyWeeks: 2 });
    expect((await request(app("irrigation_manager")).get("/api/planner/route-preview")).body).toEqual({ imported: false, stops: [] });
    await db.update(companies).set({ routesImportedAt: new Date() }).where(eq(companies.id, f.companyId));
    const preview = await request(app("irrigation_manager")).get("/api/planner/route-preview").set("X-Company-Id", f.companyId);
    expect(preview.status).toBe(200);
    expect(preview.body.stops).toHaveLength(1);
    expect(preview.body.stops[0]).toMatchObject({ id: s.id, customerId: f.properties[1].id, serviceKey: "mowing", weekday: 4, everyWeeks: 2, crew: { id: f.standing[0].id } });
    expect((await request(app("irrigation_manager")).get("/api/routes/stops")).status).toBe(403);
    expect((await request(app("field", "foreign")).get("/api/planner/route-preview")).body.stops).toEqual([]);
    for (const path of ["/api/planner/route-preview", "/api/planner/readiness", "/api/routes/stops"]) {
      expect((await request(app()).get(path).set("X-Company-Id", "foreign")).status).toBe(409);
      expect((await request(app("field", f.companyId, false)).get(path)).status).toBe(401);
    }
  });
  it("ordinary weekday edits preserve visits and align fortnightly cadence to the new weekday", async () => {
    const s = await stop({ everyWeeks: 2 }); await fillRouteVisits(f.companyId);
    const before = await rows();
    const patched = await request(app()).patch(`/api/routes/stops/${s.id}`).send({ weekday: 4 });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ everyWeeks: 2, weekday: 4, anchorDate: "2027-03-04", minutes: 30 });
    expect(await rows()).toEqual(before);
    // The old Tuesday occurrences already own these weeks. Changing weekday
    // cannot generate a second occurrence or rewrite the saved visits.
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
    expect((await fillRouteVisits(f.companyId, { through: "2027-04-16" })).created).toBe(1);
    expect((await rows()).filter(v => v.routeOccurrenceDate === "2027-04-15")).toHaveLength(1);
  });
  it("explicit reconciliation touches only this stop's future planned route visits and preserves identities", async () => {
    const s = await stop(); await fillRouteVisits(f.companyId);
    const before = await rows();
    await db.update(visits).set({ status: "done" }).where(eq(visits.id, before[1].id));
    await db.update(visits).set({ status: "in_progress" }).where(eq(visits.id, before[2].id));
    await db.update(visits).set({ status: "skipped" }).where(eq(visits.id, before[3].id));
    await db.insert(visits).values({ companyId: f.companyId, crewId: f.standing[0].id, sourceType: "internal", title: "Ticket-like one off", visitDate: "2027-03-09", status: "planned" });
    const patch = await request(app()).patch(`/api/routes/stops/${s.id}`).send({ weekday: 4, crewId: f.standing[1].id, minutes: 45 });
    const response = await request(app()).post(`/api/routes/stops/${s.id}/apply-calendar`).send({ expectedUpdatedAt: patch.body.updatedAt });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ moved: 1, cancelled: 0, unchanged: 0 });
    const after = await rows();
    expect(after.find(v => v.id === before[0].id)).toMatchObject({ visitDate: "2027-03-11", routeOccurrenceDate: "2027-03-09", crewId: f.standing[1].id, estimatedHours: .75 });
    for (const old of before.slice(1)) expect(after.find(v => v.id === old.id)?.visitDate).toBe(old.visitDate);
    expect(after.find(v => v.sourceType === "internal")?.visitDate).toBe("2027-03-09");
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
    const unchanged = await rows();
    expect((await request(app()).post(`/api/routes/stops/${s.id}/apply-calendar`).send({ expectedUpdatedAt: s.updatedAt.toISOString() })).status).toBe(409);
    expect(await rows()).toEqual(unchanged);
  });
  it("cancels only planned future occurrences outside cadence, pause or positive contract months", async () => {
    const s = await stop(); await fillRouteVisits(f.companyId);
    await db.update(termScopeLines).set({ monthSpread: [1,1,0,1,1,1,1,1,1,1,1,1] }).where(eq(termScopeLines.termId, f.term.id));
    const before = await rows();
    const response = await request(app()).post(`/api/routes/stops/${s.id}/apply-calendar`).send({ expectedUpdatedAt: s.updatedAt.toISOString() });
    expect(response.body.cancelled).toBe(4);
    expect((await rows()).every(v => v.status === "cancelled")).toBe(true);
    expect((await rows()).map(v => v.routeOccurrenceDate).sort()).toEqual(before.map(v => v.routeOccurrenceDate).sort());
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
  });
  it("rejects foreign calendar targets and leaves past, cancelled and unrelated work unchanged", async () => {
    const s = await stop();
    await db.insert(visits).values([
      { companyId: f.companyId, routeStopId: s.id, routeOccurrenceDate: "2027-03-02", sourceType: "route", customerId: s.customerId, serviceKey: "mowing", crewId: s.crewId, visitDate: "2027-03-08", status: "planned" },
      { companyId: f.companyId, routeStopId: s.id, routeOccurrenceDate: "2027-03-09", sourceType: "route", customerId: s.customerId, serviceKey: "mowing", crewId: s.crewId, visitDate: "2027-03-09", status: "cancelled" },
    ]);
    const before = await rows();
    expect((await request(app("admin", "foreign")).post(`/api/routes/stops/${s.id}/apply-calendar`).send({ expectedUpdatedAt: s.updatedAt.toISOString() })).status).toBe(404);
    expect((await request(app()).post(`/api/routes/stops/${s.id}/apply-calendar`).send({ expectedUpdatedAt: s.updatedAt.toISOString() })).body).toEqual({ moved: 0, cancelled: 0, unchanged: 0 });
    expect(await rows()).toEqual(before);
  });
  it("revalidates status after a competing scheduling write and rolls back partial calendar failure", async () => {
    const s = await stop(); await fillRouteVisits(f.companyId);
    const original = await rows();
    let apply!: Promise<request.Response>;
    await db.transaction(async tx => {
      await lockVisitCompany(tx, f.companyId);
      // The request must wait for this transaction, then see in_progress,
      // not apply a browser's old planned-state assumption.
      apply = request(app()).post(`/api/routes/stops/${s.id}/apply-calendar`).send({ expectedUpdatedAt: s.updatedAt.toISOString() }).then(r => r);
      await tx.update(visits).set({ status: "in_progress" }).where(eq(visits.id, original[0].id));
    });
    expect((await apply).status).toBe(200);
    expect((await rows()).find(v => v.id === original[0].id)?.status).toBe("in_progress");
    const changed = await request(app()).patch(`/api/routes/stops/${s.id}`).send({ minutes: 90 });
    const before = await rows();
    const real = visitMutations.patchVisitInTransaction;
    let calls = 0;
    vi.spyOn(visitMutations, "patchVisitInTransaction").mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error("Injected calendar failure");
      return real(...args);
    });
    const response = await request(app()).post(`/api/routes/stops/${s.id}/apply-calendar`).send({ expectedUpdatedAt: changed.body.updatedAt });
    expect(response.status).toBe(500);
    expect(calls).toBe(2);
    expect(await rows()).toEqual(before);
  });
  it("persists import decisions only in an approved import and resolves Keep/Remove idempotently across app reloads", async () => {
    const [extra] = await db.insert(scheduleBlocks).values({ templateId: f.template.id, visitConfigId: f.configs[0].id, crewId: f.columns[1].id, dayOfWeek: "thursday", sortOrder: 8 }).returning();
    const dry = await importPlannerRoutes(f.companyId, { dryRun: true });
    expect(await db.select().from(routeImportDecisions).where(eq(routeImportDecisions.companyId, f.companyId))).toHaveLength(0);
    if (!("fingerprint" in dry)) throw new Error("Missing dry-run fingerprint");
    routeImportApprovals[f.companyId] = { approvedBy: "Randy", fingerprint: dry.fingerprint };
    await importPlannerRoutes(f.companyId, { dryRun: false });
    const decision = (await request(app()).get("/api/routes/decisions")).body[0];
    expect(decision).toMatchObject({ customerId: f.configs[0].customerId, crewId: f.standing[1].id, weekday: 4 });
    expect((await request(app("admin", "foreign")).post(`/api/routes/decisions/${decision.id}/resolve`).send({ resolution: "keep" })).status).toBe(404);
    expect((await request(app()).post(`/api/routes/decisions/${decision.id}/resolve`).send({ resolution: "keep" })).status).toBe(200);
    expect((await request(app()).post(`/api/routes/decisions/${decision.id}/resolve`).send({ resolution: "keep" })).body.alreadyResolved).toBe(true);
    expect((await request(app()).post(`/api/routes/decisions/${decision.id}/resolve`).send({ resolution: "remove" })).status).toBe(409);
    expect((await request(app()).get("/api/routes/decisions")).body).toEqual([]);
    const active = await db.select().from(routeStops).where(and(eq(routeStops.companyId, f.companyId), eq(routeStops.customerId, f.configs[0].customerId), eq(routeStops.isActive, true)));
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ weekday: 4, crewId: f.standing[1].id });
    expect((await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, extra.id)))[0]).toEqual(extra);
    // A second unresolved record exercises dismissal, which must not remove
    // the accepted pattern.
    const [copy] = await db.insert(routeImportDecisions).values({ companyId: f.companyId, sourceBlockId: "review-only-copy", snapshot: { ...(await db.select().from(routeImportDecisions).where(eq(routeImportDecisions.id, decision.id)))[0].snapshot } }).returning();
    expect((await request(app()).post(`/api/routes/decisions/${copy.id}/resolve`).send({ resolution: "remove" })).status).toBe(200);
    expect((await request(app()).get("/api/routes/decisions")).body).toEqual([]);
    expect(await db.select().from(routeStops).where(eq(routeStops.id, active[0].id))).toHaveLength(1);
  });
  it("leaves unimported planners usable; freezes every authenticated planner-only write after import", async () => {
    const endpoints: [string, string][] = [
      ["post", "/api/schedule-templates"], ["patch", `/api/schedule-templates/${f.template.id}`], ["delete", `/api/schedule-templates/${f.template.id}`],
      ["post", `/api/schedule-templates/${f.template.id}/duplicate`], ["post", `/api/schedule-templates/${f.template.id}/blocks`],
      ["patch", `/api/schedule-blocks/${f.blocks[0].id}`], ["delete", `/api/schedule-blocks/${f.blocks[0].id}`],
      ["put", `/api/customers/${f.properties[1].id}/maintenance-config`], ["post", "/api/maintenance-visit-configs"],
    ];
    expect((await request(app()).post("/api/schedule-templates").send({})).status).toBe(200);
    await db.update(companies).set({ routesImportedAt: new Date() }).where(eq(companies.id, f.companyId));
    for (const role of ["admin", "office", "field_manager", "irrigation_manager"]) for (const [method, url] of endpoints) {
      const response = await (request(app(role)) as any)[method](url).send({});
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: "PLANNER_REPLACED", message: PLANNER_REPLACED_MESSAGE });
    }
    expect((await request(app("admin", f.companyId, false)).post("/api/schedule-templates").send({})).status).toBe(401);
    expect((await request(app("irrigation_manager")).get("/api/schedule-templates")).status).toBe(200);
    expect((await request(app()).patch(`/api/maintenance-crews/${f.columns[0].id}`).send({ crewId: f.standing[0].id })).status).toBe(200);
    expect((await request(app()).get("/api/planner/readiness")).body).toMatchObject({ imported: true, plannerReadOnly: true });
    // Direct/alternate storage entry points cannot bypass HTTP middleware.
    for (const fn of [
      () => storage.createWeeklyScheduleTemplate({ companyId: f.companyId, name: "blocked", seasonStartMonth: 4, seasonStartWeek: 1, seasonEndMonth: 10, seasonEndWeek: 4, isActive: true }),
      () => storage.updateWeeklyScheduleTemplate(f.template.id, f.companyId, { name: "blocked" }),
      () => storage.deleteWeeklyScheduleTemplate(f.template.id, f.companyId),
      () => storage.duplicateWeeklyScheduleTemplate(f.template.id, f.companyId, "blocked"),
      () => storage.createScheduleBlock({ templateId: f.template.id, visitConfigId: f.configs[0].id, crewId: f.columns[0].id, dayOfWeek: "monday", sortOrder: 0 }),
      () => storage.updateScheduleBlock(f.blocks[0].id, { dayOfWeek: "friday" }),
      () => storage.deleteScheduleBlock(f.blocks[0].id),
      () => storage.deleteScheduleBlocksByTemplate(f.template.id),
      () => storage.createMaintenanceVisitConfig({ companyId: f.companyId, customerId: f.properties[7].id, estimatedDurationMinutes: 60, crewSize: 1, isActive: true }),
      () => storage.updateMaintenanceVisitConfig(f.configs[0].id, f.companyId, { notes: "blocked" }),
    ]) await expect(fn()).rejects.toMatchObject({ code: "PLANNER_REPLACED", status: 409 });
    expect(await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.templateId, f.template.id))).toHaveLength(6);
  });
});
