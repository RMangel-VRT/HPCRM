import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  companies, users, companyUsers, crews, customers, ticketTypes, ticketTypeStatuses,
  tickets, visits, ticketStatusHistory, ticketComments, ticketNotifications, insertTicketSchema,
  ticketTypeFields, ticketFieldValues, ticketLinks, routeStops, insertTicketFieldValueSchema,
} from "@workspace/db";
import { db, pool, inTransaction } from "../db";
import { storage } from "../storage";
import { registerVisitRoutes } from "./visits";
import { applyVisitTicketEdit } from "../lib/visitTicketCompatibility";
import { applySchedulingTransition, assertSchedulingGate, isSchedulingGateType, scheduleRequiredMessage } from "../lib/schedulingTransition";
import { hasOpenTicketVisit, lockVisitTickets, VisitError } from "../lib/visitLocks";
import { repairUnplacedScheduledTickets, schedulingRepairNote } from "../lib/repairUnplacedScheduledTickets";
import { transactionalTicketPatch } from "../lib/ticketPatchTransaction";
import { pickProvided } from "../lib/patchBody";
import { maintainScheduleBy } from "../lib/scheduleByMaintenance";
import { dueDateExtendedToFuture as wasDueDateExtendedToFuture } from "../lib/dueDateDismissal";
import { backfillVisitsFromTickets } from "../lib/backfillVisits";
import { backfillVisitServices } from "../lib/backfillVisitServices";
import { syncTicketFromVisits, lockVisitCompany } from "../lib/visitSync";
import { companyDateString, companyNoon, companyToday } from "../lib/companyDay";
import { findSeededStatus, isSeededStatus, isSeededTicketType } from "../shared/ticketCapabilities";
import { assertNotParentCustomer } from "../utils/parentGuard";
import { guardTicketCustomerChange } from "../lib/guardedTicketEdit";
import { getBillingBehaviorForWorkType } from "../shared/workTypeCatalog";
import { canSeeBilling, isBillingInvoiceAction } from "../lib/billing";
import { notifyTicketAssignment } from "../lib/ticketAssignmentNotification";
import { maybeAutoCreateInvoiceOnRfb } from "../lib/rfbInvoiceAutoCreate";
import { propagateInvoiceCompletion } from "../lib/invoiceCompletion";
import { applyTicketStatus } from "../lib/ticketStatusChange";
import { registerCrewsAndMobileRoutes } from "./crewsAndMobile";
import { registerMobileTicketPhotosNotesRoutes } from "./mobileTicketPhotosNotes";
import { issueMobileToken } from "../mobileAuth";
import { registerContractCenterRoutes } from "./contractCenter";
import { createRfpFixture, removeRfpFixture } from "../lib/rfpContractFixture";
import { guardManualRfpStatus } from "../lib/rfpContracts";
import { ContractCenterError } from "../lib/contractCenterService";

let companyId: string, foreignCompanyId: string, userId: string;
let crewId: string, secondCrewId: string, inactiveCrewId: string, foreignCrewId: string;
let customerId: string, foreignCustomerId: string;
let taskTypeId: string, todoTypeId: string, invoiceTypeId: string, foreignTypeId: string;
let readyId: string, scheduledId: string, progressId: string, finalId: string, todoStatusId: string, invoiceStatusId: string, foreignStatusId: string;
let ticketId: string;
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.patch("/api/tickets/:id",');
const end = source.indexOf("  // Manual invoice ticket creation", start);
const patchCode = transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code;
const decisionStart = source.indexOf('  app.put("/api/tickets/:ticketId/field-values/:fieldId",');
const decisionCode = transformSync(source.slice(decisionStart, source.indexOf("  // Ticket Status History routes", decisionStart)), { loader: "ts", target: "es2022" }).code;
function app(role = "admin", authenticated = true, activeCompanyId = companyId, actor = userId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = { id: actor, activeCompanyId, activeRole: role, accessRole: role } as Express.User;
    next();
  });
  registerVisitRoutes(app);
  registerContractCenterRoutes(app);
  const deps = {
    app, db, storage, transactionalTicketPatch, applyVisitTicketEdit, applySchedulingTransition,
    assertSchedulingGate, isSchedulingGateType, hasOpenTicketVisit, lockVisitCompany, lockVisitTickets, VisitError, inTransaction, insertTicketFieldValueSchema,
    insertTicketSchema, pickProvided, maintainScheduleBy, wasDueDateExtendedToFuture,
    findSeededStatus, isSeededStatus, isSeededTicketType, assertNotParentCustomer, guardTicketCustomerChange, getBillingBehaviorForWorkType,
    canSeeBilling, isBillingInvoiceAction, notifyTicketAssignment, maybeAutoCreateInvoiceOnRfb,
    propagateInvoiceCompletion, applyTicketStatus, eq, and, sql, guardManualRfpStatus, ContractCenterError,
    APPROVED_BILLING_STATUS_KEYS: ["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"],
    // Only the unrelated invoice-producing branch needs this bootstrap function.
    ensureInvoiceTicketType: async () => { throw new Error("Unexpected invoice bootstrap in visits test"); },
    sendPushToUser: async () => {},
  };
  new Function("deps", `const { ${Object.keys(deps).join(",")} } = deps; ${patchCode}\n${decisionCode}`)(deps);
  return app;
}
async function newTicket(overrides: Partial<typeof tickets.$inferInsert> = {}) {
  const [ticket] = await db.insert(tickets).values({
    companyId, ticketTypeId: taskTypeId, currentStatusId: readyId, title: "Visits acceptance",
    customerId, createdById: userId, workType: "contract", billingBehavior: "no_invoice", priority: "normal", ...overrides,
  }).returning();
  return ticket;
}
async function ticketRow(id = ticketId) {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id)); return row;
}
async function visitRows(id = ticketId) { return db.select().from(visits).where(eq(visits.ticketId, id)); }
async function post(body: Record<string, unknown> = {}, id = ticketId) {
  return request(app()).post("/api/visits").send({ crewId, visitDate: companyToday(), ticketId: id, ...body });
}
async function snapshot(id = ticketId) {
  return {
    ticket: await ticketRow(id), visits: await visitRows(id),
    history: await db.select().from(ticketStatusHistory).where(eq(ticketStatusHistory.ticketId, id)),
    comments: await db.select().from(ticketComments).where(eq(ticketComments.ticketId, id)),
    notifications: await db.select().from(ticketNotifications).where(eq(ticketNotifications.ticketId, id)),
    fields: await db.select().from(ticketFieldValues).where(eq(ticketFieldValues.ticketId, id)),
  };
}
beforeAll(async () => {
  const suffix = randomUUID();
  [companyId, foreignCompanyId] = (await db.insert(companies).values([
    { name: "Visits disposable", slug: `visits-${suffix}` }, { name: "Visits foreign", slug: `visits-foreign-${suffix}` },
  ]).returning()).map(c => c.id);
  [userId] = (await db.insert(users).values({ name: "Visits supervisor", passwordHash: "test-only-not-login" }).returning()).map(u => u.id);
  await db.insert(companyUsers).values({ companyId, userId, role: "field_manager" });
  [crewId, secondCrewId, inactiveCrewId, foreignCrewId] = (await db.insert(crews).values([
    { companyId, supervisorUserId: userId, name: "First", displayOrder: 0 },
    { companyId, supervisorUserId: userId, name: "Second", displayOrder: 1, defaultHoursPerDay: 6 },
    { companyId, supervisorUserId: userId, name: "Inactive", isActive: false },
    { companyId: foreignCompanyId, supervisorUserId: userId, name: "Foreign" },
  ]).returning()).map(c => c.id);
  [customerId, foreignCustomerId] = (await db.insert(customers).values([
    { companyId, name: "Visits property", street: "Test", city: "Test", state: "CO", zip: "00000" },
    { companyId: foreignCompanyId, name: "Secret foreign", street: "Test", city: "Test", state: "CO", zip: "00000" },
  ]).returning()).map(c => c.id);
  [taskTypeId, todoTypeId, invoiceTypeId, foreignTypeId] = (await db.insert(ticketTypes).values([
    { companyId, name: "Renamed job", typeKey: "task" }, { companyId, name: "To-Do", typeKey: "todo" },
    { companyId, name: "Invoice", typeKey: "invoice" }, { companyId: foreignCompanyId, name: "Secret type", typeKey: "task" },
  ]).returning()).map(t => t.id);
  [readyId, scheduledId, progressId, finalId, todoStatusId, invoiceStatusId, foreignStatusId] = (await db.insert(ticketTypeStatuses).values([
    { ticketTypeId: taskTypeId, name: "Needs scheduling", statusKey: "ready_to_schedule", displayOrder: 1 },
    { ticketTypeId: taskTypeId, name: "Scheduled", statusKey: "scheduled", displayOrder: 2 },
    { ticketTypeId: taskTypeId, name: "In progress", statusKey: "in_progress", displayOrder: 3 },
    { ticketTypeId: taskTypeId, name: "Closed", statusKey: "closed_won", displayOrder: 4, isFinal: "true" },
    { ticketTypeId: todoTypeId, name: "New", statusKey: "new", displayOrder: 0 },
    { ticketTypeId: invoiceTypeId, name: "Pending", statusKey: "pending_invoice", displayOrder: 0 },
    { ticketTypeId: foreignTypeId, name: "Secret status", statusKey: "scheduled", displayOrder: 0 },
  ]).returning()).map(s => s.id);
}, 30_000);
beforeEach(async () => { ticketId = (await newTicket()).id; });
afterAll(async () => {
  vi.restoreAllMocks();
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  if (foreignCompanyId) await db.delete(companies).where(eq(companies.id, foreignCompanyId));
  if (userId) await db.delete(users).where(eq(users.id, userId));
}, 30_000);

describe("real PostgreSQL visits API and ticket workflow", () => {
  it("returns complete scoped ticket history without relaxing board range limits", async () => {
    await post({ visitDate: "2020-01-01" });
    const other = await post({ visitDate: "2030-01-01" });
    await request(app()).patch(`/api/visits/${other.body.id}`).send({ status: "cancelled" });
    const history = await request(app()).get(`/api/tickets/${ticketId}/visits`);
    expect(history.status).toBe(200);
    expect(history.body.map((v: { visitDate: string }) => v.visitDate)).toEqual(["2020-01-01", "2030-01-01"]);
    expect(history.body[0].customer).toMatchObject({ street: "Test", city: "Test", state: "CO", zip: "00000" });
    expect((await request(app("admin", true, foreignCompanyId)).get(`/api/tickets/${ticketId}/visits`)).status).toBe(404);
    expect((await request(app()).get("/api/visits?from=2020-01-01&to=2030-01-01")).status).toBe(400);
  });
  it.each(["field", "crew_supervisor", "chemical_manager"])("denies %s the queue and ticket history", async role => {
    expect((await request(app(role)).get("/api/scheduling/queue")).status).toBe(403);
    expect((await request(app(role)).get(`/api/tickets/${ticketId}/visits`)).status).toBe(403);
  });
  it.each(["admin", "office", "field_manager"])("permits %s queue and ticket history", async role => {
    expect((await request(app(role)).get("/api/scheduling/queue")).status).toBe(200);
    expect((await request(app(role)).get(`/api/tickets/${ticketId}/visits`)).status).toBe(200);
  });
  it("queue is uncapped, stable-name-independent, sorted and company-scoped in two bulk queries", async () => {
    const oldest = await newTicket({ title: "Oldest ready", createdAt: new Date("2000-01-01"), scheduleBy: "2026-01-01", priority: "urgent" });
    await db.insert(tickets).values(Array.from({ length: 605 }, (_, i) => ({
      companyId, ticketTypeId: taskTypeId, currentStatusId: finalId, title: `Newer closed ${i}`, createdById: userId,
    })));
    const high = await newTicket({ scheduleBy: "2026-01-01", priority: "high" });
    const later = await newTicket({ scheduleBy: "2026-01-02", priority: "urgent" });
    const project = (await db.insert(ticketTypes).values({ companyId, typeKey: "project", name: "Renamed Project" }).returning())[0];
    const states = await db.insert(ticketTypeStatuses).values([
      { ticketTypeId: project.id, statusKey: "ready_to_schedule", name: "Renamed ready", displayOrder: 0 },
      { ticketTypeId: project.id, statusKey: "scheduled", name: "Renamed scheduled", displayOrder: 1 },
    ]).returning();
    const acrossType = await newTicket({ ticketTypeId: project.id, currentStatusId: states[0].id });
    const alien = await newTicket({ companyId: foreignCompanyId, ticketTypeId: foreignTypeId, currentStatusId: foreignStatusId });
    const todo = await newTicket({ ticketTypeId: todoTypeId, currentStatusId: todoStatusId });
    const invoice = await newTicket({ ticketTypeId: invoiceTypeId, currentStatusId: invoiceStatusId });
    const spy = vi.spyOn(pool, "query");
    const result = await request(app()).get("/api/scheduling/queue");
    const count = spy.mock.calls.length; spy.mockRestore();
    expect(result.status).toBe(200); expect(count).toBe(2);
    const ids = result.body.needsScheduling.map((t: { id: string }) => t.id);
    expect(ids).toContain(oldest.id); expect(ids).toContain(acrossType.id);
    expect(ids.indexOf(oldest.id)).toBeLessThan(ids.indexOf(high.id));
    expect(ids.indexOf(high.id)).toBeLessThan(ids.indexOf(later.id));
    for (const id of [alien.id, todo.id, invoice.id]) expect(ids).not.toContain(id);
  });
  it("uses the exact winning open visit at 8 pm Colorado, excluding today/future/in-progress alternatives", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T20:00:00-06:00"));
    try {
      const slipped = await post({ visitDate: "2026-10-12" });
      const today = await newTicket(); await post({ visitDate: "2026-10-13" }, today.id);
      const future = await newTicket(); await post({ visitDate: "2026-10-11" }, future.id); await post({ visitDate: "2026-10-14" }, future.id);
      const progress = await newTicket();
      await post({ visitDate: "2026-10-10" }, progress.id);
      const active = await post({ visitDate: "2026-10-12" }, progress.id);
      await request(app()).patch(`/api/visits/${active.body.id}`).send({ status: "in_progress" });
      const r = await request(app()).get("/api/scheduling/queue");
      expect(r.status).toBe(200);
      expect(r.body.slipped.find((t: { id: string }) => t.id === ticketId)).toMatchObject({ visit: { id: slipped.body.id, visitDate: "2026-10-12", crewId, crewName: "First" } });
      for (const id of [today.id, future.id, progress.id]) expect(r.body.slipped.some((t: { id: string }) => t.id === id)).toBe(false);
      expect(companyToday()).toBe("2026-10-13");
    } finally { vi.useRealTimers(); }
  });
  it("copies service snapshots through all producers, fills nulls only and filters open summaries", async () => {
    await db.update(tickets).set({ serviceType: "aeration" }).where(eq(tickets.id, ticketId));
    const created = await post({ serviceKey: "chemical", visitDate: "2026-10-13" });
    expect(created.body.serviceKey).toBe("aeration");
    await db.update(tickets).set({ serviceType: "mowing" }).where(eq(tickets.id, ticketId));
    expect(await backfillVisitServices(companyId)).toBe(0);
    expect((await visitRows())[0].serviceKey).toBe("aeration");
    const patch = await request(app()).patch(`/api/visits/${created.body.id}`).send({ serviceKey: "chemical", estimatedHours: 3 });
    expect(patch.body.serviceKey).toBe("chemical");
    const nullVisit = await post({ visitDate: "2026-10-13" });
    await request(app()).patch(`/api/visits/${nullVisit.body.id}`).send({ serviceKey: null, status: "done" });
    expect(await backfillVisitServices(companyId)).toBe(1);
    expect(await backfillVisitServices(companyId)).toBe(0);
    const filtered = await request(app()).get("/api/visits?from=2026-10-13&to=2026-10-13&service=chemical");
    expect(filtered.body.map((v: { id: string }) => v.id)).toEqual([created.body.id]);
    const summary = await request(app()).get("/api/visits/summary?from=2026-10-13&to=2026-10-13&service=chemical");
    expect(summary.body).toEqual([{ crewId, date: "2026-10-13", visitCount: 1, plannedHours: 3, capacityHours: 8 }]);
    const legacy = await newTicket({ serviceType: "cleanups" });
    const edited = await request(app()).patch(`/api/tickets/${legacy.id}`).send({ crewId, dueDate: companyNoon("2026-10-14").toISOString() });
    expect(edited.status).toBe(200);
    expect((await visitRows(legacy.id))[0].serviceKey).toBe("cleanups");
    const backfilled = await newTicket({ serviceType: "tree_pruning", crewId, dueDate: companyNoon("2026-10-15") });
    await backfillVisitsFromTickets(companyId);
    expect((await visitRows(backfilled.id))[0].serviceKey).toBe("tree_pruning");
  });
  it("removal reports only the actual transactional status transition", async () => {
    const first = await post();
    const second = await post();
    const a = await request(app()).delete(`/api/visits/${first.body.id}`);
    expect(a.body).toEqual({ ticketSync: { statusChanged: false, newStatusKey: "scheduled" } });
    const b = await request(app()).delete(`/api/visits/${second.body.id}`);
    expect(b.body).toEqual({ ticketSync: { statusChanged: true, newStatusKey: "ready_to_schedule" } });
  });
  it("ordinary ticket edits with open visits save without submitting scheduling mirrors", async () => {
    const created = await post({ visitDate: "2026-10-20" });
    const before = await ticketRow();
    const edited = await request(app()).patch(`/api/tickets/${ticketId}`).send({ title: "Unrelated title edit", priority: "urgent" });
    expect(edited.status).toBe(200);
    const after = await ticketRow();
    expect(after).toMatchObject({ title: "Unrelated title edit", priority: "urgent", crewId: before.crewId, dueDate: before.dueDate, routeOrder: before.routeOrder });
    expect((await visitRows())[0]).toMatchObject({ id: created.body.id, visitDate: "2026-10-20", crewId });
  });
  it("queue and complete history require authentication", async () => {
    expect((await request(app("admin", false)).get("/api/scheduling/queue")).status).toBe(401);
    expect((await request(app("admin", false)).get(`/api/tickets/${ticketId}/visits`)).status).toBe(401);
  });
  it.each(["admin", "office", "field_manager"])("permits %s across company crews", async role => {
    const r = await request(app(role)).post("/api/visits").send({ crewId: secondCrewId, visitDate: companyToday(), title: "Internal" });
    expect(r.status).toBe(201);
    expect((await request(app(role)).get(`/api/visits?from=${companyToday()}&to=${companyToday()}`)).status).toBe(200);
  });
  it.each(["field", "crew_supervisor", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"])("denies %s reads and writes", async role => {
    for (const r of [
      await request(app(role)).get("/api/visits?from=2026-10-01&to=2026-10-01"),
      await request(app(role)).get("/api/visits/summary?from=2026-10-01&to=2026-10-01"),
      await request(app(role)).post("/api/visits").send({}),
      await request(app(role)).patch("/api/visits/nope").send({}),
      await request(app(role)).delete("/api/visits/nope"),
      await request(app(role)).post("/api/visits/reorder").send({}),
    ]) expect(r.status).toBe(403);
  });
  it("returns 401 before reading data on every endpoint", async () => {
    const a = app("admin", false);
    expect((await request(a).get("/api/visits")).status).toBe(401);
    expect((await request(a).get("/api/visits/summary")).status).toBe(401);
    expect((await request(a).post("/api/visits")).status).toBe(401);
    expect((await request(a).patch("/api/visits/nope")).status).toBe(401);
    expect((await request(a).delete("/api/visits/nope")).status).toBe(401);
    expect((await request(a).post("/api/visits/reorder")).status).toBe(401);
  });
  it("creates Scheduled mirror/history then deletes back to Needs scheduling without losing deadline", async () => {
    const r = await post({ routeOrder: 7, customerId: foreignCustomerId, status: "done", companyId: foreignCompanyId });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ customerId, status: "planned", companyId, ticketSync: { statusChanged: true, newStatusKey: "scheduled" } });
    expect(await ticketRow()).toMatchObject({ currentStatusId: scheduledId, crewId, routeOrder: 7, dueDate: companyNoon(companyToday()) });
    expect((await snapshot()).history[0]).toMatchObject({ notes: "Crew and date set", fromStatusId: readyId, toStatusId: scheduledId });
    expect((await request(app()).delete(`/api/visits/${r.body.id}`)).status).toBe(200);
    expect(await ticketRow()).toMatchObject({ currentStatusId: readyId, crewId: null, routeOrder: null, dueDate: companyNoon(companyToday()) });
    expect((await snapshot()).history.map(h => h.notes).sort()).toEqual(["Crew and date set", "Crew or date cleared"].sort());
    expect((await ticketRow()).scheduleBy).not.toBeNull();
  });
  it("selects next planned rather than yesterday done and leaves in-progress ticket status unchanged", async () => {
    await db.update(tickets).set({ currentStatusId: progressId }).where(eq(tickets.id, ticketId));
    const old = await post({ visitDate: "2025-01-01" });
    await request(app()).patch(`/api/visits/${old.body.id}`).send({ status: "done" });
    const next = await post({ visitDate: "2027-01-05", crewId: secondCrewId });
    expect(await ticketRow()).toMatchObject({ crewId: secondCrewId, dueDate: companyNoon("2027-01-05"), currentStatusId: progressId });
    await request(app()).delete(`/api/visits/${next.body.id}`);
    expect(await ticketRow()).toMatchObject({ crewId: null, currentStatusId: progressId });
    expect((await snapshot()).history).toHaveLength(0);
  });
  it("does not write a ticket when mirror and status already agree", async () => {
    await post();
    const before = await ticketRow();
    await db.transaction(async tx => {
      await lockVisitCompany(tx, companyId);
      await syncTicketFromVisits(ticketId, companyId, userId, tx);
    });
    expect(await ticketRow()).toEqual(before);
  });
  it.each(["todo", "invoice", "final", "foreign", "missing"])("rejects %s tickets as NOT_SCHEDULABLE", async kind => {
    let id = ticketId;
    if (kind === "todo") id = (await newTicket({ ticketTypeId: todoTypeId, currentStatusId: todoStatusId })).id;
    if (kind === "invoice") id = (await newTicket({ ticketTypeId: invoiceTypeId, currentStatusId: invoiceStatusId })).id;
    if (kind === "final") await db.update(tickets).set({ currentStatusId: finalId }).where(eq(tickets.id, id));
    if (kind === "foreign") id = (await newTicket({ companyId: foreignCompanyId, ticketTypeId: foreignTypeId, currentStatusId: foreignStatusId, customerId: foreignCustomerId })).id;
    if (kind === "missing") id = randomUUID();
    const r = await post({}, id);
    expect(r.status).toBe(422); expect(r.body.error).toBe("NOT_SCHEDULABLE");
    expect(await visitRows(id)).toHaveLength(0);
  });
  it.each(["inactive", "foreign"])("rejects %s crews without any mirror/history writes", async kind => {
    const before = await snapshot();
    expect((await post({ crewId: kind === "inactive" ? inactiveCrewId : foreignCrewId })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });
  it.each([
    ["2026-01-01", "2026-03-05"], ["2026-02-30", "2026-03-01"], ["2026-03-01", "2026-02-01"],
  ])("rejects invalid list and summary range %s..%s", async (from, to) => {
    for (const path of ["/api/visits", "/api/visits/summary"])
      expect((await request(app()).get(`${path}?from=${from}&to=${to}`)).status).toBe(400);
  });
  it("allows inclusive 62-day difference and both endpoints require dates", async () => {
    expect((await request(app()).get("/api/visits?from=2026-01-01&to=2026-03-04")).status).toBe(200);
    expect((await request(app()).get("/api/visits")).status).toBe(400);
    expect((await request(app()).get("/api/visits/summary")).status).toBe(400);
  });
  it.each(["done", "skipped", "cancelled"])("move-locks %s visits", async status => {
    const r = await post();
    expect((await request(app()).patch(`/api/visits/${r.body.id}`).send({ status })).status).toBe(200);
    const before = await snapshot();
    const moved = await request(app()).patch(`/api/visits/${r.body.id}`).send({ crewId: secondCrewId });
    expect(moved.status).toBe(409); expect(moved.body.error).toBe("VISIT_CLOSED");
    expect(await snapshot()).toEqual(before);
  });
  it.each(["in_progress", "done", "skipped", "cancelled"])("does not publicly delete %s", async status => {
    const r = await post();
    await request(app()).patch(`/api/visits/${r.body.id}`).send({ status });
    expect((await request(app()).delete(`/api/visits/${r.body.id}`)).status).toBe(409);
  });
  it("PATCH is sparse, honors null and protects server-owned fields", async () => {
    const r = await post({ startTime: "09:30", estimatedHours: 4, notes: "Keep" });
    expect((await request(app()).patch(`/api/visits/${r.body.id}`).send({ sourceType: "internal" })).status).toBe(400);
    const response = await request(app()).patch(`/api/visits/${r.body.id}`).send({
      notes: null, customerId: foreignCustomerId, ticketId: randomUUID(), companyId: foreignCompanyId, createdById: null,
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ notes: null, startTime: "09:30", estimatedHours: 4, customerId, ticketId, companyId, status: "planned", createdById: userId });
    const cleared = await request(app()).patch(`/api/visits/${r.body.id}`).send({ startTime: null, estimatedHours: null, routeOrder: null });
    expect(cleared.body).toMatchObject({ startTime: null, estimatedHours: null, routeOrder: null });
    expect((await request(app()).patch(`/api/visits/${r.body.id}`).send({ visitDate: "2026-02-30" })).status).toBe(400);
  });
  it("append is serialized, moves append, and explicit route order wins", async () => {
    const day = "2027-02-01";
    const results = await Promise.all([post({ visitDate: day }), post({ visitDate: day })]);
    expect(results.map(r => r.status)).toEqual([201, 201]);
    expect(results.map(r => r.body.routeOrder).sort()).toEqual([1, 2]);
    const destination = await request(app()).post("/api/visits").send({ crewId: secondCrewId, visitDate: day, title: "Destination", routeOrder: 9 });
    const moved = await request(app()).patch(`/api/visits/${results[0].body.id}`).send({ crewId: secondCrewId });
    expect(moved.body.routeOrder).toBe(10);
    expect(destination.status).toBe(201);
    expect((await request(app()).patch(`/api/visits/${moved.body.id}`).send({ crewId, routeOrder: 3 })).body.routeOrder).toBe(3);
  });
  it("reorder requires an exact unique open ID set and excludes closed trips", async () => {
    const a = await post({ visitDate: "2027-03-01" });
    const other = await newTicket();
    const b = await post({ visitDate: "2027-03-01" }, other.id);
    const c = await post({ visitDate: "2027-03-01" }, (await newTicket()).id);
    await request(app()).patch(`/api/visits/${c.body.id}`).send({ status: "done" });
    const body = { crewId, visitDate: "2027-03-01", visitIds: [a.body.id, b.body.id] };
    const before = await snapshot();
    for (const visitIds of [[a.body.id], [a.body.id, a.body.id], [a.body.id, b.body.id, c.body.id], [a.body.id, randomUUID()]])
      expect((await request(app()).post("/api/visits/reorder").send({ ...body, visitIds })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
    expect((await request(app()).post("/api/visits/reorder").send({ ...body, visitIds: [b.body.id, a.body.id] })).status).toBe(200);
    expect((await ticketRow()).routeOrder).toBe(2);
    expect((await ticketRow(other.id)).routeOrder).toBe(1);
  });
  it("parallel moves of the same visit leave final mirror exactly matching it", async () => {
    const a = await post({ visitDate: "2027-04-01" });
    const results = await Promise.all([
      request(app()).patch(`/api/visits/${a.body.id}`).send({ crewId: secondCrewId, visitDate: "2027-04-02" }),
      request(app()).patch(`/api/visits/${a.body.id}`).send({ crewId, visitDate: "2027-04-03" }),
    ]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    const [final] = await visitRows();
    expect(await ticketRow()).toMatchObject({ crewId: final.crewId, dueDate: companyNoon(final.visitDate), routeOrder: final.routeOrder });
  });
  it("parallel opposite reorders serialize without deadlock or mixed ticket mirrors", async () => {
    const day = "2027-05-01", other = await newTicket();
    const a = await post({ visitDate: day }), b = await post({ visitDate: day }, other.id);
    const results = await Promise.all([
      request(app()).post("/api/visits/reorder").send({ crewId, visitDate: day, visitIds: [a.body.id, b.body.id] }),
      request(app()).post("/api/visits/reorder").send({ crewId, visitDate: day, visitIds: [b.body.id, a.body.id] }),
    ]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect((await ticketRow()).routeOrder).toBe((await visitRows())[0].routeOrder);
    expect((await ticketRow(other.id)).routeOrder).toBe((await visitRows(other.id))[0].routeOrder);
    expect(new Set([(await ticketRow()).routeOrder, (await ticketRow(other.id)).routeOrder]).size).toBe(2);
  });
  it("parallel visit move and reorder either serialize to consistent mirrors or reject the stale ID set", async () => {
    const day = "2027-05-02", other = await newTicket();
    const a = await post({ visitDate: day }), b = await post({ visitDate: day }, other.id);
    const [move, reorder] = await Promise.all([
      request(app()).patch(`/api/visits/${a.body.id}`).send({ crewId: secondCrewId }),
      request(app()).post("/api/visits/reorder").send({ crewId, visitDate: day, visitIds: [b.body.id, a.body.id] }),
    ]);
    expect(move.status).toBe(200);
    expect([200, 400]).toContain(reorder.status);
    for (const id of [ticketId, other.id]) {
      const [visit] = await visitRows(id);
      expect(await ticketRow(id)).toMatchObject({ crewId: visit.crewId, routeOrder: visit.routeOrder, dueDate: companyNoon(visit.visitDate) });
    }
  });
  it("ticket crew/date creates, single visit moves, and multi-visit ambiguity changes nothing", async () => {
    const r = await request(app()).patch(`/api/tickets/${ticketId}`).send({ crewId, dueDate: companyNoon("2027-06-01").toISOString() });
    expect(r.status).toBe(200); expect(r.body.currentStatusId).toBe(scheduledId);
    expect(await visitRows()).toHaveLength(1);
    expect((await request(app()).patch(`/api/tickets/${ticketId}`).send({ crewId: secondCrewId })).status).toBe(200);
    expect((await visitRows())[0].crewId).toBe(secondCrewId);
    await post({ visitDate: "2027-06-02" });
    const before = await snapshot();
    const conflict = await request(app()).patch(`/api/tickets/${ticketId}`).send({ dueDate: null, title: "No side effects" });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: "MULTIPLE_VISITS", message: "This job is on the schedule more than once. Change it under On the schedule below." });
    expect(await snapshot()).toEqual(before);
  });
  it.each([{ crewId: null }, { dueDate: null }, { crewId: null, dueDate: null }])("planned visit is removed for incomplete pair %j", async body => {
    await post();
    const before = await ticketRow();
    const r = await request(app()).patch(`/api/tickets/${ticketId}`).send(body);
    expect(r.status).toBe(200);
    expect(await visitRows()).toHaveLength(0);
    expect(await ticketRow()).toMatchObject({ crewId: null, routeOrder: null, currentStatusId: readyId,
      dueDate: Object.hasOwn(body, "dueDate") ? null : before.dueDate });
  });
  it.each([{ crewId: null }, { dueDate: null }, { crewId: null, dueDate: null }])("in-progress incomplete pair %j rolls back every side effect", async body => {
    const a = await post();
    await request(app()).patch(`/api/visits/${a.body.id}`).send({ status: "in_progress" });
    const before = await snapshot();
    const r = await request(app()).patch(`/api/tickets/${ticketId}`).send({ ...body, title: "Must not change", currentStatusId: progressId, followUpDate: "2027-06-03", assignedToId: userId });
    expect(r.status).toBe(409); expect(r.body.error).toBe("VISIT_IN_PROGRESS");
    expect(await snapshot()).toEqual(before);
  });
  it("single in-progress visit can move to a complete new crew/date pair through ticket PATCH", async () => {
    const a = await post();
    await request(app()).patch(`/api/visits/${a.body.id}`).send({ status: "in_progress" });
    const r = await request(app()).patch(`/api/tickets/${ticketId}`).send({ crewId: secondCrewId, dueDate: companyNoon("2027-07-01").toISOString() });
    expect(r.status).toBe(200);
    expect((await visitRows())[0]).toMatchObject({ status: "in_progress", crewId: secondCrewId, visitDate: "2027-07-01" });
  });
  it("explicit status/current/null intent, follow-up and unrelated edits remain compatible", async () => {
    expect((await request(app()).patch(`/api/tickets/${ticketId}`).send({ crewId, dueDate: companyNoon("2027-07-02").toISOString(), currentStatusId: readyId })).status).toBe(200);
    expect((await ticketRow()).currentStatusId).toBe(readyId);
    expect((await snapshot()).history).toHaveLength(0);
    const beforeNull = await snapshot();
    // Explicit null is not replaced by scheduling inference; the existing
    // required status contract still rejects it rather than broadening PATCH.
    expect((await request(app()).patch(`/api/tickets/${ticketId}`).send({ currentStatusId: null, title: "Sparse" })).status).toBe(400);
    expect(await snapshot()).toEqual(beforeNull);
    await db.update(tickets).set({ currentStatusId: readyId }).where(eq(tickets.id, ticketId));
    expect((await request(app()).patch(`/api/tickets/${ticketId}`).send({ followUpDate: "2027-08-01" })).status).toBe(200);
    expect((await ticketRow()).currentStatusId).toBe(readyId);
    expect((await request(app()).patch(`/api/tickets/${ticketId}`).send({ routeOrder: 99 })).status).toBe(409);
    const [visit] = await visitRows();
    await request(app()).patch(`/api/visits/${visit.id}`).send({ status: "done" });
    const closedOnly = await snapshot();
    expect((await request(app()).patch(`/api/tickets/${ticketId}`).send({ routeOrder: 99 })).status).toBe(409);
    expect(await snapshot()).toEqual(closedOnly);
    expect((await request(app()).patch(`/api/tickets/${ticketId}`).send({ crewId: secondCrewId, dueDate: null })).status).toBe(200);
    expect(await ticketRow()).toMatchObject({ crewId: null, routeOrder: null, dueDate: null });
  });
  it("deadline-only and To-Do behave as before; ticket PATCH permissions are not broadened", async () => {
    const deadline = companyNoon("2027-08-02");
    expect((await request(app()).patch(`/api/tickets/${ticketId}`).send({ dueDate: deadline.toISOString() })).status).toBe(200);
    expect(await visitRows()).toHaveLength(0);
    expect((await ticketRow()).dueDate).toEqual(deadline);
    const todo = await newTicket({ ticketTypeId: todoTypeId, currentStatusId: todoStatusId });
    expect((await request(app()).patch(`/api/tickets/${todo.id}`).send({ crewId, dueDate: deadline.toISOString() })).status).toBe(200);
    expect(await visitRows(todo.id)).toHaveLength(0);
    expect((await request(app("field_manager")).patch(`/api/tickets/${ticketId}`).send({ title: "Denied" })).status).toBe(403);
    expect((await request(app("field")).patch(`/api/tickets/${ticketId}`).send({ title: "Denied" })).status).toBe(403);
  });
  it("rolls back visit/mirror/history/cleanup after a late workflow validation rejection", async () => {
    await post();
    const [field] = await db.insert(ticketTypeFields).values({ ticketTypeId: taskTypeId, statusId: scheduledId, fieldKey: randomUUID(), fieldLabel: "Undo field", fieldType: "text", displayOrder: 0 }).returning();
    await db.insert(ticketFieldValues).values({ ticketId, fieldId: field.id, value: "Retain", capturedById: userId });
    const before = await snapshot();
    const r = await request(app()).patch(`/api/tickets/${ticketId}`).send({ crewId: null, actualStartTime: "2027-01-01T12:00:00Z", actualEndTime: "2027-01-01T11:00:00Z" });
    expect(r.status).toBe(422); expect(r.body.error).toBe("END_BEFORE_START");
    expect(await snapshot()).toEqual(before);
  });
  it("rolls back a real history constraint failure together with inserted visit and mirror", async () => {
    const before = await snapshot();
    await expect(db.transaction(async tx => {
      await lockVisitCompany(tx, companyId);
      await tx.insert(visits).values({ companyId, crewId, ticketId, visitDate: companyToday() });
      await syncTicketFromVisits(ticketId, companyId, randomUUID(), tx); // missing actor FK
    })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
  it("foreign visits cannot be patched, read or deleted; corrupt counterparts enrich to null in one query", async () => {
    const foreign = await newTicket({ companyId: foreignCompanyId, ticketTypeId: foreignTypeId, currentStatusId: foreignStatusId, customerId: foreignCustomerId });
    const [foreignVisit] = await db.insert(visits).values({ companyId: foreignCompanyId, crewId: foreignCrewId, ticketId: foreign.id, visitDate: "2027-09-01" }).returning();
    expect((await request(app()).patch(`/api/visits/${foreignVisit.id}`).send({ notes: "denied" })).status).toBe(404);
    expect((await request(app()).delete(`/api/visits/${foreignVisit.id}`)).status).toBe(404);
    const [corrupt] = await db.insert(visits).values({ companyId, crewId: foreignCrewId, customerId: foreignCustomerId, ticketId: foreign.id, visitDate: "2027-09-01" }).returning();
    const querySpy = vi.spyOn(pool, "query");
    const read = await request(app()).get("/api/visits?from=2027-09-01&to=2027-09-01");
    expect(read.status).toBe(200);
    expect(read.body.find((v: { id: string }) => v.id === corrupt.id)).toMatchObject({ ticket: null, customer: null, crew: null });
    expect(read.body.some((v: { id: string }) => v.id === foreignVisit.id)).toBe(false);
    const calls = querySpy.mock.calls.length;
    querySpy.mockRestore();
    expect(calls).toBe(1);
    await db.insert(visits).values(Array.from({ length: 10 }, (_, i) => ({ companyId, crewId, title: `bulk ${i}`, sourceType: "internal" as const, visitDate: "2027-09-01" })));
    const bulkSpy = vi.spyOn(pool, "query");
    await request(app()).get("/api/visits?from=2027-09-01&to=2027-09-01");
    expect(bulkSpy.mock.calls.length).toBe(1); bulkSpy.mockRestore();
  });
  it("reads stable enrichment and summary in one query with zero-hour and capacity fallbacks", async () => {
    const day = "2027-10-01";
    const a = await post({ visitDate: day, estimatedHours: 2.5, routeOrder: 2 });
    const b = await post({ visitDate: day, estimatedHours: 1.5, routeOrder: 1 }, (await newTicket()).id);
    await request(app()).patch(`/api/visits/${b.body.id}`).send({ status: "in_progress" });
    const closed = await post({ visitDate: day, estimatedHours: 20 }, (await newTicket()).id);
    await request(app()).patch(`/api/visits/${closed.body.id}`).send({ status: "done" });
    await request(app()).post("/api/visits").send({ crewId: secondCrewId, visitDate: day, title: "No hours" });
    const read = await request(app()).get(`/api/visits?from=${day}&to=${day}&customerId=${customerId}`);
    expect(read.body.map((v: { id: string }) => v.id).slice(0, 2)).toEqual([b.body.id, a.body.id]);
    expect(read.body.find((v: { id: string }) => v.id === a.body.id)).toMatchObject({
      ticket: { id: ticketId, title: "Visits acceptance", typeKey: "task", typeName: "Renamed job", statusKey: "scheduled", statusName: "Scheduled" },
      customer: { id: customerId, name: "Visits property" }, crew: { id: crewId, name: "First", color: null },
    });
    const spy = vi.spyOn(pool, "query");
    const summary = await request(app()).get(`/api/visits/summary?from=${day}&to=${day}`);
    expect(spy.mock.calls.length).toBe(1); spy.mockRestore();
    expect(summary.body).toEqual(expect.arrayContaining([
      { crewId, date: day, visitCount: 2, plannedHours: 4, capacityHours: 8 },
      { crewId: secondCrewId, date: day, visitCount: 1, plannedHours: 0, capacityHours: 6 },
    ]));
  });
  it("backfill is idempotent, non-final, Colorado-dated and never touches ticket values", async () => {
    const candidate = await newTicket({ crewId, dueDate: companyNoon("2026-03-08"), routeOrder: 5, currentStatusId: progressId });
    await newTicket({ crewId, dueDate: new Date(), currentStatusId: finalId });
    await newTicket({ crewId, dueDate: null });
    await newTicket({ crewId: null, dueDate: new Date() });
    const existing = await newTicket({ crewId, dueDate: companyNoon("2026-01-01") });
    await db.insert(visits).values({ companyId, crewId, ticketId: existing.id, visitDate: "2026-01-01", status: "done" });
    const before = await ticketRow(candidate.id);
    await backfillVisitsFromTickets(companyId);
    expect((await visitRows(candidate.id))[0]).toMatchObject({ visitDate: "2026-03-08", routeOrder: 5, status: "planned", customerId, crewId });
    expect(await ticketRow(candidate.id)).toEqual(before);
    expect(await visitRows(existing.id)).toHaveLength(1);
    expect(await backfillVisitsFromTickets(companyId)).toBe(0);
  });
  it("real supervisor Today/week/photos/notes still see a visit's ticket mirror at 8 pm Colorado", async () => {
    const a = app();
    registerCrewsAndMobileRoutes(a);
    registerMobileTicketPhotosNotesRoutes(a);
    const token = await issueMobileToken(userId, companyId, "visits integration");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T20:00:00-06:00"));
    try {
      const r = await post({ visitDate: companyToday() });
      expect(r.status).toBe(201);
      const tomorrow = await newTicket();
      expect((await post({ visitDate: "2026-10-14" }, tomorrow.id)).status).toBe(201);
      const today = await request(a).get("/api/m/today").auth(token.rawToken, { type: "bearer" });
      expect(today.status).toBe(200); expect(today.body.date).toBe("2026-10-13");
      expect(today.body.stops.some((s: { id?: string; ticketId?: string }) => s.id === ticketId || s.ticketId === ticketId)).toBe(true);
      expect(today.body.stops.some((s: { id?: string; ticketId?: string }) => s.id === tomorrow.id || s.ticketId === tomorrow.id)).toBe(false);
      expect((await request(a).get("/api/m/me/week").auth(token.rawToken, { type: "bearer" })).status).toBe(200);
      expect((await request(a).get(`/api/m/tickets/${ticketId}/photos`).auth(token.rawToken, { type: "bearer" })).status).toBe(200);
      expect((await request(a).get(`/api/m/tickets/${ticketId}/notes`).auth(token.rawToken, { type: "bearer" })).status).toBe(200);
      expect((await request(app()).delete(`/api/visits/${r.body.id}`)).status).toBe(200);
      const removed = await request(a).get("/api/m/today").auth(token.rawToken, { type: "bearer" });
      expect(removed.body.stops.some((s: { id?: string; ticketId?: string }) => s.id === ticketId || s.ticketId === ticketId)).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("concurrent backfill and API placement cannot both seed a duplicate visit", async () => {
    await db.update(tickets).set({ crewId, dueDate: companyNoon("2027-11-01") }).where(eq(tickets.id, ticketId));
    await Promise.all([backfillVisitsFromTickets(companyId), post({ visitDate: "2027-11-01" })]);
    // If backfill gets the lock first the intentional API trip is additional; if
    // placement wins, backfill must see it and not add a legacy duplicate.
    const count = (await visitRows()).length;
    expect(count === 1 || count === 2).toBe(true);
    expect(await backfillVisitsFromTickets(companyId)).toBe(0);
    expect((await visitRows()).length).toBe(count);
  });
});

describe("S1 scheduling gate", () => {
  async function workflow(type: "task" | "project" | "estimate_request" | "todo" | "invoice" | "rfp_request") {
    const [row] = await db.insert(ticketTypes).values({ companyId, name: `S1 ${type} ${randomUUID()}`, typeKey: type }).returning();
    const stages = ["new", "decision_received", "ready_to_schedule", "scheduled", type === "task" ? "in_progress" : "work_completed", "closed_lost"];
    const ladder = await db.insert(ticketTypeStatuses).values(stages.map((statusKey, displayOrder) => ({
      ticketTypeId: row.id, name: `Renamed ${statusKey}`, statusKey, displayOrder, isFinal: statusKey === "closed_lost" ? "true" as const : "false" as const,
    }))).returning();
    return { typeId: row.id, ladder, id: (key: string) => ladder.find(s => s.statusKey === key)!.id, after: ladder[4].id };
  }

  it.each([false, true])("does not place a stop from an unchanged legacy mirror (closed history: %s)", async closedOnly => {
    const w = await workflow("task");
    const day = "2036-10-08";
    const job = await newTicket({ ticketTypeId: w.typeId, currentStatusId: w.id("ready_to_schedule"),
      crewId, dueDate: companyNoon(day), routeOrder: 3, scheduleBy: day });
    if (closedOnly) {
      await db.insert(visits).values((["done", "skipped", "cancelled"] as const).map((status, i) => (
        { companyId, crewId, ticketId: job.id, visitDate: day, routeOrder: i + 1, status }
      )));
    }
    const before = await snapshot(job.id);
    const originalStops = await visitRows(job.id);
    const a = request(app());
    const path = `/api/tickets/${job.id}`;
    // Simulate a browser in UTC round-tripping the same Colorado day as a
    // different instant, along with the unchanged legacy crew and order.
    const edited = await a.patch(path).send({ title: "Only the title changed", crewId, dueDate: `${day}T12:00:00Z`, routeOrder: 3 });
    expect(edited.status).toBe(200);
    expect(await ticketRow(job.id)).toMatchObject({
      title: "Only the title changed", currentStatusId: w.id("ready_to_schedule"),
      crewId, dueDate: companyNoon(day), routeOrder: 3, scheduleBy: day,
    });
    expect(await visitRows(job.id)).toEqual(originalStops);
    expect((await snapshot(job.id)).history).toEqual(before.history);
    const placed = await a.patch(path).send({ crewId, dueDate: "2036-10-09T12:00:00Z" });
    expect(placed.status).toBe(200);
    expect((await ticketRow(job.id)).currentStatusId).toBe(w.id("scheduled"));
    expect(await visitRows(job.id)).toEqual(expect.arrayContaining([
      ...originalStops, expect.objectContaining({ crewId, visitDate: "2036-10-09", status: "planned" }),
    ]));
    expect(await visitRows(job.id)).toHaveLength(originalStops.length + 1);
  });

  it.each(["task", "project", "estimate_request"] as const)("checks the entire %s gate, history and skip target", async type => {
    const w = await workflow(type);
    const job = await newTicket({ ticketTypeId: w.typeId, currentStatusId: w.id("ready_to_schedule"), scheduleBy: companyToday() });
    const a = request(app());
    const path = `/api/tickets/${job.id}`;
    const baseline = await snapshot(job.id);
    for (const target of [w.id("scheduled"), w.after, w.id("closed_lost")]) {
      const reject = await a.patch(path).send({ currentStatusId: target, title: "Uncommitted", statusChangeNotes: "Scheduling skipped: user text" });
      expect(reject.status).toBe(422);
      expect(reject.body).toEqual({ error: "SCHEDULE_REQUIRED", message: scheduleRequiredMessage });
    }
    expect(await snapshot(job.id)).toEqual(baseline);
    await expect(db.transaction(tx => applyTicketStatus(tx, {
      ticket: { ...job, currentStatusId: w.id("scheduled") }, userId, updates: { currentStatusId: w.after },
    }))).rejects.toMatchObject({ code: "SCHEDULE_REQUIRED" });
    const [closed] = await db.insert(visits).values({ companyId, crewId, ticketId: job.id, visitDate: companyToday(), status: "done" }).returning();
    expect((await a.patch(path).send({ currentStatusId: w.id("scheduled") })).status).toBe(422);
    for (const reason of [" ", "ab", "Other", "a".repeat(501)]) {
      expect((await a.post(`${path}/skip-scheduling`).send({ reason })).status).toBe(400);
    }
    const [open] = await db.insert(visits).values({ companyId, crewId, ticketId: job.id, visitDate: companyToday(), status: "in_progress" }).returning();
    expect((await a.patch(path).send({ currentStatusId: w.after })).status).toBe(422);
    expect((await a.post(`${path}/skip-scheduling`).send({ reason: "No crew trip needed" })).body).toEqual({
      error: "ALREADY_SCHEDULED", message: "It’s already on the schedule; remove that stop first.",
    });
    expect((await a.patch(path).send({ currentStatusId: w.id("scheduled") })).status).toBe(200);
    expect((await a.patch(path).send({ currentStatusId: w.after })).status).toBe(200);
    expect((await a.patch(path).send({ currentStatusId: w.id("ready_to_schedule") })).status).toBe(200);
    await db.delete(visits).where(eq(visits.id, open.id));
    const skipped = await a.post(`${path}/skip-scheduling`).send({ reason: "  Done during a regular stop   " });
    expect(skipped.body).toEqual({ currentStatusId: w.after });
    expect(await ticketRow(job.id)).toMatchObject({ currentStatusId: w.after, scheduleBy: null });
    expect((await snapshot(job.id)).history.filter(row => row.notes === "Scheduling skipped: Done during a regular stop")).toHaveLength(1);
    expect((await visitRows(job.id)).map(row => row.id)).toEqual([closed.id]);
    expect((await a.post(`${path}/skip-scheduling`).send({ reason: "Again" })).status).toBe(409);
    expect((await a.get("/api/scheduling/queue")).body.needsScheduling.some((q: { id: string }) => q.id === job.id)).toBe(false);
  }, 25_000);

  it.each(["task", "project", "estimate_request"] as const)("manual placement at New only schedules eligible %s", async type => {
    const w = await workflow(type);
    const job = await newTicket({ ticketTypeId: w.typeId, currentStatusId: w.id("new") });
    expect((await request(app()).patch(`/api/tickets/${job.id}`).send({ currentStatusId: w.after })).status).toBe(422);
    const result = await post({}, job.id);
    expect(result.status).toBe(201);
    expect(result.body.ticketSync.newStatusKey).toBe(type === "estimate_request" ? "new" : "scheduled");
    expect((await ticketRow(job.id)).acceptedAt).toBeNull();
  });

  it.each(["todo", "invoice", "rfp_request"] as const)("leaves %s without a scheduling gate", async type => {
    const w = await workflow(type);
    // Use the shared persistence path for unaffected workflows, independent of
    // the RFP-specific and Invoice-specific guards in generic PATCH.
    const job = await newTicket({ ticketTypeId: w.typeId, currentStatusId: w.id("new") });
    const updated = await db.transaction(tx => applyTicketStatus(tx, { ticket: job, userId, updates: { currentStatusId: w.after } }));
    expect(updated.currentStatusId).toBe(w.after);
  });

  it("allows the same-company assignee to skip without exposing visits; rejects unrelated and stale company actions", async () => {
    const path = `/api/tickets/${ticketId}`;
    const reason = { reason: "Handled by a vendor or sub" };
    expect((await request(app("field")).post(`${path}/skip-scheduling`).send(reason)).status).toBe(403);
    expect((await request(app("office", true, foreignCompanyId)).post(`${path}/skip-scheduling`).send(reason)).status).toBe(404);
    expect((await request(app("admin")).post(`${path}/skip-scheduling`).set("X-Company-Id", foreignCompanyId).send(reason)).status).toBe(409);
    await db.update(tickets).set({ assignedToId: userId }).where(eq(tickets.id, ticketId));
    expect((await request(app("field")).get(`${path}/visits`)).status).toBe(403);
    expect((await request(app("field")).post(`${path}/skip-scheduling`).send(reason)).status).toBe(200);
  });

  it("preserves Estimate send, approval and denial while rejecting a linked recovery jump from New", async () => {
    const w = await workflow("estimate_request");
    const [field] = await db.insert(ticketTypeFields).values({ ticketTypeId: w.typeId, statusId: w.id("decision_received"),
      fieldKey: "decision_outcome", fieldLabel: "Decision", fieldType: "select", displayOrder: 0 }).returning();
    for (const decision of ["Approved", "Denied"]) {
      const job = await newTicket({ ticketTypeId: w.typeId, currentStatusId: w.id("new"), workType: "estimate_request" });
      const path = `/api/tickets/${job.id}`;
      const a = request(app());
      expect((await a.patch(path).send({ currentStatusId: w.id("closed_lost"), followUpDate: null })).body.error).toBe("SCHEDULE_REQUIRED");
      expect((await a.patch(path).send({ currentStatusId: w.id("decision_received") })).status).toBe(200);
      expect((await a.put(`${path}/field-values/${field.id}`).send({ value: decision })).status).toBe(200);
      expect((await ticketRow(job.id)).currentStatusId).toBe(w.id(decision === "Approved" ? "ready_to_schedule" : "closed_lost"));
    }
  });

  it("works a seeded RFP through the real ticket PATCH, Contract Center, checklist PUT and Won", async () => {
    const f = await createRfpFixture();
    try {
      const rfp = await f.createRfp("reviewing"), path = `/api/tickets/${rfp.id}`;
      const client = request(app("office", true, f.companyId, f.userId));
      const move = (key: string, statusChangeNotes?: string) => client.patch(path)
        .send({ currentStatusId: f.status(key).id, ...(statusChangeNotes ? { statusChangeNotes } : {}) });
      const answer = (key: string, value: string) => client.put(`${path}/field-values/${f.fields.find(field => field.fieldKey === key)!.id}`).send({ value });
      const [archivedDecision] = await db.insert(ticketTypeFields).values({ ticketTypeId: f.type.id,
        fieldKey: "decision_outcome", fieldLabel: "Retired", fieldType: "select", displayOrder: 0 }).returning();
      expect((await client.put(`${path}/field-values/${archivedDecision.id}`).send({ value: "Lost" })).status).toBe(200);
      expect((await ticketRow(rfp.id)).currentStatusId).toBe(f.status("reviewing").id);
      expect((await answer("missing_items", "Service scope")).status).toBe(200);
      expect((await answer("info_requested_date", "2026-11-23")).status).toBe(200);
      expect((await move("waiting_info")).status).toBe(200);
      expect((await answer("proposal_version", "1")).status).toBe(200);
      const drafting = await move("proposal_draft", "Site walk skipped.");
      expect(drafting.status, JSON.stringify(drafting.body)).toBe(200);
      const contract = await client.post("/api/contract-center/contracts").send({
        bidTicketId: rfp.id, customerId: f.customerId, line: "landscape", form: "ours",
        term: { seasonLabel: "2027", startDate: "2027-01-01", endDate: "2027-12-31" }, scope: [], rates: [], payments: [],
      });
      expect(contract.status, JSON.stringify(contract.body)).toBe(201);
      const termPath = `/api/contract-center/terms/${contract.body.terms[0].id}/status`;
      expect((await client.post(termPath).send({ to: "sent" })).status).toBe(200);
      expect((await ticketRow(rfp.id)).currentStatusId).toBe(f.status("proposal_sent").id);
      expect((await move("awarded")).status).toBe(200);
      expect((await move("closed_lost")).body.message).toContain("Use Mark lost");
      const early = await move("onboarding");
      expect(early.status).toBe(409);
      expect(early.body.message).toContain("Mark the contract signed");
      expect((await client.post(termPath).send({ to: "signed" })).status).toBe(200);
      expect((await ticketRow(rfp.id)).currentStatusId).toBe(f.status("onboarding").id);
      for (const [field, value] of [["customer_setup", "Yes"], ["maps_created", "Yes"],
        ["board_contacts_collected", "Partial"], ["kickoff_date", "2026-11-27"], ["kickoff_notes", "Review the maps"]]) {
        const response = await answer(field, value);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ value, capturedById: f.userId });
      }
      const won = await move("closed_won");
      expect(won.status, JSON.stringify(won.body)).toBe(200);
      expect(won.body).toMatchObject({ currentStatusId: f.status("closed_won").id, completedByUserId: f.userId });
      const audit = await storage.getTicketStatusHistory(rfp.id);
      expect(audit.map(row => row.toStatusId).reverse()).toEqual(
        ["waiting_info", "proposal_draft", "proposal_sent", "awarded", "onboarding", "closed_won"].map(key => f.status(key).id));
      expect(audit.find(row => row.toStatusId === f.status("proposal_draft").id)?.notes).toBe("Site walk skipped.");
    } finally {
      await removeRfpFixture(f.companyId, f.userId);
    }
  });

  it("rolls back Invoice completion for a blocked parent, then preserves later-stage billing", async () => {
    const [invoiced] = await db.insert(ticketTypeStatuses).values({
      ticketTypeId: invoiceTypeId, name: "Invoiced", statusKey: "invoiced", displayOrder: 1, isFinal: "true",
    }).returning();
    const parent = await newTicket({ billingBehavior: "invoice_required", workType: "extra_work" });
    const invoice = await newTicket({ ticketTypeId: invoiceTypeId, currentStatusId: invoiceStatusId, workType: "admin" });
    const link = await storage.createTicketLink({ sourceTicketId: parent.id, targetTicketId: invoice.id, linkType: "invoice_for" });
    const [field] = await db.insert(ticketTypeFields).values({ ticketTypeId: invoiceTypeId, statusId: invoiceStatusId,
      fieldKey: "invoice_number", fieldLabel: "Invoice Number", fieldType: "text", displayOrder: 0 }).returning();
    await storage.upsertTicketFieldValue({ ticketId: invoice.id, fieldId: field.id, value: "S1 test", capturedById: userId });
    const before = [await snapshot(invoice.id), await snapshot(parent.id)];
    const result = await request(app()).patch(`/api/tickets/${invoice.id}`).send({ currentStatusId: invoiced.id, invoiceNumber: "Not saved" });
    expect(result.status).toBe(422);
    expect(result.body.error).toBe("SCHEDULE_REQUIRED");
    expect([await snapshot(invoice.id), await snapshot(parent.id)]).toEqual(before);
    expect(await db.select().from(ticketLinks).where(eq(ticketLinks.id, link.id))).toHaveLength(1);
    await db.update(tickets).set({ currentStatusId: progressId }).where(eq(tickets.id, parent.id));
    const success = await request(app()).patch(`/api/tickets/${invoice.id}`).send({ currentStatusId: invoiced.id });
    expect(success.status).toBe(200);
    expect(success.body.invoiceCompletion.parentAdvanced).toBe(true);
    expect((await ticketRow(parent.id)).currentStatusId).toBe(finalId);
  });

  it("selects a Colorado-evening branch stop across sources and preserves closed history and other mirrors", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Separate crew-day from P3 tests that also place stops on October 13.
    vi.setSystemTime(new Date("2037-10-14T02:00:00Z"));
    try {
      const [branch] = await db.insert(customers).values({ companyId, name: "Exact S1 branch", parentCustomerId: customerId, street: "", city: "", state: "CO", zip: "" }).returning();
      const job = await newTicket({ customerId: branch.id });
      const other = await newTicket({ customerId: branch.id, currentStatusId: scheduledId });
      const today = "2037-10-13";
      const [route] = await db.insert(routeStops).values({ companyId, customerId: branch.id, crewId, serviceKey: "mowing", anchorDate: today, weekday: 2, minutes: 20 }).returning();
      await db.insert(visits).values([
        { companyId, customerId, crewId, visitDate: today, routeOrder: 0, sourceType: "internal", title: "Parent ignored" },
        { companyId, customerId: branch.id, crewId, visitDate: "2037-10-12", routeOrder: 0, sourceType: "internal", title: "Yesterday ignored" },
        { companyId, customerId: branch.id, crewId, visitDate: "2037-10-14", routeOrder: 0, sourceType: "internal", title: "Tomorrow" },
        { companyId, customerId: branch.id, crewId, visitDate: today, routeOrder: 0, ticketId: job.id },
        { companyId, customerId: branch.id, crewId: inactiveCrewId, visitDate: today, routeOrder: 0, sourceType: "internal", title: "Inactive ignored" },
        { companyId, customerId: branch.id, crewId: secondCrewId, visitDate: today, routeOrder: 2, sourceType: "internal", title: "Second crew" },
        { companyId: foreignCompanyId, customerId: foreignCustomerId, crewId: foreignCrewId, visitDate: today, routeOrder: 0, sourceType: "internal", title: "Foreign ignored" },
      ]);
      const [anchor, later, closed] = await db.insert(visits).values([
        { companyId, customerId: branch.id, crewId, visitDate: today, routeOrder: 2, sourceType: "route", routeStopId: route.id, routeOccurrenceDate: today },
        { companyId, customerId: branch.id, crewId, visitDate: today, routeOrder: 3, ticketId: other.id },
        { companyId, customerId: branch.id, crewId, visitDate: today, routeOrder: 9, sourceType: "internal", title: "Closed", status: "done" },
      ]).returning();
      const a = request(app());
      const base = `/api/tickets/${job.id}`;
      const offered = await a.get(`${base}/next-stop`);
      expect(offered.body).toEqual({ date: today, crew: { id: crewId, name: "First" }, routeOrder: 2, label: "Tue Oct 13 · First" });
      const placed = await a.post(`${base}/schedule-next-stop`).set("If-Match", offered.headers["x-next-stop-snapshot"]);
      expect(placed.status).toBe(201);
      expect(placed.body).toMatchObject({ routeOrder: 4, ticketSync: { statusChanged: true, newStatusKey: "scheduled" } });
      expect((await ticketRow(other.id)).routeOrder).toBe(5);
      const day = await db.select().from(visits).where(and(eq(visits.companyId, companyId), eq(visits.crewId, crewId), eq(visits.visitDate, today)));
      expect(day.find(v => v.id === anchor.id)?.routeOrder).toBe(3);
      expect(day.find(v => v.id === later.id)?.routeOrder).toBe(5);
      expect(day.find(v => v.id === closed.id)).toEqual(closed);
      expect((await db.select().from(routeStops).where(eq(routeStops.id, route.id)))[0]).toEqual(route);
    } finally { vi.useRealTimers(); }
  }, 20_000);

  it.each(["move", "delete", "reorder"] as const)("refuses a stale suggestion after a %s", async change => {
    const [property] = await db.insert(customers).values({ companyId, name: `S1 stale ${change}`, street: "", city: "", state: "CO", zip: "" }).returning();
    const job = await newTicket({ customerId: property.id });
    const day = "2032-08-01";
    const [anchor, alternative] = await db.insert(visits).values([1, 2].map(routeOrder => ({
      companyId, customerId: property.id, crewId, visitDate: day, routeOrder, sourceType: "internal" as const, title: "Stop",
    }))).returning();
    const a = request(app());
    const base = `/api/tickets/${job.id}`;
    const offered = await a.get(`${base}/next-stop`);
    expect(offered.status).toBe(200);
    if (change === "move") expect((await a.patch(`/api/visits/${anchor.id}`).send({ visitDate: "2032-08-02" })).status).toBe(200);
    if (change === "delete") expect((await a.delete(`/api/visits/${anchor.id}`)).status).toBe(200);
    if (change === "reorder") {
      const full = (await db.select().from(visits).where(and(eq(visits.companyId, companyId), eq(visits.crewId, crewId), eq(visits.visitDate, day))));
      const ids = [alternative.id, anchor.id, ...full.filter(v => v.id !== alternative.id && v.id !== anchor.id).map(v => v.id)];
      expect((await a.post("/api/visits/reorder").send({ crewId, visitDate: day, visitIds: ids })).status).toBe(200);
    }
    const stale = await a.post(`${base}/schedule-next-stop`).set("If-Match", offered.headers["x-next-stop-snapshot"]);
    expect(stale.status).toBe(409);
    expect(stale.body.message).toBe("That stop is no longer on the schedule");
    expect(await visitRows(job.id)).toHaveLength(0);
    expect((await a.get(`${base}/next-stop`)).headers["x-next-stop-snapshot"]).not.toBe(offered.headers["x-next-stop-snapshot"]);
  });

  it("repairs only unplaced Scheduled jobs and doesn't fabricate stops on a second startup sequence", async () => {
    const due = companyNoon("2027-06-20");
    const invalid = await newTicket({ currentStatusId: scheduledId, crewId, routeOrder: 8, dueDate: due, scheduleBy: null });
    await db.insert(visits).values({ companyId, crewId, visitDate: "2027-06-20", ticketId: invalid.id, status: "done" });
    const none = await newTicket({ currentStatusId: scheduledId, crewId, routeOrder: 8, dueDate: due });
    const valid = await newTicket({ currentStatusId: scheduledId });
    await post({}, valid.id);
    const validBefore = await snapshot(valid.id);
    const unrelated = await newTicket({ currentStatusId: progressId });
    const unrelatedBefore = await snapshot(unrelated.id);
    expect(await repairUnplacedScheduledTickets(companyId)).toBeGreaterThanOrEqual(2);
    await backfillVisitsFromTickets(companyId);
    await backfillVisitServices(companyId);
    expect((await ticketRow(invalid.id))).toMatchObject({ currentStatusId: readyId, crewId: null, routeOrder: null, dueDate: due });
    expect((await ticketRow(invalid.id)).scheduleBy).not.toBeNull();
    expect((await snapshot(invalid.id)).history).toMatchObject([{ toStatusId: readyId, fromStatusId: scheduledId, changedById: userId, notes: schedulingRepairNote }]);
    expect(await visitRows(none.id)).toHaveLength(0);
    expect(await snapshot(valid.id)).toEqual(validBefore);
    expect(await snapshot(unrelated.id)).toEqual(unrelatedBefore);
    expect(await repairUnplacedScheduledTickets(companyId)).toBe(0);
    await backfillVisitsFromTickets(companyId);
    expect(await visitRows(none.id)).toHaveLength(0);
    expect((await snapshot(invalid.id)).history).toHaveLength(1);
  }, 25_000);
});
