import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import { tickets, ticketLinks, customers, companyUsers } from "@workspace/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), getTicketTypes: vi.fn(), getTicketTypeStatuses: vi.fn(),
  getTicketsByIds: vi.fn(), getTickets: vi.fn(), getTicketTypeStatusesByTypeIds: vi.fn(),
}));
vi.mock("../db", () => ({ db: { select: mocks.select } }));
vi.mock("../storage", () => ({ storage: mocks }));
import { invoiceAgeDays, recentInvoiceBounds, registerPendingInvoicesRoute } from "./pendingInvoices";

const dialect = new PgDialect();
let rows: any[];
let links: any[];
let sources: any[];
let query: { sql: string; params: unknown[] } | undefined;
function app(role = "admin", authenticated = true, tags: string[] = []) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authenticated;
    (req as any).user = { id: "viewer", activeCompanyId: "company", activeRole: role, activeTags: tags };
    next();
  });
  registerPendingInvoicesRoute(app);
  return app;
}
const invoice = (id: string, extra = {}) => ({
  id, companyId: "company", ticketTypeId: "invoice-type", currentStatusId: "pending",
  title: id, createdAt: new Date("2026-10-01T18:00:00Z"), customerId: null,
  workCompletedDate: null, invoiceCategory: "landscape", ...extra,
});

describe("GET /api/pending-invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query = undefined;
    rows = [invoice("standalone")];
    links = [];
    sources = [];
    mocks.getTicketTypes.mockResolvedValue([
      { id: "invoice-type", typeKey: "invoice", name: "Renamed Charges" },
      { id: "task-type", typeKey: "task", name: "Renamed Task" },
    ]);
    mocks.getTicketTypeStatusesByTypeIds.mockResolvedValue([
      { id: "pending", ticketTypeId: "invoice-type", statusKey: "pending_invoice", name: "Renamed Waiting", isFinal: "false" },
      { id: "decoy", ticketTypeId: "invoice-type", statusKey: "invoiced", name: "Pending Invoice", isFinal: "true" },
      { id: "rfb", ticketTypeId: "task-type", statusKey: "ready_for_billing", name: "Renamed ready", isFinal: "false" },
    ]);
    mocks.getTicketsByIds.mockImplementation(async (ids: string[], companyId: string) =>
      [...sources, ...rows].filter(ticket => ids.includes(ticket.id) && ticket.companyId === companyId));
    mocks.select.mockImplementation(() => ({
      from: (table: unknown) => ({
        innerJoin: () => ({
          where: (condition: any) => {
            expect(table).toBe(companyUsers);
            expect(dialect.sqlToQuery(condition).params).toContain("company");
            return Promise.resolve([{ id: "viewer", name: "Viewer" }, { id: "other", name: "Other assignee" }]);
          },
        }),
        // No limit() on this double: adding a limit fails the regression.
        where: (condition: any) => {
          const compiled = dialect.sqlToQuery(condition);
          if (table === tickets) {
            if (compiled.sql.includes('"ticket_type_id" =')) query = compiled;
            return Promise.resolve(rows.filter(ticket => {
              const columns: Record<string, string> = { company_id: "companyId", ticket_type_id: "ticketTypeId", current_status_id: "currentStatusId" };
              for (const match of compiled.sql.matchAll(/"tickets"\."(\w+)" (=|<>) \$(\d+)/g)) {
                if (!columns[match[1]]) continue;
                const equal = ticket[columns[match[1]]] === compiled.params[Number(match[3]) - 1];
                if (match[2] === "=" ? !equal : equal) return false;
              }
              for (const match of compiled.sql.matchAll(/"tickets"\."(\w+)" in \(([^)]+)\)/g)) {
                const values = [...match[2].matchAll(/\$(\d+)/g)].map(m => compiled.params[Number(m[1]) - 1]);
                if (!values.includes(ticket[columns[match[1]]])) return false;
              }
              if (compiled.sql.includes('"assigned_to_id"') && ticket.assignedToId != null && ticket.assignedToId !== "viewer") return false;
              const start = compiled.sql.match(/"completed_at" >= \$(\d+)/);
              const end = compiled.sql.match(/"completed_at" < \$(\d+)/);
              if (start && (!ticket.completedAt || new Date(ticket.completedAt) < new Date(compiled.params[Number(start[1]) - 1] as string))) return false;
              if (end && (!ticket.completedAt || new Date(ticket.completedAt) >= new Date(compiled.params[Number(end[1]) - 1] as string))) return false;
              return true;
            }));
          }
          if (table === ticketLinks) return Promise.resolve(links);
          if (table === customers) return Promise.resolve([]);
          throw new Error("Unexpected query");
        },
      }),
    }));
  });
  it.each(["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"])(
    "serializes approved estimate source metadata at %s without replacing raw identity", async statusKey => {
      mocks.getTicketTypes.mockResolvedValue([
        { id: "invoice-type", typeKey: "invoice", name: "Renamed Charges" },
        { id: "estimate-type", typeKey: "estimate_request", name: "Renamed estimate" },
      ]);
      mocks.getTicketTypeStatusesByTypeIds.mockResolvedValue([
        { id: "pending", ticketTypeId: "invoice-type", statusKey: "pending_invoice", isFinal: "false" },
        { id: "approved", ticketTypeId: "estimate-type", statusKey, isFinal: "false" },
      ]);
      links = [{ sourceTicketId: "estimate", targetTicketId: "standalone", linkType: "invoice_for" }];
      sources = [invoice("estimate", { ticketTypeId: "estimate-type", currentStatusId: "approved" })];
      const response = await request(app()).get("/api/pending-invoices");
      expect(response.status).toBe(200);
      expect(response.body[0].sourceTicket).toMatchObject({
        ticketTypeId: "estimate-type", typeKey: "estimate_request", typeName: "Renamed estimate",
        displayTypeKey: "project", displayTypeName: "Project",
      });
    },
  );
  it("requires authentication before reading any data", async () => {
    expect((await request(app("admin", false)).get("/api/pending-invoices")).status).toBe(401);
    expect(mocks.getTicketTypes).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it.each(["field_manager", "chemical_manager", "field", "irrigation_manager", "landscape_supervisor", "crew_supervisor", "maintenance_manager", "unknown"])(
    "rejects %s before reading data", async role => {
      expect((await request(app(role)).get("/api/pending-invoices")).status).toBe(403);
      expect(mocks.getTicketTypes).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
    },
  );
  it.each(["admin", "office"])("allows %s and preserves standalone fields", async role => {
    const response = await request(app(role)).get("/api/pending-invoices");
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: "standalone", sourceTicket: null, customer: null,
      ticketTypeName: "Renamed Charges", invoiceCategory: "landscape", ageDays: expect.any(Number),
    });
  });
  it("returns an invoice older than 500 newer tickets using a scoped, uncapped identity query", async () => {
    rows = [
      ...Array.from({ length: 501 }, (_, index) => invoice(`new-${index}`, { ticketTypeId: "task-type" })),
      invoice("old-charge", { createdAt: new Date("2020-01-01T18:00:00Z") }),
      invoice("other-company", { companyId: "other" }),
      invoice("already-billed", { currentStatusId: "decoy" }),
    ];
    const response = await request(app()).get("/api/pending-invoices");
    expect(response.body.map((row: any) => row.id)).toEqual(["old-charge"]);
    expect(query?.params).toEqual(["company", "invoice-type", "pending"]);
    expect(query?.sql).toContain('"tickets"."company_id"');
    expect(query?.sql).toContain('"tickets"."ticket_type_id"');
    expect(query?.sql).toContain('"tickets"."current_status_id"');
    expect(mocks.getTickets).not.toHaveBeenCalled();
  });
  it("bulk-loads scoped source tickets, adds type metadata, and ignores foreign-company counterparts", async () => {
    rows = [invoice("linked"), invoice("foreign-link"), invoice("standalone")];
    links = [
      { targetTicketId: "linked", sourceTicketId: "parent", linkType: "invoice_for" },
      { targetTicketId: "foreign-link", sourceTicketId: "foreign", linkType: "invoice_for" },
    ];
    sources = [
      { id: "parent", companyId: "company", ticketTypeId: "task-type", title: "Source job" },
      { id: "foreign", companyId: "other", ticketTypeId: "task-type" },
    ];
    const response = await request(app()).get("/api/pending-invoices");
    expect(response.body[0].sourceTicket).toMatchObject({ title: "Source job", typeKey: "task", typeName: "Renamed Task" });
    expect(response.body[1].sourceTicket).toBeNull();
    expect(response.body[2].sourceTicket).toBeNull();
    expect(mocks.getTicketsByIds).toHaveBeenCalledExactlyOnceWith(["parent", "linked", "foreign", "foreign-link"], "company");
  });
  it("uses workCompletedDate before createdAt for age", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T18:00:00Z"));
    rows = [invoice("worked", { workCompletedDate: new Date("2026-10-06T18:00:00Z") }), invoice("fallback")];
    const response = await request(app()).get("/api/pending-invoices");
    expect(response.body.map((row: any) => row.ageDays)).toEqual([2, 7]);
  });
  it("returns an empty list if seeded type or status is absent", async () => {
    mocks.getTicketTypes.mockResolvedValue([]);
    expect((await request(app()).get("/api/pending-invoices")).body).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("allows billing-tagged field managers but denies untagged ones", async () => {
    expect((await request(app("field_manager", true, ["billing"])).get("/api/pending-invoices")).status).toBe(200);
    expect((await request(app("field_manager")).get("/api/pending-invoices")).status).toBe(403);
  });
  it("tagged field viewers receive scoped names without administrative directory access", async () => {
    rows = [invoice("charge", { assignedToId: "other" })];
    const result = await request(app("field_manager", true, ["billing"])).get("/api/pending-invoices?scope=all");
    expect(result.status).toBe(200);
    expect(result.body[0]).toMatchObject({ assignedToId: "other", assigneeName: "Other assignee" });
  });
  it("mine includes own and unassigned invoices and every stranded job, never another assignee's invoice", async () => {
    rows = [invoice("own", { assignedToId: "viewer" }), invoice("unassigned"), invoice("someone-else", { assignedToId: "other" }),
      invoice("job", { ticketTypeId: "task-type", currentStatusId: "rfb", billingBehavior: "invoice_required", assignedToId: "other" })];
    const response = await request(app()).get("/api/pending-invoices?scope=mine");
    expect(response.body.map((r: any) => [r.id, r.kind])).toEqual([["own", "invoice"], ["unassigned", "invoice"], ["job", "stranded"]]);
    expect(response.body[2]).toMatchObject({ invoiceCategory: null, assignedToId: "other", sourceTicket: { id: "job", typeKey: "task", typeName: "Renamed Task" } });
  });
  it("excludes contract Tasks; deleted, non-Invoice and cross-company targets do not hide a stranded charge", async () => {
    const job = (id: string, billingBehavior = "invoice_required") => invoice(id, { ticketTypeId: "task-type", currentStatusId: "rfb", billingBehavior });
    rows = [job("contract", "no_invoice"), job("valid"), job("deleted"), job("foreign"), job("not-invoice"), invoice("charge")];
    links = [
      { sourceTicketId: "valid", targetTicketId: "charge" },
      { sourceTicketId: "deleted", targetTicketId: "missing" },
      { sourceTicketId: "foreign", targetTicketId: "other-company-charge" },
      { sourceTicketId: "not-invoice", targetTicketId: "contract" },
    ];
    sources = [invoice("other-company-charge", { companyId: "other" })];
    const result = await request(app()).get("/api/pending-invoices");
    expect(result.body.filter((r: any) => r.kind === "stranded").map((r: any) => r.id)).toEqual(["deleted", "foreign", "not-invoice"]);
  });
  it("recovery replaces one stranded job with one normal Invoice charge", async () => {
    rows = [invoice("job", { ticketTypeId: "task-type", currentStatusId: "rfb", billingBehavior: "invoice_required" })];
    expect((await request(app()).get("/api/pending-invoices")).body.map((r: any) => r.kind)).toEqual(["stranded"]);
    rows.push(invoice("recovered"));
    links = [{ sourceTicketId: "job", targetTicketId: "recovered" }];
    const result = await request(app()).get("/api/pending-invoices");
    expect(result.body).toHaveLength(1);
    expect(result.body[0]).toMatchObject({ id: "recovered", kind: "invoice", sourceTicket: { id: "job" } });
  });
  it("keeps a fixed bulk query budget for thousands of pending and stranded rows", async () => {
    const calls = async (count: number) => {
      vi.clearAllMocks();
      rows = Array.from({ length: count }, (_, i) => [
        invoice(`charge-${i}`, { customerId: "property", assignedToId: "viewer" }),
        invoice(`job-${i}`, { customerId: "property", assignedToId: "other", ticketTypeId: "task-type", currentStatusId: "rfb", billingBehavior: "invoice_required" }),
      ]).flat();
      const result = await request(app()).get("/api/pending-invoices");
      expect(result.body).toHaveLength(count * 2);
      return [mocks.select.mock.calls.length, mocks.getTicketsByIds.mock.calls.length, mocks.getTicketTypeStatusesByTypeIds.mock.calls.length];
    };
    expect(await calls(1500)).toEqual(await calls(1));
  });
  it("recent uses final statuses, newest first and the same assignment boundary, never stranded", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T02:00:00Z")); // October 8, 8 pm Colorado; host UTC
    rows = [
      invoice("today", { currentStatusId: "decoy", completedAt: new Date("2026-10-09T01:00:00Z") }),
      invoice("first-day", { currentStatusId: "decoy", completedAt: new Date("2026-09-09T06:00:00Z") }),
      invoice("too-old", { currentStatusId: "decoy", completedAt: new Date("2026-09-09T05:59:59Z") }),
      invoice("31-days", { currentStatusId: "decoy", completedAt: new Date("2026-09-07T18:00:00Z") }),
      invoice("tomorrow", { currentStatusId: "decoy", completedAt: new Date("2026-10-09T06:00:00Z") }),
      invoice("someone-else", { currentStatusId: "decoy", completedAt: new Date("2026-10-09T01:30:00Z"), assignedToId: "other" }),
      invoice("pending"), invoice("stranded", { ticketTypeId: "task-type", currentStatusId: "rfb", billingBehavior: "invoice_required" }),
    ];
    const result = await request(app()).get("/api/pending-invoices?scope=mine&view=recent");
    expect(result.body.map((r: any) => r.id)).toEqual(["today", "first-day"]);
    expect(result.body.every((r: any) => r.kind === "invoice" && r.completedAt)).toBe(true);
  });
  it("rejects unknown scope/view", async () => {
    expect((await request(app()).get("/api/pending-invoices?scope=other")).status).toBe(400);
    expect((await request(app()).get("/api/pending-invoices?view=other")).status).toBe(400);
  });
  afterEach(() => vi.useRealTimers());
});

describe("Colorado calendar invoice age", () => {
  it.each([
    ["2026-03-10T02:00:00Z", "2026-02-08T07:00:00.000Z", "2026-03-10T06:00:00.000Z"],
    ["2026-11-03T03:00:00Z", "2026-10-04T06:00:00.000Z", "2026-11-03T07:00:00.000Z"],
  ])("recent half-open window resolves each DST midnight at %s", (now, start, end) => {
    const bounds = recentInvoiceBounds(new Date(now));
    expect(bounds.start.toISOString()).toBe(start);
    expect(bounds.end.toISOString()).toBe(end);
  });
  it.each([
    ["2026-10-08T05:30:00Z", "2026-10-08T06:30:00Z", 1],
    ["2026-10-08T00:00:00Z", "2026-10-08T05:30:00Z", 0],
    ["2026-03-07T19:00:00Z", "2026-03-09T18:00:00Z", 2],
    ["2026-10-31T18:00:00Z", "2026-11-02T19:00:00Z", 2],
    ["2026-10-09T00:00:00-06:00", "2026-10-09T23:59:59-06:00", 0],
    ["2026-10-09T23:59:59-06:00", "2026-10-10T00:00:00-06:00", 1],
    ["2026-03-08T00:00:00-07:00", "2026-03-09T00:00:00-06:00", 1],
    ["2026-11-01T00:00:00-06:00", "2026-11-02T00:00:00-07:00", 1],
  ])("counts %s to %s as %s calendar days, including DST", (base, now, expected) => {
    expect(invoiceAgeDays(new Date(base), new Date(now))).toBe(expected);
  });
});
