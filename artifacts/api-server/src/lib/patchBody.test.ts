// @vitest-environment node
import { describe, expect, it } from "vitest";
import { insertTicketSchema } from "@workspace/db";
import { pickProvided } from "./patchBody";

const ticketPatchSchema = insertTicketSchema.partial().omit({
  companyId: true,
  createdById: true,
});

function validatedTicketUpdate(body: unknown) {
  const result = ticketPatchSchema.safeParse(body);
  expect(result.success).toBe(true);
  if (!result.success) throw result.error;
  return pickProvided(result.data, body);
}

describe("pickProvided", () => {
  it("keeps parsed values only for own keys provided in the body", () => {
    expect(pickProvided({ a: 1, b: 2 }, { a: 9 })).toEqual({ a: 1 });
    expect(pickProvided({ a: 1 }, Object.create({ a: 9 }))).toEqual({});
  });

  it("retains explicit null", () => {
    expect(pickProvided({ a: null }, { a: null })).toEqual({ a: null });
    expect(validatedTicketUpdate({ assignedToId: null })).toEqual({ assignedToId: null });
  });

  it.each([null, undefined, "text", 42, false])("returns an empty update for non-object body %s", (body) => {
    expect(pickProvided({ a: 1 }, body)).toEqual({});
  });

  it("documents default injection by the real ticket schema and removes it from PATCH", () => {
    const body = { assignedToId: "u1" };
    const result = ticketPatchSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;
    expect(result.data).toMatchObject({
      billingBehavior: "no_invoice",
      workType: "contract",
      priority: "normal",
      mobileStatus: "not_started",
    });
    expect(pickProvided(result.data, body)).toEqual({ assignedToId: "u1" });
  });

  it("preserves unrelated billable-ticket fields across reassignment, status move, and title edit", () => {
    const original = {
      assignedToId: "old-assignee",
      currentStatusId: "status-1",
      title: "Extra billable work",
      billingBehavior: "invoice_required",
      workType: "extra_work",
      priority: "high",
      mobileStatus: "in_progress",
    };
    const changes = [
      { assignedToId: "new-assignee" },
      { currentStatusId: "status-2" },
      { title: "Revised work" },
    ];
    for (const body of changes) {
      const updates = validatedTicketUpdate(body);
      expect(updates).toEqual(body);
      const ticket = { ...original, ...updates };
      expect(ticket).toMatchObject({
        billingBehavior: "invoice_required",
        workType: "extra_work",
        priority: "high",
        mobileStatus: "in_progress",
      });
      expect(ticket).toMatchObject(body);
    }
  });

  it("keeps server-added billing normalization and parsed date values", () => {
    const body = {
      currentStatusId: "ready-for-billing",
      billingBehavior: "invoice_required",
      dueDate: "2026-10-01T00:00:00.000Z",
    };
    expect(validatedTicketUpdate(body)).toEqual({
      currentStatusId: "ready-for-billing",
      billingBehavior: "invoice_required",
      dueDate: new Date(body.dueDate),
    });
    expect(validatedTicketUpdate({})).toEqual({});
  });
});