import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  companies, users, companyUsers, ticketTypes, ticketTypeStatuses, tickets, ticketStatusHistory, ticketLinks,
} from "@workspace/db";
import { db, pool } from "../db";
import { registerDashboardSectionsRoutes, loadDashboardSections } from "./dashboardSections";
import { loadEstimatesBoard } from "./estimatesBoard";
import { BID_STAGES, loadBidsBoard } from "./bidsBoard";
import { excludeBidsFromPersonalTickets } from "../lib/personalTicketScope";
import { storage } from "../storage";
import { loadSchedulingQueue } from "./schedulingQueue";
import type { UserWithContext } from "../auth";

const NOW = new Date("2026-10-27T01:00:00Z"); // Oct 26 Colorado.
const companyIds: string[] = [];
let viewer: UserWithContext;
let estimateTypeId: string, taskTypeId: string, todoTypeId: string;
let bidStatus: string, readyStatus: string, todoStatus: string, finalStatus: string;
const insertedTicketIds: string[] = [];
const app = express();
app.use((req, _res, next) => {
  req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
  req.user = viewer;
  next();
});
registerDashboardSectionsRoutes(app);

beforeAll(async () => {
  for (const name of ["Sections test", "Sections foreign"]) {
    const [company] = await db.insert(companies).values({ name: `${name} ${randomUUID()}`, slug: `sections-${randomUUID()}` }).returning();
    companyIds.push(company.id);
  }
  const [user] = await db.insert(users).values({ name: "Sections fixture", email: `sections-${randomUUID()}@example.invalid`, passwordHash: "not-a-login" }).returning();
  viewer = { ...user, activeCompanyId: companyIds[0], activeRole: "admin", activeTags: [], isSuperAdminBool: false };
  await db.insert(companyUsers).values({ companyId: companyIds[0], userId: user.id, role: "admin", status: "active" });
}, 30_000);
afterAll(async () => {
  if (insertedTicketIds.length) {
    await db.delete(ticketStatusHistory).where(inArray(ticketStatusHistory.ticketId, insertedTicketIds));
    await db.delete(tickets).where(inArray(tickets.id, insertedTicketIds));
  }
  if (companyIds.length) await db.delete(companies).where(inArray(companies.id, companyIds));
  if (viewer?.id) await db.delete(users).where(eq(users.id, viewer.id));
  await pool.end();
}, 30_000);

describe("dashboard sections real PostgreSQL regressions", () => {
  it("returns 200 for a truly empty tenant, including Mine's date expression", async () => {
    const response = await request(app).get("/api/dashboard/sections");
    expect(response.status).toBe(200);
    expect(response.body.sections).toHaveLength(8);
    for (const section of response.body.sections) {
      expect(section).toMatchObject({ total: 0, overdue: 0, oldest: null, flow: null });
    }
  });
  it("matches actual board/queue populations and handles schedule-by and Colorado due-date fallback", async () => {
    [estimateTypeId, taskTypeId, todoTypeId] = (await db.insert(ticketTypes).values([
      { companyId: companyIds[0], name: "Renamed estimate", typeKey: "estimate_request" },
      { companyId: companyIds[0], name: "Renamed task", typeKey: "task" },
      { companyId: companyIds[0], name: "Renamed personal", typeKey: "todo" },
    ]).returning()).map(row => row.id);
    [bidStatus, readyStatus, todoStatus, finalStatus] = (await db.insert(ticketTypeStatuses).values([
      { ticketTypeId: estimateTypeId, name: "Renamed sent", statusKey: "proposal_sent", displayOrder: 0 },
      { ticketTypeId: taskTypeId, name: "Renamed ready", statusKey: "ready_to_schedule", displayOrder: 0 },
      { ticketTypeId: todoTypeId, name: "Renamed new", statusKey: "new", displayOrder: 0 },
      { ticketTypeId: todoTypeId, name: "Renamed final", statusKey: "completed", isFinal: "true", displayOrder: 1 },
    ]).returning()).map(row => row.id);
    await db.insert(ticketTypeStatuses).values({ ticketTypeId: taskTypeId, name: "Renamed scheduled", statusKey: "scheduled", displayOrder: 1 });
    const rows = await db.insert(tickets).values([
      { companyId: companyIds[0], title: "Old bid", ticketTypeId: estimateTypeId, currentStatusId: bidStatus,
        assignedToId: viewer.id, createdAt: new Date("2026-10-01T18:00Z") },
      { companyId: companyIds[0], title: "Ready job", ticketTypeId: taskTypeId, currentStatusId: readyStatus,
        assignedToId: viewer.id, scheduleBy: "2026-10-25" },
      { companyId: companyIds[0], title: "Today in Colorado", ticketTypeId: todoTypeId, currentStatusId: todoStatus,
        assignedToId: viewer.id, dueDate: new Date("2026-10-27T01:00Z") },
      { companyId: companyIds[0], title: "Yesterday in Colorado", ticketTypeId: todoTypeId, currentStatusId: todoStatus,
        assignedToId: viewer.id, dueDate: new Date("2026-10-26T01:00Z") },
      { companyId: companyIds[0], title: "Schedule-by takes precedence", ticketTypeId: todoTypeId, currentStatusId: todoStatus,
        assignedToId: viewer.id, scheduleBy: "2026-10-28", dueDate: new Date("2026-10-01T01:00Z") },
      { companyId: companyIds[0], title: "Already final", ticketTypeId: todoTypeId, currentStatusId: finalStatus, assignedToId: viewer.id },
    ].map(row => ({ ...row, createdById: viewer.id }))).returning();
    insertedTicketIds.push(...rows.map(row => row.id));
    const [result, board, queue] = await Promise.all([
      loadDashboardSections(viewer, NOW), loadEstimatesBoard(companyIds[0], NOW), loadSchedulingQueue(companyIds[0], NOW),
    ]);
    expect(result.sections.find(s => s.key === "estimates")).toMatchObject({
      total: board.stages.reduce((n, stage) => n + stage.tickets.length, 0), overdue: 1,
    });
    expect(result.sections.find(s => s.key === "scheduling")).toMatchObject({
      total: queue.needsScheduling.length + queue.slipped.length, overdue: 1,
    });
    expect(result.sections.find(s => s.key === "mine")).toMatchObject({
      total: 3, overdue: 1, oldest: { label: "Yesterday in Colorado", detail: "2026-10-25" },
    });
    // Re-entry resets the stage clock and never uses an old schedule deadline.
    await db.insert(ticketStatusHistory).values({ ticketId: rows[0].id, toStatusId: bidStatus, changedById: viewer.id, createdAt: new Date("2026-10-26T18:00Z") });
    expect((await loadDashboardSections(viewer, NOW)).sections.find(s => s.key === "estimates")?.overdue).toBe(0);
  }, 30_000);
  it("isolates renamed RFPs across all stages, summary totals and Mine, including re-entry", async () => {
    const [type] = await db.insert(ticketTypes).values({
      companyId: companyIds[0], name: "Renamed contract opportunity", typeKey: "rfp_request",
    }).returning();
    const statuses = await db.insert(ticketTypeStatuses).values(BID_STAGES.flatMap(stage => stage.statusKeys.map(statusKey => ({
      ticketTypeId: type.id, name: `Renamed ${statusKey}`, statusKey, displayOrder: 0,
    })))).returning();
    const rows = await db.insert(tickets).values(statuses.map(status => ({
      companyId: companyIds[0], title: `Contract opportunity ${status.statusKey}`, ticketTypeId: type.id,
      currentStatusId: status.id, assignedToId: viewer.id, createdById: viewer.id, createdAt: new Date("2026-10-01T18:00Z"),
    }))).returning();
    insertedTicketIds.push(...rows.map(row => row.id));
    const bids = await loadBidsBoard(companyIds[0], NOW);
    expect(bids.stages.map(s => s.tickets.length)).toEqual([1, 2, 1, 1, 2, 1]);
    const estimates = await loadEstimatesBoard(companyIds[0], NOW);
    expect(estimates.stages.flatMap(s => s.tickets).every(t => t.typeKey === "estimate_request")).toBe(true);
    const sections = (await loadDashboardSections(viewer, NOW)).sections;
    expect(sections.find(s => s.key === "bids")).toMatchObject({ total: 8, overdue: 8 });
    expect(sections.find(s => s.key === "estimates")?.total).toBe(estimates.stages.flatMap(s => s.tickets).length);
    expect(sections.find(s => s.key === "mine")?.total).toBe(3);
    const assigned = await storage.getTickets(companyIds[0], { assignedToId: viewer.id });
    const personal = excludeBidsFromPersonalTickets(assigned, await storage.getTicketTypes(companyIds[0]));
    expect(assigned.some(t => rows.some(bid => bid.id === t.id))).toBe(true);
    expect(personal.some(t => rows.some(bid => bid.id === t.id))).toBe(false);
    expect(personal.some(t => t.ticketTypeId === estimateTypeId)).toBe(true);
    await db.insert(ticketStatusHistory).values([
      { ticketId: rows[0].id, toStatusId: statuses[0].id, changedById: viewer.id, createdAt: new Date("2026-10-02T18:00Z") },
      { ticketId: rows[0].id, toStatusId: statuses[0].id, changedById: viewer.id, createdAt: new Date("2026-10-26T18:00Z") },
      { ticketId: rows[0].id, toStatusId: statuses[1].id, changedById: viewer.id, createdAt: new Date("2026-10-27T00:00Z") },
    ]);
    expect((await loadBidsBoard(companyIds[0], NOW)).stages[0].tickets[0].daysInStage).toBe(0);
    expect((await loadDashboardSections(viewer, NOW)).sections.find(s => s.key === "bids")?.overdue).toBe(7);
  }, 30_000);
  it("never returns the populated tenant's rows from another active company", async () => {
    const result = await loadDashboardSections({ ...viewer, activeCompanyId: companyIds[1] }, NOW);
    expect(result.sections.every(s => s.total === 0 && s.oldest === null)).toBe(true);
  });
  it("counts linked pending invoices once and dates billing from the source RFB entry", async () => {
    const [invoiceType] = await db.insert(ticketTypes).values({ companyId: companyIds[0], name: "Renamed charges", typeKey: "invoice" }).returning();
    const [pending] = await db.insert(ticketTypeStatuses).values({
      ticketTypeId: invoiceType.id, name: "Renamed pending", statusKey: "pending_invoice", displayOrder: 0,
    }).returning();
    const [rfb] = await db.insert(ticketTypeStatuses).values({
      ticketTypeId: taskTypeId, name: "Renamed ready for billing", statusKey: "ready_for_billing", displayOrder: 2,
    }).returning();
    const created = await db.insert(tickets).values([
      { companyId: companyIds[0], title: "Linked source", ticketTypeId: taskTypeId, currentStatusId: rfb.id,
        createdById: viewer.id, billingBehavior: "invoice_required", scheduleBy: "2020-01-01" },
      { companyId: companyIds[0], title: "Linked invoice", ticketTypeId: invoiceType.id, currentStatusId: pending.id,
        createdById: viewer.id, createdAt: new Date("2026-10-26T18:00Z") },
      { companyId: companyIds[0], title: "Stranded source", ticketTypeId: taskTypeId, currentStatusId: rfb.id,
        createdById: viewer.id, billingBehavior: "invoice_required", scheduleBy: "2020-01-01", createdAt: new Date("2020-01-01") },
    ]).returning();
    insertedTicketIds.push(...created.map(row => row.id));
    await db.insert(ticketLinks).values({ sourceTicketId: created[0].id, targetTicketId: created[1].id, linkType: "invoice_for" });
    await db.insert(ticketStatusHistory).values([
      { ticketId: created[0].id, toStatusId: rfb.id, changedById: viewer.id, createdAt: new Date("2026-10-19T18:00Z") },
      { ticketId: created[2].id, toStatusId: rfb.id, changedById: viewer.id, createdAt: new Date("2026-10-26T18:00Z") },
    ]);
    const section = (await loadDashboardSections(viewer, NOW)).sections.find(s => s.key === "invoicing");
    expect(section).toMatchObject({ total: 2, overdue: 1, oldest: { label: "Linked invoice", detail: "Linked invoice · 7d" } });
    const mine = (await loadDashboardSections(viewer, NOW)).sections.find(s => s.key === "mine");
    expect(mine?.total).toBe(3); // RFB sources cannot enter personal work.
  }, 30_000);
  it("does not widen a field manager into office-only source populations", async () => {
    const result = await loadDashboardSections({ ...viewer, activeRole: "field_manager" }, NOW);
    expect(result.sections.map(s => s.key)).toEqual(["scheduling", "mine"]);
  });
});
