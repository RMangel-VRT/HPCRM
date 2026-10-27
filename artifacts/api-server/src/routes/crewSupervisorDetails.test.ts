import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { excludeBidsFromPersonalTickets } from "../lib/personalTicketScope";

const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.get("/api/tickets/:id/details",');
const end = source.indexOf("  // Customer Map Layers", start);
if (start < 0 || end < 0) throw new Error("Real details handler not found");
const mount = new Function("app", "storage", transformSync(source.slice(start, end), { loader: "ts" }).code);
const listStart = source.indexOf('  app.get("/api/tickets",');
const listEnd = source.indexOf('  app.get("/api/tickets/:id",', listStart);
if (listStart < 0 || listEnd < 0) throw new Error("Real ticket collection handler not found");
const mountList = new Function("app", "storage", "withInvoiceLinkSummaries",
  transformSync(source.slice(listStart, listEnd), { loader: "ts" }).code);
const myStart = source.indexOf('  app.get("/api/tickets/my",');
const mountMy = new Function("app", "storage", "withInvoiceLinkSummaries", "excludeBidsFromPersonalTickets",
  transformSync(source.slice(myStart, listStart), { loader: "ts" }).code);
const customerStart = source.indexOf('  app.get("/api/customers/:customerId/tickets",');
const customerEnd = source.indexOf('  app.get("/api/contracts/:contractId/tickets",', customerStart);
const mountCustomerList = new Function("app", "storage", "withInvoiceLinkSummaries",
  transformSync(source.slice(customerStart, customerEnd), { loader: "ts" }).code);
let ticket: any;
let user: any;
let storage: Record<string, ReturnType<typeof vi.fn>>;
let app: express.Express;
let summaries: ReturnType<typeof vi.fn>;
beforeEach(() => {
  ticket = { id: "job", ticketTypeId: "task", companyId: "company", assignedToId: "owner" };
  user = { id: "owner", activeCompanyId: "company", activeRole: "crew_supervisor", activeTags: [] };
  storage = {};
  for (const name of [
    "getTicketTypeStatuses", "getTicketFieldValues", "getTicketStatusHistory", "getTicketComments",
    "getTicketTypeFieldsByStatuses", "getTicketLinks", "getTicketsByIds", "getTicketTypesByIds",
    "getTicketTypeStatusesByTypeIds",
  ]) storage[name] = vi.fn().mockResolvedValue([]);
  storage.getTicketById = vi.fn().mockResolvedValue(ticket);
  storage.getTicketTypeById = vi.fn().mockResolvedValue({ id: "task" });
  storage.getUserById = vi.fn().mockResolvedValue({ id: "owner" });
  storage.getTickets = vi.fn().mockResolvedValue([ticket]);
  storage.getTicketsByCustomerId = vi.fn().mockResolvedValue([ticket]);
  storage.getAllTicketTypeStatuses = vi.fn().mockResolvedValue([]);
  storage.getTicketTypes = vi.fn().mockResolvedValue([{ id: "task", typeKey: "task" }]);
  storage.getCustomersByIds = vi.fn().mockResolvedValue(new Map());
  summaries = vi.fn().mockImplementation(async (_company: string, rows: unknown[]) => rows);
  app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as any;
    req.user = user;
    next();
  });
  // Deliberately no outer middleware: exercise the actual details handler guard.
  mount(app, storage);
  mountList(app, storage, summaries);
  mountMy(app, storage, summaries, excludeBidsFromPersonalTickets);
  mountCustomerList(app, storage, summaries);
});
describe("actual web details handler crew-supervisor access", () => {
  it("opens the assigned ticket and its detail payload", async () => {
    const res = await request(app).get("/api/tickets/job/details");
    expect(res.status).toBe(200);
    expect(res.body.ticket.id).toBe("job");
    expect(storage.getTicketById).toHaveBeenCalledWith("job", "company");
  });
  it("display Project metadata neither grants ownership access nor replaces the raw estimate identity", async () => {
    Object.assign(ticket, { ticketTypeId: "estimate", displayTypeKey: "project", displayTypeName: "Project" });
    storage.getTicketTypeById.mockResolvedValue({ id: "estimate", typeKey: "estimate_request", name: "Renamed estimate" });
    ticket.assignedToId = "other";
    expect((await request(app).get("/api/tickets/job/details")).status).toBe(403);
    ticket.assignedToId = "owner";
    const response = await request(app).get("/api/tickets/job/details");
    expect(response.status).toBe(200);
    expect(response.body.ticket.ticketTypeId).toBe("estimate");
    expect(response.body.ticketType.typeKey).toBe("estimate_request");
    expect(storage.getTicketTypeById).toHaveBeenLastCalledWith("estimate", "company");
  });
  it.each([[], ["billing"]].map(tags => ({ tags })))("blocks other owners before loading linked data, tags=$tags", async ({ tags }) => {
    ticket.assignedToId = "other";
    user.activeTags = tags;
    expect((await request(app).get("/api/tickets/job/details")).status).toBe(403);
    expect(storage.getTicketComments).not.toHaveBeenCalled();
    expect(storage.getTicketLinks).not.toHaveBeenCalled();
  });
  it("hides a foreign-company ticket even when assigned to the caller", async () => {
    ticket.companyId = "foreign";
    expect((await request(app).get("/api/tickets/job/details")).status).toBe(404);
    expect(storage.getTicketComments).not.toHaveBeenCalled();
  });
  it("does not expose clickable linked tickets belonging to other owners", async () => {
    storage.getTicketLinks.mockResolvedValue([{ sourceTicketId: "job", targetTicketId: "other" }]);
    storage.getTicketsByIds.mockResolvedValue([{ id: "other", ticketTypeId: "task", assignedToId: "someone" }]);
    expect((await request(app).get("/api/tickets/job/details")).body.linkedTickets).toEqual([]);
  });
  it("leaves office access to other owners' tickets unchanged", async () => {
    user.activeRole = "office";
    ticket.assignedToId = "other";
    expect((await request(app).get("/api/tickets/job/details")).status).toBe(200);
  });
  it("registers the subtree guard before separately registered ticket routes", () => {
    expect(source.indexOf("registerCrewSupervisorTicketGuard(app, storage)"))
      .toBeLessThan(source.indexOf("registerTicketOwnerResponseRoutes(app)"));
  });
  it.each([[], ["billing"]].map(tags => ({ tags })))("forces the related-ticket collection to self even with forged filters, tags=$tags", async ({ tags }) => {
    user.activeTags = tags;
    expect((await request(app).get("/api/tickets?assignedToId=other&customerId=customer")).status).toBe(200);
    expect(storage.getTickets).toHaveBeenCalledWith("company", { assignedToId: "owner", customerId: "customer" });
  });
  it.each(["/api/tickets/my", "/api/tickets", "/api/customers/customer/tickets"])("scopes both directions of summaries on actual collection route %s", async path => {
    user.activeTags = ["billing"];
    expect((await request(app).get(path)).status).toBe(200);
    expect(summaries).toHaveBeenLastCalledWith("company", expect.any(Array), "owner");
  });
  it("does not impose crew summary scoping on office", async () => {
    user.activeRole = "office";
    expect((await request(app).get("/api/tickets")).status).toBe(200);
    expect(summaries).toHaveBeenLastCalledWith("company", expect.any(Array), undefined);
  });
});
