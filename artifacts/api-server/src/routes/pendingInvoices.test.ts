import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import { tickets, ticketLinks, customers } from "@workspace/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), getTicketTypes: vi.fn(), getTicketTypeStatuses: vi.fn(),
  getTicketsByIds: vi.fn(), getTickets: vi.fn(),
}));
vi.mock("../db", () => ({ db: { select: mocks.select } }));
vi.mock("../storage", () => ({ storage: mocks }));
import { invoiceAgeDays, registerPendingInvoicesRoute } from "./pendingInvoices";

const dialect = new PgDialect();
let rows: any[];
let links: any[];
let sources: any[];
let query: { sql: string; params: unknown[] } | undefined;
function app(role = "admin", authenticated = true) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authenticated;
    (req as any).user = { id: "viewer", activeCompanyId: "company", activeRole: role };
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
    mocks.getTicketTypeStatuses.mockResolvedValue([
      { id: "pending", statusKey: "pending_invoice", name: "Renamed Waiting" },
      { id: "decoy", statusKey: "invoiced", name: "Pending Invoice" },
    ]);
    mocks.getTicketsByIds.mockImplementation(async (ids: string[], companyId: string) =>
      sources.filter(ticket => ids.includes(ticket.id) && ticket.companyId === companyId));
    mocks.select.mockImplementation(() => ({
      from: (table: unknown) => ({
        // No limit() on this double: adding a limit fails the regression.
        where: (condition: any) => {
          const compiled = dialect.sqlToQuery(condition);
          if (table === tickets) {
            query = compiled;
            return Promise.resolve(rows.filter(ticket =>
              ticket.companyId === compiled.params[0] && ticket.ticketTypeId === compiled.params[1]
              && ticket.currentStatusId === compiled.params[2]));
          }
          if (table === ticketLinks) return Promise.resolve(links);
          if (table === customers) return Promise.resolve([]);
          throw new Error("Unexpected query");
        },
      }),
    }));
  });
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
    expect(mocks.getTicketsByIds).toHaveBeenCalledExactlyOnceWith(["parent", "foreign"], "company");
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
  afterEach(() => vi.useRealTimers());
});

describe("Colorado calendar invoice age", () => {
  it.each([
    ["2026-10-08T05:30:00Z", "2026-10-08T06:30:00Z", 1],
    ["2026-10-08T00:00:00Z", "2026-10-08T05:30:00Z", 0],
    ["2026-03-07T19:00:00Z", "2026-03-09T18:00:00Z", 2],
    ["2026-10-31T18:00:00Z", "2026-11-02T19:00:00Z", 2],
  ])("counts %s to %s as %s calendar days, including DST", (base, now, expected) => {
    expect(invoiceAgeDays(new Date(base), new Date(now))).toBe(expected);
  });
});
