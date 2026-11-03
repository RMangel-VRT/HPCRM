import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import pg from "pg";
import { and, eq, sql } from "drizzle-orm";
import {
  routeStops, visits, companies, customers, weeklyScheduleTemplates, scheduleBlocks, maintenanceVisitConfigs, maintenanceCrews,
  tickets, ticketTypes, ticketTypeStatuses, termScopeLines,
} from "@workspace/db";
import { db, inTransaction } from "../db";
import { createRouteFixture, removeRouteFixture } from "./routeTestFixture";
import { fillRouteVisits, fillRouteVisitsInTransaction } from "./routeFill";
import { slideRouteVisits, slideRouteVisitsInTransaction } from "./routeSlide";
import { importPlannerRoutes } from "./importPlannerRoutes";
import { routeImportApprovals } from "./routeImportApproval";
import { runRouteNight } from "./routeScheduler";
import { lockVisitCompany } from "./visitSync";
import { registerRouteStopRoutes } from "../routes/routeStops";
import { registerVisitRoutes } from "../routes/visits";
import { scopeServiceByKey } from "../shared/contractCatalog";
import { storage } from "../storage";

const enabled = process.env.ROUTES_DB_TESTS === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("route engine real PostgreSQL/API contracts", () => {
  let f: Awaited<ReturnType<typeof createRouteFixture>>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-09T18:00:00Z")); // Tuesday before spring DST.
    f = await createRouteFixture();
  }, 30000);
  afterEach(async () => {
    vi.restoreAllMocks(); vi.useRealTimers();
    if (f) { delete routeImportApprovals[f.companyId]; await removeRouteFixture(f.companyId, f.userId); }
  }, 30000);
  function app(role = "admin", companyId = f.companyId, authenticated = true) {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => authenticated,
      user: { id: f.userId, activeCompanyId: companyId, activeRole: role } }); next(); });
    registerRouteStopRoutes(a); registerVisitRoutes(a); return a;
  }
  function stopBody(i = 1, overrides = {}) {
    return { customerId: f.properties[i].id, crewId: f.standing[0].id, serviceKey: "mowing",
      weekday: 2, minutes: 30, everyWeeks: 1, anchorDate: "2027-03-02", ...overrides };
  }
  async function addStop(i = 1, overrides = {}) {
    const [stop] = await db.insert(routeStops).values({ companyId: f.companyId, ...stopBody(i, overrides) }).returning();
    return stop;
  }
  async function rows() { return db.select().from(visits).where(eq(visits.companyId, f.companyId)); }
  it("generates winter visits only in positive contract months, never throughout summer", async () => {
    await db.insert(termScopeLines).values({
      companyId: f.companyId, termId: f.term.id, serviceKey: "winter_visits", line: "landscape", included: true, quantity: 10,
      monthSpread: scopeServiceByKey("winter_visits")!.defaultMonthSpread,
    });
    await addStop(1, { serviceKey: "winter_visits", weekday: 1, anchorDate: "2027-01-04" });
    expect((await fillRouteVisits(f.companyId, { today: "2027-06-01", through: "2027-07-13" })).created).toBe(0);
    expect((await fillRouteVisits(f.companyId, { today: "2027-03-29", through: "2027-05-10" })).created).toBe(1);
    expect((await fillRouteVisits(f.companyId, { today: "2027-10-25", through: "2027-12-06" })).created).toBe(6);
    const generated = await rows();
    expect(generated).toHaveLength(7);
    expect(generated.every(v => [1, 2, 3, 11, 12].includes(Number(v.routeOccurrenceDate!.slice(5, 7))))).toBe(true);
    expect((await fillRouteVisits(f.companyId, { today: "2027-06-01", through: "2027-07-13" })).created).toBe(0);
  });
  it.each(["application", "SQL"] as const)("customer deletion through %s retires stops without destroying occurrence history", async method => {
    const stop = await addStop();
    await fillRouteVisits(f.companyId);
    const generated = await rows();
    await db.update(visits).set({ status: "done" }).where(eq(visits.id, generated[0].id));
    await db.update(visits).set({ status: "in_progress" }).where(eq(visits.id, generated[1].id));
    await db.update(visits).set({ status: "skipped" }).where(eq(visits.id, generated[2].id));
    await db.insert(visits).values({ companyId: f.companyId, customerId: f.properties[1].id, sourceType: "route",
      routeStopId: stop.id, routeOccurrenceDate: "2000-01-01", visitDate: "2000-01-01", status: "planned" });
    const before = await rows();
    if (method === "application") await storage.deleteCustomer(f.properties[1].id, f.companyId);
    else await db.delete(customers).where(and(eq(customers.id, f.properties[1].id), eq(customers.companyId, f.companyId)));
    expect(await db.select().from(customers).where(eq(customers.id, f.properties[1].id))).toHaveLength(0);
    const [retired] = await db.select().from(routeStops).where(eq(routeStops.id, stop.id));
    expect(retired).toMatchObject({ customerId: null, isActive: false });
    const after = await rows();
    expect(after).toHaveLength(before.length);
    for (const old of before) expect(after.find(v => v.id === old.id)).toMatchObject({
      routeStopId: stop.id, routeOccurrenceDate: old.routeOccurrenceDate, visitDate: old.visitDate, customerId: null,
      status: old.status === "planned" && old.visitDate !== "2000-01-01" ? "cancelled" : old.status,
    });
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
    expect((await request(app()).get("/api/routes/stops")).body).toEqual([]);
    expect((await request(app()).patch(`/api/routes/stops/${stop.id}`).send({ isActive: true })).status).toBe(400);
    await expect(db.update(routeStops).set({ isActive: true }).where(eq(routeStops.id, stop.id))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(db.delete(routeStops).where(eq(routeStops.id, stop.id))).rejects.toMatchObject({ cause: { code: "23503" } });
  });
  async function plannerSnapshot() {
    return {
      templates: await db.select().from(weeklyScheduleTemplates).where(eq(weeklyScheduleTemplates.companyId, f.companyId)),
      blocks: await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.templateId, f.template.id)),
      configs: await db.select().from(maintenanceVisitConfigs).where(eq(maintenanceVisitConfigs.companyId, f.companyId)),
      columns: await db.select().from(maintenanceCrews).where(eq(maintenanceCrews.companyId, f.companyId)),
    };
  }
  async function approveAndImport() {
    const dry = await importPlannerRoutes(f.companyId, { dryRun: true });
    if (!("fingerprint" in dry)) throw new Error("Dry run missing fingerprint");
    routeImportApprovals[f.companyId] = { approvedBy: "Randy", fingerprint: dry.fingerprint };
    return importPlannerRoutes(f.companyId, { dryRun: false });
  }
  it("fills 21 days idempotently, appends after existing visits, preserves skipped/moved/done snapshots", async () => {
    const stop = await addStop();
    await db.insert(visits).values({ companyId: f.companyId, sourceType: "internal", title: "Existing",
      visitDate: "2027-03-09", crewId: stop.crewId, routeOrder: 20 });
    const report = await fillRouteVisits(f.companyId);
    expect(report).toMatchObject({ created: 4, through: "2027-03-30", byService: { mowing: 4 } });
    const generated = (await rows()).filter(v => v.sourceType === "route").sort((a, b) => a.visitDate.localeCompare(b.visitDate));
    expect(generated[0]).toMatchObject({ routeOrder: 21, estimatedHours: 0.5, title: "Weekly turf service", customerId: stop.customerId });
    await db.update(visits).set({ status: "cancelled" }).where(eq(visits.id, generated[0].id));
    await db.update(visits).set({ visitDate: "2027-06-01" }).where(eq(visits.id, generated[1].id));
    await db.update(visits).set({ status: "done" }).where(eq(visits.id, generated[2].id));
    await db.update(routeStops).set({ minutes: 90, weekday: 3 }).where(eq(routeStops.id, stop.id));
    await db.update(routeStops).set({ weekday: 2 }).where(eq(routeStops.id, stop.id));
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
    expect((await rows()).filter(v => v.sourceType === "route").every(v => v.estimatedHours === 0.5)).toBe(true);
  });
  it("database unique identities and required route identifiers prevent invalid inserts", async () => {
    const stop = await addStop(); await fillRouteVisits(f.companyId);
    const [v] = (await rows()).filter(v => v.sourceType === "route");
    const { id, createdAt, updatedAt, ...copy } = v;
    await expect(db.insert(visits).values(copy)).rejects.toThrow();
    await expect(db.insert(visits).values({ ...copy, routeStopId: null })).rejects.toThrow();
    await expect(addStop()).rejects.toThrow();
    expect((await rows()).filter(v => v.routeStopId === stop.id)).toHaveLength(4);
  });
  it("dry fill is genuinely read only; query count stays constant across 1 and 201 stops", async () => {
    await addStop();
    const spy = vi.spyOn(pg.Client.prototype, "query");
    await fillRouteVisits(f.companyId, { dryRun: true });
    const countReads = () => spy.mock.calls.filter(c => /^\s*select\b/i.test(typeof c[0] === "string" ? c[0] : (c[0] as { text?: string })?.text ?? "")).length;
    const small = countReads();
    const extra = await db.insert(customers).values(Array.from({ length: 200 }, (_, i) => ({
      companyId: f.companyId, parentCustomerId: f.properties[0].id, name: `Bulk ${i}`, street: "Fixture", city: "Denver", state: "CO", zip: "80000",
    }))).returning();
    await db.insert(routeStops).values(extra.map(p => ({ companyId: f.companyId, ...stopBody(), customerId: p.id })));
    spy.mockClear();
    expect((await fillRouteVisits(f.companyId, { dryRun: true })).created).toBe(804);
    expect(countReads()).toBe(small);
    expect(await rows()).toEqual([]);
    const commands = spy.mock.calls.map(c => typeof c[0] === "string" ? c[0] : (c[0] as { text?: string })?.text ?? "").join("\n");
    expect(commands).toMatch(/read only/i);
    expect(commands).not.toMatch(/\b(insert into|update |delete from|pg_advisory_xact_lock)\b/i);
  });
  it("inactive crew, paused and uncovered stops report reasons without creating visits", async () => {
    await addStop(1, { crewId: f.standing[2].id });
    await addStop(2, { pausedUntil: "2027-04-01" });
    await addStop(3, { serviceKey: "winter_visits" });
    const report = await fillRouteVisits(f.companyId);
    expect(report.created).toBe(0);
    expect(report.skipped.map(s => s.reason).sort()).toEqual(["Inactive crew", "No contract for this season", "Paused"]);
  });
  it("concurrent fills and a real board move serialize without duplicates", async () => {
    await addStop(); await fillRouteVisits(f.companyId);
    const [v] = await rows();
    const results = await Promise.all([
      fillRouteVisits(f.companyId), fillRouteVisits(f.companyId),
      request(app()).patch(`/api/visits/${v.id}`).send({ visitDate: "2027-04-02" }),
    ]);
    expect(results[2]).toMatchObject({ status: 200 });
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
    expect(await rows()).toHaveLength(4);
    expect((await rows()).find(r => r.id === v.id)?.routeOccurrenceDate).toBe(v.routeOccurrenceDate);
  });
  it("day slides only planned routes, filters crews, appends Saturday to Monday, leaves tickets/done/internal alone", async () => {
    const stop = await addStop(1, { weekday: 6 });
    await addStop(2, { weekday: 6, crewId: f.standing[1].id });
    await fillRouteVisits(f.companyId);
    await db.insert(visits).values([
      { companyId: f.companyId, crewId: stop.crewId, sourceType: "internal", title: "Leave alone", visitDate: "2027-03-13" },
      { companyId: f.companyId, crewId: stop.crewId, sourceType: "internal", title: "Destination", visitDate: "2027-03-15", routeOrder: 10 },
    ]);
    const before = await rows();
    const result = await slideRouteVisits(f.companyId, { date: "2027-03-13", mode: "day", crewIds: [stop.crewId] });
    expect(result).toMatchObject({ moved: 1 });
    const after = await rows(), moved = after.find(v => v.routeStopId === stop.id && v.routeOccurrenceDate === "2027-03-13")!;
    expect(moved).toMatchObject({ visitDate: "2027-03-15", routeOrder: 11 });
    for (const original of before.filter(v => v.id !== moved.id)) expect(after.find(v => v.id === original.id)).toEqual(original);
  });
  it("planner import/fill/Tuesday week-slide/refill demonstration preserves ticket trips and occurrences", async () => {
    await approveAndImport();
    expect((await db.select().from(routeStops).where(eq(routeStops.companyId, f.companyId)))).toHaveLength(6);
    await fillRouteVisits(f.companyId);
    const before = await rows();
    const [type] = await db.insert(ticketTypes).values({ companyId: f.companyId, name: "Fixture Task", typeKey: "task" }).returning();
    const [status] = await db.insert(ticketTypeStatuses).values({ ticketTypeId: type.id, name: "Scheduled", statusKey: "scheduled", displayOrder: 0 }).returning();
    const [ticket] = await db.insert(tickets).values({ companyId: f.companyId, customerId: f.properties[1].id,
      title: "Ticket must stay", createdById: f.userId, ticketTypeId: type.id, currentStatusId: status.id, crewId: f.standing[0].id,
      dueDate: new Date("2027-03-09T18:00:00Z") }).returning();
    await db.insert(visits).values({ companyId: f.companyId, sourceType: "ticket", ticketId: ticket.id, visitDate: "2027-03-09", crewId: f.standing[0].id });
    const slid = await slideRouteVisits(f.companyId, { date: "2027-03-09", crewIds: "all", mode: "week" });
    expect(slid.moved).toBe(5);
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
    const after = await rows();
    expect(after).toHaveLength(before.length + 1);
    expect(after.find(v => v.sourceType === "ticket")?.visitDate).toBe("2027-03-09");
    expect((await db.select().from(tickets).where(eq(tickets.id, ticket.id)))[0]).toEqual(ticket);
    for (const date of ["2027-03-09", "2027-03-10", "2027-03-11", "2027-03-12", "2027-03-13"]) {
      const original = before.find(v => v.visitDate === date)!;
      const moved = after.find(v => v.id === original.id)!;
      expect(moved.routeOccurrenceDate).toBe(date);
      expect(moved.visitDate).toBe(date === "2027-03-13" ? "2027-03-15" : `2027-03-${Number(date.slice(-2)) + 1}`);
    }
  });
  it("rolls back an entire slide on failure and excludes done/skipped/in-progress routes", async () => {
    await addStop(); await fillRouteVisits(f.companyId);
    const before = await rows();
    await expect(db.transaction(async tx => {
      await lockVisitCompany(tx, f.companyId);
      await slideRouteVisitsInTransaction(tx, f.companyId, { date: "2027-03-09", crewIds: "all", mode: "day" });
      throw new Error("Injected failure after update");
    })).rejects.toThrow("Injected failure");
    expect(await rows()).toEqual(before);
    for (const status of ["done", "skipped", "in_progress", "cancelled"] as const) {
      await db.update(visits).set({ status }).where(eq(visits.id, before[0].id));
      expect((await slideRouteVisits(f.companyId, { date: before[0].visitDate, crewIds: "all", mode: "day" })).moved).toBe(0);
    }
  });
  it("API rejects foreign/inactive references, duplicate stops, invalid dates and roles", async () => {
    expect((await request(app()).post("/api/routes/stops").send(stopBody(1, { customerId: "foreign" }))).status).toBe(400);
    expect((await request(app()).post("/api/routes/stops").send(stopBody(1, { crewId: f.standing[2].id }))).status).toBe(400);
    expect((await request(app()).post("/api/routes/stops").send(stopBody())).status).toBe(201);
    expect((await request(app()).post("/api/routes/stops").send(stopBody())).status).toBe(409);
    expect((await request(app()).post("/api/routes/slide").send({ date: "2027-03-09", mode: "day", crewIds: ["foreign"] })).status).toBe(400);
    expect((await request(app()).post("/api/routes/fill").send({ through: "2027-04-21" })).status).toBe(400);
    expect((await request(app()).post("/api/routes/fill").send({ through: "2027-02-30" })).status).toBe(400);
    expect((await request(app("field_manager")).post("/api/routes/fill").send({})).status).toBe(200);
    expect((await request(app("field")).get("/api/routes/stops")).status).toBe(403);
    expect((await request(app("admin", f.companyId, false)).get("/api/routes/stops")).status).toBe(401);
    expect((await request(app("office")).get("/api/routes/stops")).status).toBe(200);
    expect((await request(app("field_manager")).get("/api/routes/needs")).status).toBe(200);
  });
  it("PATCH preserves omitted defaults, reorder rejects subsets, DELETE soft-deactivates and only cancels future planned", async () => {
    const first = await addStop(1, { everyWeeks: 2, sortOrder: 10 });
    const second = await addStop(2, { sortOrder: 20 });
    const patched = await request(app()).patch(`/api/routes/stops/${first.id}`).send({ minutes: 45 });
    expect(patched.body).toMatchObject({ everyWeeks: 2, sortOrder: 10, minutes: 45 });
    const base = { crewId: first.crewId, weekday: 2, serviceKey: "mowing" };
    expect((await request(app()).post("/api/routes/stops/reorder").send({ ...base, stopIds: [first.id] })).status).toBe(400);
    expect((await request(app()).post("/api/routes/stops/reorder").send({ ...base, stopIds: [second.id, first.id] })).status).toBe(200);
    await fillRouteVisits(f.companyId);
    await db.insert(visits).values({ companyId: f.companyId, sourceType: "route", routeStopId: first.id,
      routeOccurrenceDate: "2027-03-02", visitDate: "2027-03-02", status: "planned" });
    const generated = (await rows()).filter(v => v.routeStopId === first.id && v.visitDate >= "2027-03-09");
    await db.update(visits).set({ status: "done" }).where(eq(visits.id, generated[0].id));
    expect((await request(app()).delete(`/api/routes/stops/${first.id}`)).status).toBe(200);
    const after = (await rows()).filter(v => v.routeStopId === first.id);
    expect(after.find(v => v.visitDate === "2027-03-02")?.status).toBe("planned");
    expect(after.find(v => v.id === generated[0].id)?.status).toBe("done");
    expect(after.filter(v => v.id !== generated[0].id && v.visitDate >= "2027-03-09").every(v => v.status === "cancelled")).toBe(true);
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
  });
  it("board DELETE preserves a cancelled route occurrence so refill cannot restore it", async () => {
    await addStop(); await fillRouteVisits(f.companyId);
    const [v] = await rows();
    expect((await request(app()).delete(`/api/visits/${v.id}`)).status).toBe(200);
    expect((await rows()).find(r => r.id === v.id)?.status).toBe("cancelled");
    expect((await fillRouteVisits(f.companyId)).created).toBe(0);
  });
  it("needs and progress derive quantities from contracts and use original occurrence season after slides", async () => {
    await addStop(); await fillRouteVisits(f.companyId);
    const [v] = await rows();
    await db.update(visits).set({ visitDate: "2028-01-02", status: "done" }).where(eq(visits.id, v.id));
    const progress = await request(app()).get(`/api/routes/progress?customerId=${f.properties[1].id}&service=mowing&season=2027`);
    expect(progress.body).toMatchObject({ quantity: 26, done: 1, planned: 3, contractStatus: "covered" });
    const needs = await request(app()).get("/api/routes/needs?service=mowing");
    expect(needs.body.some((p: { customerId: string }) => p.customerId === f.properties[2].id)).toBe(true);
    expect(needs.body.some((p: { customerId: string }) => p.customerId === f.properties[1].id)).toBe(false);
    expect((await request(app()).get("/api/routes/progress?customerId=foreign&season=2027")).status).toBe(400);
  });
  it("import defaults off; approved DML is atomic/one-time and leaves every planner row unchanged", async () => {
    // Frozen planner identity must not override the linked standing crew owner.
    await db.update(maintenanceCrews).set({ isActive: false }).where(eq(maintenanceCrews.id, f.columns[0].id));
    const before = await plannerSnapshot();
    expect(await importPlannerRoutes(f.companyId, { dryRun: false })).toMatchObject({ disabled: true });
    const dry = await importPlannerRoutes(f.companyId, { dryRun: true });
    expect(dry).toMatchObject({ activeTemplates: 1, covered2027: 6 });
    expect(await plannerSnapshot()).toEqual(before);
    expect(await db.select().from(routeStops).where(eq(routeStops.companyId, f.companyId))).toHaveLength(0);
    await approveAndImport();
    expect(await importPlannerRoutes(f.companyId, { dryRun: false })).toEqual({ alreadyImported: true });
    expect(await plannerSnapshot()).toEqual(before);
    const imported = await db.select().from(routeStops).where(eq(routeStops.companyId, f.companyId));
    expect(imported).toHaveLength(6);
    expect(imported.every(s => s.seasonStart === null && s.seasonEnd === null && s.everyWeeks === 1 && s.notes === "Planner snapshot" && s.importedFromBlockId)).toBe(true);
    expect((await db.select().from(companies).where(eq(companies.id, f.companyId)))[0].routesImportedAt).not.toBeNull();
  });
  it("multiple/zero templates prevent marker and report blocks; duplicates/unlinked/inactive configs are skipped", async () => {
    await db.insert(weeklyScheduleTemplates).values({ companyId: f.companyId, name: "Second active" });
    const blocked = await importPlannerRoutes(f.companyId, { dryRun: true });
    expect(blocked).toMatchObject({ activeTemplates: 2, created: [], skipped: expect.any(Array) });
    expect((await db.select().from(companies).where(eq(companies.id, f.companyId)))[0].routesImportedAt).toBeNull();
    await db.update(weeklyScheduleTemplates).set({ isActive: false }).where(eq(weeklyScheduleTemplates.companyId, f.companyId));
    expect(await importPlannerRoutes(f.companyId, { dryRun: true })).toMatchObject({ activeTemplates: 0 });
    await db.update(weeklyScheduleTemplates).set({ isActive: true }).where(eq(weeklyScheduleTemplates.id, f.template.id));
    await db.insert(scheduleBlocks).values({ templateId: f.template.id, crewId: f.columns[0].id, visitConfigId: f.configs[0].id, dayOfWeek: "tuesday", sortOrder: 99 });
    await db.update(maintenanceVisitConfigs).set({ isActive: false }).where(eq(maintenanceVisitConfigs.id, f.configs[1].id));
    await db.update(scheduleBlocks).set({ crewId: f.columns[1].id }).where(eq(scheduleBlocks.id, f.blocks[2].id));
    await db.update(maintenanceCrews).set({ crewId: null }).where(eq(maintenanceCrews.id, f.columns[1].id));
    await db.update(scheduleBlocks).set({ crewId: f.columns[2].id }).where(eq(scheduleBlocks.id, f.blocks[3].id));
    const dry = await importPlannerRoutes(f.companyId, { dryRun: true });
    expect(dry).toMatchObject({ created: expect.any(Array), decisions: [expect.objectContaining({ reason: expect.stringContaining("Duplicate") })] });
    if ("skipped" in dry) expect(dry.skipped.map(s => s.reason).sort()).toEqual(["Inactive config", "Inactive crew", "Unlinked planner column"]);
  });
  it("approval is invalidated by changed planner data, and concurrent startups only import once", async () => {
    const dry = await importPlannerRoutes(f.companyId, { dryRun: true });
    if (!("fingerprint" in dry)) throw new Error("missing fingerprint");
    routeImportApprovals[f.companyId] = { approvedBy: "Randy", fingerprint: dry.fingerprint };
    await db.update(maintenanceVisitConfigs).set({ notes: "Changed after review" }).where(eq(maintenanceVisitConfigs.id, f.configs[0].id));
    expect(await importPlannerRoutes(f.companyId, { dryRun: false })).toMatchObject({ disabled: true });
    await db.update(maintenanceVisitConfigs).set({ notes: "Planner snapshot" }).where(eq(maintenanceVisitConfigs.id, f.configs[0].id));
    const results = await Promise.all([importPlannerRoutes(f.companyId, { dryRun: false }), importPlannerRoutes(f.companyId, { dryRun: false })]);
    expect(results.some(r => "alreadyImported" in r)).toBe(true);
    expect(await db.select().from(routeStops).where(eq(routeStops.companyId, f.companyId))).toHaveLength(6);
  });
  it("a rolled-back import cannot leave its stops or success marker behind", async () => {
    const before = await plannerSnapshot();
    await expect(db.transaction(async tx => inTransaction(tx, async () => {
      await approveAndImport();
      throw new Error("Injected import failure");
    }))).rejects.toThrow("Injected import failure");
    expect(await db.select().from(routeStops).where(eq(routeStops.companyId, f.companyId))).toHaveLength(0);
    expect((await db.select().from(companies).where(eq(companies.id, f.companyId)))[0].routesImportedAt).toBeNull();
    expect(await plannerSnapshot()).toEqual(before);
  });
  it("actual other-company crew/property/stop references cannot be used", async () => {
    const other = await createRouteFixture();
    try {
      const stop = await addStop();
      expect((await request(app()).post("/api/routes/stops").send(stopBody(2, { customerId: other.properties[1].id }))).status).toBe(400);
      expect((await request(app()).patch(`/api/routes/stops/${stop.id}`).send({ crewId: other.standing[0].id })).status).toBe(400);
      expect((await request(app()).post("/api/routes/slide").send({ date: "2027-03-09", mode: "week", crewIds: [other.standing[0].id] })).status).toBe(400);
      expect((await request(app("admin", other.companyId)).patch(`/api/routes/stops/${stop.id}`).send({ notes: "Foreign" })).status).toBe(404);
      expect((await request(app("admin", other.companyId)).delete(`/api/routes/stops/${stop.id}`)).status).toBe(404);
      expect((await request(app("admin", other.companyId)).get("/api/routes/stops")).body).toEqual([]);
    } finally { await removeRouteFixture(other.companyId, other.userId); }
  });
  it("nightly once-per-night marker and real advisory lock coordinate concurrent runners", async () => {
    await addStop();
    const now = new Date("2027-03-14T09:01:00Z");
    const results = await Promise.all([runRouteNight(now, f.companyId), runRouteNight(now, f.companyId)]);
    expect(results.reduce((n, r) => n + r.ran, 0)).toBe(1);
    expect(await runRouteNight(now, f.companyId)).toEqual({ ran: 0 });
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('routes-nightly'), 1)`);
      expect(await runRouteNight(new Date("2027-03-15T09:01:00Z"), f.companyId)).toEqual({ ran: 0 });
    });
    expect((await runRouteNight(new Date("2027-03-15T09:01:00Z"), f.companyId)).ran).toBe(1);
  });
  it("a fill that fails after inserting rolls its whole transaction back", async () => {
    await addStop();
    await expect(db.transaction(async tx => {
      await lockVisitCompany(tx, f.companyId);
      await fillRouteVisitsInTransaction(tx, f.companyId);
      throw new Error("Injected fill failure");
    })).rejects.toThrow("Injected fill failure");
    expect(await rows()).toEqual([]);
  });
});
