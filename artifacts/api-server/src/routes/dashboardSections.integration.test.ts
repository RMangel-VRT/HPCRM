import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  companies, users, companyUsers, ticketTypes, ticketTypeStatuses, tickets, ticketStatusHistory, ticketLinks,
  customers, estimates, estimateVersions,
} from "@workspace/db";
import { compareRows, flattenActionBoard, isAction } from "@workspace/db/estimate-contracts";
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
  viewer = { ...user, activeCompanyId: companyIds[0], activeRole: "admin", accessRole: "admin", activeTags: [], isSuperAdminBool: false };
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
      total: flattenActionBoard(board).filter(row => isAction(row.nextAction.bucket)).length,
      overdue: flattenActionBoard(board).filter(row => isAction(row.nextAction.bucket) && row.nextAction.urgency === "red").length,
    });
    expect(result.sections.find(s => s.key === "scheduling")).toMatchObject({
      total: queue.needsScheduling.length + queue.slipped.length, overdue: 1,
    });
    expect(result.sections.find(s => s.key === "mine")).toMatchObject({
      total: 3, overdue: 1, oldest: { label: "Yesterday in Colorado", detail: "Yesterday in Colorado · 1d" },
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
    expect(sections.find(s => s.key === "estimates")?.total).toBe(flattenActionBoard(estimates).filter(row => isAction(row.nextAction.bucket)).length);
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
  it("matches Action Center counts and first actionable row at fixed now, not raw stage ages", async () => {
    const [company] = await db.insert(companies).values({ name: "Action parity fixture", slug: `action-${randomUUID()}` }).returning();
    companyIds.push(company.id);
    await db.insert(companyUsers).values({ companyId: company.id, userId: viewer.id, role: "admin", status: "active" });
    const [customer] = await db.insert(customers).values({
      companyId: company.id, name: "Action customer", street: "Test", city: "Test", state: "CO", zip: "00000",
    }).returning();
    const [type] = await db.insert(ticketTypes).values({ companyId: company.id, name: "Estimate", typeKey: "estimate_request" }).returning();
    const statuses = await db.insert(ticketTypeStatuses).values(
      ["new", "estimating", "proposal_draft", "proposal_sent", "decision_received", "ready_to_schedule"].map(statusKey => ({
        ticketTypeId: type.id, name: statusKey, statusKey, displayOrder: 0,
      })),
    ).returning();
    const statusId = (key: string) => statuses.find(s => s.statusKey === key)!.id;
    const dayAgo = (days: number) => new Date(Date.parse("2026-10-26T18:00:00Z") - days * 86_400_000);
    const specs = [
      { id: "won", status: "ready_to_schedule", age: 500, bucket: "won", urgency: null },
      { id: "waiting", status: "proposal_sent", age: 400, sent: 0, follow: "2026-11-10", bucket: "waiting", urgency: null },
      { id: "b", status: "proposal_sent", age: 4, sent: 40, bucket: "follow_up", urgency: "red" },
      { id: "a", status: "proposal_sent", age: 4, sent: 40, bucket: "follow_up", urgency: "red" },
      { id: "expiry5", status: "proposal_sent", age: 3, sent: 25, bucket: "follow_up", urgency: "red" },
      { id: "expiry6", status: "proposal_sent", age: 100, sent: 24, follow: "2026-11-10", bucket: "waiting", urgency: null },
      { id: "late2", status: "proposal_sent", age: 1, sent: 1, follow: "2026-10-24", bucket: "follow_up", urgency: "red" },
      { id: "late1", status: "proposal_sent", age: 90, sent: 1, follow: "2026-10-25", bucket: "follow_up", urgency: "amber" },
      { id: "due", status: "proposal_sent", age: 0, sent: 0, follow: "2026-10-26", bucket: "follow_up", urgency: "amber" },
      { id: "unanswered7", status: "proposal_sent", age: 7, sent: 7, bucket: "follow_up", urgency: "amber" },
      { id: "sent6", status: "proposal_sent", age: 6, sent: 6, bucket: "waiting", urgency: null },
      { id: "idle10", status: "estimating", age: 200, edited: 10, bucket: "finish", urgency: "red" },
      { id: "idle9", status: "estimating", age: 100, edited: 9, bucket: "finish", urgency: "amber" },
      { id: "idle5", status: "estimating", age: 5, edited: 5, bucket: "finish", urgency: "amber" },
      { id: "idle4", status: "estimating", age: 4, edited: 4, bucket: "finish", urgency: null },
      { id: "start3", status: "new", age: 3, bucket: "start", urgency: "red" },
      { id: "start2", status: "new", age: 2, bucket: "start", urgency: null },
      { id: "assigned3", status: "new", age: 3, assigned: true, bucket: "start", urgency: "amber" },
      { id: "send", status: "proposal_draft", age: 3, edited: 0, bucket: "send", urgency: "amber" },
      { id: "decide", status: "decision_received", age: 100, bucket: "decide", urgency: "amber" },
    ];
    const prefix = randomUUID();
    for (const spec of specs) {
      const id = `${prefix}-${spec.id}`;
      await db.insert(tickets).values({
        id, companyId: company.id, customerId: customer.id, title: spec.id, ticketTypeId: type.id,
        currentStatusId: statusId(spec.status), createdById: viewer.id, createdAt: dayAgo(spec.age),
        assignedToId: spec.assigned ? viewer.id : null, followUpDate: spec.follow ?? null,
      });
      insertedTicketIds.push(id);
      if (spec.sent !== undefined || spec.edited !== undefined) {
        const [estimate] = await db.insert(estimates).values({
          companyId: company.id, customerId: customer.id, ticketId: id, title: spec.id, estimateNumber: spec.id,
        }).returning();
        const [version] = await db.insert(estimateVersions).values({
          companyId: company.id, estimateId: estimate.id, versionNumber: 1,
          status: spec.sent !== undefined ? "sent" : "draft",
          sentAt: spec.sent !== undefined ? dayAgo(spec.sent) : null,
          updatedAt: dayAgo(spec.edited ?? 0),
        }).returning();
        await db.update(estimates).set({ currentVersionId: version.id }).where(eq(estimates.id, estimate.id));
      }
    }
    const [board, sections] = await Promise.all([
      loadEstimatesBoard(company.id, NOW), loadDashboardSections({ ...viewer, activeCompanyId: company.id }, NOW),
    ]);
    const rows = flattenActionBoard(board);
    for (const spec of specs) expect(rows.find(row => row.title === spec.id)?.nextAction).toMatchObject({
      bucket: spec.bucket, urgency: spec.urgency,
    });
    // These are the unfiltered Action Center Needs action and Urgent populations.
    const needs = rows.filter(row => isAction(row.nextAction.bucket)).sort(compareRows);
    const urgent = needs.filter(row => row.nextAction.urgency === "red");
    expect(needs).toHaveLength(16);
    expect(urgent).toHaveLength(6);
    const first = needs[0];
    expect(first.id).toBe(`${prefix}-a`); // deterministic tie, despite red/amber rows with much greater stage ages
    expect(sections.sections.find(s => s.key === "estimates")).toEqual({
      key: "estimates", href: "/dashboard/estimates", total: needs.length, overdue: urgent.length, flow: null,
      oldest: { label: customer.name, detail: "", reason: first.nextAction.reason, href: `/dashboard/tickets/${first.id}` },
    });
    // With just waiting/won left, neither the old ages nor future follow-ups create work.
    await db.delete(tickets).where(inArray(tickets.id, needs.map(row => row.id)));
    expect((await loadDashboardSections({ ...viewer, activeCompanyId: company.id }, NOW)).sections.find(s => s.key === "estimates"))
      .toMatchObject({ total: 0, overdue: 0, oldest: null });
  }, 30_000);
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
