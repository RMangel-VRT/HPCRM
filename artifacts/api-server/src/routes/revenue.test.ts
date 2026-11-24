import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRole, ROLE_VALUES, type Role } from "../../../../lib/db/src/accessRole";
import type { ContractRevenueRow } from "../lib/contractRevenue";
import { registerRevenueRoutes } from "./revenue";

const mocks = vi.hoisted(() => ({
  paymentRows: vi.fn(), seasons: vi.fn(), tmCount: vi.fn(), snowPricing: vi.fn(), overview: vi.fn(), top: vi.fn(), db: {},
}));
vi.mock("../db", () => ({ db: mocks.db }));
vi.mock("../storage", () => ({ storage: { getRevenueOverview: mocks.overview, getTopCustomers: mocks.top } }));
vi.mock("../lib/contractRevenue", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/contractRevenue")>(),
  loadContractRevenueRows: mocks.paymentRows, loadContractRevenueSeasons: mocks.seasons, countInEffectSnowTm: mocks.tmCount,
  inEffectSnowPricing: mocks.snowPricing,
}));

const billing = "/api/revenue/contracts/billing?month=2026-10";
const matrix = "/api/revenue/contracts/by-customer?year=2026";
const overview = "/api/revenue/overview?month=10&year=2026";
const monthly = "/api/dashboard/monthly-revenue";
const top = "/api/dashboard/top-customers";
const remaining = ["contract-audit", "exceptions", "export/audit", "export/exceptions", "export/filtered", "export/matrix"]
  .map(path => `/api/revenue/${path}`);

function appFor(role: Role | null) {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      isAuthenticated: () => role !== null,
      user: role && { activeCompanyId: "scope", activeRole: role, accessRole: accessRole(role), isSuperAdminBool: true },
    });
    next();
  });
  registerRevenueRoutes(app);
  // The legacy handlers mount later in registerRoutes. They cannot run unless
  // the namespace guard lets the request through, including for super-admins.
  for (const path of remaining) app.get(path, (_req, res) => res.sendStatus(204));
  return app;
}

const row = {
  agreementId: "agreement", customerId: "owner", customerName: "Owner", termId: "new",
  seasonLabel: "Renewal", startDate: "2026-10-05", endDate: "2027-10-04",
  line: "both", form: "theirs", notRenewing: true, stream: "contract",
  component: "Landscape", month: "2026-10-01", isFee: false, amountCents: 12345,
} satisfies ContractRevenueRow;
const fee = { ...row, component: "Fee", isFee: true, amountCents: 55 };

describe("Revenue HTTP routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paymentRows.mockResolvedValue([row, fee]);
    mocks.tmCount.mockResolvedValue(3);
    mocks.snowPricing.mockResolvedValue({ snowTmCount: 3, hasFlatSnow: false });
    mocks.seasons.mockResolvedValue([row, { ...row, termId: "old", startDate: "2025-05-01" }]);
    mocks.overview.mockResolvedValue({ selectedMonthTotal: 22 });
    mocks.top.mockResolvedValue([{ id: "owner", name: "Owner", totalRevenue: 124, activeContracts: 2 }]);
  });

  it.each([null, ...ROLE_VALUES.filter(role => !["admin", "office", "account_manager"].includes(role))])(
    "denies %s on all Revenue and dashboard revenue routes before reading data",
    async role => {
      const app = appFor(role);
      const responses = await Promise.all([billing, matrix, overview, monthly, top, ...remaining].map(path => request(app).get(path)));
      expect(responses.map(response => response.status)).toEqual(Array(responses.length).fill(role ? 403 : 401));
      expect(mocks.paymentRows).not.toHaveBeenCalled();
      expect(mocks.overview).not.toHaveBeenCalled();
      expect(mocks.top).not.toHaveBeenCalled();
    },
  );

  it.each(["office", "admin", "account_manager"] as const)("allows %s, preserving dashboard and overview shapes", async role => {
    const app = appFor(role);
    const [bill, year, old, months, ranking] = await Promise.all(
      [billing, matrix, overview, `${monthly}?year=2026`, `${top}?limit=3`].map(path => request(app).get(path)),
    );
    expect([bill, year, old, months, ranking].map(response => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(bill.body).toEqual({
      month: "2026-10-01", totals: { amountCents: 12400, contractCents: 12400, snowCents: 0, feeCents: 55, landscapeCents: 12345, flatSnowCents: 0 },
      snowTmCount: 3, yearToDateCents: 12400, fullYearCents: 12400,
      customers: [{
        agreementId: "agreement", customerId: "owner", customerName: "Owner", termId: "new",
        seasonLabel: "Renewal", line: "both", form: "theirs", notRenewing: true, amountCents: 12400,
        lines: [{ component: "Fee", isFee: true, amountCents: 55 }, { component: "Landscape", isFee: false, amountCents: 12345 }],
      }],
    });
    expect(old.body).toEqual({ selectedMonthTotal: 22 });
    expect(months.body).toHaveLength(12);
    expect(months.body[9]).toEqual({ month: "Oct", revenue: 124 });
    expect(ranking.body).toEqual([{ id: "owner", name: "Owner", totalRevenue: 124, activeContracts: 2 }]);
    expect(mocks.top).toHaveBeenCalledWith("scope", 3);
    expect(mocks.overview).toHaveBeenCalledWith("scope", 10, 2026);
    expect(mocks.paymentRows).toHaveBeenCalledWith(mocks.db, "scope", "2026-01-01", "2026-12-01");
    expect(mocks.tmCount).toHaveBeenCalledWith(mocks.db, "scope", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(mocks.seasons).toHaveBeenCalledWith(mocks.db, "scope", ["agreement"], 2026);
  });

  it.each([["all", 12400], ["fee", 55], ["contract", 12345], ["snow", 0]] as const)(
    "keeps exact cents and renewal history for the %s filter",
    async (line, totalCents) => {
      const response = await request(appFor("office")).get(`${matrix}&line=${line}`);
      const months = [0, 0, 0, 0, 0, 0, 0, 0, 0, totalCents, 0, 0];
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ year: 2026, totalCents, monthTotals: months, snowTmCount: 3, hasFlatSnow: false, customers: totalCents ? [{
        customerId: "owner", customerName: "Owner", agreementId: "agreement", months, totalCents,
        seasonStarts: [{ month: "2026-10-01", seasonLabel: "Renewal" }],
      }] : [] });
    },
  );

  it("uses the same annual rows for billing rollups without leaking other months into the table", async () => {
    mocks.paymentRows.mockResolvedValue([row, fee, { ...row, month: "2026-01-01", amountCents: 300 },
      { ...row, month: "2026-12-01", amountCents: 700 }]);
    const response = await request(appFor("office")).get(billing).set("X-Company-Id", "scope").expect(200);
    expect(response.body).toMatchObject({ yearToDateCents: 12700, fullYearCents: 13400, totals: { amountCents: 12400 } });
    expect(response.body.customers[0].lines).toHaveLength(2);
    for (const path of [billing, matrix])
      await request(appFor("admin")).get(path).set("X-Company-Id", "old-company").expect(409);
    expect(mocks.paymentRows).toHaveBeenCalledTimes(1);
  });

  it.each([
    billing.split("?")[0], billing.replace("2026-10", "2026-13"), billing.replace("2026-10", "2026-1"),
    `${billing}&month=2026-11`, `${billing}&companyId=another`, `${billing}&month[]=2026-01`,
    matrix.split("?")[0], matrix.replace("2026", "0000"), matrix.replace("2026", "2026x"),
    `${matrix}&line=both`, `${matrix}&line=fee&line=snow`, `${matrix}&line[]=fee`,
    `${monthly}?year=bad`, `${top}?limit=-1`,
  ])("rejects malformed queries: %s", async path => {
    expect((await request(appFor("office")).get(path)).status).toBe(400);
    expect(mocks.paymentRows).not.toHaveBeenCalled();
    expect(mocks.top).not.toHaveBeenCalled();
  });

  it("defaults the dashboard month read to the Colorado year", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2027-01-01T05:00:00Z"));
      expect((await request(appFor("office")).get(monthly)).status).toBe(200);
      expect(mocks.paymentRows).toHaveBeenCalledWith(mocks.db, "scope", "2026-01-01", "2026-12-01");
    } finally {
      vi.useRealTimers();
    }
  });
});
