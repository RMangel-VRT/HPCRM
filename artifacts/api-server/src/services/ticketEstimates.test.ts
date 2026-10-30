import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("../db", () => ({ db: { select: mocks.select } }));
vi.mock("./estimateReads", () => ({ readEstimate: vi.fn() }));
import { loadTicketEstimateSummaries } from "./ticketEstimates";

const dialect = new PgDialect();
let rows: unknown[], where: { sql: string; params: unknown[] }, joins: { sql: string; params: unknown[] }[];
beforeEach(() => {
  vi.clearAllMocks(); rows = []; joins = [];
  const builder = {
    from: () => builder,
    innerJoin: (_table: unknown, condition: any) => { joins.push(dialect.sqlToQuery(condition)); return builder; },
    leftJoin: (_table: unknown, condition: any) => { joins.push(dialect.sqlToQuery(condition)); return builder; },
    where: (condition: any) => { where = dialect.sqlToQuery(condition); return Promise.resolve(rows); },
  };
  mocks.select.mockReturnValue(builder);
});
describe("one-query ticket estimate summaries", () => {
  it.each([1, 1001])("uses one company-qualified join query for %s board cards", async count => {
    const ids = Array.from({ length: count }, (_, i) => `ticket-${i}`);
    rows = ids.map((ticketId, i) => ({
      estimate: { ticketId, id: `estimate-${i}`, estimateNumber: `EST-${i}` },
      version: { id: `version-${i}`, versionNumber: 1, status: "draft", frozenSubtotalCents: null },
      line: { quantity: "2.5", unitPriceCents: 33, unitCostCents: null, sectionId: "section", umbrellaKey: "landscape_materials" },
    }));
    const result = await loadTicketEstimateSummaries("company", ids);
    expect(result.size).toBe(count); expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(result.get("ticket-0")?.subtotalCents).toBe(83);
    expect(where.sql).toContain('"estimates"."company_id" =');
    expect(where.sql).toContain('"estimates"."voided_at" is null');
    expect(where.sql).toContain('"estimates"."ticket_id" in');
    expect(where.params).toEqual(["company", ...ids]);
    expect(joins[0].sql).toContain('"estimate_versions"."company_id" =');
    expect(joins[1].sql).toContain('"estimate_lines"."company_id" =');
    expect(joins[1].params).toEqual(["company", "draft"]);
  });
  it("aggregates all captured draft lines but uses frozen subtotal, including null, for non-drafts", async () => {
    const base = { estimate: { ticketId: "ticket", id: "e", estimateNumber: "EST" },
      version: { id: "v", versionNumber: 1, status: "draft", frozenSubtotalCents: 999 },
      line: { quantity: "2.5", unitPriceCents: 33, unitCostCents: null, sectionId: "s", umbrellaKey: "plants" } };
    rows = [base, base];
    expect((await loadTicketEstimateSummaries("c", ["ticket"])).get("ticket")?.subtotalCents).toBe(166);
    rows = [{ ...base, version: { ...base.version, status: "accepted" } }];
    expect((await loadTicketEstimateSummaries("c", ["ticket"])).get("ticket")?.subtotalCents).toBe(999);
    rows = [{ ...base, version: { ...base.version, status: "sent", frozenSubtotalCents: null } }];
    expect((await loadTicketEstimateSummaries("c", ["ticket"])).get("ticket")?.subtotalCents).toBeNull();
  });
  it("does not query for an empty board", async () => {
    expect((await loadTicketEstimateSummaries("c", [])).size).toBe(0);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
