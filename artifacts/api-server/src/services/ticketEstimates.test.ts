import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("../db", () => ({ db: { select: mocks.select } }));
vi.mock("./estimateReads", () => ({ readEstimate: vi.fn() }));
import { loadTicketEstimateSummaries } from "./ticketEstimates";
import { estimateSections } from "@workspace/db";

const dialect = new PgDialect();
let rows: unknown[], where: { sql: string; params: unknown[] }, joins: { sql: string; params: unknown[] }[];
beforeEach(() => {
  vi.clearAllMocks(); rows = []; joins = [];
  const builder = {
    from: (table: unknown) => table === estimateSections ? { where: (condition: any) => {
      const sectionQuery = dialect.sqlToQuery(condition);
      expect(sectionQuery.sql).toContain('"estimate_sections"."company_id" =');
      expect(sectionQuery.sql).toContain('"estimate_sections"."version_id" in');
      return Promise.resolve([{ versionId: "version-0", updatedAt: new Date("2026-11-12T18:00:00Z") }]);
    } } : builder,
    innerJoin: (_table: unknown, condition: any) => { joins.push(dialect.sqlToQuery(condition)); return builder; },
    leftJoin: (_table: unknown, condition: any) => { joins.push(dialect.sqlToQuery(condition)); return builder; },
    where: (condition: any) => { where = dialect.sqlToQuery(condition); return Promise.resolve(rows); },
  };
  mocks.select.mockReturnValue(builder);
});
describe("constant-query ticket estimate summaries", () => {
  it.each([1, 1001])("uses two company-qualified bulk queries for %s board cards", async count => {
    const ids = Array.from({ length: count }, (_, i) => `ticket-${i}`);
    rows = ids.map((ticketId, i) => ({
      estimate: { ticketId, id: `estimate-${i}`, estimateNumber: `EST-${i}` },
      version: { id: `version-${i}`, updatedAt: new Date("2026-11-10T18:00:00Z"), versionNumber: 1, status: "draft", frozenSubtotalCents: null },
      line: { updatedAt: new Date("2026-11-11T18:00:00Z"), quantity: "2.5", unitPriceCents: 33, unitCostCents: null, sectionId: "section", umbrellaKey: "landscape_materials" },
    }));
    const result = await loadTicketEstimateSummaries("company", ids);
    expect(result.size).toBe(count); expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(result.get("ticket-0")?.draftEditedAt).toBe("2026-11-12T18:00:00.000Z");
    if (count > 1) expect(result.get("ticket-1")?.draftEditedAt).toBe("2026-11-11T18:00:00.000Z");
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
      version: { id: "v", updatedAt: new Date("2026-11-10T18:00:00Z"), versionNumber: 1, status: "draft", frozenSubtotalCents: 999 },
      line: { updatedAt: new Date("2026-11-11T18:00:00Z"), quantity: "2.5", unitPriceCents: 33, unitCostCents: null, sectionId: "s", umbrellaKey: "plants" } };
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
  it("reports exactly send's non-manual zero-price lines and version edits can be newest", async () => {
    const version = { id: "v", versionNumber: 1, updatedAt: new Date("2026-11-15T01:00:00Z"), status: "draft" };
    const estimate = { id: "e", ticketId: "t", estimateNumber: "EST" };
    rows = ["catalog", "contract", "rate_card", "quick_list", "manual"].map(priceSource => ({
      version, estimate, line: { updatedAt: new Date("2026-11-10T01:00:00Z"), priceSource, quantity: "1",
        unitPriceCents: 0, unitCostCents: null, sectionId: "s", umbrellaKey: "plants" },
    }));
    const summary = (await loadTicketEstimateSummaries("c", ["t"])).get("t");
    expect(summary).toMatchObject({ versionId: "v", lineCount: 5, linesNeedingPrice: 4, draftEditedAt: "2026-11-15T01:00:00.000Z" });
    rows = [{ estimate, version: { ...version, status: "sent", sentAt: new Date("2026-03-08T03:00:00Z"), acceptedAt: null, frozenSubtotalCents: 123 }, line: null }];
    expect((await loadTicketEstimateSummaries("c", ["t"])).get("t")).toMatchObject({
      sentAt: "2026-03-08T03:00:00.000Z", acceptedAt: null, validUntil: "2026-04-06",
      draftEditedAt: null, linesNeedingPrice: 0, subtotalCents: 123,
    });
  });
});
