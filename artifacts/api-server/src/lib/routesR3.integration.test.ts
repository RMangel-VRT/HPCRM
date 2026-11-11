import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { routeStops, visits, customers, termScopeLines } from "@workspace/db";
import { db } from "../db";
import { createRouteFixture, removeRouteFixture } from "./routeTestFixture";
import { registerRouteStopRoutes } from "../routes/routeStops";
import { registerVisitRoutes } from "../routes/visits";
import { registerCrewsAndMobileRoutes } from "../routes/crewsAndMobile";
import { fillRouteVisits, fillRouteVisitsInTransaction } from "./routeFill";
import { slideRouteVisits } from "./routeSlide";
import { lockVisitCompany } from "./visitSync";
import { routeSchemaReady } from "./routeSchema";

const enabled = process.env.ROUTES_DB_TESTS === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("Routes with handmade stops and no migration data", () => {
  let f: Awaited<ReturnType<typeof createRouteFixture>>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-09T18:00:00Z"));
    f = await createRouteFixture();
  }, 30_000);
  afterEach(async () => {
    vi.restoreAllMocks(); vi.useRealTimers();
    if (f) await removeRouteFixture(f.companyId, f.userId);
  }, 30_000);
  function app(role = "admin", companyId: string = f.companyId, authenticated = true) {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => authenticated, user: { id: f.userId, activeCompanyId: companyId, activeRole: role, accessRole: role } }); next();
    });
    registerRouteStopRoutes(a); registerVisitRoutes(a); registerCrewsAndMobileRoutes(a);
    return a;
  }
  const body = (property = 1) => ({ customerId: f.properties[property].id, serviceKey: "mowing",
    crewId: f.standing[0].id, weekday: 2, everyWeeks: 1, anchorDate: "2027-03-02", minutes: 30 });
  async function stop(overrides = {}, property = 1) {
    const [s] = await db.insert(routeStops).values({ ...body(property), companyId: f.companyId, ...overrides }).returning();
    return s;
  }
  const rows = () => db.select().from(visits).where(eq(visits.companyId, f.companyId));
  it("readiness works without retired columns", async () => { expect(await routeSchemaReady()).toBe(true); });
  it.each(["admin", "office", "field_manager", "irrigation_manager"])("%s can manage Routes", async role => {
    const a = app(role);
    expect((await request(a).get("/api/routes/status")).status).toBe(200);
    expect((await request(a).get("/api/routes/crews")).status).toBe(200);
    const created = await request(a).post("/api/routes/stops").send(body());
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await request(a).patch(`/api/routes/stops/${id}`).send({ minutes: 45 })).status).toBe(200);
    expect((await request(a).post("/api/routes/stops/reorder").send({ crewId: f.standing[0].id, weekday: 2, serviceKey: "mowing", stopIds: [id] })).status).toBe(200);
    expect((await request(a).post("/api/routes/fill").send({})).status).toBe(200);
    expect((await request(a).post("/api/routes/slide").send({ date: "2027-03-09", crewIds: "all", mode: "day" })).status).toBe(200);
    expect((await request(a).delete(`/api/routes/stops/${id}`)).status).toBe(200);
  });
  it.each(["field", "crew_supervisor", "chemical_manager", "landscape_supervisor", "shop_manager", "mapping"])("%s cannot manage Routes but keeps summary/preview access", async role => {
    const s = await stop();
    const a = app(role);
    for (const path of ["/api/routes/status", "/api/routes/stops", "/api/routes/needs", "/api/routes/crews"])
      expect((await request(a).get(path)).status).toBe(403);
    expect((await request(a).post("/api/routes/fill").send({})).status).toBe(403);
    const summary = await request(a).get(`/api/customers/${f.properties[1].id}/route-summary`);
    expect(summary.body).toEqual({ stops: [{ id: s.id, serviceKey: "mowing", crew: { id: s.crewId, name: f.standing[0].name }, weekday: 2, everyWeeks: 1, minutes: 30 }] });
    expect((await request(a).get("/api/routes/preview")).body.stops[0]).toMatchObject({ id: s.id, customerId: s.customerId });
  });
  it("does not broaden irrigation visit-board permissions; company and authentication gates remain", async () => {
    for (const path of ["/api/crews/board", "/api/visits?from=2027-03-09&to=2027-03-16", "/api/visits/summary?from=2027-03-09&to=2027-03-16"])
      expect((await request(app("irrigation_manager")).get(path)).status).toBe(403);
    expect((await request(app("irrigation_manager")).post("/api/visits").send({})).status).toBe(403);
    for (const path of ["/api/routes/stops", "/api/routes/preview", `/api/customers/${f.properties[1].id}/route-summary`]) {
      expect((await request(app("admin", f.companyId, false)).get(path)).status).toBe(401);
      expect((await request(app()).get(path).set("X-Company-Id", "foreign")).status).toBe(409);
    }
    expect((await request(app("field", "foreign")).get(`/api/customers/${f.properties[1].id}/route-summary`)).status).toBe(404);
    expect((await request(app("field", "foreign")).get("/api/routes/preview")).body).toEqual({ stops: [] });
  });
  it("create, move and exact reorder preserve all other stop values and existing visits", async () => {
    const a = app();
    const s = await stop({ everyWeeks: 2, notes: "Handmade" });
    const second = await stop({}, 2);
    await fillRouteVisits(f.companyId);
    const before = await rows();
    const bad = await request(a).post("/api/routes/stops/reorder").send({ crewId: s.crewId, weekday: 2, serviceKey: "mowing", stopIds: [s.id] });
    expect(bad.status).toBe(400);
    expect((await request(a).post("/api/routes/stops/reorder").send({ crewId: s.crewId, weekday: 2, serviceKey: "mowing", stopIds: [second.id, s.id] })).status).toBe(200);
    const moved = await request(a).patch(`/api/routes/stops/${s.id}`).send({ weekday: 4 });
    expect(moved.body).toMatchObject({ id: s.id, weekday: 4, everyWeeks: 2, anchorDate: "2027-03-04", notes: "Handmade", minutes: 30 });
    expect(await rows()).toEqual(before);
    expect((await request(a).post("/api/routes/stops").send(body())).status).toBe(409);
    expect((await request(a).post("/api/routes/stops").send({ ...body(3), crewId: f.standing[2].id })).status).toBe(400);
    expect((await request(a).patch(`/api/routes/stops/${s.id}`).send({ seasonStart: "2027-04-01" })).status).toBe(400);
  });
  it("fills idempotently, keeps dated snapshots, tombstones, and weekly identity after moving", async () => {
    const s = await stop();
    expect((await fillRouteVisits(f.companyId, { dryRun: true })).created).toBe(4);
    expect(await rows()).toHaveLength(0);
    expect((await fillRouteVisits(f.companyId)).created).toBe(4);
    const generated = (await rows()).sort((a,b) => a.visitDate.localeCompare(b.visitDate));
    expect(generated[0]).toMatchObject({ sourceType: "route", ticketId: null, estimatedHours: 0.5, customerId: s.customerId });
    await db.update(visits).set({ status: "done" }).where(eq(visits.id, generated[0].id));
    await db.update(visits).set({ status: "cancelled" }).where(eq(visits.id, generated[1].id));
    await db.update(visits).set({ visitDate: "2027-06-01" }).where(eq(visits.id, generated[2].id));
    await request(app()).patch(`/api/routes/stops/${s.id}`).send({ weekday: 4, minutes: 90 });
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
    expect((await rows()).every(v => v.estimatedHours === 0.5)).toBe(true);
  });
  it.each(["day", "week"] as const)("rain slide %s changes only planned route visits and does not change the weekly pattern", async mode => {
    const s = await stop();
    await stop({ weekday: 3, anchorDate: "2027-03-03" }, 2);
    await fillRouteVisits(f.companyId);
    const before = await db.select().from(routeStops).where(eq(routeStops.companyId, f.companyId));
    const result = await slideRouteVisits(f.companyId, { date: "2027-03-09", crewIds: [s.crewId], mode });
    expect(result.moved).toBe(mode === "day" ? 1 : 2);
    expect(await db.select().from(routeStops).where(eq(routeStops.companyId, f.companyId))).toEqual(before);
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
  });
  it("winter month holes, pauses and inactive crews are respected", async () => {
    await db.insert(termScopeLines).values({ companyId: f.companyId, termId: f.term.id, line: "landscape", serviceKey: "winter_visits", included: true, quantity: 10, monthSpread: [1,1,1,0,0,0,0,0,0,0,1,1] });
    await stop({ serviceKey: "winter_visits", weekday: 1, anchorDate: "2027-01-04" });
    await stop({ pausedUntil: "2027-08-01" }, 2);
    await stop({ crewId: f.standing[2].id }, 3);
    expect((await fillRouteVisits(f.companyId, { today: "2027-06-01", through: "2027-07-13" })).created).toBe(0);
  });
  it("property deletion preserves occurrence identities and retires the stop", async () => {
    const s = await stop(); await fillRouteVisits(f.companyId);
    await db.delete(customers).where(eq(customers.id, f.properties[1].id));
    expect((await db.select().from(routeStops).where(eq(routeStops.id, s.id)))[0]).toMatchObject({ isActive: false, customerId: null });
    expect(await rows()).toHaveLength(4);
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
  });
  it("failed fill rolls back atomically and concurrent fills generate one set", async () => {
    await stop();
    await expect(db.transaction(async tx => {
      await lockVisitCompany(tx, f.companyId);
      await fillRouteVisitsInTransaction(tx, f.companyId);
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await rows()).toHaveLength(0);
    await Promise.all([fillRouteVisits(f.companyId), fillRouteVisits(f.companyId)]);
    expect(await rows()).toHaveLength(4);
  });
});
