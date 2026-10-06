import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  communications,
  contracts,
  crews,
  customers,
  seasons,
  ticketLinks,
  tickets,
  users,
} from "@workspace/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getDashboardStats: vi.fn(),
  getMonthlyRevenueData: vi.fn(),
  getUpcomingRenewals: vi.fn(),
  getTicketTypes: vi.fn(),
  getTicketTypeStatuses: vi.fn(),
  where: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("../storage", () => ({
  storage: {
    getDashboardStats: mocks.getDashboardStats,
    getMonthlyRevenueData: mocks.getMonthlyRevenueData,
    getUpcomingRenewals: mocks.getUpcomingRenewals,
    getTicketTypes: mocks.getTicketTypes,
    getTicketTypeStatuses: mocks.getTicketTypeStatuses,
  },
}));

import { registerDashboardQueueRoutes } from "./dashboardQueue";

const COMPANY_ID = "company-1";
const NOW = new Date("2026-09-02T12:00:00.000Z");
const day = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000);
const dayFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const justOlderThan = (daysAgo: number) => new Date(day(daysAgo).getTime() - 60_000);

function createApp(args: { authenticated?: boolean; role?: string } = {}) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => args.authenticated ?? true;
    (req as any).user = {
      id: "user-1",
      activeCompanyId: COMPANY_ID,
      activeRole: args.role ?? "admin",
      isSuperAdminBool: false,
    };
    next();
  });
  registerDashboardQueueRoutes(app);
  return app;
}

function installDbRows(rowsByTable: Map<unknown, unknown[]>) {
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      const builder = {
        innerJoin: () => builder,
        where: async (predicate: any) => {
          mocks.where(table, new PgDialect().sqlToQuery(predicate));
          return rowsByTable.get(table) ?? [];
        },
      };
      return builder;
    },
  }));
}

function queryResult(rows: unknown[]) {
  const builder: any = {
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return builder;
}

function installDbSequence(rowsByQuery: unknown[][]) {
  const rows = [...rowsByQuery];
  mocks.select.mockImplementation(() => ({
    from: vi.fn(() => queryResult(rows.shift() ?? [])),
  }));
}

describe("GET /api/dashboard/action-queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mocks.getTicketTypes.mockResolvedValue([]);
    mocks.getTicketTypeStatuses.mockResolvedValue([]);
    installDbRows(new Map());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when unauthenticated without querying", async () => {
    const response = await request(createApp({ authenticated: false }))
      .get("/api/dashboard/action-queue");

    expect(response.status).toBe(401);
    expect(mocks.getTicketTypes).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("allows a field manager's empty assignee-only queue without querying protected sources", async () => {
    const response = await request(createApp({ role: "field_manager" }))
      .get("/api/dashboard/action-queue");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(mocks.where.mock.calls.map(([table]) => table)).toEqual([tickets]);
  });

  it("returns the complete zeroed shape for an empty company", async () => {
    const response = await request(createApp({ role: "office" }))
      .get("/api/dashboard/action-queue");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      total: 0,
      byFilter: {
        billing: 0,
        communications: 0,
        estimates: 0,
        contracts: 0,
        flags: 0,
      },
    });
  });

  it("assembles, sorts, enriches, and de-duplicates all queue sources with bounded queries", async () => {
    const typeRows = [
      { id: "type-invoice", name: "Invoice", typeKey: "invoice" },
      { id: "type-estimate", name: "Estimate Request", typeKey: "estimate_request" },
      { id: "type-project", name: "Project", typeKey: "project" },
      { id: "type-task", name: "Task", typeKey: "task" },
      { id: "type-rfp", name: "RFP Request", typeKey: "rfp_request" },
      { id: "type-todo", name: "To-Do", typeKey: "todo" },
    ];
    const statusRowsByType = new Map<string, any[]>([
      ["type-invoice", [
        { id: "status-pending", name: "Pending Invoice", statusKey: "pending_invoice", actionType: "needs_action", isFinal: "false" },
        { id: "status-invoiced", name: "Invoiced", statusKey: "invoiced", actionType: "needs_action", isFinal: "true" },
      ]],
      ["type-estimate", [
        { id: "status-proposal", name: "Proposal Sent", statusKey: "proposal_sent", actionType: "waiting", isFinal: "false" },
        { id: "status-new-estimate", name: "New", statusKey: "new", actionType: "needs_action", isFinal: "false" },
      ]],
      ["type-project", []],
      ["type-task", [
        { id: "status-rfb", name: "Ready for Billing", statusKey: "ready_for_billing", actionType: "needs_action", isFinal: "false" },
      ]],
      ["type-rfp", [
        { id: "status-maps", name: "Maps Requested", statusKey: "maps_requested", actionType: "waiting", isFinal: "false" },
      ]],
      ["type-todo", [
        { id: "status-new-todo", name: "Open", statusKey: "new", actionType: "needs_action", isFinal: "false" },
      ]],
    ]);
    mocks.getTicketTypes.mockResolvedValue(typeRows);
    mocks.getTicketTypeStatuses.mockImplementation(async (typeId: string) => statusRowsByType.get(typeId) ?? []);

    const ticketBase = {
      companyId: COMPANY_ID,
      customerId: "customer-1",
      assignedToId: "user-2",
      createdAt: day(20),
    };
    const ticketRows = [
      { ...ticketBase, id: "invoice", ticketTypeId: "type-invoice", currentStatusId: "status-pending", title: "Invoice review", updatedAt: justOlderThan(7) },
      { ...ticketBase, id: "linked-parent", ticketTypeId: "type-task", currentStatusId: "status-rfb", title: "Linked work", updatedAt: day(12) },
      { ...ticketBase, id: "linked-complete-parent", ticketTypeId: "type-task", currentStatusId: "status-rfb", title: "Already invoiced work", updatedAt: day(11) },
      { ...ticketBase, id: "stranded-parent", ticketTypeId: "type-task", currentStatusId: "status-rfb", title: "Stranded work", updatedAt: day(2) },
      { ...ticketBase, id: "proposal", ticketTypeId: "type-estimate", currentStatusId: "status-proposal", title: "Proposal waiting", updatedAt: justOlderThan(10) },
      { ...ticketBase, id: "blocked", ticketTypeId: "type-rfp", currentStatusId: "status-maps", title: "Maps missing", updatedAt: justOlderThan(5) },
      { ...ticketBase, id: "blocked-recent", ticketTypeId: "type-rfp", currentStatusId: "status-maps", title: "Maps just requested", updatedAt: day(4) },
      { ...ticketBase, id: "unassigned", ticketTypeId: "type-estimate", currentStatusId: "status-new-estimate", title: "New request", assignedToId: null, updatedAt: day(1) },
      { ...ticketBase, id: "assigned", ticketTypeId: "type-todo", currentStatusId: "status-new-todo", title: "Assigned task", updatedAt: day(1) },
    ];
    const communicationRows = [
      {
        id: "draft",
        customerId: "customer-2",
        subject: "Old draft",
        status: "draft",
        followUpStatus: "none",
        followUpDueAt: null,
        createdAt: day(6),
        updatedAt: justOlderThan(3),
      },
      {
        id: "followup",
        customerId: "customer-2",
        subject: "Call customer",
        status: "sent",
        followUpStatus: "open",
        followUpDueAt: day(3),
        createdAt: day(8),
        updatedAt: day(8),
      },
    ];
    const contractRows = [
      { id: "renewal-soon", customerId: "customer-3", endDate: dayFromNow(20), createdAt: day(300), updatedAt: day(2) },
      { id: "renewal-week", customerId: "customer-3", endDate: dayFromNow(40), createdAt: day(300), updatedAt: day(2) },
    ];

    installDbRows(new Map<unknown, unknown[]>([
      [tickets, ticketRows],
      [communications, communicationRows],
      [contracts, contractRows],
      [ticketLinks, [{
        id: "foreign-link",
        sourceTicketId: "foreign-parent",
        targetTicketId: "invoice",
        linkType: "invoice_for",
        createdAt: day(1),
      }, {
        id: "invoice-link",
        sourceTicketId: "linked-parent",
        targetTicketId: "invoice",
        linkType: "invoice_for",
        createdAt: day(1),
      }, {
        id: "completed-invoice-link",
        sourceTicketId: "linked-complete-parent",
        targetTicketId: "invoice-complete",
        linkType: "invoice_for",
        createdAt: day(1),
      }]],
      [customers, [
        { id: "customer-1", name: "Alpha HOA" },
        { id: "customer-2", name: "Bravo HOA" },
        { id: "customer-3", name: "Charlie HOA" },
      ]],
    ]));

    const response = await request(createApp()).get("/api/dashboard/action-queue");

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: any) => item.source)).toEqual([
      "contract_renewal",
      "stale_proposal",
      "pending_invoice",
      "comm_draft",
      "comm_followup",
      "blocked_rfp",
      "ready_for_billing",
      "unassigned_request",
      "contract_renewal",
    ]);
    expect(response.body.items.some((item: any) => item.id === "linked-parent")).toBe(false);
    expect(response.body.items.some((item: any) => item.id === "linked-complete-parent")).toBe(false);
    expect(response.body.items.some((item: any) => item.id === "blocked-recent")).toBe(false);

    const invoice = response.body.items.find((item: any) => item.id === "invoice");
    expect(invoice).toMatchObject({
      parentTicketId: "linked-parent",
      customerName: "Alpha HOA",
      verb: "Mark invoiced",
      amountCents: null,
      ticketType: { name: "Invoice", typeKey: "invoice" },
      ticketStatus: {
        name: "Pending Invoice",
        statusKey: "pending_invoice",
        actionType: "needs_action",
        isFinal: "false",
      },
      action: {
        kind: "patch",
        method: "PATCH",
        endpoint: "/api/tickets/invoice",
        payload: { currentStatusId: "status-invoiced" },
        undoPayload: { currentStatusId: "status-pending" },
        optimistic: "remove",
        confirmation: {
          confirmLabel: "Mark invoiced",
        },
      },
    });
    expect(invoice).not.toHaveProperty("amount");

    const strandedParent = response.body.items.find((item: any) => item.id === "stranded-parent");
    expect(strandedParent).toMatchObject({
      verb: "Open",
      parentTicketId: null,
      action: null,
      ticketType: { name: "Task", typeKey: "task" },
      ticketStatus: { statusKey: "ready_for_billing" },
    });

    const followup = response.body.items.find((item: any) => item.id === "followup");
    expect(followup).toMatchObject({
      verb: "Mark done",
      action: {
        kind: "patch",
        method: "PATCH",
        endpoint: "/api/communications/followup",
        payload: { followUpStatus: "done" },
        undoPayload: {
          followUpStatus: "open",
          followUpDueAt: day(3).toISOString(),
        },
        optimistic: "remove",
      },
    });

    const unassigned = response.body.items.find((item: any) => item.id === "unassigned");
    expect(unassigned).toMatchObject({
      verb: "Assign to me",
      action: {
        kind: "patch",
        method: "PATCH",
        endpoint: "/api/tickets/unassigned",
        payload: { assignedToId: "user-1" },
        undoPayload: { assignedToId: null },
        optimistic: "remove",
      },
    });

    expect(response.body.items.filter((item: any) => item.action !== null)).toHaveLength(3);

    expect(response.body).toMatchObject({
      total: 9,
      byFilter: {
        billing: 2,
        communications: 2,
        estimates: 2,
        contracts: 2,
        flags: 0,
      },
    });
    expect(mocks.getTicketTypes).toHaveBeenCalledTimes(1);
    expect(mocks.getTicketTypeStatuses).toHaveBeenCalledTimes(6);
    expect(mocks.select).toHaveBeenCalledTimes(6);
  });

  function schedulingFixtures(ticketRows: any[]) {
    const types = ["task", "project", "estimate_request", "invoice", "custom"].map(key => ({
      id: `type-${key}`, typeKey: key === "custom" ? null : key, name: `Renamed ${key}`,
    }));
    mocks.getTicketTypes.mockResolvedValue(types);
    mocks.getTicketTypeStatuses.mockImplementation(async (id: string) =>
      ["new", "ready_to_schedule", "scheduled", "custom_open", "closed", "ready_for_billing"].map(key => ({
        id: `${id}-${key}`, ticketTypeId: id, name: `Renamed ${key}`,
        statusKey: key === "custom_open" ? null : key,
        isFinal: key === "closed" ? "true" : "false",
      })),
    );
    installDbRows(new Map<unknown, unknown[]>([
      [tickets, ticketRows],
      [users, [{ id: "creator", name: "Creator Name" }]],
      [communications, [{ id: "private-comm", status: "draft", subject: "Private", createdAt: day(6) }]],
      [contracts, [{ id: "private-contract", endDate: dayFromNow(20) }]],
    ]));
  }

  function schedulingTicket(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id, companyId: COMPANY_ID, ticketTypeId: "type-task",
      currentStatusId: "type-task-new", assignedToId: "user-1",
      createdById: "creator", title: id, createdAt: day(1), updatedAt: day(1),
      scheduleBy: null, followUpDate: null, followUpNote: null, ...overrides,
    };
  }

  it("uses seeded identities, creation aging and creator headlines; retains unassigned precedence", async () => {
    schedulingFixtures([
      schedulingTicket("mine", { createdAt: day(5), updatedAt: day(0), followUpDate: "2026-09-02" }),
      schedulingTicket("project", { ticketTypeId: "type-project", currentStatusId: "type-project-new" }),
      schedulingTicket("other", { assignedToId: "user-2" }),
      schedulingTicket("unassigned", { assignedToId: null, followUpDate: "2026-09-02" }),
      schedulingTicket("estimate", { ticketTypeId: "type-estimate_request", currentStatusId: "type-estimate_request-new" }),
      schedulingTicket("foreign", { companyId: "company-2" }),
    ]);
    const { body } = await request(createApp()).get("/api/dashboard/action-queue");
    expect(body.items.find((item: any) => item.id === "mine")).toMatchObject({
      source: "new_for_you", band: "overdue", ageDays: 5, verb: "Open", action: null,
      headline: "mine — New · from Creator Name",
    });
    expect(body.items.find((item: any) => item.id === "project")).toMatchObject({
      source: "new_for_you", band: "today", action: null,
    });
    expect(body.items.find((item: any) => item.id === "unassigned").source).toBe("unassigned_request");
    for (const id of ["other", "estimate", "foreign"]) {
      expect(body.items.some((item: any) => item.id === id)).toBe(false);
    }
    expect(body.items.filter((item: any) => item.id === "mine")).toHaveLength(1);
    expect(body.byFilter.flags).toBe(0);
    expect(body.byFilter.estimates).toBe(1);
  });

  it.each([
    ["2026-09-04T12:00:00", "2026-09-05T23:59:00", "today"],
    ["2026-09-04T12:00:00", "2026-09-06T23:59:00", "today"],
    ["2026-09-04T12:00:00", "2026-09-07T23:59:00", "today"],
    ["2026-09-04T12:00:00", "2026-09-08T00:00:00", "overdue"],
    ["2026-09-05T12:00:00", "2026-09-07T12:00:00", "today"],
  ])("ages New by business days from %s through %s", async (created, now, band) => {
    vi.setSystemTime(new Date(now));
    schedulingFixtures([schedulingTicket("new", { createdAt: new Date(created) })]);
    const { body } = await request(createApp()).get("/api/dashboard/action-queue");
    expect(body.items.find((item: any) => item.id === "new").band).toBe(band);
  });

  it("uses Colorado server-local day at UTC midnight, with DST-safe calendar lateness", async () => {
    vi.stubEnv("TZ", "America/Denver");
    try {
      vi.setSystemTime(new Date("2026-09-03T01:00:00Z")); // Still Sep 2 locally.
      schedulingFixtures([
        schedulingTicket("today", { currentStatusId: "type-task-ready_to_schedule", scheduleBy: "2026-09-02" }),
        schedulingTicket("tomorrow", { currentStatusId: "type-task-scheduled", followUpDate: "2026-09-03" }),
        schedulingTicket("due", { currentStatusId: "type-task-scheduled", followUpDate: "2026-09-02" }),
      ]);
      const { body } = await request(createApp()).get("/api/dashboard/action-queue");
      expect(body.items.filter((item: any) => item.ticketType).map((item: any) => item.id)).toEqual(["due"]);
      vi.setSystemTime(new Date("2026-03-09T00:01:00-06:00"));
      schedulingFixtures([schedulingTicket("dst", {
        currentStatusId: "type-task-ready_to_schedule", scheduleBy: "2026-03-07",
      })]);
      const result = await request(createApp()).get("/api/dashboard/action-queue");
      expect(result.body.items.find((item: any) => item.id === "dst").ageDays).toBe(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("honors schedule-by and follow-up boundaries, all open metadata, final exclusion and deduplication", async () => {
    const ready = { currentStatusId: "type-task-ready_to_schedule", scheduleBy: "2026-09-01" };
    schedulingFixtures([
      schedulingTicket("late", { ...ready, followUpDate: "2026-09-01" }),
      schedulingTicket("late-null", ready),
      schedulingTicket("follow-today", { ...ready, followUpDate: "2026-09-02" }),
      schedulingTicket("follow-future", { ...ready, followUpDate: "2026-09-03" }),
      schedulingTicket("schedule-today", { ...ready, scheduleBy: "2026-09-02" }),
      schedulingTicket("schedule-future", { ...ready, scheduleBy: "2026-09-03" }),
      schedulingTicket("scheduled", { currentStatusId: "type-task-scheduled", followUpDate: "2026-09-02", followUpNote: `  ${"a".repeat(70)}  ` }),
      schedulingTicket("custom", { ticketTypeId: "type-custom", currentStatusId: "type-custom-custom_open", followUpDate: "2026-09-01" }),
      schedulingTicket("custom-ready", { ticketTypeId: "type-custom", currentStatusId: "type-custom-ready_to_schedule", scheduleBy: "2026-09-01" }),
      schedulingTicket("final", { currentStatusId: "type-task-closed", followUpDate: "2026-09-01" }),
      schedulingTicket("billing", { currentStatusId: "type-task-ready_for_billing", followUpDate: "2026-09-01" }),
    ]);
    const { body } = await request(createApp({ role: "office" })).get("/api/dashboard/action-queue");
    const ticketItems = body.items.filter((item: any) => item.ticketType);
    expect(ticketItems).toHaveLength(7);
    expect(new Set(body.items.map((item: any) => item.id)).size).toBe(body.total);
    expect(ticketItems.find((item: any) => item.id === "late")).toMatchObject({
      source: "past_schedule_by", band: "overdue", verb: "Open", action: null,
      headline: "late — Schedule by Tue Sep 1 · 1 days late",
    });
    expect(ticketItems.find((item: any) => item.id === "follow-today")).toMatchObject({ source: "followup_due", band: "today" });
    expect(ticketItems.find((item: any) => item.id === "scheduled").headline).toBe(`scheduled — Follow up · ${"a".repeat(60)}`);
    expect(ticketItems.find((item: any) => item.id === "custom")).toMatchObject({ source: "followup_due", ticketStatus: { statusKey: null } });
    expect(ticketItems.find((item: any) => item.id === "custom-ready").source).toBe("past_schedule_by");
    expect(ticketItems.find((item: any) => item.id === "billing").source).toBe("ready_for_billing");
    const queries = mocks.where.mock.calls.filter(([table]) => table === tickets).map(([, query]) => query);
    expect(queries).toHaveLength(2);
    expect(queries[0].params).toContain("type-custom-ready_to_schedule");
    expect(queries[0].params).not.toContain("type-task-scheduled");
    expect(queries[0].params).not.toContain("type-custom-custom_open");
    expect(queries[1].sql).toContain('"tickets"."follow_up_date" <=');
    expect(queries[1].sql).toContain("NOT IN");
    expect(queries[1].sql).toContain('"ticket_type_statuses"."is_final"');
    expect(queries[1].params).toEqual([COMPANY_ID, "2026-09-02", COMPANY_ID]);
  });

  it.each(["field_manager", "field", "chemical_manager", "irrigation_manager", "landscape_supervisor", "crew_supervisor", "shop_manager", "mapping"])(
    "limits %s to own company-scoped scheduling signals and never reads protected sources", async role => {
      schedulingFixtures([
        schedulingTicket("mine"),
        schedulingTicket("late", { currentStatusId: "type-task-ready_to_schedule", scheduleBy: "2026-09-01" }),
        schedulingTicket("follow", { currentStatusId: "type-project-scheduled", ticketTypeId: "type-project", followUpDate: "2026-09-02" }),
        schedulingTicket("other", { assignedToId: "user-2" }),
        schedulingTicket("unassigned", { assignedToId: null }),
        schedulingTicket("foreign", { companyId: "company-2" }),
        schedulingTicket("bill", { currentStatusId: "type-task-ready_for_billing", followUpDate: "2026-09-02" }),
        schedulingTicket("invoice", { ticketTypeId: "type-invoice", currentStatusId: "type-invoice-new", followUpDate: "2026-09-02" }),
        schedulingTicket("estimate", { ticketTypeId: "type-estimate_request", currentStatusId: "type-estimate_request-scheduled", followUpDate: "2026-09-02" }),
      ]);
      const response = await request(createApp({ role })).get("/api/dashboard/action-queue");
      expect(response.status).toBe(200);
      expect(response.body.items.map((item: any) => item.id)).toEqual(["late", "mine", "follow"]);
      expect(response.body.items.every((item: any) => item.action === null)).toBe(true);
      expect(Object.values(response.body.byFilter)).toEqual([0, 0, 0, 0, 0]);
      const queries = mocks.where.mock.calls;
      expect(queries.some(([table]) => [communications, contracts, ticketLinks].includes(table))).toBe(false);
      for (const [, query] of queries.filter(([table]) => table === tickets)) {
        expect(query.sql).toContain('"tickets"."assigned_to_id" =');
        expect(query.params).toContain("user-1");
        expect(query.params).toContain(COMPANY_ID);
      }
    },
  );
});

describe("GET /api/dashboard/pulse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mocks.getDashboardStats.mockResolvedValue({
      customersCount: 0,
      activeContractsCount: 0,
      monthlyRevenue: 0,
      ytdRevenue: 0,
    });
    mocks.getMonthlyRevenueData.mockResolvedValue([]);
    mocks.getUpcomingRenewals.mockResolvedValue([]);
    mocks.getTicketTypes.mockResolvedValue([]);
    mocks.getTicketTypeStatuses.mockResolvedValue([]);
    installDbSequence([[], [], []]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when unauthenticated and 403 to field-facing roles", async () => {
    const unauthenticated = await request(createApp({ authenticated: false }))
      .get("/api/dashboard/pulse");
    const fieldFacing = await request(createApp({ role: "field_manager" }))
      .get("/api/dashboard/pulse");

    expect(unauthenticated.status).toBe(401);
    expect(fieldFacing.status).toBe(403);
    expect(mocks.getDashboardStats).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns every pulse key with dense revenue and safe empty values", async () => {
    const response = await request(createApp({ role: "office" }))
      .get("/api/dashboard/pulse");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      stats: {
        customersCount: 0,
        activeContractsCount: 0,
        monthlyRevenue: 0,
        ytdRevenue: 0,
      },
      revenue: {
        year: 2026,
        months: Array(12).fill(0),
        priorYear: 2025,
        priorMonths: Array(12).fill(0),
      },
      unbilledTicketCount: 0,
      avgDaysCloseToInvoice: null,
      activeSeason: null,
      nextSeason: null,
      snowBook: {
        activeSnowContracts: 0,
        expiringBeforeSeasonStart: 0,
      },
      renewals: [],
      crewsToday: [],
    });
  });

  it("assembles billing, season, snow, renewal, and crew metrics with stable keys", async () => {
    mocks.getDashboardStats.mockResolvedValue({
      customersCount: 17,
      activeContractsCount: 9,
      monthlyRevenue: 12000,
      ytdRevenue: 80000,
    });
    mocks.getMonthlyRevenueData
      .mockResolvedValueOnce([
        { month: "Jan", revenue: 100 },
        { month: "Mar", revenue: 300 },
      ])
      .mockResolvedValueOnce([
        { month: "2", revenue: 200 },
        { month: "Dec", revenue: 1200 },
      ]);
    mocks.getUpcomingRenewals.mockResolvedValue([{
      contractId: "contract-renewal",
      customerId: "customer-renewal",
      customerName: "Renewal HOA",
      serviceType: "Maintenance",
      endDate: new Date("2026-10-01T00:00:00.000Z"),
      daysUntilExpiry: 29,
    }]);
    mocks.getTicketTypes.mockResolvedValue([
      { id: "type-project", name: "Renamed project", typeKey: "project" },
      { id: "type-task", name: "Renamed task", typeKey: "task" },
      { id: "type-invoice", name: "Renamed invoice", typeKey: "invoice" },
    ]);
    mocks.getTicketTypeStatuses.mockImplementation(async (typeId: string) =>
      typeId === "type-task"
        ? [{ id: "status-ready", name: "Renamed ready", statusKey: "ready_for_billing" }]
        : [{ id: "status-invoiced", name: "Renamed invoiced", statusKey: "invoiced" }],
    );
    installDbSequence([
      [
        { id: "season-active", name: "Summer", startDate: "2026-04-01", endDate: "2026-10-31" },
        { id: "season-next", name: "Winter", startDate: "2026-11-15", endDate: "2027-03-31" },
      ],
      [
        { endDate: new Date("2026-10-15T00:00:00.000Z") },
        { endDate: new Date("2026-12-15T00:00:00.000Z") },
      ],
      [{ count: 4 }],
      [{ crewId: "crew-1", crewName: "North Crew", stops: 8, complete: 5, flagged: 1 }],
      [{ id: "invoice-1", createdAt: new Date("2026-08-20T12:00:00.000Z") }],
      [{
        sourceTicketId: "source-1",
        targetTicketId: "invoice-1",
        workCompletedDate: new Date("2026-08-16T12:00:00.000Z"),
      }],
    ]);

    const response = await request(createApp()).get("/api/dashboard/pulse");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      stats: {
        customersCount: 17,
        activeContractsCount: 9,
        monthlyRevenue: 12000,
        ytdRevenue: 80000,
      },
      unbilledTicketCount: 4,
      avgDaysCloseToInvoice: 4,
      activeSeason: {
        id: "season-active",
        name: "Summer",
        startDate: "2026-04-01",
        endDate: "2026-10-31",
      },
      nextSeason: {
        id: "season-next",
        name: "Winter",
        startDate: "2026-11-15",
      },
      snowBook: {
        activeSnowContracts: 2,
        expiringBeforeSeasonStart: 1,
      },
      renewals: [{
        contractId: "contract-renewal",
        customerId: "customer-renewal",
        customerName: "Renewal HOA",
        serviceType: "Maintenance",
        endDate: "2026-10-01T00:00:00.000Z",
        daysUntilExpiry: 29,
      }],
      crewsToday: [{
        crewId: "crew-1",
        crewName: "North Crew",
        stops: 8,
        complete: 5,
        flagged: 1,
      }],
    });
    expect(response.body.revenue.months).toEqual([
      100, 0, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(response.body.revenue.priorMonths).toEqual([
      0, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1200,
    ]);
  });
});