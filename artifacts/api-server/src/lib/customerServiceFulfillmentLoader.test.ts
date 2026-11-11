import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import { loadServiceFulfillmentInputs } from "./customerServiceFulfillmentLoader";

describe("batched fulfillment reads", () => {
  it("uses a fixed set of company-scoped queries, no commercial tables and route-only activity", async () => {
    const calls: { table: string; sql: string; params: unknown[] }[] = [];
    const reader = { select: () => ({ from: (table: any) => ({ where: async (predicate: any) => {
      const query = new PgDialect().sqlToQuery(predicate);
      const name = getTableName(table);
      calls.push({ table: name, ...query });
      if (name === "agreement_terms") return [{ startDate: "2026-10-01", endDate: "2027-09-30" }];
      return [];
    } }) }) };
    const loaded = await loadServiceFulfillmentInputs(reader as any, "company-fixture");
    expect(loaded.programs).toEqual([]);
    expect(calls).toHaveLength(8);
    expect(calls.map(c => c.table)).toEqual([
      "customers", "agreements", "agreement_terms", "term_scope_lines",
      "campaigns", "campaign_items", "route_stops", "visits",
    ]);
    for (const call of calls) {
      expect(call.sql).toContain("company_id");
      expect(call.params).toContain("company-fixture");
    }
    expect(calls.at(-1)!.params).toEqual(["company-fixture", "route", "2026-10-01", "2027-09-30"]);
  });
});
