import { sql } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessRole, type Role } from "../../../../lib/db/src/accessRole";

vi.mock("../storage", () => ({ storage: {} }));

const plan = "/api/revenue/plan/2027";
const targets = "/api/revenue/targets/2027";
const months = (cents: number) => Array<number>(12).fill(cents);
const emptyStreams = () => ({ contract: months(0), snow: months(0), irrigation: months(0), projects: months(0), extra: months(0) });

describe.runIf(process.env.RUN_RV3_POSTGRES_TEST === "1")("Revenue planning routes in disposable PostgreSQL", () => {
  let deps: typeof import("../db");
  let register: typeof import("./revenue").registerRevenueRoutes;

  function appFor(role: Role | null, activeCompanyId = "rv3-a", id = "rv3-admin") {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, {
        isAuthenticated: () => role !== null,
        user: role && { id, activeCompanyId, activeRole: role, accessRole: accessRole(role) },
      });
      next();
    });
    register(app);
    const onError: express.ErrorRequestHandler = (_err, _req, res, _next) => {
      res.sendStatus(500);
    };
    app.use(onError);
    return request(app);
  }

  beforeAll(async () => {
    if (!process.env.RV3_TEST_SOCKET?.startsWith("/tmp/rv3-planning.")) {
      throw new Error("Run RV3 against a verified private PostgreSQL fixture socket");
    }
    deps = await import("../db");
    const identity = await deps.db.execute(sql`
      select current_database() as db, current_user as role, inet_server_addr() is null as unix,
        current_setting('unix_socket_directories') as socket
    `);
    expect(identity.rows).toEqual([{
      db: "rv3_planning_test", role: "rv3_test", unix: true, socket: process.env.RV3_TEST_SOCKET,
    }]);
    ({ registerRevenueRoutes: register } = await import("./revenue"));
  });

  afterAll(async () => {
    if (!deps) return;
    await deps.pool.end();
    await (await import("@workspace/db")).pool.end();
  });

  beforeEach(async () => {
    await deps.db.execute(sql`
      truncate revenue_plans, revenue_targets, users, companies;
      insert into companies (id, slug, name) values ('rv3-a', 'rv3-a', 'A'), ('rv3-b', 'rv3-b', 'B');
      insert into users (id, name, password_hash) values
        ('rv3-admin', 'Admin', 'not-a-password'), ('rv3-editor', 'Editor', 'not-a-password');
    `);
  });

  const counts = () => deps.db.execute(sql`
    select (select count(*)::int from revenue_plans) as plans, (select count(*)::int from revenue_targets) as targets
  `).then(result => result.rows[0]);

  it("returns all defaults and zero targets to office without creating rows", async () => {
    const office = appFor("office");
    const [p, t] = await Promise.all([office.get(plan), office.get(targets)]);
    expect(p.status).toBe(200);
    expect(p.headers["cache-control"]).toBe("no-store");
    expect(p.body).toEqual({
      year: 2027, renewalIncreasePct: 3, keptPct: 90, snowYears: 3, irrigationGrowthPct: 0,
      projectsGrowthPct: 0, extraGrowthPct: 0, goalCents: null, saved: false,
    });
    expect(t.status).toBe(200);
    expect(t.body).toEqual({
      year: 2027, streams: emptyStreams(), annual: { contract: 0, snow: 0, irrigation: 0, projects: 0, extra: 0 }, saved: false,
    });
    expect(await counts()).toEqual({ plans: 0, targets: 0 });
  });

  it("applies only provided plan fields, preserves the other company/year, and can clear the goal", async () => {
    const admin = appFor("admin");
    const adminB = appFor("admin", "rv3-b");
    const nextPlan = plan.replace("2027", "2028");
    const initial = { renewalIncreasePct: -4.25, snowYears: 5, projectsGrowthPct: 12.07, goalCents: 3000000001 };
    const first = await admin.put(plan).set("X-Company-Id", "rv3-a").send(initial).expect(200);
    expect(first.body).toMatchObject({
      ...initial, companyId: "rv3-a", year: 2027, updatedBy: "rv3-admin", saved: true,
      keptPct: 90, irrigationGrowthPct: 0, extraGrowthPct: 0,
    });
    expect(typeof first.body.id).toBe("string");
    await adminB.put(plan).send({ keptPct: 66 }).expect(200);
    await admin.put(nextPlan).send({ keptPct: 77 }).expect(200);

    const editor = appFor("account_manager", "rv3-a", "rv3-editor");
    const edited = await editor.put(plan).send({ keptPct: 81 }).expect(200);
    expect(edited.body).toEqual({ ...first.body, keptPct: 81, updatedBy: "rv3-editor", updatedAt: edited.body.updatedAt });
    expect((await appFor("office").get(plan).expect(200)).body).toEqual(edited.body);
    expect((await editor.put(plan).send({}).expect(200)).body).toEqual(edited.body);
    expect((await editor.put(plan).send({ goalCents: null }).expect(200)).body).toMatchObject({
      ...initial, goalCents: null, keptPct: 81,
    });
    expect((await adminB.get(plan).expect(200)).body.keptPct).toBe(66);
    expect((await admin.get(nextPlan).expect(200)).body.keptPct).toBe(77);
    expect(await counts()).toEqual({ plans: 3, targets: 0 });
  });

  it("zero-fills missing months and replaces only supplied streams, keeping explicit zeroes saved", async () => {
    const admin = appFor("admin");
    const adminB = appFor("admin", "rv3-b");
    const nextTargets = targets.replace("2027", "2028");
    await deps.db.execute(sql`insert into revenue_targets (company_id, stream, month, amount_cents)
      values ('rv3-a', 'contract', '2027-12-01', 11)`);
    const sparse = await admin.get(targets).expect(200);
    expect(sparse.body.streams.contract).toEqual([...Array(11).fill(0), 11]);
    expect(sparse.body.annual.contract).toBe(11);
    expect(sparse.body.saved).toBe(true);

    const initial = { contract: months(7), snow: months(11), irrigation: months(5), projects: months(6), extra: months(9) };
    await admin.put(targets).send({ streams: initial }).expect(200);
    const adj = await admin.put(nextTargets).send({ streams: { contract: months(0) } }).expect(200);
    const foreign = await adminB.put(targets).send({ streams: { snow: months(22) } }).expect(200);
    expect(adj.body.saved).toBe(true);
    const preservedRows = () => deps.db.execute(sql`select * from revenue_targets
      where not (company_id = 'rv3-a' and month >= '2027-01-01' and month < '2028-01-01'
        and stream in ('contract', 'snow')) order by company_id, stream, month`).then(result => result.rows);
    const before = await preservedRows();

    const contract = [13, 17, ...Array(9).fill(0), 100];
    const snow = months(2147483647);
    const saved = await admin.put(targets).set("X-Company-Id", "rv3-a").send({ streams: { contract, snow } }).expect(200);
    expect(saved.body).toEqual({
      year: 2027, streams: { ...initial, contract, snow },
      annual: { contract: 130, snow: 25769803764, irrigation: 60, projects: 72, extra: 108 }, saved: true,
    });
    expect(await preservedRows()).toEqual(before);
    expect((await appFor("office").get(targets).expect(200)).body).toEqual(saved.body);
    expect((await admin.put(targets).send({ streams: {} }).expect(200)).body).toEqual(saved.body);
    expect((await admin.get(nextTargets).expect(200)).body).toEqual(adj.body);
    expect((await adminB.get(targets).expect(200)).body).toEqual(foreign.body);
    expect(await counts()).toEqual({ plans: 0, targets: 84 });
  });

  it("rolls back every supplied stream if the database rejects one", async () => {
    const admin = appFor("admin");
    const before = await admin.put(targets).send({ streams: { contract: months(1), snow: months(2) } }).expect(200);
    await deps.db.execute(sql`alter table revenue_targets add constraint rv3_fixture_reject check (amount_cents <> 99999)`);
    try {
      await admin.put(targets).send({ streams: { contract: months(5), snow: months(99999) } }).expect(500);
      expect((await admin.get(targets).expect(200)).body).toEqual(before.body);
    } finally {
      await deps.db.execute(sql`alter table revenue_targets drop constraint rv3_fixture_reject`);
    }
  });

  it("rejects unauthorized, stale-company and invalid requests before saving anything", async () => {
    const admin = appFor("admin");
    for (const [path, body, invalid] of [
      [plan, { keptPct: 88 }, [{ extraGrowthPct: 101 }, { updatedBy: "wrong" }, { keptPct: 1.5 }]],
      [targets, { streams: { snow: months(2) } }, [{ streams: { other: months(7) } }, { streams: { snow: months(-1) } }]],
    ] as const) {
      await appFor(null).get(path).expect(401);
      await appFor("field").get(path).expect(403);
      await appFor("admin", "").get(path).expect(403);
      await appFor("office").put(path).send(body).expect(403);
      await appFor("admin", "").put(path).send(body).expect(403);
      const stale = await admin.put(path).set("X-Company-Id", "rv3-b").send(body).expect(409);
      expect(stale.body).toEqual({ message: "Active company changed. Reload and try again." });
      for (const badBody of invalid) await admin.put(path).send(badBody).expect(400);
      for (const year of ["2014", "2101", "2027.0", "0x7ea"]) {
        const badPath = path.replace("2027", year);
        await admin.get(badPath).expect(400);
        await admin.put(badPath).send(body).expect(400);
      }
    }
    expect(await counts()).toEqual({ plans: 0, targets: 0 });
  });
});
