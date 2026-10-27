import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import { communications, flags, tickets, ticketStatusHistory } from "@workspace/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), board: vi.fn(), bids: vi.fn(), queue: vi.fn(), invoices: vi.fn(),
  getCommunicationStats: vi.fn(), contracts: vi.fn(), visible: vi.fn(),
}));
vi.mock("../db", () => ({ db: { select: mocks.select } }));
vi.mock("../storage", () => ({ storage: mocks }));
vi.mock("../lib/contractCenterPersistence", () => ({ contractsSection: mocks.contracts }));
vi.mock("./estimatesBoard", async original => ({
  ...await original<typeof import("./estimatesBoard")>(), loadEstimatesBoard: mocks.board,
}));
vi.mock("./schedulingQueue", () => ({ loadSchedulingQueue: mocks.queue }));
vi.mock("./bidsBoard", () => ({ loadBidsBoard: mocks.bids }));
vi.mock("./pendingInvoices", () => ({ loadPendingInvoices: mocks.invoices }));
vi.mock("../services/mailboxScope", () => ({ resolveVisibleMailboxes: mocks.visible }));

import {
  registerDashboardSectionsRoutes, loadDashboardSections, permittedSections,
  estimatesSummary, bidsSummary, schedulingSummary, invoicingSummary, contractsSummary, inboxSummary, mineSummary,
} from "./dashboardSections";
import type { UserWithContext } from "../auth";

const NOW = new Date("2026-10-27T01:00:00Z"); // Still Oct 26 in Colorado.
const user = { id: "viewer", activeCompanyId: "company-a", activeRole: "admin", activeTags: [], isSuperAdminBool: false } as unknown as UserWithContext;
const dialect = new PgDialect();
let byTable: Map<unknown, unknown[]>;
let predicates: { table: unknown; sql: string; params: unknown[] }[];
function app(viewer = user, authenticated = true) {
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = viewer;
    next();
  });
  registerDashboardSectionsRoutes(app);
  return app;
}
beforeEach(() => {
  vi.clearAllMocks();
  byTable = new Map();
  predicates = [];
  mocks.board.mockResolvedValue({ stages: Array.from({ length: 5 }, () => ({ tickets: [] })) });
  mocks.bids.mockResolvedValue({ stages: Array.from({ length: 6 }, () => ({ tickets: [] })) });
  mocks.queue.mockResolvedValue({ needsScheduling: [], slipped: [] });
  mocks.invoices.mockResolvedValue([]);
  mocks.getCommunicationStats.mockResolvedValue({ drafts: 0, openFollowUps: 0, overdueFollowUps: 0 });
  mocks.contracts.mockResolvedValue({ count: 0, overdue: 0, mostOverdue: null, rows: [] });
  mocks.visible.mockResolvedValue({ mailboxIds: null, includeNullMailbox: true });
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      const builder = {
        innerJoin: () => builder,
        where: (predicate: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          predicates.push({ table, ...dialect.sqlToQuery(predicate) });
          return builder;
        },
        orderBy: () => builder, groupBy: () => builder, limit: () => builder,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(byTable.get(table) ?? []).then(resolve),
      };
      return builder;
    },
  }));
});

describe("dashboard sections access and contract", () => {
  it("rejects unauthenticated requests before any source access", async () => {
    expect((await request(app(user, false)).get("/api/dashboard/sections")).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.board).not.toHaveBeenCalled();
  });
  it("requires an active company", async () => {
    expect((await request(app({ ...user, activeCompanyId: null } as unknown as UserWithContext)).get("/api/dashboard/sections")).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("returns all eight zero summaries, null oldest and explicit flow null for an empty company", async () => {
    const response = await request(app()).get("/api/dashboard/sections");
    expect(response.status).toBe(200);
    expect(response.body.sections.map((s: { key: string }) => s.key)).toEqual(["estimates", "bids", "scheduling", "invoicing", "inbox", "flags", "contracts", "mine"]);
    for (const section of response.body.sections) {
      expect(section).toMatchObject({ total: 0, overdue: 0, oldest: null, flow: null });
      expect(Object.keys(section).sort()).toEqual(["flow", "href", "key", "oldest", "overdue", "total"]);
    }
  });
  it("loads Scheduling and Mine only for field managers; hidden sources are never invoked", async () => {
    const response = await request(app({ ...user, activeRole: "field_manager" })).get("/api/dashboard/sections");
    expect(response.body.sections.map((s: { key: string }) => s.key)).toEqual(["scheduling", "mine"]);
    expect(mocks.board).not.toHaveBeenCalled();
    expect(mocks.bids).not.toHaveBeenCalled();
    expect(mocks.invoices).not.toHaveBeenCalled();
    expect(mocks.getCommunicationStats).not.toHaveBeenCalled();
    expect(mocks.contracts).not.toHaveBeenCalled();
  });
  it("matches billing navigation visibility rather than widening to billing API permissions", () => {
    expect(permittedSections({ ...user, activeRole: "office", activeTags: ["billing"] })).not.toContain("invoicing");
    expect(permittedSections({ ...user, activeRole: "field_manager", activeTags: ["billing"] })).not.toContain("invoicing");
    expect(permittedSections({ ...user, activeRole: "mapping", activeTags: [] })).toEqual([]);
    expect(permittedSections({ ...user, activeRole: "mapping", activeTags: ["billing"] })).toEqual(["mine"]);
    expect(permittedSections({ ...user, isSuperAdminBool: true })).toEqual(["invoicing", "mine"]);
  });
  it("returns an explicit API error instead of successful fabricated zeros", async () => {
    mocks.board.mockRejectedValueOnce(new Error("source unavailable"));
    expect((await request(app()).get("/api/dashboard/sections")).status).toBe(500);
  });
  it("passes active tenant and a single consistent time to shared sources; SQL stays scoped", async () => {
    await loadDashboardSections(user, NOW);
    expect(mocks.board).toHaveBeenCalledWith("company-a", NOW);
    expect(mocks.bids).toHaveBeenCalledWith("company-a", NOW);
    expect(mocks.queue).toHaveBeenCalledWith("company-a", NOW);
    expect(mocks.invoices).toHaveBeenCalledWith(user, { now: NOW });
    expect(mocks.getCommunicationStats).toHaveBeenCalledWith("company-a");
    expect(mocks.contracts).toHaveBeenCalledWith(expect.anything(), "company-a", "2026-10-26");
    for (const predicate of predicates) {
      expect(predicate.sql).toContain('"company_id"');
      expect(predicate.params).toContain("company-a");
    }
    await loadDashboardSections({ ...user, activeCompanyId: "company-b" }, NOW);
    expect(mocks.board).toHaveBeenLastCalledWith("company-b", NOW);
    expect(mocks.bids).toHaveBeenLastCalledWith("company-b", NOW);
    expect(mocks.queue).toHaveBeenLastCalledWith("company-b", NOW);
  });
  it("starts permitted sources concurrently", async () => {
    let release!: (value: unknown) => void;
    mocks.board.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const pending = loadDashboardSections(user, NOW);
    expect(mocks.queue).toHaveBeenCalled();
    expect(mocks.invoices).toHaveBeenCalled();
    expect(mocks.contracts).toHaveBeenCalled();
    release({ stages: [] });
    await pending;
  });
});

describe("section clocks and population parity", () => {
  it("keeps six-stage Bids separate and uses the seven-day threshold", async () => {
    mocks.bids.mockResolvedValue({ stages: [0, 1, 6, 7, 8, 21].map((daysInStage, id) => ({
      tickets: [{ id: `${id}`, title: `RFP ${id}`, statusName: "Renamed stage", customer: null, daysInStage }],
    })) });
    expect(await bidsSummary("company-a", NOW)).toMatchObject({
      key: "bids", href: "/dashboard/bids", total: 6, overdue: 3, oldest: { label: "RFP 5" },
    });
    expect(await estimatesSummary("company-a", NOW)).toMatchObject({ total: 0 });
  });
  it("sums all five actual board stages and uses established days-in-stage, including undated bids", async () => {
    mocks.board.mockResolvedValue({ stages: [0, 1, 7, 8, 21].map((daysInStage, id) => ({
      tickets: [{ id: `${id}`, title: `Bid ${id}`, statusName: "Renamed stage", customer: null, daysInStage }],
    })) });
    const result = await estimatesSummary("company-a", NOW);
    expect(result).toMatchObject({ total: 5, overdue: 3, oldest: { label: "Bid 4", detail: "Renamed stage · 21d" } });
  });
  it("uses the destination needs/slipped sets once each, deduplicates, and compares to Colorado today", async () => {
    const item = (id: string, scheduleBy: string | null) => ({ id, title: id, scheduleBy, customer: null });
    mocks.queue.mockResolvedValue({
      needsScheduling: [item("old", "2026-10-25"), item("today", "2026-10-26"), item("undated", null)],
      slipped: [item("old", "2026-10-25"), item("slipped", "2026-10-27")],
    });
    expect(await schedulingSummary("company-a", NOW)).toMatchObject({
      total: 4, overdue: 1, oldest: { label: "old", href: "/dashboard/tickets/old" },
    });
  });
  it("uses source RFB entry and not stale schedule-by, work-completed date, or invoice creation", async () => {
    mocks.invoices.mockResolvedValue([
      { id: "invoice", title: "Linked charge", kind: "invoice", createdAt: new Date("2026-10-25T18:00Z"),
        scheduleBy: "2026-01-01", sourceTicket: { id: "job", createdAt: new Date("2026-01-01") } },
      { id: "stranded", title: "Stranded", kind: "stranded", sourceTicket: { id: "stranded", createdAt: new Date("2026-01-01") } },
    ]);
    byTable.set(ticketStatusHistory, [
      { ticketId: "job", enteredAt: new Date("2026-10-19T18:00Z") }, // 7 Colorado days.
      { ticketId: "stranded", enteredAt: new Date("2026-10-20T18:00Z") }, // 6.
    ]);
    expect(await invoicingSummary(user, NOW)).toMatchObject({ total: 2, overdue: 1, oldest: { label: "Linked charge" } });
    const history = predicates.find(p => p.table === ticketStatusHistory)!;
    const entrySelection = mocks.select.mock.calls.find(([selection]) => selection?.enteredAt)?.[0].enteredAt;
    expect(dialect.sqlToQuery(entrySelection).sql).toContain('max("ticket_status_history"."created_at")');
    expect(history.params).toEqual(expect.arrayContaining(["company-a", "job", "stranded", "ready_for_billing"]));
    expect(history.sql).not.toContain("interval");
  });
  it("does not fabricate an overdue age when legacy billing history is absent", async () => {
    mocks.invoices.mockResolvedValue([{ id: "legacy", title: "Legacy", kind: "stranded", sourceTicket: { id: "legacy", createdAt: new Date("2020-01-01") } }]);
    expect(await invoicingSummary(user, NOW)).toMatchObject({ total: 1, overdue: 0, oldest: { detail: "Legacy" } });
  });
  it("reuses communication statistics exactly and applies mailbox restrictions to the oldest lookup", async () => {
    mocks.getCommunicationStats.mockResolvedValue({ drafts: 2, openFollowUps: 3, overdueFollowUps: 1 });
    mocks.visible.mockResolvedValue({ mailboxIds: ["allowed-mailbox"], includeNullMailbox: false });
    byTable.set(communications, [{ id: "comm", subject: "Call customer", followUpDueAt: new Date("2026-10-25T18:00Z") }]);
    expect(await inboxSummary(user, NOW)).toMatchObject({ total: 5, overdue: 1, oldest: { label: "Call customer" } });
    const predicate = predicates.find(p => p.table === communications)!;
    expect(predicate.params).toContain("allowed-mailbox");
    expect(predicate.sql).toContain('"deleted_at" is null');
    expect(predicate.sql).toContain('"follow_up_due_at" <');
  });
  it.each([[30, "Snow · 2026-11-25"], [-10, "Expired 2026-11-25"]] as const)(
    "maps shared counts and agreement destination with daysLeft %s", async (daysLeft, detail) => {
    mocks.contracts.mockResolvedValue({ count: 2, overdue: 1,
      mostOverdue: { agreementId: "agreement-a", customerName: "A", endDate: "2026-11-25", daysLeft },
      rows: [{ agreementId: "agreement-a", line: "snow" }] });
    expect(await contractsSummary("company-a", NOW)).toMatchObject({ total: 2, overdue: 1,
      oldest: { label: "A", detail, href: "/dashboard/contracts/agreement-a" } });
  });
  it("counts all unread flags as overdue from the sidebar's new-status population", async () => {
    byTable.set(flags, [{ total: 3, id: "flag", note: "Irrigation leak", createdAt: NOW }]);
    const response = await loadDashboardSections(user, NOW);
    expect(response.sections.find(s => s.key === "flags")).toMatchObject({ total: 3, overdue: 3 });
    expect(predicates.filter(p => p.table === flags).every(p => p.params.includes("new"))).toBe(true);
  });
  it("limits Mine to assigned actionable nonfinal tickets and excludes other section ownership by key", async () => {
    byTable.set(tickets, [{ id: "todo", title: "Personal", deadline: "2026-10-25" }, { id: "due", title: "Today", deadline: "2026-10-26" }]);
    expect(await mineSummary(user, NOW)).toMatchObject({ total: 2, overdue: 1, oldest: { label: "Personal" } });
    const predicate = predicates.find(p => p.table === tickets)!;
    expect(predicate.params).toEqual(expect.arrayContaining(["company-a", "viewer", "needs_action", "false"]));
    const deadlineSelection = mocks.select.mock.calls.find(([selection]) => selection?.deadline)?.[0].deadline;
    expect(dialect.sqlToQuery(deadlineSelection).sql).toContain("'America/Denver'");
    expect(predicate.sql).toContain("'ready_for_billing'");
    expect(predicate.sql).not.toContain('"name"');
    expect(predicate.sql).toContain("coalesce");
  });
  it("keeps query counts fixed as the permitted population grows, with no all-ticket loader or cap", async () => {
    const run = async (size: number) => {
      mocks.select.mockClear();
      mocks.invoices.mockResolvedValue(Array.from({ length: size }, (_, i) => ({
        id: `invoice-${i}`, title: "Charge", kind: "invoice", createdAt: NOW,
      })));
      byTable.set(tickets, Array.from({ length: size }, (_, i) => ({ id: `todo-${i}`, title: "Task", deadline: null })));
      const result = await loadDashboardSections(user, NOW);
      expect(result.sections.find(s => s.key === "mine")?.total).toBe(size);
      expect(result.sections.find(s => s.key === "invoicing")?.total).toBe(size);
      return mocks.select.mock.calls.length;
    };
    expect(await run(1001)).toBe(await run(1));
  });
});
