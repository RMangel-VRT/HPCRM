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

const now = new Date("2026-10-21T18:00:00Z");
const dialect = new PgDialect();
let queries: { sql: string; params: unknown[] }[];
let rows: any[];
let histories: any[];
const typeRows = ["estimate_request", "rfp_request"].map(typeKey => ({ id: typeKey, typeKey, name: "Renamed type" }));
const statuses = (typeKey: "estimate_request" | "rfp_request") =>
  [...new Set([...ESTIMATE_STAGES.flatMap(stage => [...stage[typeKey]]), "ready_to_schedule", "awarded", "closed_lost", "scheduled", "completed"])]
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

describe("existing-ticket estimates board", () => {
  it("exports exactly the supplied five-stage map", () => {
    expect(ESTIMATE_STAGES).toEqual([
      { key: "new", estimate_request: ["new"], rfp_request: ["new"] },
      { key: "estimating", estimate_request: ["estimating"], rfp_request: ["reviewing", "waiting_info", "site_visit"] },
      { key: "proposal", estimate_request: ["proposal_draft"], rfp_request: ["proposal_draft"] },
      { key: "sent", estimate_request: ["proposal_sent"], rfp_request: ["proposal_sent", "awaiting_response"] },
      { key: "decision", estimate_request: ["decision_received"], rfp_request: ["decision_received"] },
    ]);
  });
  it.each(ESTIMATE_STAGES)("places each Estimate Request stage $key by stable status key", async stage => {
    rows = [ticket("estimate_request", stage.estimate_request[0])];
    const board = await loadEstimatesBoard("company-a", undefined, now);
    expect(board.stages.find(s => s.key === stage.key)!.tickets).toHaveLength(1);
    expect(board.stages).toHaveLength(5);
    expect(board.stages.flatMap(s => s.tickets)[0]).toMatchObject({
      typeKey: "estimate_request", statusName: `Renamed ${stage.estimate_request[0]}`,
      customer: { id: "customer-a", name: "Safe Development Customer" },
      assignee: { id: "user-a", name: "Development Estimator" },
      priority: "high", estimateNumber: "E-101", daysInStage: 20,
    });
  });
  it.each(ESTIMATE_STAGES.flatMap(stage => stage.rfp_request.map(status => ({ key: stage.key, status }))))
    ("places RFP $status in $key", async ({ key, status }) => {
      rows = [ticket("rfp_request", status)];
      expect((await loadEstimatesBoard("company-a", undefined, now)).stages.find(s => s.key === key)!.tickets).toHaveLength(1);
    });
  it("excludes later statuses, unrelated types and other companies in SQL", async () => {
    rows = [
      ticket(), ...["ready_to_schedule", "awarded", "closed_lost", "scheduled", "completed"].flatMap(status =>
        [ticket("estimate_request", status), ticket("rfp_request", status)]),
      { ...ticket(), id: "foreign", companyId: "company-b" },
      { ...ticket(), id: "wrong-type", ticketTypeId: "custom" },
    ];
    const all = (await loadEstimatesBoard("company-a", undefined, now)).stages.flatMap(s => s.tickets);
    expect(all.map(t => t.id)).toEqual(["estimate_request:new"]);
  });
  it.each(["estimate_request", "rfp_request", "invalid", "", undefined, ["rfp_request"]])("recognizes only valid scalar filters %j", async filter => {
    rows = [ticket(), ticket("rfp_request")];
    const all = (await loadEstimatesBoard("company-a", filter, now)).stages.flatMap(s => s.tickets);
    expect(all).toHaveLength(filter === "estimate_request" || filter === "rfp_request" ? 1 : 2);
    if (filter === "estimate_request" || filter === "rfp_request") expect(all[0].typeKey).toBe(filter);
  });
  it("keeps all empty stages, including a company with no seeded types", async () => {
    expect((await loadEstimatesBoard("company-a", undefined, now)).stages.map(s => s.tickets)).toEqual([[], [], [], [], []]);
    mocks.getTicketTypes.mockResolvedValue([]);
    expect((await loadEstimatesBoard("company-a", undefined, now)).stages.map(s => s.tickets)).toEqual([[], [], [], [], []]);
  });
  it("uses latest current-status entry, creation fallback, deterministic ordering and nullable relations", async () => {
    rows = [ticket("estimate_request", "new", "b"), ticket("estimate_request", "new", "a"),
      { ...ticket("estimate_request", "new", "recent"), customerId: null, assignedToId: null, estimateNumber: null }];
    histories = [{ ticketId: "recent", enteredAt: new Date("2026-10-21T05:00:00Z") }];
    const all = (await loadEstimatesBoard("company-a", undefined, now)).stages[0].tickets;
    expect(all.map(t => [t.id, t.daysInStage])).toEqual([["a", 20], ["b", 20], ["recent", 1]]);
    expect(all[2]).toMatchObject({ customer: null, assignee: null, estimateNumber: null });
  });
  it("query count is constant for 1 and 1001 tickets, without truncation", async () => {
    const counts = [];
    for (const count of [1, 1001]) {
      vi.clearAllMocks(); queries = [];
      rows = Array.from({ length: count }, (_, i) => ticket("estimate_request", "new", String(i)));
      const board = await loadEstimatesBoard("company-a", undefined, now);
      expect(board.stages[0].tickets).toHaveLength(count);
      // Three metadata queries, tickets, customers, assignees, grouped history = seven.
      counts.push(queries.length + mocks.getTicketTypes.mock.calls.length +
        mocks.getTicketTypeStatuses.mock.calls.length + mocks.getCustomersByIds.mock.calls.length);
    }
    expect(counts).toEqual([7, 7]);
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

describe("estimates board authorization", () => {
  function app(role: string, authenticated = true) {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => authenticated;
      (req as any).user = { activeRole: role, activeCompanyId: "company-a" };
      next();
    });
    registerEstimatesBoardRoutes(app);
    return app;
  }
  it("rejects unauthenticated requests before querying", async () => {
    expect((await request(app("admin", false)).get("/api/estimates/board")).status).toBe(401);
    expect(mocks.getTicketTypes).not.toHaveBeenCalled();
  });
  it.each(["field_manager", "field", "crew_supervisor", "mapping", "shop_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"])
    ("denies %s before querying", async role => {
      expect((await request(app(role)).get("/api/estimates/board")).status).toBe(403);
      expect(mocks.getTicketTypes).not.toHaveBeenCalled();
    });
  it.each(["admin", "office"])("permits %s and uses active company", async role => {
    const response = await request(app(role)).get("/api/estimates/board?type=rfp_request");
    expect(response.status).toBe(200);
    expect(response.body.stages).toHaveLength(5);
    expect(mocks.getTicketTypes).toHaveBeenCalledWith("company-a");
    expect(mocks.getTicketTypeStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.getTicketTypeStatuses).toHaveBeenCalledWith("rfp_request");
  });
});
