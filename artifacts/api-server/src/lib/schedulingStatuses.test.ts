import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ticketTypes } from "@workspace/db";

const mocked = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock("../db", () => ({ db: mocked }));
import { checkSchedulingWorkflow, migrateSchedulingStatuses } from "./schedulingStatuses";

const dialect = new PgDialect();
let types: any[];
let statuses: any[];
let mutations: number;

function workflow(typeKey: string, keys: string[], customName = false) {
  const id = `${typeKey}-type`;
  types.push({ id, companyId: "company", typeKey });
  statuses.push(...keys.map((statusKey, displayOrder) => ({
    id: `${typeKey}-${statusKey}`, ticketTypeId: id, statusKey, displayOrder,
    name: statusKey === "ready_to_schedule" ? customName ? "Dispatch queue" : "Ready to Schedule" : statusKey,
  })));
}

beforeEach(() => {
  types = [];
  statuses = [];
  mutations = 0;
  vi.clearAllMocks();
  mocked.execute.mockResolvedValue({ rows: [
    ...["id", "company_id", "type_key"].map(column_name => ({ table_name: "ticket_types", column_name })),
    ...["id", "ticket_type_id", "name", "status_key", "description", "display_order", "color", "is_final", "action_type"]
      .map(column_name => ({ table_name: "ticket_type_statuses", column_name })),
  ] });
  mocked.transaction.mockImplementation(async callback => {
    const before = structuredClone(statuses);
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      select: () => ({
        from: (table: unknown) => ({
          where: (condition: any) => ({
            for: async () => {
              const { params } = dialect.sqlToQuery(condition);
              return structuredClone(table === ticketTypes
                ? types.filter(type => params.includes(type.typeKey))
                : statuses.filter(status => status.ticketTypeId === params[0]));
            },
          }),
        }),
      }),
      update: () => ({
        set: (values: any) => ({
          where: async (condition: any) => {
            const { params } = dialect.sqlToQuery(condition);
            mutations++;
            if (values.displayOrder) {
              for (const status of statuses) {
                if (status.ticketTypeId === params[0] && status.displayOrder > Number(params[1])) status.displayOrder++;
              }
            } else {
              Object.assign(statuses.find(status => status.id === params[0] && status.ticketTypeId === params[1]), values);
            }
          },
        }),
      }),
      insert: () => ({
        values: async (values: any) => {
          mutations++;
          statuses.push({ id: `${values.ticketTypeId}-inserted`, ...values });
        },
      }),
    };
    try { return await callback(tx); }
    catch (error) { statuses = before; throw error; }
  });
});

describe("scheduling status boot DML", () => {
  it("inserts once, shifts existing orders exactly once, preserves IDs/keys and leaves Project's Scheduled alone", async () => {
    workflow("task", ["new", "ready_to_schedule", "in_progress", "work_completed", "ready_for_billing", "closed_won"]);
    workflow("estimate_request", ["new", "estimating", "proposal_draft", "proposal_sent", "decision_received",
      "ready_to_schedule", "work_completed", "ready_for_billing", "invoicing", "closed_lost"]);
    workflow("project", ["new", "ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing", "closed_lost"]);
    const identities = statuses.map(({ id, statusKey }) => ({ id, statusKey }));
    const project = structuredClone(statuses.filter(status => status.ticketTypeId === "project-type"));
    expect(await migrateSchedulingStatuses()).toEqual({ inserts: 2, renames: 3 });
    for (const type of types) {
      const list = statuses.filter(status => status.ticketTypeId === type.id).sort((a, b) => a.displayOrder - b.displayOrder);
      expect(list.map(status => status.displayOrder)).toEqual(list.map((_, index) => index));
      expect(list.find(status => status.statusKey === "scheduled")!.displayOrder).toBe(type.typeKey === "estimate_request" ? 6 : 2);
    }
    for (const identity of identities) expect(statuses.find(status => status.id === identity.id)).toMatchObject(identity);
    expect(statuses.filter(status => status.ticketTypeId === "project-type")).toEqual(
      project.map(status => status.statusKey === "ready_to_schedule"
        ? { ...status, name: "Needs scheduling", description: "Accepted. Waiting for a crew and date." } : status),
    );
    expect(statuses.filter(status => status.id.endsWith("-inserted"))).toEqual([
      expect.objectContaining({ statusKey: "scheduled", description: "On the calendar with a crew and date", color: "#3b82f6", isFinal: "false", actionType: "needs_action" }),
      expect.objectContaining({ statusKey: "scheduled", description: "On the calendar with a crew and date", color: "#3b82f6", isFinal: "false", actionType: "needs_action" }),
    ]);
    const once = structuredClone(statuses);
    mutations = 0;
    expect(await migrateSchedulingStatuses()).toEqual({ inserts: 0, renames: 0 });
    expect(statuses).toEqual(once);
    expect(mutations).toBe(0);
  });
  it("preserves custom labels and existing Scheduled identities", async () => {
    workflow("task", ["new", "ready_to_schedule", "scheduled", "in_progress", "work_completed"], true);
    const before = structuredClone(statuses);
    expect(await migrateSchedulingStatuses()).toEqual({ inserts: 0, renames: 0 });
    expect(statuses).toEqual(before);
  });
  it("does not touch nonseeded/custom workflows or other companies' rows", async () => {
    workflow("custom", ["new", "ready_to_schedule", "work_completed"]);
    workflow("task", ["new", "ready_to_schedule", "in_progress", "work_completed"]);
    const custom = structuredClone(statuses.filter(status => status.ticketTypeId === "custom-type"));
    statuses.push({ id: "outsider", ticketTypeId: "other-company-type", name: "Ready to Schedule", statusKey: "ready_to_schedule", displayOrder: 1 });
    expect(await migrateSchedulingStatuses()).toEqual({ inserts: 1, renames: 1 });
    expect(statuses.filter(status => status.ticketTypeId === "custom-type")).toEqual(custom);
    expect(statuses.find(status => status.id === "outsider")!.name).toBe("Ready to Schedule");
  });
  it.each(["duplicate", "custom"])("stops every workflow before any writes for %s orders", async problem => {
    workflow("task", ["new", "ready_to_schedule", "in_progress", "work_completed"]);
    workflow("estimate_request", ["new", "ready_to_schedule", "work_completed"]);
    if (problem === "duplicate") statuses.find(status => status.id === "estimate_request-work_completed").displayOrder = 1;
    else {
      statuses.find(status => status.id === "estimate_request-work_completed").displayOrder = 3;
      statuses.push({ id: "custom", ticketTypeId: "estimate_request-type", name: "Inspection", statusKey: null, displayOrder: 2 });
    }
    const before = structuredClone(statuses);
    await expect(migrateSchedulingStatuses()).rejects.toThrow("Scheduling migration blocked");
    expect(statuses).toEqual(before);
    expect(mutations).toBe(0);
  });
  it("skips/warns when ready_to_schedule is absent", async () => {
    workflow("task", ["new", "in_progress", "work_completed"]);
    expect(await migrateSchedulingStatuses()).toEqual({ inserts: 0, renames: 0 });
    expect(mutations).toBe(0);
  });
  it("is column guarded and never enters a transaction on missing schema", async () => {
    mocked.execute.mockResolvedValue({ rows: [] });
    expect(await migrateSchedulingStatuses()).toEqual({ inserts: 0, renames: 0 });
    expect(mocked.transaction).not.toHaveBeenCalled();
  });
  it("rolls back on a failed insert instead of leaving shifted orders", async () => {
    workflow("task", ["new", "ready_to_schedule", "in_progress", "work_completed"]);
    const before = structuredClone(statuses);
    const implementation = mocked.transaction.getMockImplementation()!;
    mocked.transaction.mockImplementation(callback => implementation(async (tx: any) => {
      tx.insert = () => ({ values: async () => { throw new Error("insert failed"); } });
      return callback(tx);
    }));
    await expect(migrateSchedulingStatuses()).rejects.toThrow("insert failed");
    expect(statuses).toEqual(before);
  });
});

describe("preflight ordering safety", () => {
  it("rejects out-of-order Scheduled or duplicate keys", () => {
    const list = [
      { id: "r", name: "Custom ready", statusKey: "ready_to_schedule", displayOrder: 1 },
      { id: "w", name: "Custom work", statusKey: "work_completed", displayOrder: 3 },
      { id: "s", name: "Custom scheduled", statusKey: "scheduled", displayOrder: 4 },
    ];
    expect(() => checkSchedulingWorkflow("project", list)).toThrow("out-of-order Scheduled");
    expect(() => checkSchedulingWorkflow("project", [...list, { ...list[0], id: "duplicate", displayOrder: 5 }])).toThrow("duplicate key");
  });
});
