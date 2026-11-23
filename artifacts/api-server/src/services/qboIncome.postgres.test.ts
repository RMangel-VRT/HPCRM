import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessRole, type Role } from "../../../../lib/db/src/accessRole";
import { incomeData, incomeReport, incomeSection } from "../test/qboIncomeFixture";

const remote = vi.hoisted(() => vi.fn());
vi.mock("./qboClient", () => ({ qboRequest: remote }));

const statusPath = "/api/revenue/qbo/status";
const accountsPath = "/api/revenue/qbo/accounts";
const refreshPath = "/api/revenue/qbo/refresh";

describe.runIf(process.env.RUN_RV2_POSTGRES_TEST === "1")("Revenue QuickBooks routes in disposable PostgreSQL", () => {
  let deps: typeof import("../db");
  let closeSchemaPool: () => Promise<void>;
  let registerRevenueRoutes: typeof import("../routes/revenue").registerRevenueRoutes;

  function appFor(role: Role | null, activeCompanyId = "rv2-a") {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, {
        isAuthenticated: () => role !== null,
        user: role && { id: "rv2-user", activeCompanyId, activeRole: role, accessRole: accessRole(role) },
      });
      next();
    });
    registerRevenueRoutes(app);
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
    });
    return request(app);
  }

  const reportWithIncome = (year: number, id: string, name: string, amount: string, feb = "") =>
    Response.json(incomeReport(year, [incomeSection([incomeData(id, name, amount, feb)])]));

  beforeAll(async () => {
    if (!process.env.RV2_TEST_SOCKET?.startsWith("/tmp/rv2-income.")) {
      throw new Error("Run RV2 against a verified private PostgreSQL fixture socket");
    }
    deps = await import("../db");
    closeSchemaPool = () => import("@workspace/db").then(({ pool }) => pool.end());
    const identity = await deps.db.execute(sql`
      select current_database() as db, current_user as role, inet_server_addr() is null as unix,
        current_setting('unix_socket_directories') as socket
    `);
    expect(identity.rows).toEqual([{
      db: "rv2_income_test", role: "rv2_test", unix: true, socket: process.env.RV2_TEST_SOCKET,
    }]);
    ({ registerRevenueRoutes } = await import("../routes/revenue"));
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // UTC is already January 2027, but Colorado is still in 2026.
    vi.setSystemTime(new Date("2027-01-01T05:30:00Z"));
    remote.mockReset();
    await deps.db.execute(sql`
      truncate revenue_qbo_income_months, revenue_qbo_income_years, revenue_income_accounts,
        qbo_connections, users, companies;
      insert into companies (id, slug, name) values ('rv2-a', 'rv2-a', 'A'), ('rv2-b', 'rv2-b', 'B');
      insert into users (id, name, password_hash) values ('rv2-user', 'Admin', 'not-a-password');
      insert into qbo_connections (company_id, realm_id, status, access_token_enc, refresh_token_enc, token_expires_at)
        values ('rv2-a', 'synthetic-a', 'connected', 'synthetic', 'synthetic', now()),
               ('rv2-b', 'synthetic-b', 'connected', 'synthetic', 'synthetic', now());
    `);
  });

  afterAll(async () => {
    await deps?.pool.end();
    await closeSchemaPool?.();
  });
  afterEach(() => vi.useRealTimers());

  it("gates reads and writes by signed-in access role and scopes the connection status", async () => {
    remote.mockResolvedValue(Response.json({ QueryResponse: {} }));
    expect((await appFor(null).get(statusPath)).status).toBe(401);
    expect((await appFor("field").get(accountsPath)).status).toBe(403);
    expect((await appFor("admin", "").get(statusPath)).status).toBe(403);
    const office = appFor("office");
    expect((await office.get(statusPath)).body).toEqual({ connected: true, years: [], unmappedCount: 0 });
    expect((await office.get(accountsPath)).status).toBe(200);
    expect((await office.put(accountsPath).send([])).status).toBe(403);
    expect((await office.post(refreshPath).send({ year: 2025 })).status).toBe(403);
    expect(remote).toHaveBeenCalledTimes(1);
    expect((await appFor("account_manager").put(accountsPath).send([])).status).toBe(200);
  });

  it("checks the company expectation and exact body shapes before any provider calls", async () => {
    const admin = appFor("admin");
    expect((await admin.put(accountsPath).set("X-Company-Id", "rv2-b").send([])).status).toBe(409);
    expect((await admin.post(refreshPath).set("X-Company-Id", "rv2-b").send({ year: 2026 })).status).toBe(409);
    for (const body of [{ year: 2014 }, { year: 2027 }, { year: "2025" }, { year: 2025.5 }, { year: 2025, companyId: "rv2-b" }]) {
      expect((await admin.post(refreshPath).send(body)).status).toBe(400);
    }
    for (const body of [
      { qboAccountId: "1", stream: "contract" },
      [{ qboAccountId: "1" }], [{ qboAccountId: "1", stream: "" }], [{ qboAccountId: " ", stream: "other" }],
      [{ qboAccountId: "1", stream: "other", companyId: "rv2-b" }],
      [{ qboAccountId: "1", stream: "other" }, { qboAccountId: "1", stream: null }],
    ]) {
      const response = await admin.put(accountsPath).send(body);
      expect(response.status, JSON.stringify(response.body)).toBe(400);
    }
    expect(remote).not.toHaveBeenCalled();
  });

  it("replaces just the requested company/year, preserves mappings, and retains historic and active IDs", async () => {
    const admin = appFor("admin");
    const refresh = async (companyId: string, year: number, accountId: string, name: string, amount: string, feb?: string) => {
      remote.mockResolvedValueOnce(reportWithIncome(year, accountId, name, amount, feb));
      const response = await appFor("admin", companyId).post(refreshPath).set("X-Company-Id", companyId).send({ year });
      expect(response.status).toBe(200);
      expect(remote).toHaveBeenLastCalledWith(companyId, "GET",
        `/reports/ProfitAndLoss?start_date=${year}-01-01&end_date=${year}-12-31&accounting_method=Accrual&summarize_column_by=Month`);
      return response.body;
    };
    const y25 = await refresh("rv2-a", 2025, "old", "Historic job", "100", "-5.21");
    expect((await admin.get(statusPath)).body).toEqual({ connected: true, years: [y25], unmappedCount: 1 });
    await refresh("rv2-b", 2026, "foreign", "Foreign company", "300");
    await refresh("rv2-a", 2026, "old", "Historic job", "21");
    const active = () => Response.json({ QueryResponse: { Account: [
      { Id: "active", Name: "Active but never pulled", Active: true },
      { Id: "old", Name: "Inactive, use report name", Active: false },
    ] } });

    remote.mockResolvedValueOnce(active());
    const saved = await admin.put(accountsPath).send([
      { qboAccountId: "active", stream: "exclude" }, { qboAccountId: "old", stream: "projects" },
    ]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    remote.mockResolvedValueOnce(active());
    expect((await admin.put(accountsPath).send([
      { qboAccountId: "old", stream: "snow" }, { qboAccountId: "foreign", stream: "other" },
    ])).status).toBe(400);

    const y26 = await refresh("rv2-a", 2026, "active", "Active report name", "50");
    remote.mockResolvedValueOnce(active());
    expect((await appFor("office").get(accountsPath)).body).toEqual([
      { qboAccountId: "active", name: "Active but never pulled", stream: "exclude", active: true, lastYearCents: 0 },
      { qboAccountId: "old", name: "Historic job", stream: "projects", active: false, lastYearCents: 9479 },
    ]);
    expect((await admin.get(statusPath)).body).toEqual({ connected: true, years: [y26, y25], unmappedCount: 0 });
    expect((await deps.db.execute(sql`
      select company_id, qbo_account_id, month::text, amount_cents from revenue_qbo_income_months
      order by company_id, month
    `)).rows).toEqual([
      { company_id: "rv2-a", qbo_account_id: "old", month: "2025-01-01", amount_cents: 10000 },
      { company_id: "rv2-a", qbo_account_id: "old", month: "2025-02-01", amount_cents: -521 },
      { company_id: "rv2-a", qbo_account_id: "active", month: "2026-01-01", amount_cents: 5000 },
      { company_id: "rv2-a", qbo_account_id: "active", month: "2026-02-01", amount_cents: 0 },
      { company_id: "rv2-b", qbo_account_id: "foreign", month: "2026-01-01", amount_cents: 30000 },
      { company_id: "rv2-b", qbo_account_id: "foreign", month: "2026-02-01", amount_cents: 0 },
    ]);
    expect((await deps.db.execute(sql`
      select account_name, updated_by from revenue_income_accounts where company_id = 'rv2-a' and qbo_account_id = 'active'
    `)).rows).toEqual([{ account_name: "Active report name", updated_by: "rv2-user" }]);
    expect((await admin.put(accountsPath).send([{ qboAccountId: "old", stream: null }])).status).toBe(200);
    expect((await admin.get(statusPath)).body.unmappedCount).toBe(1);
  });

  it("keeps prior months and metadata after a provider, parse or SQL failure; records a valid empty year", async () => {
    const admin = appFor("admin");
    remote.mockResolvedValueOnce(reportWithIncome(2025, "before", "Original", "10"));
    const first = await admin.post(refreshPath).send({ year: 2025 });
    expect(first.status).toBe(200);
    vi.setSystemTime(new Date("2027-01-01T05:31:00Z"));
    remote.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await admin.post(refreshPath).send({ year: 2025 })).status).toBe(502);
    remote.mockResolvedValueOnce(Response.json({ ...incomeReport(2025, []), Rows: null }));
    expect((await admin.post(refreshPath).send({ year: 2025 })).status).toBe(502);
    await deps.db.execute(sql`alter table revenue_income_accounts add constraint rv2_test_failure check (account_name <> 'Fail locally')`);
    try {
      remote.mockImplementationOnce(async () => {
        // Stand-in for independently committed token rotation by qboRequest.
        await deps.db.execute(sql`update qbo_connections set access_token_enc = 'rotated' where company_id = 'rv2-a'`);
        return reportWithIncome(2025, "bad", "Fail locally", "99");
      });
      expect((await admin.post(refreshPath).send({ year: 2025 })).status).toBe(500);
      expect((await deps.db.execute(sql`select access_token_enc from qbo_connections where company_id = 'rv2-a'`)).rows)
        .toEqual([{ access_token_enc: "rotated" }]);
    } finally {
      await deps.db.execute(sql`alter table revenue_income_accounts drop constraint rv2_test_failure`);
    }
    expect((await admin.get(statusPath)).body).toEqual({ connected: true, years: [first.body], unmappedCount: 1 });
    expect((await deps.db.execute(sql`select qbo_account_id, amount_cents from revenue_qbo_income_months order by month`)).rows)
      .toEqual([{ qbo_account_id: "before", amount_cents: 1000 }, { qbo_account_id: "before", amount_cents: 0 }]);

    remote.mockResolvedValueOnce(Response.json({ ...incomeReport(2025, []), Rows: {} }));
    const empty = await admin.post(refreshPath).send({ year: 2025 });
    expect(empty.status).toBe(200);
    expect(empty.body.fetchedAt).not.toBe(first.body.fetchedAt);
    expect((await deps.db.execute(sql`select * from revenue_qbo_income_months`)).rows).toEqual([]);
    expect((await admin.get(statusPath)).body).toEqual({ connected: true, years: [empty.body], unmappedCount: 1 });
  });

  it("reports a disconnected refresh without contacting QuickBooks and still serves history", async () => {
    remote.mockResolvedValueOnce(reportWithIncome(2025, "old", "Historic job", "-2"));
    expect((await appFor("admin").post(refreshPath).send({ year: 2025 })).status).toBe(200);
    await deps.db.execute(sql`delete from qbo_connections where company_id = 'rv2-a'`);
    remote.mockClear();
    expect((await appFor("admin").post(refreshPath).send({ year: 2025 })).status).toBe(503);
    expect((await appFor("office").get(statusPath)).body).toMatchObject({ connected: false, unmappedCount: 1 });
    expect((await appFor("office").get(accountsPath)).body).toEqual([
      { qboAccountId: "old", name: "Historic job", stream: null, active: false, lastYearCents: -200 },
    ]);
    expect((await appFor("admin").put(accountsPath).send([{ qboAccountId: "new", stream: "snow" }])).status).toBe(503);
    expect(remote).not.toHaveBeenCalled();
  });

  it("fetches before taking the company/year lock and waits for it before replacing the mirror", async () => {
    const held = await deps.pool.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await held.query("begin");
      await held.query("select pg_advisory_xact_lock(hashtextextended('revenue-qbo-income:rv2-a:2025', 0))");
      remote.mockResolvedValueOnce(reportWithIncome(2025, "1", "Income", "10"));
      pending = appFor("admin").post(refreshPath).send({ year: 2025 }).then(response => response);
      await vi.waitFor(async () => {
        expect(remote).toHaveBeenCalledTimes(1);
        const waiting = await held.query("select count(*)::int as count from pg_locks where locktype = 'advisory' and not granted");
        expect(waiting.rows).toEqual([{ count: 1 }]);
      });
      expect((await held.query("select * from revenue_qbo_income_years")).rows).toEqual([]);
    } finally {
      await held.query("rollback");
      held.release();
      if (pending) expect((await pending).status).toBe(200);
    }
  });

  it("rejects malformed remote accounts instead of allowing bogus mappings", async () => {
    const badAccounts = () => Response.json({ QueryResponse: { Account: [{ Name: "No ID" }] } });
    remote.mockResolvedValueOnce(badAccounts()).mockResolvedValueOnce(badAccounts());
    expect((await appFor("office").get(accountsPath)).status).toBe(502);
    expect((await appFor("admin").put(accountsPath).send([{ qboAccountId: "undefined", stream: "snow" }])).status).toBe(502);
    expect((await deps.db.execute(sql`select * from revenue_income_accounts`)).rows).toEqual([]);
  });
});
