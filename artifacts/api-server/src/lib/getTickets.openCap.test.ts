import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { getTableColumns } from "drizzle-orm";
import { tickets } from "@workspace/db";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return {
    db: drizzle(async (sql, params) => ({ rows: mocks.query(sql, params) })),
    pool: {},
  };
});
// Import real storage without creating a session table or connecting to Postgres.
vi.mock("connect-pg-simple", () => ({ default: () => class {} }));
import { storage } from "../storage";

type Fixture = {
  id: string;
  companyId: string;
  customerId: string;
  contractId: string;
  assignedToId: string;
  currentStatusId: string;
  ticketTypeId: string;
  createdAt: Date;
};
let sqlite: DatabaseSync;
let fixtures: Fixture[];
let reads: Array<{ sql: string; params: unknown[] }>;
const columns = getTableColumns(tickets);

beforeEach(() => {
  vi.clearAllMocks();
  reads = [];
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE tickets (${Object.values(columns).map(c => `"${c.name}" TEXT`).join(", ")});
    CREATE TABLE ticket_type_statuses (id TEXT PRIMARY KEY, is_final TEXT);
    INSERT INTO ticket_type_statuses VALUES ('open', 'false'), ('closed', 'true');`);
  const row = (id: string, currentStatusId: string, time: number, i: number): Fixture => ({
    id, currentStatusId, ticketTypeId: i % 2 ? "task" : "invoice",
    createdAt: new Date(time), companyId: "company",
    customerId: i % 2 ? "customer-b" : "customer-a",
    contractId: i % 3 ? "contract-b" : "contract-a",
    assignedToId: i % 4 ? "assignee-b" : "assignee-a",
  });
  fixtures = [
    ...Array.from({ length: 600 }, (_, i) => row(`closed-${i}`, "closed", Date.UTC(2026, 0, 1) + i * 1000, i)),
    ...Array.from({ length: 10 }, (_, i) => row(`open-${i}`, "open", Date.UTC(2025, 0, 1) + i * 1000, i)),
    // Missing statuses count as open, whether old or interleaved with closed work.
    row("missing-old", "deleted-status", Date.UTC(2024, 0, 1), 0),
    row("missing-middle", "deleted-status", Date.UTC(2026, 0, 1) + 550500, 0),
    { ...row("foreign-open", "open", Date.UTC(2023, 0, 1), 0), companyId: "other-company" },
    { ...row("foreign-closed", "closed", Date.UTC(2027, 0, 1), 0), companyId: "other-company" },
    { ...row("foreign-missing", "deleted-status", Date.UTC(2027, 0, 1), 0), companyId: "other-company" },
  ];
  const insert = sqlite.prepare(`INSERT INTO tickets VALUES (${Object.keys(columns).map(() => "?").join(", ")})`);
  for (const fixture of fixtures) {
    insert.run(...Object.keys(columns).map(key => {
      const value = fixture[key as keyof Fixture];
      return value instanceof Date ? value.toISOString() : value ?? null;
    }));
  }
  mocks.query.mockImplementation((sql: string, params: SQLInputValue[]) => {
    reads.push({ sql, params });
    // SQLite and PostgreSQL share the selection syntax here, except PostgreSQL
    // parenthesizes UNION operands. Wrap each operand as a SQLite subquery.
    // Predicates, joins, projections, ordering and limit are executed unchanged.
    const portable = sql.replace(/^\((select .*)\) union all \((select .*)\)( order by .*)$/s,
      "select * from ($1) union all select * from ($2)$3");
    const bindings: SQLInputValue[] = [];
    const positional = portable.replace(/\$(\d+)/g, (_, index: string) => {
      bindings.push(params[Number(index) - 1]);
      return "?";
    });
    return sqlite.prepare(positional).all(...bindings).map(row => Object.values(row));
  });
});
afterEach(() => sqlite.close());

type Filters = NonNullable<Parameters<typeof storage.getTickets>[1]>;
const matching = (f: Fixture, filters: Filters) => f.companyId === "company" &&
  (!filters.customerId || f.customerId === filters.customerId) &&
  (!filters.contractId || f.contractId === filters.contractId) &&
  (!filters.assignedToId || f.assignedToId === filters.assignedToId);
const newest = (rows: Fixture[]) => [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
const expected = (filters: Filters) => {
  const scoped = fixtures.filter(f => matching(f, filters));
  return newest([
    ...scoped.filter(f => f.currentStatusId !== "closed"),
    ...newest(scoped.filter(f => f.currentStatusId === "closed")).slice(0, 500),
  ]);
};

describe("real getTickets selection SQL against in-memory fixtures", () => {
  it("keeps all ten older open tickets and missing statuses plus exactly the newest 500 closed", async () => {
    const result = await storage.getTickets("company");
    expect(result.map(t => t.id)).toEqual(expected({}).map(t => t.id));
    expect(result).toHaveLength(512);
    expect(result.filter(t => t.currentStatusId === "closed").map(t => t.id))
      .toEqual(Array.from({ length: 500 }, (_, i) => `closed-${599 - i}`));
    for (let i = 0; i < 10; i++) expect(result.some(t => t.id === `open-${i}`)).toBe(true);
    expect(result.some(t => t.id === "missing-old")).toBe(true);
    expect(result.some(t => t.id === "missing-middle")).toBe(true);
    expect(result.filter(t => t.currentStatusId === "open" && t.ticketTypeId === "invoice")).toHaveLength(5);
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
    expect(result.every(t => t.companyId === "company")).toBe(true);
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(Object.keys(result[0])).toEqual(Object.keys(columns));
  });

  it.each<Filters>([
    { customerId: "customer-a" },
    { contractId: "contract-a" },
    { assignedToId: "assignee-a" },
    { customerId: "customer-a", contractId: "contract-a" },
    { customerId: "customer-a", assignedToId: "assignee-a" },
    { contractId: "contract-a", assignedToId: "assignee-a" },
    { customerId: "customer-a", contractId: "contract-a", assignedToId: "assignee-a" },
    { customerId: "no-match" },
    // These declared but historically unused filters must remain unused.
    { status: "nonexistent", category: "project" },
  ])("preserves effective filters on both selections: %j", async filters => {
    const result = await storage.getTickets("company", filters);
    expect(result.map(t => t.id)).toEqual(expected(filters).map(t => t.id));
    expect(result.every(t => t.companyId === "company")).toBe(true);
    expect(new Set(result.map(t => t.id)).size).toBe(result.length);
    expect(reads).toHaveLength(1);
  });

  it("does not impose a 500-row limit on open work itself", async () => {
    const insert = sqlite.prepare(`INSERT INTO tickets
      (id, company_id, current_status_id, created_at) VALUES (?, ?, ?, ?)`);
    for (let i = 0; i < 600; i++) {
      insert.run(`older-open-${i}`, "company", "open", "2020-01-01T00:00:00.000Z");
    }
    const result = await storage.getTickets("company");
    expect(result).toHaveLength(1112);
    expect(result.filter(t => t.currentStatusId === "open")).toHaveLength(610);
    expect(result.filter(t => t.currentStatusId === "closed")).toHaveLength(500);
    expect(new Set(result.map(t => t.id)).size).toBe(1112);
    expect(reads).toHaveLength(1);
  });

  it.each(["company", "other-company", "empty-company"])("uses one SQL read regardless of result size for %s", async companyId => {
    await storage.getTickets(companyId);
    expect(reads).toHaveLength(1);
    expect(reads[0].sql).toContain("union all");
    expect(reads[0].sql.match(/left join "ticket_type_statuses"/g)).toHaveLength(2);
    expect(reads[0].sql.match(/"tickets"."company_id" =/g)).toHaveLength(2);
    expect(reads[0].sql.match(/limit /g)).toHaveLength(1);
    expect(reads[0].sql.trim()).toMatch(/order by "created_at" desc$/);
    expect(reads[0].params.filter(p => p === companyId)).toHaveLength(2);
  });
});
