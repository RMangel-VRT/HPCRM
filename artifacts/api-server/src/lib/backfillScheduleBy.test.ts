// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { computeScheduleBy } from "./scheduleBy";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock("../db", () => ({ db: mocks }));
import { backfillScheduleBy } from "./backfillScheduleBy";
let rows: any[];
let queries: string[];
let set: ReturnType<typeof vi.fn>;
let writes: any[];
const dialect = new PgDialect();
beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  writes = [];
  rows = [{ id: "old", companyId: "company", priority: "urgent", createdAt: new Date("2020-01-03T12:00:00") }];
  mocks.execute.mockResolvedValue({ rows: [
    ...["id", "company_id", "ticket_type_id", "current_status_id", "schedule_by", "priority", "created_at"]
      .map(column_name => ({ table_name: "tickets", column_name })),
    ...["id", "company_id", "type_key"].map(column_name => ({ table_name: "ticket_types", column_name })),
    ...["id", "ticket_type_id", "status_key"].map(column_name => ({ table_name: "ticket_type_statuses", column_name })),
  ] });
  set = vi.fn(data => ({ where: (condition: any) => {
    queries.push(dialect.sqlToQuery(condition).sql);
    return { returning: async () => { writes.push(data); rows = []; return [{ id: "old" }]; } };
  } }));
  mocks.transaction.mockImplementation(async cb => cb({
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    select: () => {
      const chain: any = {
        from: () => chain, innerJoin: () => chain,
        where: (condition: any) => { queries.push(dialect.sqlToQuery(condition).sql); return chain; },
        for: async () => rows,
      };
      return chain;
    },
    update: () => ({ set }),
  }));
});
describe("Guarded schedule-by boot DML", () => {
  it("sets only eligible null dates using creation day, keeps old overdue dates, and reruns empty", async () => {
    expect(await backfillScheduleBy()).toBe(1);
    expect(writes).toEqual([{ scheduleBy: computeScheduleBy("urgent", new Date("2020-01-03T12:00:00")) }]);
    expect(writes[0].scheduleBy).toBe("2020-01-06");
    expect(queries[0]).toContain('"tickets"."schedule_by" is null');
    expect(queries[0]).toContain("IN ('task', 'project', 'estimate_request')");
    expect(queries[0]).toContain("IN ('new', 'ready_to_schedule')");
    expect(queries[1]).toContain('"tickets"."schedule_by" is null');
    expect(await backfillScheduleBy()).toBe(0);
    expect(set).toHaveBeenCalledOnce();
  });
  it("skips writes entirely when the scheduling column is absent", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    expect(await backfillScheduleBy()).toBe(0);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
