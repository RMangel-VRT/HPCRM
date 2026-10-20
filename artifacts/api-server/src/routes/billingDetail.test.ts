// @vitest-environment node
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canSeeBilling, isStrandedEligible } from "../lib/billing";
import { findSeededTicketType, isSeededStatus, isSeededTicketType } from "../shared/ticketCapabilities";

// Exercise the real detail handler, including the existing assignment guard.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.get("/api/tickets/:id",');
const end = source.indexOf('  app.get("/api/customers/:customerId/tickets",', start);
if (start < 0 || end < 0) throw new Error("Ticket detail handler not found");
const mount = new Function("deps", `
  const {app,storage,canSeeBilling,isStrandedEligible,findSeededTicketType,isSeededStatus,isSeededTicketType} = deps;
  ${transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code}
`);
let app: express.Express;
let ticket: any;
let viewer: any;
let storage: any;
const invoice = { id: "invoice", typeKey: "invoice", name: "Renamed Charges" };
const task = { id: "task", typeKey: "task", name: "Renamed Work" };
beforeEach(() => {
  ticket = { id: "job", companyId: "company", ticketTypeId: "invoice", currentStatusId: "pending", assignedToId: null, billingBehavior: "invoice_required" };
  viewer = { id: "viewer", activeCompanyId: "company", activeRole: "field_manager", activeTags: ["billing"] };
  storage = {
    getTicketById: vi.fn(async () => ticket),
    getTicketTypeById: vi.fn(async (id: string) => id === "invoice" ? invoice : task),
    getTicketTypeStatuses: vi.fn().mockResolvedValue([{ id: "rfb", statusKey: "ready_for_billing", name: "Renamed Ready" }]),
    getTicketLinks: vi.fn().mockResolvedValue([]),
    getTicketsByIds: vi.fn().mockResolvedValue([]),
    getTicketTypes: vi.fn().mockResolvedValue([invoice, task]),
  };
  app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as any;
    req.user = viewer;
    next();
  });
  mount({ app, storage, canSeeBilling, isStrandedEligible, findSeededTicketType, isSeededStatus, isSeededTicketType });
});
describe("billing-authorized ticket detail", () => {
  it("crew supervisor can open their assigned ticket", async () => {
    Object.assign(viewer, { activeRole: "crew_supervisor", activeTags: [] });
    Object.assign(ticket, { assignedToId: "viewer", ticketTypeId: "task" });
    expect((await request(app).get("/api/tickets/job")).status).toBe(200);
    expect(storage.getTicketById).toHaveBeenCalledWith("job", "company");
  });
  it.each([{ tags: [] }, { tags: ["billing"] }])("crew supervisor cannot open another person's ticket, tags=$tags", async ({ tags }) => {
    Object.assign(viewer, { activeRole: "crew_supervisor", activeTags: tags });
    ticket.assignedToId = "other";
    expect((await request(app).get("/api/tickets/job")).status).toBe(403);
    expect(storage.getTicketTypeById).not.toHaveBeenCalled();
  });
  it("crew supervisor cannot cross the tenant boundary even for an assigned ticket", async () => {
    Object.assign(viewer, { activeRole: "crew_supervisor", activeTags: [] });
    Object.assign(ticket, { companyId: "foreign", assignedToId: "viewer" });
    expect((await request(app).get("/api/tickets/job")).status).toBe(404);
  });
  it.each(["field_manager", "chemical_manager", "irrigation_manager"])("%s can open an unassigned charge", async role => {
    viewer.activeRole = role;
    expect((await request(app).get("/api/tickets/job")).status).toBe(200);
    expect(storage.getTicketById).toHaveBeenCalledWith("job", "company");
  });
  it("company-wide billing access includes another assignee's recent Invoice", async () => {
    Object.assign(ticket, { assignedToId: "other", currentStatusId: "invoiced", completedAt: new Date() });
    expect((await request(app).get("/api/tickets/job")).status).toBe(200);
  });
  it("can open another assignee's stranded job", async () => {
    Object.assign(ticket, { ticketTypeId: "task", currentStatusId: "rfb", assignedToId: "other" });
    expect((await request(app).get("/api/tickets/job")).status).toBe(200);
    expect(storage.getTicketsByIds).toHaveBeenCalledWith([], "company");
  });
  it.each(["deleted", "foreign", "non-invoice"])("invalid %s invoice link does not prevent stranded detail access", async kind => {
    Object.assign(ticket, { ticketTypeId: "task", currentStatusId: "rfb", assignedToId: "other" });
    storage.getTicketLinks.mockResolvedValue([{ sourceTicketId: "job", targetTicketId: "target", linkType: "invoice_for" }]);
    storage.getTicketsByIds.mockResolvedValue(kind === "deleted" ? [] : [{
      id: "target", companyId: kind === "foreign" ? "foreign" : "company", ticketTypeId: kind === "non-invoice" ? "task" : "invoice",
    }]);
    expect((await request(app).get("/api/tickets/job")).status).toBe(200);
  });
  it("valid company Invoice counterpart makes a job non-stranded", async () => {
    Object.assign(ticket, { ticketTypeId: "task", currentStatusId: "rfb", assignedToId: "other" });
    storage.getTicketLinks.mockResolvedValue([{ sourceTicketId: "job", targetTicketId: "target", linkType: "invoice_for" }]);
    storage.getTicketsByIds.mockResolvedValue([{ id: "target", companyId: "company", ticketTypeId: "invoice" }]);
    expect((await request(app).get("/api/tickets/job")).status).toBe(403);
  });
  it("does not give an untagged field manager billing detail access", async () => {
    viewer.activeTags = [];
    expect((await request(app).get("/api/tickets/job")).status).toBe(403);
    expect(storage.getTicketTypeById).not.toHaveBeenCalled();
  });
  it("billing tags do not give access to an ordinary other-assignee job", async () => {
    Object.assign(ticket, { ticketTypeId: "task", currentStatusId: "new", assignedToId: "other" });
    expect((await request(app).get("/api/tickets/job")).status).toBe(403);
  });
  it("contract Tasks at RFB are not stranded billing details", async () => {
    Object.assign(ticket, { ticketTypeId: "task", currentStatusId: "rfb", billingBehavior: "no_invoice" });
    expect((await request(app).get("/api/tickets/job")).status).toBe(403);
  });
  it("foreign ticket data cannot cross the company boundary", async () => {
    ticket.companyId = "foreign";
    expect((await request(app).get("/api/tickets/job")).status).toBe(404);
    expect(storage.getTicketTypeById).not.toHaveBeenCalled();
  });
  it("existing assignment access remains unchanged", async () => {
    viewer.activeTags = [];
    Object.assign(ticket, { assignedToId: "viewer", ticketTypeId: "task", currentStatusId: "new" });
    expect((await request(app).get("/api/tickets/job")).status).toBe(200);
  });
});
