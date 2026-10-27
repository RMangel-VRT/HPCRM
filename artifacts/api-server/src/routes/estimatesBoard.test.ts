import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { tickets, ticketStatusHistory } from "@workspace/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), selectDistinct: vi.fn(), getTicketTypes: vi.fn(),
  getTicketTypeStatuses: vi.fn(), getCustomersByIds: vi.fn(),
}));
vi.mock("../db", () => ({ db: { select: mocks.select, selectDistinct: mocks.selectDistinct } }));
vi.mock("../storage", () => ({ storage: mocks }));
import { ESTIMATE_STAGES, estimateDaysInStage, loadEstimatesBoard, registerEstimatesBoardRoutes } from "./estimatesBoard";
import { BID_STAGES, loadBidsBoard, registerBidsBoardRoutes } from "./bidsBoard";

const now = new Date("2026-10-21T18:00:00Z");
const dialect = new PgDialect();
let queries: { sql: string; params: unknown[] }[];
let rows: any[];
let histories: any[];
const typeRows = ["estimate_request", "rfp_request"].map(typeKey => ({ id: typeKey, typeKey, name: "Renamed type" }));
const statuses = (typeKey: "estimate_request" | "rfp_request") =>
  [...new Set([...(typeKey === "estimate_request" ? ESTIMATE_STAGES : BID_STAGES).flatMap(stage => [...stage.statusKeys]), "ready_to_schedule", "awarded", "closed_lost", "scheduled", "completed"])]
    .map(statusKey => ({ id: `${typeKey}:${statusKey}`, statusKey, name: `Renamed ${statusKey}` }));
const ticket = (type = "estimate_request", status = "new", id = `${type}:${status}`) => ({
  id, companyId: "company-a", title: `Bid ${id}`, ticketTypeId: type,
  currentStatusId: `${type}:${status}`, customerId: "customer-a", assignedToId: "user-a",
  priority: "high", estimateNumber: "E-101", createdAt: new Date("2026-10-01T18:00:00Z"),
});

beforeEach(() => {
  vi.clearAllMocks();
  queries = []; rows = []; histories = [];
  mocks.getTicketTypes.mockResolvedValue(typeRows);
  mocks.getTicketTypeStatuses.mockImplementation(async type => statuses(type));
  mocks.getCustomersByIds.mockImplementation(async (_ids, company) => {
    expect(company).toBe("company-a");
    return new Map([["customer-a", { id: "customer-a", name: "Safe Development Customer" }]]);
  });
  const select = (projection: unknown) => ({
    from(table: unknown) {
      let predicate: ReturnType<typeof dialect.sqlToQuery>;
      const builder: any = {
        innerJoin: vi.fn(() => builder),
        where: vi.fn((condition: any) => {
          predicate = dialect.sqlToQuery(condition); queries.push(predicate); return builder;
        }),
        groupBy: vi.fn(() => builder),
        then(resolve: any, reject: any) {
          let result: any[];
          if (table === tickets) {
            expect(predicate.sql).toContain('"tickets"."company_id" =');
            expect(predicate.sql).toContain('"tickets"."ticket_type_id" in');
            expect(predicate.sql).toContain('"tickets"."current_status_id" in');
            expect(predicate.sql).not.toMatch(/limit/i);
            result = rows.filter(row => predicate.params.includes(row.companyId) &&
              predicate.params.includes(row.ticketTypeId) && predicate.params.includes(row.currentStatusId));
          } else if (table === ticketStatusHistory) {
            expect(builder.groupBy).toHaveBeenCalledWith(ticketStatusHistory.ticketId);
            expect(builder.innerJoin).toHaveBeenCalled();
            const join = dialect.sqlToQuery(builder.innerJoin.mock.calls[0][1]);
            expect(join.sql).toContain('"tickets"."current_status_id" = "ticket_status_history"."to_status_id"');
            const aggregate = dialect.sqlToQuery((projection as any).enteredAt);
            expect(aggregate.sql).toContain('max("ticket_status_history"."created_at")');
            result = histories;
          } else {
            expect(predicate.params).toContain("company-a");
            result = [{ id: "user-a", name: "Development Estimator" }];
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  });
  mocks.select.mockImplementation(select);
  mocks.selectDistinct.mockImplementation(select);
});

describe.each([
  { type: "estimate_request", stages: ESTIMATE_STAGES, load: loadEstimatesBoard },
  { type: "rfp_request", stages: BID_STAGES, load: loadBidsBoard },
] as const)("$type board", ({ type, stages, load }) => {
  it("exports exactly the supplied stage maps", () => {
    expect(ESTIMATE_STAGES).toEqual([
      { key: "new", statusKeys: ["new"] },
      { key: "estimating", statusKeys: ["estimating"] },
      { key: "proposal", statusKeys: ["proposal_draft"] },
      { key: "sent", statusKeys: ["proposal_sent"] },
      { key: "decision", statusKeys: ["decision_received"] },
    ]);
    expect(BID_STAGES).toEqual([
      { key: "new", statusKeys: ["new"] }, { key: "reviewing", statusKeys: ["reviewing", "waiting_info"] },
      { key: "walk", statusKeys: ["site_visit"] }, { key: "proposal", statusKeys: ["proposal_draft"] },
      { key: "submitted", statusKeys: ["proposal_sent", "awaiting_response"] }, { key: "decision", statusKeys: ["decision_received"] },
    ]);
  });
  it.each(stages as readonly { key: string; statusKeys: readonly string[] }[])("places stage $key by stable status key", async stage => {
    rows = [ticket(type, stage.statusKeys[0])];
    const board = await load("company-a", now);
    expect(board.stages.find(s => s.key === stage.key)!.tickets).toHaveLength(1);
    expect(board.stages).toHaveLength(stages.length);
    expect(board.stages.flatMap(s => s.tickets)[0]).toMatchObject({
      typeKey: type, statusName: `Renamed ${stage.statusKeys[0]}`,
      customer: { id: "customer-a", name: "Safe Development Customer" },
      assignee: { id: "user-a", name: "Development Estimator" },
      priority: "high", estimateNumber: "E-101", daysInStage: 20,
    });
  });
  it.each(stages.flatMap(stage => stage.statusKeys.map(status => ({ key: stage.key, status }))))
    ("places every status $status in $key", async ({ key, status }) => {
      rows = [ticket(type, status)];
      expect((await load("company-a", now)).stages.find(s => s.key === key)!.tickets).toHaveLength(1);
    });
  it("excludes later statuses, unrelated types and other companies in SQL", async () => {
    rows = [
      ticket(type), ...["ready_to_schedule", "awarded", "closed_lost", "scheduled", "completed"].flatMap(status =>
        [ticket("estimate_request", status), ticket("rfp_request", status)]),
      { ...ticket(), id: "foreign", companyId: "company-b" },
      { ...ticket(), id: "wrong-type", ticketTypeId: "custom" },
    ];
    const all = (await load("company-a", now)).stages.flatMap(s => s.tickets);
    expect(all.map(t => t.id)).toEqual([`${type}:new`]);
  });
  it("never mixes opportunity types", async () => {
    rows = [ticket(), ticket("rfp_request")];
    const all = (await load("company-a", now)).stages.flatMap(s => s.tickets);
    expect(all).toHaveLength(1);
    expect(all[0].typeKey).toBe(type);
  });
  it("keeps all empty stages, including a company with no seeded types", async () => {
    expect((await load("company-a", now)).stages.map(s => s.tickets)).toEqual(stages.map(() => []));
    mocks.getTicketTypes.mockResolvedValue([]);
    expect((await load("company-a", now)).stages.map(s => s.tickets)).toEqual(stages.map(() => []));
  });
  it("uses latest current-status entry, creation fallback, deterministic ordering and nullable relations", async () => {
    rows = [ticket(type, "new", "b"), ticket(type, "new", "a"),
      { ...ticket(type, "new", "recent"), customerId: null, assignedToId: null, estimateNumber: null }];
    histories = [{ ticketId: "recent", enteredAt: new Date("2026-10-21T05:00:00Z") }];
    const all = (await load("company-a", now)).stages[0].tickets;
    expect(all.map(t => [t.id, t.daysInStage])).toEqual([["a", 20], ["b", 20], ["recent", 1]]);
    expect(all[2]).toMatchObject({ customer: null, assignee: null, estimateNumber: null });
  });
  it("query count is constant for 1 and 1001 tickets, without truncation", async () => {
    const counts = [];
    for (const count of [1, 1001]) {
      vi.clearAllMocks(); queries = [];
      rows = Array.from({ length: count }, (_, i) => ticket(type, "new", String(i)));
      const board = await load("company-a", now);
      expect(board.stages[0].tickets).toHaveLength(count);
      // Two metadata queries, tickets, customers, assignees, grouped history = six (<= seven).
      counts.push(queries.length + mocks.getTicketTypes.mock.calls.length +
        mocks.getTicketTypeStatuses.mock.calls.length + mocks.getCustomersByIds.mock.calls.length);
    }
    expect(counts).toEqual([6, 6]);
  });
  it.each(["UTC", "America/Denver"])("counts Colorado calendar days under TZ=%s across midnight and DST", timezone => {
    const previous = process.env.TZ;
    process.env.TZ = timezone;
    try {
      expect(estimateDaysInStage(new Date("2026-10-21T05:00:00Z"), now)).toBe(1);
      expect(estimateDaysInStage(new Date("2026-10-21T05:00:00Z"), new Date("2026-10-21T05:59:00Z"))).toBe(0);
      expect(estimateDaysInStage(new Date("2026-03-08T06:00:00Z"), new Date("2026-03-09T06:00:00Z"))).toBe(2);
      expect(estimateDaysInStage(new Date("2026-11-01T05:00:00Z"), new Date("2026-11-02T07:00:00Z"))).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
});

describe.each([
  { path: "/api/estimates/board", register: registerEstimatesBoardRoutes, type: "estimate_request", count: 5 },
  { path: "/api/bids/board", register: registerBidsBoardRoutes, type: "rfp_request", count: 6 },
])("$path authorization", ({ path, register, type, count }) => {
  function app(role: string, authenticated = true, activeCompanyId: string | null = "company-a") {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => authenticated;
      (req as any).user = { activeRole: role, activeCompanyId };
      next();
    });
    register(app);
    return app;
  }
  it("rejects unauthenticated requests before querying", async () => {
    expect((await request(app("admin", false)).get(path)).status).toBe(401);
    expect(mocks.getTicketTypes).not.toHaveBeenCalled();
  });
  it.each(["field_manager", "field", "crew_supervisor", "mapping", "shop_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"])
    ("denies %s before querying", async role => {
      expect((await request(app(role)).get(path)).status).toBe(403);
      expect(mocks.getTicketTypes).not.toHaveBeenCalled();
    });
  it.each(["admin", "office"])("permits %s and uses active company", async role => {
    rows = [ticket(), ticket("rfp_request")];
    const response = await request(app(role)).get(`${path}?type=rfp_request`);
    expect(response.status).toBe(200);
    expect(response.body.stages).toHaveLength(count);
    expect(response.body.stages.flatMap((s: any) => s.tickets).map((t: any) => t.typeKey)).toEqual([type]);
    expect(mocks.getTicketTypes).toHaveBeenCalledWith("company-a");
    expect(mocks.getTicketTypeStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.getTicketTypeStatuses).toHaveBeenCalledWith(type);
  });
  it("requires active company before querying", async () => {
    expect((await request(app("admin", true, null)).get(path)).status).toBe(403);
    expect(mocks.getTicketTypes).not.toHaveBeenCalled();
  });
  it.each(["type=estimate_request", "type=rfp_request", "type=invalid", "type=", "type=rfp_request&type=estimate_request", "type[x]=rfp_request"])
    ("ignores legacy query %s", async query => {
      rows = [ticket(), ticket("rfp_request")];
      const response = await request(app("office")).get(`${path}?${query}`);
      expect(response.body.stages.flatMap((s: any) => s.tickets).map((t: any) => t.typeKey)).toEqual([type]);
    });
  it("reports loader errors explicitly", async () => {
    mocks.getTicketTypes.mockRejectedValueOnce(new Error("Unavailable"));
    expect((await request(app("admin")).get(path)).status).toBe(500);
  });
});
