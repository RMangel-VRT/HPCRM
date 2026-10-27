import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  contracts,
  crews,
  seasons,
  ticketLinks,
  tickets,
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

function queryResult(rows: unknown[], table?: unknown) {
  const builder: any = {
    innerJoin: vi.fn(() => builder),
    where: vi.fn((predicate: any) => {
      mocks.where(table, new PgDialect().sqlToQuery(predicate));
      return builder;
    }),
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
    from: vi.fn((table: unknown) => queryResult(rows.shift() ?? [], table)),
  }));
}

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

  it.each([
    ["2026-10-09T20:00:00-06:00", "2026-10-09", "2026-10-09T06:00:00.000Z", "2026-10-10T06:00:00.000Z"],
    ["2026-03-08T20:00:00-06:00", "2026-03-08", "2026-03-08T07:00:00.000Z", "2026-03-09T06:00:00.000Z"],
    ["2026-11-01T20:00:00-07:00", "2026-11-01", "2026-11-01T06:00:00.000Z", "2026-11-02T07:00:00.000Z"],
  ])("pulse at %s uses Colorado windows and projects instants, not calendar-only dates", async (instant, date, start, end) => {
    vi.setSystemTime(new Date(instant));
    installDbSequence([
      [
        { id: "calendar", name: "Calendar", startDate: date, endDate: date },
        { id: "instant", name: "Instant", startDate: new Date(start), endDate: new Date(instant).toISOString() },
      ],
      [], [{ crewId: "crew", crewName: "Crew", stops: 1, complete: 0, flagged: 0 }],
    ]);
    const response = await request(createApp()).get("/api/dashboard/pulse");
    expect(response.status).toBe(200);
    expect(response.body.activeSeason).not.toBeNull();
    const query = mocks.where.mock.calls.find(([table]) => table === tickets)![1];
    expect(query.params).toContain(start);
    expect(query.params).toContain(end);
    expect(query.sql).toContain('"tickets"."due_date" >=');
    expect(query.sql).toContain('"tickets"."due_date" <');
    expect(response.body.crewsToday[0].stops).toBe(1);
    // Test instant-only season separately so calendar-string row cannot mask it.
    installDbSequence([
      [{ id: "instant", name: "Instant", startDate: new Date(start), endDate: new Date(instant).toISOString() }], [], [],
    ]);
    const result = await request(createApp()).get("/api/dashboard/pulse");
    expect(result.body.activeSeason.id).toBe("instant");
  });

  it("pulse revenue year remains Colorado's year on December 31 evening", async () => {
    vi.setSystemTime(new Date("2026-12-31T20:00:00-07:00"));
    const { body } = await request(createApp()).get("/api/dashboard/pulse");
    expect(body.revenue.year).toBe(2026);
    expect(body.revenue.priorYear).toBe(2025);
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