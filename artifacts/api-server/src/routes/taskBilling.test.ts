// @vitest-environment node
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTicketSchema } from "@workspace/db";
import { pickProvided } from "../lib/patchBody";
import { maybeAutoCreateInvoiceOnRfb } from "../lib/rfbInvoiceAutoCreate";
import * as capabilities from "../shared/ticketCapabilities";

const mockedStorage = vi.hoisted(() => ({}));
vi.mock("../storage", () => ({ storage: mockedStorage }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../auth", () => ({ setupAuth: vi.fn(), hashPassword: vi.fn() }));
import { ensureTaskTicketType } from "./routes";

// Mount the actual three mutation handlers, not copies of their logic. Extract
// only their registration block to avoid registerRoutes' unrelated boot DML.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.post("/api/tickets",');
const end = source.indexOf("  // Manual invoice ticket creation", start);
if (start < 0 || end < 0) throw new Error("Ticket mutation registration block not found");
const mount = new Function("deps", `
  const { app, storage, ensureTaskTicketType, ensureInvoiceTicketType,
    insertTicketSchema, pickProvided, maybeAutoCreateInvoiceOnRfb,
    isSeededTicketType, isSeededStatus, findSeededStatus,
    assertNotParentCustomer, sendPushToUser, APPROVED_BILLING_STATUS_KEYS } = deps;
  ${transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code}
`);

const taskType = { id: "task", name: "Renamed Field Jobs", typeKey: "task" };
const otherType = { id: "other", name: "Other", typeKey: "todo" };
const statuses = ["new", "ready_to_schedule", "in_progress", "work_completed", "ready_for_billing", "closed_won"]
  .map((statusKey, displayOrder) => ({
    id: statusKey, statusKey, name: `Renamed ${statusKey}`,
    displayOrder, isFinal: statusKey === "closed_won" ? "true" : "false",
  }));
let ticket: any;
let links: any[];
let app: ReturnType<typeof express>;
let role: string;
const storage: Record<string, ReturnType<typeof vi.fn>> = mockedStorage;
const parentGuard = vi.fn();

function billable() {
  Object.assign(ticket, { workType: "extra_work", billingBehavior: "invoice_required" });
}
function assertNoWrites() {
  for (const name of ["updateTicket", "createTicket", "createTicketLink", "createTicketComment",
    "createTicketStatusHistory", "deleteTicket", "deleteTicketLink",
    "deleteTicketFieldValuesByFieldIds", "createNotification"]) {
    expect(storage[name], name).not.toHaveBeenCalled();
  }
}
const createBody = { title: "Work", assignedToId: "actor", customerId: "customer", ticketTypeId: "other" };

beforeEach(() => {
  vi.clearAllMocks();
  role = "admin";
  links = [];
  ticket = {
    id: "job", companyId: "company", title: "Work", ticketTypeId: "task",
    currentStatusId: "work_completed", workType: "contract", billingBehavior: "no_invoice",
    assignedToId: "actor", customerId: null,
  };
  for (const name of ["createTicketStatusHistory", "createTicketSource", "createTicketComment",
    "deleteTicket", "deleteTicketLink", "deleteTicketFieldValuesByFieldIds",
    "createNotification", "dismissDueDateNotificationsForTicket"]) {
    storage[name] = vi.fn().mockResolvedValue({});
  }
  storage.getTicketTypes = vi.fn().mockResolvedValue([taskType]);
  storage.getTicketTypeById = vi.fn(async id => id === "task" ? taskType : otherType);
  storage.getTicketTypeStatuses = vi.fn().mockResolvedValue(statuses);
  storage.getTicketTypeFields = vi.fn().mockResolvedValue([
    { id: "field-done", statusId: "closed_won", fieldKey: "completion_date" },
    { fieldKey: "actual_hours" }, { fieldKey: "completion_notes" },
  ]);
  storage.getCompanyUsersByCompanyId = vi.fn().mockResolvedValue([{ userId: "actor", role: "admin" }]);
  storage.getCustomers = vi.fn().mockResolvedValue([{ id: "customer", name: "Customer" }]);
  storage.getCustomerById = vi.fn().mockResolvedValue({ name: "Customer" });
  storage.getTickets = vi.fn().mockResolvedValue([]);
  storage.getTicketById = vi.fn(async () => ({ ...ticket }));
  storage.getTicketLinks = vi.fn(async () => [...links]);
  storage.getTicketComments = vi.fn().mockResolvedValue([]);
  storage.createTicket = vi.fn(async data => ({ ...data, id: "created" }));
  storage.createTicketLink = vi.fn(async data => { links.push({ ...data, id: "link" }); return data; });
  storage.updateTicket = vi.fn(async (_id, _company, data) => { Object.assign(ticket, data); return { ...ticket }; });
  parentGuard.mockResolvedValue(false);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as any;
    req.user = { id: "actor", activeCompanyId: "company", activeRole: role } as any;
    next();
  });
  mount({
    app, storage, ensureTaskTicketType, insertTicketSchema, pickProvided, maybeAutoCreateInvoiceOnRfb,
    ...capabilities, assertNotParentCustomer: parentGuard, sendPushToUser: vi.fn(),
    ensureInvoiceTicketType: vi.fn().mockResolvedValue({ typeId: "invoice", pendingStatusId: "pending" }),
    APPROVED_BILLING_STATUS_KEYS: ["ready_to_schedule", "work_completed", "ready_for_billing", "invoicing"],
  });
});

describe("Task single and batch creation", () => {
  it.each(["contract", "extra_work"])("single %s overrides type, billing, and status", async workType => {
    // New is intentionally not first by display order.
    storage.getTicketTypeStatuses.mockResolvedValue(statuses.map(s => ({ ...s, displayOrder: s.id === "new" ? 99 : s.displayOrder })));
    const res = await request(app).post("/api/tickets").send({
      ...createBody, workType, currentStatusId: "closed_won", billingBehavior: "internal",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ticketTypeId: "task", currentStatusId: "new", workType,
      billingBehavior: workType === "extra_work" ? "invoice_required" : "no_invoice",
    });
  });
  it.each(["contract", "extra_work"])("batch %s resolves Task even without a submitted type", async workType => {
    storage.getTicketTypeStatuses.mockResolvedValue(statuses.map(s => ({ ...s, displayOrder: s.id === "new" ? 99 : s.displayOrder })));
    const res = await request(app).post("/api/tickets/batch").send({
      customerIds: ["customer"], title: "Work", assignedToId: "actor", workType,
      billingBehavior: "internal",
    });
    expect(res.status).toBe(200);
    expect(res.body.summary.createdCount).toBe(1);
    expect(storage.createTicket).toHaveBeenCalledWith(expect.objectContaining({
      ticketTypeId: "task", currentStatusId: "new", workType,
      billingBehavior: workType === "extra_work" ? "invoice_required" : "no_invoice",
    }));
  });
  it("batch duplicate detection uses resolved Task, not submitted type", async () => {
    storage.getTickets.mockResolvedValue([{ ...ticket, customerId: "customer" }]);
    const res = await request(app).post("/api/tickets/batch").send({
      ...createBody, customerIds: ["customer"], workType: "extra_work",
    });
    expect(res.body.summary.skippedCount).toBe(1);
    expect(storage.createTicket).not.toHaveBeenCalled();
  });
  it("batch ignores conflicting submitted type and billing on new billable work", async () => {
    const res = await request(app).post("/api/tickets/batch").send({
      ...createBody, ticketTypeId: "not-a-real-type", customerIds: ["customer"],
      workType: "extra_work", billingBehavior: "no_invoice",
    });
    expect(res.body.summary.createdCount).toBe(1);
    expect(storage.createTicket).toHaveBeenCalledWith(expect.objectContaining({
      ticketTypeId: "task", workType: "extra_work", billingBehavior: "invoice_required",
    }));
  });
  it("batch validates Task inputs before writing", async () => {
    const res = await request(app).post("/api/tickets/batch").send({
      ...createBody, customerIds: ["customer"], workType: "extra_work", priority: "invalid",
    });
    expect(res.body.summary.failedCount).toBe(1);
    assertNoWrites();
  });
  it("other work types retain submitted type, billing, and first status", async () => {
    storage.getTicketTypeStatuses.mockResolvedValue([...statuses].reverse().map(s => ({ ...s, displayOrder: s.id === "in_progress" ? -1 : s.displayOrder })));
    const res = await request(app).post("/api/tickets").send({
      ...createBody, workType: "admin", billingBehavior: "internal",
    });
    expect(res.body).toMatchObject({ ticketTypeId: "other", billingBehavior: "internal", currentStatusId: "in_progress" });
  });
  it("single creation remains admin-only; office can batch create", async () => {
    role = "office";
    expect((await request(app).post("/api/tickets").send({ ...createBody, workType: "contract" })).status).toBe(403);
    expect(storage.createTicket).not.toHaveBeenCalled();
    const res = await request(app).post("/api/tickets/batch").send({
      ...createBody, customerIds: ["customer"], workType: "contract",
    });
    expect(res.body.summary.createdCount).toBe(1);
  });
});

describe("Task PATCH billing", () => {
  it.each([{ billingBehavior: "invoice_required" }, { workType: "extra_work" },
    { workType: "extra_work", billingBehavior: "invoice_required" }])("pairs a switch %j and audits once", async body => {
    const res = await request(app).patch("/api/tickets/job").send(body);
    expect(res.status).toBe(200);
    expect(ticket).toMatchObject({ workType: "extra_work", billingBehavior: "invoice_required" });
    expect(storage.createTicketComment).toHaveBeenCalledExactlyOnceWith({
      ticketId: "job", authorId: "actor", body: "Billing changed from Contract to Billable",
    });
  });
  it("audits the reverse switch", async () => {
    billable();
    await request(app).patch("/api/tickets/job").send({ workType: "contract" });
    expect(ticket).toMatchObject({ workType: "contract", billingBehavior: "no_invoice" });
    expect(storage.createTicketComment).toHaveBeenCalledWith(expect.objectContaining({ body: "Billing changed from Billable to Contract" }));
  });
  it.each([
    [{ workType: "admin" }, "TASK_WORK_TYPE"],
    [{ workType: null }, "TASK_WORK_TYPE"],
    [{ workType: "contract", billingBehavior: "invoice_required" }, "BILLING_MISMATCH"],
    [{ billingBehavior: "internal" }, "BILLING_MISMATCH"],
    [{ billingBehavior: null }, "BILLING_MISMATCH"],
    [{ billingBehavior: "invalid" }, "BILLING_MISMATCH"],
  ])("rejects %j before status cleanup", async (body, error) => {
    ticket.currentStatusId = "closed_won";
    const before = { ...ticket };
    const res = await request(app).patch("/api/tickets/job").send({ ...body, currentStatusId: "work_completed" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(error);
    expect(ticket).toEqual(before);
    assertNoWrites();
  });
  it.each(["ready_for_billing", "closed_won"])("locks changes from current %s even with step-back in same PATCH", async status => {
    ticket.currentStatusId = status;
    const res = await request(app).patch("/api/tickets/job").send({ billingBehavior: "invoice_required", currentStatusId: "work_completed" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BILLING_LOCKED");
    assertNoWrites();
  });
  it("permits unchanged billing at locked status without an audit comment", async () => {
    billable();
    ticket.currentStatusId = "ready_for_billing";
    expect((await request(app).patch("/api/tickets/job").send({ billingBehavior: "invoice_required" })).status).toBe(200);
    expect(storage.createTicketComment).not.toHaveBeenCalled();
  });
  it("reassignment preserves both billing fields through partial schema defaults", async () => {
    billable();
    expect((await request(app).patch("/api/tickets/job").send({ assignedToId: "other-user" })).status).toBe(200);
    expect(storage.updateTicket).toHaveBeenCalledWith("job", "company", { assignedToId: "other-user" });
    expect(ticket).toMatchObject({ workType: "extra_work", billingBehavior: "invoice_required" });
    expect(storage.createTicketComment).not.toHaveBeenCalled();
  });
  it("access checks precede billing validation", async () => {
    role = "field";
    expect((await request(app).patch("/api/tickets/job").send({ workType: "invalid" })).status).toBe(403);
    expect(storage.getTicketTypeById).not.toHaveBeenCalled();
    assertNoWrites();
  });
  it("parent-customer guard precedes billing validation", async () => {
    parentGuard.mockImplementation(async (_customer, _company, res) => {
      res.status(422).json({ error: "PARENT_CUSTOMER" });
      return true;
    });
    const res = await request(app).patch("/api/tickets/job").send({ customerId: "parent", workType: "invalid" });
    expect(res.body.error).toBe("PARENT_CUSTOMER");
    expect(storage.getTicketTypeById).not.toHaveBeenCalled();
    assertNoWrites();
  });
  it("does not audit billing when schema validation fails", async () => {
    const res = await request(app).patch("/api/tickets/job").send({ workType: "extra_work", priority: "invalid" });
    expect(res.status).toBe(400);
    assertNoWrites();
  });
  it("does not audit billing when storage update fails", async () => {
    storage.updateTicket.mockRejectedValue(new Error("Update failed"));
    expect((await request(app).patch("/api/tickets/job").send({ workType: "extra_work" })).status).toBe(500);
    expect(storage.createTicketComment).not.toHaveBeenCalled();
    expect(ticket.billingBehavior).toBe("no_invoice");
  });
});

describe("Task status guards and invoicing", () => {
  it.each(["work_completed", "closed_won"])("rejects contract %s → billing without writes or cleanup", async status => {
    ticket.currentStatusId = status;
    links.push({ id: "link", linkType: "invoice_for", sourceTicketId: "job", targetTicketId: "invoice" });
    const before = { ...ticket };
    const res = await request(app).patch("/api/tickets/job").send({ currentStatusId: "ready_for_billing", title: "Should not change" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("CONTRACT_CANNOT_BILL");
    expect(ticket).toEqual(before);
    expect(links).toHaveLength(1);
    assertNoWrites();
  });
  it.each(["work_completed", "closed_won"])("billable %s → billing creates exactly one outgoing invoice", async status => {
    billable();
    ticket.currentStatusId = status;
    expect((await request(app).patch("/api/tickets/job").send({ currentStatusId: "ready_for_billing" })).status).toBe(200);
    expect(storage.createTicket).toHaveBeenCalledTimes(1);
    expect(links).toEqual([expect.objectContaining({ sourceTicketId: "job", targetTicketId: "created", linkType: "invoice_for" })]);
    // Re-enter billing after a close, preserving the existing invoice.
    ticket.currentStatusId = "closed_won";
    await request(app).patch("/api/tickets/job").send({ currentStatusId: "ready_for_billing" });
    expect(storage.createTicket).toHaveBeenCalledTimes(1);
  });
  it("uses pending billing when switching and entering billing together", async () => {
    const res = await request(app).patch("/api/tickets/job").send({ workType: "extra_work", currentStatusId: "ready_for_billing" });
    expect(res.status).toBe(200);
    expect(storage.createTicket).toHaveBeenCalledTimes(1);
    expect(ticket.billingBehavior).toBe("invoice_required");
  });
  it.each([
    { existingLinks: [] },
    { existingLinks: [{ linkType: "invoice_for", sourceTicketId: "elsewhere", targetTicketId: "job" }] },
  ])("billable cannot close without outgoing invoice $existingLinks", async ({ existingLinks }) => {
    billable();
    links = existingLinks;
    const res = await request(app).patch("/api/tickets/job").send({ currentStatusId: "closed_won" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BILLABLE_MUST_BILL");
    assertNoWrites();
  });
  it("contract can close without invoice", async () => {
    expect((await request(app).patch("/api/tickets/job").send({ currentStatusId: "closed_won" })).status).toBe(200);
    expect(ticket.currentStatusId).toBe("closed_won");
    expect(storage.createTicket).not.toHaveBeenCalled();
  });
  it("billable can close from billing with outgoing invoice", async () => {
    billable();
    ticket.currentStatusId = "ready_for_billing";
    links.push({ linkType: "invoice_for", sourceTicketId: "job", targetTicketId: "invoice" });
    expect((await request(app).patch("/api/tickets/job").send({ currentStatusId: "closed_won" })).status).toBe(200);
  });
  it("step back first, then switch a closed contract job", async () => {
    ticket.currentStatusId = "closed_won";
    expect((await request(app).patch("/api/tickets/job").send({ currentStatusId: "work_completed" })).status).toBe(200);
    expect((await request(app).patch("/api/tickets/job").send({ billingBehavior: "invoice_required" })).status).toBe(200);
    expect(ticket.workType).toBe("extra_work");
  });
  it("non-Task billing PATCH retains legacy behavior", async () => {
    ticket.ticketTypeId = "other";
    expect((await request(app).patch("/api/tickets/job").send({ billingBehavior: "internal" })).status).toBe(200);
    expect(ticket.billingBehavior).toBe("internal");
    expect(storage.createTicketComment).not.toHaveBeenCalled();
  });
});