// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  findSeededTicketType,
  isSeededTicketType,
  TICKET_TYPE_NAMES_BY_KEY,
  TICKET_TYPE_CAPABILITIES,
  findSeededStatus,
  isSeededStatus,
} from "./ticketCapabilities";

describe("seeded ticket type identity", () => {
  it("maps every seeded stable key to its legacy display name", () => {
    expect(TICKET_TYPE_NAMES_BY_KEY).toEqual({
      todo: "To-Do",
      estimate_request: "Estimate Request",
      project: "Project",
      task: "Task",
      invoice: "Invoice",
      rfp_request: "RFP Request",
    });
  });

  it("recognizes a renamed seeded type by key", () => {
    expect(isSeededTicketType(
      { name: "Customer Billing", typeKey: "invoice" },
      "invoice"
    )).toBe(true);
  });

  it("recognizes Task by stable key and only accepts the old name when unkeyed", () => {
    expect(isSeededTicketType({ name: "Field Work", typeKey: "task" }, "task")).toBe(true);
    expect(isSeededTicketType({ name: "Extra Billable", typeKey: null }, "task")).toBe(true);
    expect(isSeededTicketType({ name: "Extra Billable", typeKey: "todo" }, "task")).toBe(false);
    expect(isSeededTicketType({ name: "Quick Task" }, "task")).toBe(false);
    expect(TICKET_TYPE_CAPABILITIES.Task).toEqual({
      requiresCustomer: "true", requiresScheduling: "true", requiresCompletion: "true",
      requiresInvoicing: "false", terminalBehavior: "close",
    });
  });

  it("treats a present key as authoritative over a matching display name", () => {
    expect(isSeededTicketType(
      { name: "Invoice", typeKey: "project" },
      "invoice"
    )).toBe(false);
  });

  it("falls back to legacy names only for unkeyed rows", () => {
    expect(isSeededTicketType({ name: "Invoice", typeKey: null }, "invoice")).toBe(true);
    expect(isSeededTicketType({ name: "invoice" }, "invoice")).toBe(true);
    expect(isSeededTicketType({ name: "Accounts Receivable" }, "invoice")).toBe(false);
  });

  it("prefers a keyed row over an earlier legacy-name fallback", () => {
    const legacy = { id: "legacy", name: "Invoice", typeKey: null };
    const keyed = { id: "keyed", name: "Billing Queue", typeKey: "invoice" as const };

    expect(findSeededTicketType([legacy, keyed], "invoice")).toBe(keyed);
  });
});

describe("scheduling status identity", () => {
  it.each(["Ready to Schedule", "Needs scheduling"])("keeps the unkeyed %s fallback", name => {
    expect(isSeededStatus({ name }, "ready_to_schedule")).toBe(true);
    expect(isSeededStatus({ name, statusKey: "custom" }, "ready_to_schedule")).toBe(false);
  });
  it("uses Scheduled's stable identity despite renames and prefers keyed rows", () => {
    const keyed = { name: "Booked", statusKey: "scheduled" };
    expect(findSeededStatus([{ name: "Scheduled" }, keyed], "scheduled")).toBe(keyed);
    expect(isSeededStatus({ name: "Scheduled", statusKey: "custom" }, "scheduled")).toBe(false);
  });
});