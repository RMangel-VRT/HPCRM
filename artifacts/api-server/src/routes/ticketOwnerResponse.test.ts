// @vitest-environment node
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tickets, ticketTypes, ticketTypeStatuses, ticketStatusHistory, ticketComments } from "@workspace/db";
import { computeScheduleBy } from "../lib/scheduleBy";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), notify: vi.fn(), push: vi.fn(),
}));
vi.mock("../db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("../lib/ticketAssignmentNotification", () => ({
  notifyTicketAssignment: mocks.notify, pushReturnedTicket: mocks.push,
}));
import { registerTicketOwnerResponseRoutes } from "./ticketOwnerResponse";

let app: ReturnType<typeof express>;
let ticket: any;
let type: any;
let statuses: any[];
let actor: any;
let writes: { table: unknown; data: any }[];
let locked: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
let failHistory: boolean;
let hidden: boolean;
let authenticated: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  writes = [];
  locked = vi.fn();
  failHistory = hidden = false;
  authenticated = true;
  actor = { id: "owner", activeRole: "field", activeCompanyId: "company" };
  ticket = {
    id: "job", companyId: "company", ticketTypeId: "type", currentStatusId: "new",
    assignedToId: "owner", createdById: "creator", title: "Job", crewId: null, dueDate: null,
    priority: "urgent", createdAt: new Date("2026-09-04T12:00:00"), scheduleBy: null,
    billingBehavior: "invoice_required", workType: "extra_work",
  };
  type = { id: "type", companyId: "company", typeKey: "task", name: "Renamed type" };
  statuses = ["new", "ready_to_schedule", "scheduled"].map((key, i) => ({
    id: key, statusKey: key, name: "Renamed status", displayOrder: i,
  }));
  mocks.transaction.mockImplementation(async callback => {
    const before = { ...ticket };
    const previousWrites = [...writes];
    const tx = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            const rows = table === tickets ? hidden ? [] : [{ ...ticket }]
              : table === ticketTypes ? [type] : statuses;
            const promise = Promise.resolve(rows);
            return Object.assign(promise, { for: (...args: unknown[]) => { locked(...args); return promise; } });
          },
        }),
      }),
      update: () => ({
        set: (data: any) => ({
          where: () => ({
            returning: async () => {
              writes.push({ table: tickets, data });
              Object.assign(ticket, data);
              return [{ ...ticket }];
            },
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: async (data: any) => {
          if (table === ticketStatusHistory && failHistory) throw new Error("History unavailable");
          writes.push({ table, data });
        },
      }),
    };
    try { return await callback(tx); } catch (err) { ticket = before; writes = previousWrites; throw err; }
  });
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as any;
    req.user = actor;
    next();
  });
  registerTicketOwnerResponseRoutes(app);
});

describe("Accept", () => {
  it.each(["task", "project"])("assignee accepts renamed %s with audit, date and history", async typeKey => {
    type.typeKey = typeKey;
    const res = await request(app).post("/api/tickets/job/accept").send({ acceptedById: "spoof" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      currentStatusId: "ready_to_schedule", acceptedById: "owner",
      scheduleBy: computeScheduleBy("urgent", new Date("2026-09-04T12:00:00")),
      billingBehavior: "invoice_required", workType: "extra_work",
    });
    expect(res.body.acceptedAt).toBeTruthy();
    expect(locked).toHaveBeenCalledWith("update");
    expect(writes[1]).toEqual({ table: ticketStatusHistory, data: {
      ticketId: "job", fromStatusId: "new", toStatusId: "ready_to_schedule",
      changedById: "owner", notes: "Accepted",
    } });
  });
  it.each(["admin", "office"])("allows unassigned %s", async role => {
    actor.activeRole = role;
    ticket.assignedToId = "someone-else";
    expect((await request(app).post("/api/tickets/job/accept")).status).toBe(200);
  });
  it("chooses Scheduled with both crew/date and preserves explicit schedule-by", async () => {
    Object.assign(ticket, { crewId: "crew", dueDate: new Date(), scheduleBy: "2026-09-01" });
    const res = await request(app).post("/api/tickets/job/accept");
    expect(res.body).toMatchObject({ currentStatusId: "scheduled", scheduleBy: "2026-09-01" });
  });
  it("matches PATCH's approved-path billing correction for direct Projects", async () => {
    type.typeKey = "project";
    ticket.workType = "admin";
    ticket.billingBehavior = "internal";
    expect((await request(app).post("/api/tickets/job/accept")).body.billingBehavior).toBe("invoice_required");
  });
  it.each(["field", "field_manager", "crew_supervisor"])("rejects unrelated %s", async role => {
    actor.activeRole = role;
    actor.id = "unrelated";
    expect((await request(app).post("/api/tickets/job/accept")).status).toBe(403);
    expect(writes).toEqual([]);
  });
  it.each(["todo", "estimate_request", "invoice", "custom"])("rejects type %s even if named Task", async typeKey => {
    Object.assign(type, { typeKey, name: "Task" });
    const res = await request(app).post("/api/tickets/job/accept");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("NOT_ACCEPTABLE");
    expect(writes).toEqual([]);
  });
  it("rechecks current state and rejects repeat acceptance", async () => {
    expect((await request(app).post("/api/tickets/job/accept")).status).toBe(200);
    const audit = ticket.acceptedAt;
    expect((await request(app).post("/api/tickets/job/accept")).status).toBe(409);
    expect(ticket.acceptedAt).toBe(audit);
    expect(writes.filter(w => w.table === ticketStatusHistory)).toHaveLength(1);
  });
  it.each(["custom", "scheduled"])("rejects status %s", async key => {
    ticket.currentStatusId = key;
    expect((await request(app).post("/api/tickets/job/accept")).status).toBe(409);
    expect(writes).toEqual([]);
  });
  it("rejects missing target without mutation", async () => {
    statuses = statuses.filter(s => s.id !== "ready_to_schedule");
    expect((await request(app).post("/api/tickets/job/accept")).status).toBe(409);
    expect(writes).toEqual([]);
  });
  it("rolls back the acceptance if history fails", async () => {
    failHistory = true;
    expect((await request(app).post("/api/tickets/job/accept")).status).toBe(500);
    expect(ticket.currentStatusId).toBe("new");
    expect(ticket.acceptedAt).toBeUndefined();
    expect(writes).toEqual([]);
  });
});

describe("Send back", () => {
  it("reassigns to creator with trimmed actor comment and shared notification", async () => {
    const res = await request(app).post("/api/tickets/job/send-back").send({ note: "  Wrong owner  " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ assignedToId: "creator", currentStatusId: "new" });
    expect(writes[1]).toEqual({ table: ticketComments, data: {
      ticketId: "job", authorId: "owner", body: "Sent back: Wrong owner",
    } });
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ assignedToId: "owner" }), "creator", actor);
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(writes.some(w => w.table === ticketStatusHistory)).toBe(false);
  });
  it.each(["admin", "office"])("allows unrelated %s to return", async role => {
    actor.activeRole = role;
    ticket.assignedToId = "another";
    expect((await request(app).post("/api/tickets/job/send-back").send({ note: "Return" })).status).toBe(200);
  });
  it("does not notify a no-op reassignment", async () => {
    ticket.createdById = ticket.assignedToId;
    expect((await request(app).post("/api/tickets/job/send-back").send({ note: "Return" })).status).toBe(200);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("rejects missing creator", async () => {
    ticket.createdById = null;
    const res = await request(app).post("/api/tickets/job/send-back").send({ note: "Return" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("NO_CREATOR");
    expect(writes).toEqual([]);
  });
  it.each([{}, { note: "" }, { note: "  " }, { note: 3 }, { note: "a".repeat(1001) }])("validates %j", async body => {
    expect((await request(app).post("/api/tickets/job/send-back").send(body)).status).toBe(400);
    expect(writes).toEqual([]);
  });
  it("rejects unrelated users before validation", async () => {
    actor.id = "other";
    expect((await request(app).post("/api/tickets/job/send-back").send({})).status).toBe(403);
    expect(writes).toEqual([]);
  });
  it("rejects non-New tickets", async () => {
    ticket.currentStatusId = "scheduled";
    expect((await request(app).post("/api/tickets/job/send-back").send({ note: "Return" })).status).toBe(409);
    expect(writes).toEqual([]);
  });
});

describe("Company access", () => {
  for (const action of ["accept", "send-back"]) {
    it(`${action} returns 404 for a missing/company-hidden ticket`, async () => {
      hidden = true;
      expect((await request(app).post(`/api/tickets/job/${action}`).send({ note: "Return" })).status).toBe(404);
      expect(writes).toEqual([]);
    });
    it(`${action} requires authentication`, async () => {
      authenticated = false;
      expect((await request(app).post(`/api/tickets/job/${action}`)).status).toBe(401);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
  }
});
