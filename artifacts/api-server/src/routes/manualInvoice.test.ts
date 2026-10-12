import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canManuallyInvoice, canSeeBilling } from "../lib/billing";
import { findSeededTicketType } from "../shared/ticketCapabilities";

const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.post("/api/tickets/:id/create-invoice",');
const end = source.indexOf('  app.post("/api/tickets/create-invoice-from-project",', start);
const mount = new Function("deps", `
  const { app, storage, canSeeBilling, canManuallyInvoice, findSeededTicketType, ensureInvoiceTicketType } = deps;
  ${transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code}
`);
const jobType = { id: "task", typeKey: "task", name: "Renamed Work" };
const invoiceType = { id: "invoice", typeKey: "invoice", name: "Renamed Charge" };
let app: ReturnType<typeof express>;
let role: string;
let tags: string[];
let job: any;
let storage: any;
beforeEach(() => {
  role = "office"; tags = [];
  job = { id: "job", companyId: "company", ticketTypeId: "task", title: "Job", billingBehavior: "invoice_required", currentStatusId: "rfb", customerId: "property", workCompletedDate: new Date("2026-10-01T18:00:00Z") };
  storage = {
    getTicketById: vi.fn(async (_id, company) => company === "company" ? job : undefined),
    getTicketTypeById: vi.fn().mockResolvedValue(jobType),
    getTicketTypes: vi.fn().mockResolvedValue([jobType, invoiceType]),
    getTicketTypeStatuses: vi.fn().mockResolvedValue([{ id: "rfb", statusKey: "ready_for_billing", name: "Renamed ready" }]),
    getTicketLinks: vi.fn().mockResolvedValue([]),
    getTicketsByIds: vi.fn().mockResolvedValue([]),
    getCompanyUsersByCompanyId: vi.fn().mockResolvedValue([{ userId: "billing-person", status: "active", tags: ["billing"] }]),
    createTicket: vi.fn(async data => ({ id: "new-invoice", ...data })),
    createTicketLink: vi.fn().mockResolvedValue({}),
    getTicketComments: vi.fn().mockResolvedValue([{ authorId: "crew", body: "Completed work" }]),
    createTicketComment: vi.fn().mockResolvedValue({}),
  };
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    req.user = { id: "actor", activeRole: role, activeCompanyId: "company", activeTags: tags } as any;
    next();
  });
  mount({ app, storage, canSeeBilling, canManuallyInvoice, findSeededTicketType,
    ensureInvoiceTicketType: vi.fn().mockResolvedValue({ typeId: "invoice", pendingStatusId: "pending" }) });
});
describe("actual manual invoice handler", () => {
  it("recovers a stranded Task with billing assignment, scoped link, dates and copied comments", async () => {
    const result = await request(app).post("/api/tickets/job/create-invoice").send({});
    expect(result.status).toBe(200);
    expect(storage.createTicket).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company", customerId: "property", assignedToId: "billing-person",
      currentStatusId: "pending", ticketTypeId: "invoice", workCompletedDate: job.workCompletedDate,
    }));
    expect(storage.createTicketLink).toHaveBeenCalledWith(expect.objectContaining({ sourceTicketId: "job", targetTicketId: "new-invoice", linkType: "invoice_for" }));
    expect(storage.createTicketComment).toHaveBeenCalledWith(expect.objectContaining({ authorId: "crew", body: "Completed work", ticketId: "new-invoice" }));
  });
  it("rejects untagged field manager but allows billing-tagged field manager", async () => {
    role = "field_manager";
    expect((await request(app).post("/api/tickets/job/create-invoice").send({})).status).toBe(403);
    expect(storage.getTicketById).not.toHaveBeenCalled();
    tags = ["billing"];
    expect((await request(app).post("/api/tickets/job/create-invoice").send({})).status).toBe(200);
  });
  it("contract Task remains ineligible", async () => {
    job.billingBehavior = "no_invoice";
    expect((await request(app).post("/api/tickets/job/create-invoice").send({})).status).toBe(400);
    expect(storage.createTicket).not.toHaveBeenCalled();
  });
  it("accepts recovery without a request body", async () => {
    expect((await request(app).post("/api/tickets/job/create-invoice")).status).toBe(200);
  });
  it.each(["project", "estimate_request"])("retains existing %s manual behavior", async typeKey => {
    storage.getTicketTypeById.mockResolvedValue({ ...jobType, typeKey });
    job.currentStatusId = "other";
    expect((await request(app).post("/api/tickets/job/create-invoice").send({})).status).toBe(200);
  });
  it("returns 409 for a valid company-scoped invoice but recovers deleted/foreign counterparts", async () => {
    storage.getTicketLinks.mockResolvedValue([{ sourceTicketId: "job", targetTicketId: "existing", linkType: "invoice_for" }]);
    storage.getTicketsByIds.mockResolvedValue([{ id: "existing", ticketTypeId: "invoice", companyId: "company" }]);
    expect((await request(app).post("/api/tickets/job/create-invoice").send({})).status).toBe(409);
    expect(storage.createTicket).not.toHaveBeenCalled();
    expect(storage.getTicketsByIds).toHaveBeenCalledWith(["existing"], "company");
    storage.getTicketsByIds.mockResolvedValue([]);
    expect((await request(app).post("/api/tickets/job/create-invoice").send({})).status).toBe(200);
  });
});
