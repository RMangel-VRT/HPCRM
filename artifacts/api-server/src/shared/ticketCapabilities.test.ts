// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  findSeededTicketType,
  isSeededTicketType,
  TICKET_TYPE_NAMES_BY_KEY,
} from "./ticketCapabilities";

describe("seeded ticket type identity", () => {
  it("maps every seeded stable key to its legacy display name", () => {
    expect(TICKET_TYPE_NAMES_BY_KEY).toEqual({
      todo: "To-Do",
      estimate_request: "Estimate Request",
      project: "Project",
      extra_billable: "Extra Billable",
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