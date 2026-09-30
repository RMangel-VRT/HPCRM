import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { TICKET_TYPE_CAPABILITIES } from "../shared/ticketCapabilities";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db", () => ({ db: { execute: mocks.execute } }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../auth", () => ({ setupAuth: vi.fn(), hashPassword: vi.fn() }));

import { backfillTicketTypeCapabilities } from "./routes";

type TypeRow = {
  id: string;
  name: string;
  typeKey: string | null;
  caps?: typeof TICKET_TYPE_CAPABILITIES[string];
};
type StatusRow = { typeId: string; name: string; statusKey: string | null };

const dialect = new PgDialect();

function installDb(types: TypeRow[], statuses: StatusRow[], hasTypeKey: boolean) {
  const statements: string[] = [];
  mocks.execute.mockImplementation(async (statement: SQL) => {
    const query = dialect.sqlToQuery(statement);
    const text = query.sql.replace(/\$(\d+)/g, (_, index: string) =>
      JSON.stringify(query.params[Number(index) - 1])).trim();
    statements.push(text);
    if (text.includes("information_schema.columns")) {
      return { rows: [{ count: text.includes("requires_customer") || hasTypeKey ? 1 : 0 }] };
    }
    if (text.startsWith("UPDATE ticket_types SET type_key")) {
      let rowCount = 0;
      for (const type of types) {
        if (type.typeKey === null && type.name === query.params[1]) {
          type.typeKey = query.params[0] as string;
          rowCount++;
        }
      }
      return { rowCount };
    }
    if (text.startsWith("UPDATE ticket_types SET")) {
      const keyed = text.includes("type_key IS NULL");
      const typeKey = keyed ? query.params[5] : null;
      const name = query.params[keyed ? 6 : 5];
      let rowCount = 0;
      for (const type of types) {
        if (keyed ? type.typeKey === typeKey || (type.typeKey === null && type.name === name)
          : type.name === name) {
          type.caps = {
            requiresCustomer: query.params[0],
            requiresScheduling: query.params[1],
            requiresCompletion: query.params[2],
            requiresInvoicing: query.params[3],
            terminalBehavior: query.params[4],
          } as TypeRow["caps"];
          rowCount++;
        }
      }
      return { rowCount };
    }
    if (text.startsWith("UPDATE ticket_type_statuses")) {
      expect(text).toContain("s.status_key IS NULL");
      const keyed = text.includes("t.type_key IS NULL");
      const typeKey = keyed ? query.params[1] : null;
      const name = query.params[keyed ? 2 : 1];
      const statusName = query.params[keyed ? 3 : 2];
      let rowCount = 0;
      for (const status of statuses) {
        const parent = types.find(type => type.id === status.typeId);
        if (parent && (keyed ? parent.typeKey === typeKey || (parent.typeKey === null && parent.name === name)
          : parent.name === name) && status.name === statusName && status.statusKey === null) {
          status.statusKey = query.params[0] as string;
          rowCount++;
        }
      }
      return { rowCount };
    }
    if (text.startsWith("SELECT COUNT(*)::int AS count FROM ticket_type_statuses")) {
      return { rows: [{ count: statuses.filter(status => status.statusKey === null).length }] };
    }
    throw new Error(`Unexpected backfill query: ${text}`);
  });
  return statements;
}

describe("startup ticket capability backfill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses keyed identities after renames, falls back for unkeyed types, and preserves status keys", async () => {
    const types: TypeRow[] = [
      { id: "invoice", name: "Billing Document", typeKey: "invoice" },
      { id: "todo", name: "To-Do", typeKey: null },
      { id: "misleading", name: "To-Do", typeKey: "invoice" },
    ];
    const statuses: StatusRow[] = [
      { typeId: "invoice", name: "Pending Invoice", statusKey: null },
      { typeId: "invoice", name: "Invoiced", statusKey: "custom_invoiced" },
      { typeId: "todo", name: "Open", statusKey: null },
      { typeId: "misleading", name: "Open", statusKey: null },
      { typeId: "misleading", name: "Pending Invoice", statusKey: null },
    ];
    const statements = installDb(types, statuses, true);

    await backfillTicketTypeCapabilities();

    expect(types.map(type => type.caps)).toEqual([
      TICKET_TYPE_CAPABILITIES.Invoice,
      TICKET_TYPE_CAPABILITIES["To-Do"],
      TICKET_TYPE_CAPABILITIES.Invoice,
    ]);
    expect(types[1].typeKey).toBe("todo");
    expect(statuses.map(status => status.statusKey)).toEqual([
      "pending_invoice", "custom_invoiced", "new", null, "pending_invoice",
    ]);
    expect(statements.some(text => text.includes('type_key = "invoice" OR (type_key IS NULL AND name = "Invoice")'))).toBe(true);
    expect(statements.some(text => text.includes('t.type_key = "invoice" OR (t.type_key IS NULL AND t.name = "Invoice")'))).toBe(true);
  });

  it("does not reference type_key in capability or status updates before that column exists", async () => {
    const types: TypeRow[] = [{ id: "todo", name: "To-Do", typeKey: null }];
    const statuses: StatusRow[] = [{ typeId: "todo", name: "Open", statusKey: null }];
    const statements = installDb(types, statuses, false);

    await backfillTicketTypeCapabilities();

    expect(types[0].caps).toEqual(TICKET_TYPE_CAPABILITIES["To-Do"]);
    expect(statuses[0].statusKey).toBe("new");
    expect(types[0].typeKey).toBeNull();
    expect(statements.filter(text => text.startsWith("UPDATE")).every(text => !text.includes("type_key"))).toBe(true);
  });
});