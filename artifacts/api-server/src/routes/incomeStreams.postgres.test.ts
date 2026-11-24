import { sql } from "drizzle-orm";
import express from "express";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessRole, type Role } from "../../../../lib/db/src/accessRole";
import * as companyDay from "../lib/companyDay";

vi.mock("../storage", () => ({ storage: {} }));
const provider = vi.hoisted(() => ({
  request: vi.fn(() => { throw new Error("Forecast reads must not call QuickBooks"); }),
}));
vi.mock("../services/qboClient", () => ({ qboRequest: provider.request }));

const path = "/api/revenue";
const income = (year: number) => `${path}/income?year=${year}`;
const projection = `${path}/plan/2027/projection`;
const targets = `${path}/targets/2027`;
const fromPlan = `${targets}/from-plan`;
const fill = (amount: number) => Array<number>(12).fill(amount);

describe.runIf(process.env.RUN_RV4_POSTGRES_TEST === "1")("income forecast routes in disposable PostgreSQL", () => {
  let deps: typeof import("../db");
  let register: typeof import("./revenue").registerRevenueRoutes;

  function appFor(role: Role | null, activeCompanyId = "a") {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => role !== null, user: role && { id: "actor", activeCompanyId, accessRole: accessRole(role) } });
      next();
    });
    register(app);
    const onError: express.ErrorRequestHandler = (err, _req, res, _next) => {
      res.status(500).json({ message: err.message });
    };
    app.use(onError);
    return request(app);
  }

  beforeAll(async () => {
    if (!process.env.RV4_TEST_SOCKET?.startsWith("/tmp/rv4-income.")) {
      throw new Error("Run RV4 against a verified private PostgreSQL fixture socket");
    }
    deps = await import("../db");
    const identity = await deps.db.execute(sql`select current_database() as db, current_user as role,
      inet_server_addr() is null as unix, current_setting('unix_socket_directories') as socket`);
    expect(identity.rows).toEqual([{ db: "rv4_income_test", role: "rv4_test", unix: true, socket: process.env.RV4_TEST_SOCKET }]);
    ({ registerRevenueRoutes: register } = await import("./revenue"));
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (!deps) return;
    await deps.pool.end();
    await (await import("@workspace/db")).pool.end();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(companyDay, "companyToday").mockReturnValue("2026-11-23");
    provider.request.mockClear();
    await deps.db.execute(sql`
      truncate revenue_targets, revenue_plans, revenue_qbo_income_years, revenue_qbo_income_months, revenue_income_accounts,
        estimate_versions, estimates, term_billing_months, agreement_terms, agreements, customers, users, companies;
      insert into companies (id, slug, name) values ('a', 'a', 'A'), ('b', 'b', 'B');
      insert into users (id, name, password_hash) values ('actor', 'Actor', 'not-a-password');
      insert into customers (id, company_id, name, street, city, state, zip) values
        ('owner-a', 'a', 'Owner A', '', '', 'CO', ''), ('owner-b', 'b', 'Owner B', '', '', 'CO', '');
      insert into agreements (id, company_id, customer_id) values
        ('falls-back', 'a', 'owner-a'), ('not-renewing', 'a', 'owner-a'), ('foreign', 'b', 'owner-b'), ('wrong-owner', 'a', 'owner-b');
      insert into agreement_terms (id, company_id, agreement_id, start_date, end_date, season_label,
        line, form, status, billing_type, annual_price_cents, renewed_from_term_id, non_renewal_on, non_renewal_reason, created_at)
      values
        ('source', 'a', 'falls-back', '2020-03-01', '2026-12-31', '2026', 'landscape', 'theirs', 'active', 'monthly_variable', null, null, null, null, '2020-02-01'),
        ('older-draft', 'a', 'falls-back', '2027-01-01', '2027-12-31', '2027', 'landscape', 'ours', 'draft', 'monthly_variable', 50000, 'source', null, null, '2026-10-01'),
        ('correct-draft', 'a', 'falls-back', '2027-01-01', '2027-12-31', '2027', 'landscape', 'ours', 'sent', 'monthly_variable', 60000, 'source', null, null, '2026-11-01'),
        ('unrelated-draft', 'a', 'falls-back', '2027-01-01', '2027-12-31', '2027', 'landscape', 'ours', 'draft', 'monthly_variable', 70000, 'old-unrelated-source', null, null, '2026-11-22'),
        ('leaving', 'a', 'not-renewing', '2026-03-01', '2027-11-30', '2026–27', 'landscape', 'ours', 'signed', 'monthly_variable', 5000, null, '2026-10-01', 'price', '2026-02-01'),
        ('foreign', 'b', 'foreign', '2026-01-01', '2026-12-31', '2026', 'landscape', 'ours', 'signed', 'monthly_variable', 99999, null, null, null, '2026-01-01'),
        ('wrong-owner', 'a', 'wrong-owner', '2026-01-01', '2026-12-31', '2026', 'landscape', 'ours', 'signed', 'monthly_variable', 99999, null, null, null, '2026-01-01');
      insert into term_billing_months (company_id, term_id, month, component, is_fee, amount_cents) values
        ('a', 'source', '2020-02-01', 'Pre-start', false, 900000),
        ('a', 'source', '2020-03-01', 'Base', false, 12000),
        ('a', 'source', '2020-03-01', 'Fee', true, 50000),
        ('a', 'source', '2020-09-01', 'Base', false, 12000),
        ('a', 'source', '2021-03-01', 'Base', false, 50000),
        ('a', 'source', '2025-12-01', 'Base', false, 1249),
        ('a', 'source', '2026-10-01', 'Base', false, 5600),
        ('a', 'source', '2026-11-01', 'Fee', true, 199),
        ('a', 'leaving', '2026-11-01', 'Base', false, 399),
        ('a', 'leaving', '2027-01-01', 'Base', false, 220),
        ('a', 'leaving', '2027-10-01', 'Base', false, 320),
        ('b', 'source', '2026-11-01', 'Wrong company', false, 900000),
        ('b', 'foreign', '2026-11-01', 'Base', false, 900000),
        ('a', 'wrong-owner', '2026-11-01', 'Base', false, 900000);
      insert into revenue_qbo_income_years (company_id, year, fetched_at) values
        ('a', 2024, '2026-11-23 00:00:00'), ('a', 2026, '2026-11-23 00:00:00'), ('b', 2025, '2026-11-23 00:00:00');
      insert into revenue_income_accounts (company_id, qbo_account_id, account_name, stream) values
        ('a', 'one', 'Maintenance', 'contract'), ('a', 'out', 'Excluded', 'exclude'), ('a', 'null', 'Other account', null),
        ('b', 'one', 'Account One', 'snow');
      insert into revenue_qbo_income_months (company_id, qbo_account_id, month, amount_cents, fetched_at) values
        ('a', 'one', '2026-10-01', 20000, '2026-11-23'), ('a', 'one', '2026-11-01', 500000, '2026-11-23'),
        ('a', 'out', '2026-10-01', 500000, '2026-11-23'), ('a', 'null', '2026-10-01', 599, '2026-11-23'),
        ('a', 'one', '2025-12-01', 500000, '2026-11-23'), ('b', 'one', '2025-12-01', 500000, '2026-11-23');
    `);
  });

  it("returns local snapshots only, including empty pulls, the missing closed year and current-only risk", async () => {
    const office = appFor("office");
    const old = await office.get(income(2025)).expect(200);
    expect(old.body).toMatchObject({ qbo: { loaded: false, fetchedAt: null, unmappedCount: 0 }, qboMissing: true,
      closedThrough: "2025-12-01", targetMonths: null, totals: { forecastCents: 1249, earnedCents: null, targetCents: null } });
    expect(old.body).not.toHaveProperty("concentration");
    const empty = await office.get(income(2024)).expect(200);
    expect(empty.body).toMatchObject({ qbo: { loaded: true }, qboMissing: false, totals: { earnedCents: 0, signedCents: 0 } });
    const current = await office.get(income(2026)).expect(200);
    expect(current.headers["cache-control"]).toBe("no-store");
    expect(current.body).toMatchObject({
      closedThrough: "2026-10-01", qbo: { loaded: true, fetchedAt: "2026-11-23T00:00:00.000Z", unmappedCount: 1 },
      streams: { contract: { earnedCents: 20000, signedCents: 598 }, other: { earnedCents: 599 } },
      concentration: { top5: [{ customerId: "owner-a", customerName: "Owner A", cents: 6198, shareOfContractPct: 100 }] },
    });
    const foreign = await appFor("admin", "b").get(income(2025)).expect(200);
    expect(foreign.body).toMatchObject({ streams: { snow: { earnedCents: 500000 }, contract: { earnedCents: 0 } } });
    expect(provider.request).not.toHaveBeenCalled();
  });

  it("loads each source once for the plan and uses the matching renewal draft and scoped estimate versions", async () => {
    const mount = appFor("office");
    expect((await mount.get(projection).expect(200)).body.pipeline).toEqual({ acceptedLast12Cents: 0, sentOpenCents: 0, winRatePct: null });
    await deps.db.execute(sql`
      insert into estimates (id, company_id, customer_id, estimate_number, title, voided_at) values
        ('live', 'a', 'owner-a', '1', 'Live', null), ('void', 'a', 'owner-a', '2', 'Voided', '2026-11-22'),
        ('foreign', 'b', 'owner-b', '1', 'Foreign', null);
      insert into estimate_versions (company_id, estimate_id, version_number, status, accepted_on, declined_at, frozen_subtotal_cents) values
        ('a', 'live', 1, 'accepted', '2026-11-23', null, 990000),
        ('a', 'live', 2, 'sent', null, null, 450000),
        ('a', 'live', 3, 'declined', null, '2025-11-24 07:00:00', 550000),
        ('a', 'live', 4, 'declined', null, '2025-11-24 06:59:59', 550000),
        ('a', 'live', 5, 'superseded', '2026-11-22', null, 550000),
        ('a', 'void', 1, 'accepted', '2026-11-22', null, 600000),
        ('a', 'foreign', 1, 'sent', null, null, 700000),
        ('b', 'live', 6, 'sent', null, null, 800000);
    `);
    const query = vi.spyOn(pg.Client.prototype, "query");
    const plan = await mount.get(projection).expect(200);
    const reads = () => query.mock.calls.map(([call]) => typeof call === "string" ? call : (call as { text?: string }).text ?? "")
      .filter(text => /^select /i.test(text));
    expect(reads().map(text => text.match(/from "([^"]+)"/)?.[1])).toEqual([
      "term_billing_months", "agreements", "revenue_qbo_income_years", "revenue_qbo_income_months",
      "revenue_income_accounts", "revenue_plans", "revenue_targets", "estimate_versions",
    ]);
    expect(plan.body).toMatchObject({
      plan: { saved: false }, base: { contract: { earnedCents: 20000, signedCents: 598 } },
      planned: { contract: { estimatedCents: 12 * 1854, signedCents: 540 }, projects: { forecastCents: 0, signedCents: 0 } },
      bridge: { lost: [{ agreementId: "not-renewing", reason: "price", lastMonth: "2027-10-01", cents: 399 }],
        startCents: 20598, carriedCents: 20199, signedCents: 540, expectedCents: 12 * 1854, totalCents: 540 + 12 * 1854 },
      renewalsPending: [{ agreementId: "falls-back", annualCents: 24000, renewalDraft: { status: "sent", annualCents: 60000 } }],
      laterRenewalsCount: 0, pipeline: { acceptedLast12Cents: 990000, sentOpenCents: 450000, winRatePct: 50 },
    });
    query.mockClear();
    const trends = await mount.get(`${path}/income/years?from=2018&to=2027`).expect(200);
    expect(trends.body.years).toHaveLength(10);
    expect(trends.body.years[9].totals).toEqual({ lastYearCents: 21197, forecastCents: 540 + 12 * 1854 });
    expect(trends.body.monthsByStream.all[9].months[0]).toBe(220 + 1854);
    expect(reads()).toHaveLength(6);
    await mount.get(`${path}/income/years?from=2018&to=2018`).expect(200);
    expect(reads()).toHaveLength(10);
    expect(provider.request).not.toHaveBeenCalled();
  });

  it("replaces only the nominated company's five streams after rounding the same planned months", async () => {
    const admin = appFor("admin"), office = appFor("office"), other = appFor("admin", "b");
    await admin.put(targets).send({ streams: { projects: fill(33) } }).expect(200);
    const untouchedYear = `${path}/targets/2026`;
    await admin.put(untouchedYear).send({ streams: { contract: fill(11) } }).expect(200);
    await other.put(targets).send({ streams: { snow: fill(22) } }).expect(200);
    const untouched = () => deps.db.execute(sql`select * from revenue_targets
      where company_id <> 'a' or month < '2027-01-01' or month >= '2028-01-01'
      order by company_id, stream, month`).then(result => result.rows);
    const before = await untouched();
    await office.post(fromPlan).expect(403);
    await admin.post(fromPlan).set("X-Company-Id", "b").expect(409);
    const planned = (await office.get(projection).expect(200)).body.planned;
    const saved = await admin.post(fromPlan).set("X-Company-Id", "a").expect(200);
    expect(saved.body).toEqual((await office.get(targets).expect(200)).body);
    expect(saved.body).toMatchObject({ year: 2027, saved: true,
      streams: { contract: [2100, ...fill(1900).slice(1, 9), 2200, 1900, 1900], projects: fill(0) } });
    expect(Object.keys(saved.body.streams)).toEqual(["contract", "snow", "irrigation", "projects", "extra"]);
    for (const stream of Object.keys(saved.body.streams)) {
      expect(saved.body.streams[stream]).toEqual(planned[stream].months.map(
        (m: { earnedCents: number | null; signedCents: number; estimatedCents: number }) =>
          Math.round(((m.earnedCents ?? 0) + m.signedCents + m.estimatedCents) / 100) * 100,
      ));
    }
    expect(await untouched()).toEqual(before);
    const rows = await deps.db.execute(sql`select count(*)::int as count from revenue_targets
      where company_id = 'a' and month >= '2027-01-01' and month < '2028-01-01' and updated_by = 'actor'`);
    expect(rows.rows).toEqual([{ count: 60 }]);
    expect(provider.request).not.toHaveBeenCalled();
  });

  it("rejects unrepresentable targets without changing an existing grid", async () => {
    const admin = appFor("admin");
    const existing = await admin.put(`${path}/targets/2026`).send({ streams: { contract: fill(10) } }).expect(200);
    await deps.db.execute(sql`update revenue_qbo_income_months set amount_cents = -99999 where company_id = 'a' and qbo_account_id = 'one'`);
    await admin.post(`${path}/targets/2026/from-plan`).expect(422);
    expect((await admin.get(`${path}/targets/2026`).expect(200)).body).toEqual(existing.body);
  });

  it("does not change any targets if replacing the forecast fails inside the database", async () => {
    const admin = appFor("admin");
    const before = await admin.put(targets).send({ streams: { contract: fill(123), snow: fill(220) } }).expect(200);
    await deps.db.execute(sql`alter table revenue_targets add constraint fixture_reject_2100 check (amount_cents <> 2100)`);
    try {
      await admin.post(fromPlan).expect(500);
      expect((await admin.get(targets).expect(200)).body).toEqual(before.body);
    } finally {
      await deps.db.execute(sql`alter table revenue_targets drop constraint fixture_reject_2100`);
    }
  });

  it("enforces sign-in, role, active company and calendar inputs before loading", async () => {
    const query = vi.spyOn(pg.Client.prototype, "query");
    const admin = appFor("account_manager"), field = appFor("field"), anonymous = appFor(null), noCompany = appFor("admin", "");
    for (const url of [income(2026), `${path}/income/years?from=2018&to=2027`, projection]) {
      await anonymous.get(url).expect(401);
      await field.get(url).expect(403);
      await noCompany.get(url).expect(403);
    }
    for (const url of [income(2026), `${path}/income/years?from=2022&to=2026`, targets,
      `${path}/plan/2027`, `${path}/qbo/status`, `${path}/qbo/accounts`]) {
      await appFor("office").get(url).set("X-Company-Id", "b").expect(409);
    }
    await anonymous.post(fromPlan).expect(401);
    await field.post(fromPlan).expect(403);
    await noCompany.post(fromPlan).expect(403);
    await admin.post(`${path}/targets/2101/from-plan`).expect(400);
    await admin.get(`${path}/plan/2027.0/projection`).expect(400);
    for (const queryString of ["year=2026&year=2027", "year=20e2", "year=2014", ""]) {
      await admin.get(`${path}/income?${queryString}`).expect(400);
    }
    for (const queryString of ["from=2017&to=2027", "from=2028&to=2027", "from=202x&to=2027", "from=2027"]) {
      await admin.get(`${path}/income/years?${queryString}`).expect(400);
    }
    expect(query).not.toHaveBeenCalled();
    await admin.post(fromPlan).expect(200);
  });
});
