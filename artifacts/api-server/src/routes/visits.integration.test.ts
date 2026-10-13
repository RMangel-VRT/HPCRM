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
  ticketTypeFields, ticketFieldValues,
} from "@workspace/db";
import { db, pool } from "../db";
import { storage } from "../storage";
import { registerVisitRoutes } from "./visits";
import { applyVisitTicketEdit } from "../lib/visitTicketCompatibility";
import { applySchedulingTransition } from "../lib/schedulingTransition";
import { transactionalTicketPatch } from "../lib/ticketPatchTransaction";
import { pickProvided } from "../lib/patchBody";
import { maintainScheduleBy } from "../lib/scheduleByMaintenance";
import { dueDateExtendedToFuture as wasDueDateExtendedToFuture } from "../lib/dueDateDismissal";
import { backfillVisitsFromTickets } from "../lib/backfillVisits";
import { syncTicketFromVisits, lockVisitCompany } from "../lib/visitSync";
import { companyDateString, companyNoon, companyToday } from "../lib/companyDay";
import { findSeededStatus, isSeededStatus, isSeededTicketType } from "../shared/ticketCapabilities";
import { assertNotParentCustomer } from "../utils/parentGuard";
import { canSeeBilling, isBillingInvoiceAction } from "../lib/billing";
import { notifyTicketAssignment } from "../lib/ticketAssignmentNotification";
import { maybeAutoCreateInvoiceOnRfb } from "../lib/rfbInvoiceAutoCreate";
import { propagateInvoiceCompletion } from "../lib/invoiceCompletion";
import { registerCrewsAndMobileRoutes } from "./crewsAndMobile";
import { registerMobileTicketPhotosNotesRoutes } from "./mobileTicketPhotosNotes";
import { issueMobileToken } from "../mobileAuth";

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
function app(role = "admin", authenticated = true, activeCompanyId = companyId) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = { id: userId, activeCompanyId, activeRole: role } as Express.User;
    next();
  });
  registerVisitRoutes(app);
  const deps = {
    app, db, storage, transactionalTicketPatch, applyVisitTicketEdit, applySchedulingTransition,
    insertTicketSchema, pickProvided, maintainScheduleBy, wasDueDateExtendedToFuture,
    findSeededStatus, isSeededStatus, isSeededTicketType, assertNotParentCustomer,
    canSeeBilling, isBillingInvoiceAction, notifyTicketAssignment, maybeAutoCreateInvoiceOnRfb,
    propagateInvoiceCompletion, eq, and, sql,
    APPROVED_BILLING_STATUS_KEYS: ["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"],
    // Only the unrelated invoice-producing branch needs this bootstrap function.
    ensureInvoiceTicketType: async () => { throw new Error("Unexpected invoice bootstrap in visits test"); },
    sendPushToUser: async () => {},
  };
  new Function("deps", `const { ${Object.keys(deps).join(",")} } = deps; ${patchCode}`)(deps);
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
    expect((await request(app()).delete(`/api/visits/${r.body.id}`)).status).toBe(204);
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
    const response = await request(app()).patch(`/api/visits/${r.body.id}`).send({
      notes: null, customerId: foreignCustomerId, ticketId: randomUUID(), sourceType: "internal", companyId: foreignCompanyId, createdById: null,
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
    expect(conflict.body).toEqual({ error: "MULTIPLE_VISITS", message: "This job has several visits. Change them on the schedule." });
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
      expect((await request(app()).delete(`/api/visits/${r.body.id}`)).status).toBe(204);
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
