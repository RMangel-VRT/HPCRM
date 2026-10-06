// @vitest-environment node
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTicketSchema, insertTicketFieldValueSchema } from "@workspace/db";
import { pickProvided } from "../lib/patchBody";
import { computeScheduleBy } from "../lib/scheduleBy";
import { maintainScheduleBy } from "../lib/scheduleByMaintenance";
import { notifyTicketAssignment } from "../lib/ticketAssignmentNotification";
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
     insertTicketSchema, pickProvided, computeScheduleBy, maintainScheduleBy, notifyTicketAssignment, maybeAutoCreateInvoiceOnRfb,
    isSeededTicketType, isSeededStatus, findSeededStatus,
    assertNotParentCustomer, sendPushToUser, APPROVED_BILLING_STATUS_KEYS } = deps;
  ${transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code}
`);
const decisionStart = source.indexOf('  app.put("/api/tickets/:ticketId/field-values/:fieldId",');
const decisionEnd = source.indexOf("  // Ticket Status History routes", decisionStart);
if (decisionStart < 0 || decisionEnd < 0) throw new Error("Decision field mutation registration block not found");
const mountDecision = new Function("deps", `
   const { app, storage, insertTicketFieldValueSchema, computeScheduleBy, isSeededTicketType, isSeededStatus, findSeededStatus } = deps;
  ${transformSync(source.slice(decisionStart, decisionEnd), { loader: "ts", target: "es2022" }).code}
`);

const taskType = { id: "task", name: "Renamed Field Jobs", typeKey: "task" };
const otherType = { id: "other", name: "Other", typeKey: "todo" };
const statuses = ["new", "ready_to_schedule", "scheduled", "in_progress", "work_completed", "ready_for_billing", "closed_won"]
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
     assignedToId: "actor", customerId: null, priority: "normal",
     createdAt: new Date("2026-09-01T12:00:00"), scheduleBy: null, acceptedAt: null,
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
     app, storage, ensureTaskTicketType, insertTicketSchema, pickProvided, computeScheduleBy, maintainScheduleBy, notifyTicketAssignment, maybeAutoCreateInvoiceOnRfb,
    ...capabilities, assertNotParentCustomer: parentGuard, sendPushToUser: vi.fn(),
    ensureInvoiceTicketType: vi.fn().mockResolvedValue({ typeId: "invoice", pendingStatusId: "pending" }),
    APPROVED_BILLING_STATUS_KEYS: ["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"],
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
  it("office can create through both endpoints", async () => {
    role = "office";
    expect((await request(app).post("/api/tickets").send({ ...createBody, workType: "contract" })).status).toBe(200);
    const res = await request(app).post("/api/tickets/batch").send({
      ...createBody, customerIds: ["customer"], workType: "contract",
    });
    expect(res.body.summary.createdCount).toBe(1);
  });
});

describe("Scheduling foundation mutation routes", () => {
  const batchBody = { ...createBody, customerIds: ["customer"] };
  for (const path of ["/api/tickets", "/api/tickets/batch"]) {
    const body = path.endsWith("/batch") ? batchBody : createBody;
    it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor", "crew_supervisor", "mapping"])(
      `${path} forbids %s creation`, async deniedRole => {
        role = deniedRole;
        expect((await request(app).post(path).send({ ...body, workType: "contract" })).status).toBe(403);
        assertNoWrites();
      },
    );
    it.each(["task", "project"])(`${path} defaults missing/blank/null dates for renamed %s`, async typeKey => {
      storage.getTicketTypeById.mockResolvedValue({ ...otherType, name: "Renamed", typeKey });
      for (const scheduleBy of [undefined, "", null]) {
        storage.createTicket.mockClear();
        const res = await request(app).post(path).send({ ...body, workType: "admin", priority: "urgent", scheduleBy });
        expect(res.status).toBe(200);
        expect(storage.createTicket).toHaveBeenCalledWith(expect.objectContaining({
          scheduleBy: computeScheduleBy("urgent", new Date()),
        }));
      }
    });
    it.each(["task", "project"])(`${path} preserves explicit %s dates and follow-up inputs`, async typeKey => {
      storage.getTicketTypeById.mockResolvedValue({ ...otherType, name: "Renamed", typeKey });
      const fields = { scheduleBy: "2027-01-01", followUpDate: "2026-12-31", followUpNote: "Call back" };
      const res = await request(app).post(path).send({ ...body, workType: "admin", ...fields });
      expect(res.status).toBe(200);
      expect(storage.createTicket).toHaveBeenCalledWith(expect.objectContaining(fields));
    });
    it(`${path} leaves unrelated and custom name-matching types unscheduled`, async () => {
      for (const type of [
        { ...otherType, typeKey: "estimate_request" },
        { ...otherType, name: "Task", typeKey: "custom" },
        { ...otherType, name: "Project", typeKey: "custom" },
      ]) {
        storage.getTicketTypeById.mockResolvedValue(type);
        await request(app).post(path).send({ ...body, workType: "admin", scheduleBy: "2027-01-01" });
        expect(storage.createTicket).toHaveBeenLastCalledWith(expect.objectContaining({ scheduleBy: null }));
      }
    });
    it(`${path} validates dates before writing and ignores spoofed acceptance audit`, async () => {
      const rejected = await request(app).post(path).send({ ...body, workType: "contract", scheduleBy: "2026-02-30" });
      expect(rejected.status).toBe(400);
      expect(storage.createTicket).not.toHaveBeenCalled();
      const res = await request(app).post(path).send({
        ...body, workType: "contract", acceptedAt: { invalid: "timestamp" }, acceptedById: ["intruder"],
        companyId: "other-company", createdById: "intruder",
      });
      expect(res.status).toBe(200);
      const written = storage.createTicket.mock.calls[0][0];
      expect(written).toMatchObject({ companyId: "company", createdById: "actor" });
      expect(written).not.toHaveProperty("acceptedAt");
      expect(written).not.toHaveProperty("acceptedById");
    });
    it(`${path} retains assignee company validation for office users`, async () => {
      role = "office";
      expect((await request(app).post(path).send({ ...body, workType: "contract", assignedToId: "outsider" })).status).toBe(400);
      assertNoWrites();
    });
  }
  it("PATCH ignores audit fields before parsing, preserves sparse updates and explicit clears", async () => {
    Object.assign(ticket, { acceptedAt: "2026-10-01T12:00:00", acceptedById: "real-owner", scheduleBy: "2026-10-09" });
    const res = await request(app).patch("/api/tickets/job").send({
      title: "Changed", acceptedAt: { invalid: true }, acceptedById: ["intruder"],
    });
    expect(res.status).toBe(200);
    expect(storage.updateTicket).toHaveBeenLastCalledWith("job", "company", { title: "Changed" });
    expect(ticket).toMatchObject({ acceptedById: "real-owner", acceptedAt: "2026-10-01T12:00:00", scheduleBy: "2026-10-09" });
    const clear = { scheduleBy: null, followUpDate: null, followUpNote: null };
    expect((await request(app).patch("/api/tickets/job").send(clear)).status).toBe(200);
    expect(storage.updateTicket).toHaveBeenLastCalledWith("job", "company", clear);
  });
});

describe("Follow-ups and schedule-by upkeep", () => {
  it("writes waiting/clearing comments without changing status, even with persisted crew/date", async () => {
    Object.assign(ticket, { currentStatusId: "ready_to_schedule", crewId: "crew", dueDate: new Date() });
    await request(app).patch("/api/tickets/job").send({ followUpDate: "2026-10-12", followUpNote: "Need access" });
    expect(ticket.currentStatusId).toBe("ready_to_schedule");
    expect(storage.createTicketComment).toHaveBeenLastCalledWith({
      ticketId: "job", authorId: "actor", body: "Waiting on customer until 2026-10-12: Need access",
    });
    await request(app).patch("/api/tickets/job").send({ followUpDate: null });
    expect(storage.createTicketComment).toHaveBeenLastCalledWith({
      ticketId: "job", authorId: "actor", body: "Customer replied",
    });
    expect(storage.createTicketStatusHistory).not.toHaveBeenCalled();
  });
  it("uses persisted note when omitted, but honors an explicit note clear", async () => {
    ticket.followUpNote = "Existing note";
    await request(app).patch("/api/tickets/job").send({ followUpDate: "2026-10-12" });
    expect(storage.createTicketComment).toHaveBeenLastCalledWith(expect.objectContaining({
      body: "Waiting on customer until 2026-10-12: Existing note",
    }));
    await request(app).patch("/api/tickets/job").send({ followUpDate: "2026-10-13", followUpNote: null });
    expect(storage.createTicketComment).toHaveBeenLastCalledWith(expect.objectContaining({
      body: "Waiting on customer until 2026-10-13: ",
    }));
  });
  it("writes no follow-up comment on unrelated or note-only PATCH", async () => {
    await request(app).patch("/api/tickets/job").send({ title: "Changed", followUpNote: "Note only" });
    expect(storage.createTicketComment).not.toHaveBeenCalled();
  });
  it("blank dates are omissions, not manual overrides or customer replies", async () => {
    ticket.currentStatusId = "new";
    await request(app).patch("/api/tickets/job").send({ priority: "urgent", scheduleBy: "", followUpDate: "" });
    expect(ticket.scheduleBy).toBe(computeScheduleBy("urgent", ticket.createdAt));
    expect(storage.createTicketComment).not.toHaveBeenCalled();
  });
  it.each(["new", "ready_to_schedule"])("recomputes real priority changes in %s from acceptance or creation", async currentStatusId => {
    Object.assign(ticket, { currentStatusId, acceptedAt: new Date("2026-09-03T12:00:00") });
    await request(app).patch("/api/tickets/job").send({ priority: "urgent" });
    expect(ticket.scheduleBy).toBe(computeScheduleBy("urgent", ticket.acceptedAt));
    Object.assign(ticket, { acceptedAt: null, priority: "normal" });
    await request(app).patch("/api/tickets/job").send({ priority: "urgent" });
    expect(ticket.scheduleBy).toBe(computeScheduleBy("urgent", ticket.createdAt));
  });
  it("does not recompute unchanged priorities or priorities outside eligible statuses", async () => {
    Object.assign(ticket, { currentStatusId: "new", scheduleBy: "2026-12-01" });
    await request(app).patch("/api/tickets/job").send({ priority: "normal" });
    expect(ticket.scheduleBy).toBe("2026-12-01");
    ticket.currentStatusId = "work_completed";
    await request(app).patch("/api/tickets/job").send({ priority: "urgent" });
    expect(ticket.scheduleBy).toBe("2026-12-01");
  });
  it.each(["admin", "office"])("explicit %s schedule-by including null wins over priority and entry", async activeRole => {
    role = activeRole;
    for (const scheduleBy of ["2026-12-01", null]) {
      Object.assign(ticket, { currentStatusId: "new", priority: "normal", scheduleBy: null });
      await request(app).patch("/api/tickets/job").send({ priority: "urgent", currentStatusId: "ready_to_schedule", scheduleBy });
      expect(ticket.scheduleBy).toBe(scheduleBy);
    }
  });
  it.each(["2026-12-01", null, { invalid: true }])("ignores non-office date %j without suppressing recomputation", async scheduleBy => {
    role = "field_manager";
    ticket.currentStatusId = "new";
    await request(app).patch("/api/tickets/job").send({ priority: "urgent", scheduleBy });
    expect(ticket.scheduleBy).toBe(computeScheduleBy("urgent", ticket.createdAt));
  });
  it("ignores manual-only non-office date input", async () => {
    role = "field_manager";
    ticket.scheduleBy = "2026-12-01";
    await request(app).patch("/api/tickets/job").send({ title: "Changed", scheduleBy: "bad-date" });
    expect(storage.updateTicket).toHaveBeenLastCalledWith("job", "company", { title: "Changed" });
  });
  it("entry to Needs scheduling computes from today and effective priority", async () => {
    ticket.currentStatusId = "in_progress";
    await request(app).patch("/api/tickets/job").send({ currentStatusId: "ready_to_schedule", priority: "high" });
    expect(ticket.scheduleBy).toBe(computeScheduleBy("high", new Date()));
  });
  it("entry preserves an existing date", async () => {
    ticket.scheduleBy = "2026-09-01";
    await request(app).patch("/api/tickets/job").send({ currentStatusId: "ready_to_schedule" });
    expect(ticket.scheduleBy).toBe("2026-09-01");
  });
  it("PATCH shares the extracted assignment notification unchanged", async () => {
    ticket.title = "Original title";
    ticket.customerId = "customer";
    await request(app).patch("/api/tickets/job").send({ assignedToId: "creator", title: "New title" });
    expect(storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: "creator", message: "Ticket assigned: Original title - Customer",
    }));
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

describe("crew/date scheduling PATCH", () => {
  beforeEach(() => {
    Object.assign(ticket, { currentStatusId: "ready_to_schedule", crewId: null, dueDate: null });
  });
  it("schedules renamed Task with crew and date through existing history", async () => {
    const res = await request(app).patch("/api/tickets/job").send({ crewId: "crew", dueDate: "2026-10-08" });
    expect(res.status).toBe(200);
    expect(ticket.currentStatusId).toBe("scheduled");
    expect(storage.updateTicket).toHaveBeenCalledWith("job", "company", expect.objectContaining({
      currentStatusId: "scheduled", crewId: "crew",
    }));
    expect(storage.createTicketStatusHistory).toHaveBeenCalledExactlyOnceWith({
      ticketId: "job", fromStatusId: "ready_to_schedule", toStatusId: "scheduled",
      changedById: "actor", notes: "Crew and date set",
    });
    expect(storage.deleteTicketFieldValuesByFieldIds).not.toHaveBeenCalled();
  });
  it.each(["crewId", "dueDate"])("uses persisted complementary field for sparse %s edits", async field => {
    Object.assign(ticket, { crewId: "crew", dueDate: new Date("2026-10-08") });
    const res = await request(app).patch("/api/tickets/job").send({ [field]: field === "crewId" ? "new-crew" : "2026-10-09" });
    expect(res.status).toBe(200);
    expect(ticket.currentStatusId).toBe("scheduled");
    const updates = storage.updateTicket.mock.calls[0][2];
    expect(updates).not.toHaveProperty(field === "crewId" ? "dueDate" : "crewId");
  });
  it.each(["crewId", "dueDate"])("clearing %s returns Scheduled to Needs scheduling", async field => {
    Object.assign(ticket, { currentStatusId: "scheduled", crewId: "crew", dueDate: new Date("2026-10-08") });
    expect((await request(app).patch("/api/tickets/job").send({ [field]: null })).status).toBe(200);
    expect(ticket.currentStatusId).toBe("ready_to_schedule");
    expect(storage.createTicketStatusHistory).toHaveBeenCalledExactlyOnceWith({
      ticketId: "job", fromStatusId: "scheduled", toStatusId: "ready_to_schedule",
      changedById: "actor", notes: "Crew or date cleared",
    });
  });
  it.each(["in_progress", "ready_to_schedule"])("respects explicit status intent %s", async currentStatusId => {
    expect((await request(app).patch("/api/tickets/job").send({
      crewId: "crew", dueDate: "2026-10-08", currentStatusId, statusChangeNotes: "Explicit",
    })).status).toBe(200);
    expect(ticket.currentStatusId).toBe(currentStatusId);
    if (currentStatusId === "in_progress") {
      expect(storage.createTicketStatusHistory).toHaveBeenCalledWith(expect.objectContaining({ notes: "Explicit" }));
    } else expect(storage.createTicketStatusHistory).not.toHaveBeenCalled();
  });
  it("does not override explicit null status intent; schema rejects it without writes", async () => {
    expect((await request(app).patch("/api/tickets/job").send({
      crewId: "crew", dueDate: "2026-10-08", currentStatusId: null,
    })).status).toBe(400);
    assertNoWrites();
  });
  it("forward Scheduled to In Progress preserves fields and invoice links", async () => {
    ticket.currentStatusId = "scheduled";
    storage.getTicketTypeFields.mockResolvedValue([{ id: "scheduled-field", statusId: "scheduled" }, { id: "progress-field", statusId: "in_progress" }]);
    links.push({ linkType: "invoice_for", sourceTicketId: "job", targetTicketId: "invoice" });
    expect((await request(app).patch("/api/tickets/job").send({ currentStatusId: "in_progress" })).status).toBe(200);
    expect(storage.deleteTicketFieldValuesByFieldIds).not.toHaveBeenCalled();
    expect(storage.deleteTicket).not.toHaveBeenCalled();
    expect(storage.deleteTicketLink).not.toHaveBeenCalled();
  });
  it("does not transition with only one effective scheduling field", async () => {
    expect((await request(app).patch("/api/tickets/job").send({ crewId: "crew" })).status).toBe(200);
    expect((await request(app).patch("/api/tickets/job").send({ title: "Changed" })).status).toBe(200);
    expect(ticket.currentStatusId).toBe("ready_to_schedule");
    expect(storage.createTicketStatusHistory).not.toHaveBeenCalled();
  });
  it("uses both persisted values when neither scheduling key is included", async () => {
    Object.assign(ticket, { crewId: "crew", dueDate: new Date("2026-10-08") });
    expect((await request(app).patch("/api/tickets/job").send({ title: "Changed" })).status).toBe(200);
    expect(ticket.currentStatusId).toBe("scheduled");
    expect(storage.updateTicket).toHaveBeenCalledWith("job", "company", {
      title: "Changed", currentStatusId: "scheduled",
    });
  });
  it("skips types without Scheduled and custom name-matching status keys", async () => {
    storage.getTicketTypeStatuses.mockResolvedValue(statuses.filter(s => s.statusKey !== "scheduled"));
    await request(app).patch("/api/tickets/job").send({ crewId: "crew", dueDate: "2026-10-08" });
    expect(ticket.currentStatusId).toBe("ready_to_schedule");
    storage.getTicketTypeStatuses.mockResolvedValue(statuses.map(s => s.statusKey === "ready_to_schedule"
      ? { ...s, name: "Needs scheduling", statusKey: "custom" } : s));
    await request(app).patch("/api/tickets/job").send({ crewId: "crew", dueDate: "2026-10-08" });
    expect(storage.createTicketStatusHistory).not.toHaveBeenCalled();
  });
  it.each(["estimate_request", "project"])("Scheduled is on the %s approved billing path", async typeKey => {
    ticket.ticketTypeId = "other";
    ticket.workType = typeKey === "estimate_request" ? "estimate_request" : "admin";
    storage.getTicketTypeById.mockResolvedValue({ ...otherType, typeKey });
    await request(app).patch("/api/tickets/job").send({ crewId: "crew", dueDate: "2026-10-08" });
    expect(ticket).toMatchObject({ currentStatusId: "scheduled", billingBehavior: "invoice_required" });
  });
  it("rejects invalid scheduling edits before history or cleanup writes", async () => {
    expect((await request(app).patch("/api/tickets/job").send({ crewId: "crew", dueDate: "not-a-date" })).status).toBe(400);
    assertNoWrites();
  });
  it("Estimate approval still enters Needs scheduling even when crew and date already exist", async () => {
    Object.assign(ticket, {
      ticketTypeId: "other", currentStatusId: "decision_received",
      crewId: "crew", dueDate: new Date("2026-10-08"),
    });
    storage.getTicketTypeById.mockResolvedValue({ ...otherType, name: "Renamed estimates", typeKey: "estimate_request" });
    storage.getTicketTypeStatuses.mockResolvedValue([
      ...statuses, { id: "decision_received", statusKey: "decision_received", name: "Renamed decision", displayOrder: -1 },
    ]);
    storage.upsertTicketFieldValue = vi.fn().mockImplementation(async data => data);
    storage.getTicketTypeFieldById = vi.fn().mockResolvedValue({ id: "decision-field", fieldKey: "decision_outcome" });
     mountDecision({ app, storage, insertTicketFieldValueSchema, computeScheduleBy, ...capabilities });
    const res = await request(app).put("/api/tickets/job/field-values/decision-field").send({ value: "Approved" });
    expect(res.status).toBe(200);
    expect(ticket.currentStatusId).toBe("ready_to_schedule");
    expect(ticket.scheduleBy).toBe(computeScheduleBy("normal", new Date()));
    expect(storage.createTicketStatusHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      ticketId: "job", fromStatusId: "decision_received", toStatusId: "ready_to_schedule", changedById: "actor",
    }));
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