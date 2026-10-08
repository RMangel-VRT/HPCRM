import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ticketLinks, tickets, ticketTypes, ticketTypeStatuses } from "@workspace/db";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("../db", () => ({ db: { select: mocks.select }, pool: {} }));
// No session table setup: exercise the real read methods, not a session store.
vi.mock("connect-pg-simple", () => ({ default: () => class {} }));
import { getInvoiceLinkSummaries } from "./ticketLinkSummary";

const dialect = new PgDialect();
let ids: string[];
let queries: Array<{ table: unknown; sql: string; params: unknown[] }>;
beforeEach(() => {
  vi.clearAllMocks();
  ids = [];
  queries = [];
  mocks.select.mockImplementation((projection?: unknown) => ({
    from: (table: unknown) => {
      let condition: Parameters<typeof dialect.sqlToQuery>[0];
      const chain = {
        where: (value: typeof condition) => { condition = value; return chain; },
        orderBy: () => chain,
        then: (resolve: (value: unknown[]) => unknown) => {
          queries.push({ table, ...dialect.sqlToQuery(condition) });
          const types = [
            { id: "invoice", name: "Renamed billing", typeKey: "invoice" },
            { id: "task", name: "Renamed work", typeKey: "task" },
          ];
          const rows = table === ticketLinks
            ? ids.map(id => ({ sourceTicketId: id, targetTicketId: `bill-${id}`, linkType: "invoice_for" }))
            : table === tickets
              ? ids.map(id => ({ id: `bill-${id}`, title: "Bill", companyId: "company", ticketTypeId: "invoice", currentStatusId: "pending" }))
              : table === ticketTypes
                ? projection ? types.map(t => ({ id: t.id })) : types
                : [{ id: "pending", statusKey: "pending_invoice", name: "Renamed pending", isFinal: "false" }];
          return Promise.resolve(rows).then(resolve);
        },
      };
      return chain;
    },
  }));
});

describe("invoice summary SQL budget with real storage bulk methods", () => {
  it.each([1, 2, 500])("performs exactly five SQL reads for %i linked tickets", async count => {
    ids = Array.from({ length: count }, (_, i) => `job${i}`);
    const summaries = await getInvoiceLinkSummaries("company", ids);
    expect(summaries.size).toBe(count);
    expect(queries).toHaveLength(5);
    expect(queries.filter(q => q.table === ticketLinks)).toHaveLength(1);
    expect(queries.filter(q => q.table === tickets)).toHaveLength(1);
    expect(queries.filter(q => q.table === ticketTypeStatuses)).toHaveLength(1);
    expect(queries.filter(q => q.table === ticketTypes)).toHaveLength(2);
    const counterpartQuery = queries.find(q => q.table === tickets)!;
    expect(counterpartQuery.sql).toContain('"tickets"."company_id" =');
    expect(counterpartQuery.params).toContain("company");
    for (const query of queries.filter(q => q.table === ticketTypes)) {
      expect(query.sql).toContain('"ticket_types"."company_id" =');
      expect(query.params).toContain("company");
    }
    expect([...summaries.values()].every(s => s.invoices.length === 1)).toBe(true);
  });

  it("executes zero SQL reads for empty input", async () => {
    expect(await getInvoiceLinkSummaries("company", [])).toEqual(new Map());
    expect(mocks.select).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
  });
});
