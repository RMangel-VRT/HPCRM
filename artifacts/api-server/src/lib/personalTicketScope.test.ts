import { describe, expect, it } from "vitest";
import { excludeBidsFromPersonalTickets } from "./personalTicketScope";

describe("My Tickets bid isolation", () => {
  it("excludes renamed stable RFP identity while preserving every other type", () => {
    const types = [
      { id: "bid", typeKey: "rfp_request", name: "Renamed contract opportunity" },
      { id: "estimate", typeKey: "estimate_request", name: "RFP Request" },
      { id: "custom", typeKey: "task", name: "RFP Request" },
    ] as const;
    const rows = types.map(type => ({ id: type.id, ticketTypeId: type.id }));
    expect(excludeBidsFromPersonalTickets(rows, types).map(row => row.id)).toEqual(["estimate", "custom"]);
    expect(rows).toHaveLength(3); // General all-ticket viewing is not altered.
  });
  it("handles empty tenants and unrelated missing types", () => {
    expect(excludeBidsFromPersonalTickets([], [])).toEqual([]);
    expect(excludeBidsFromPersonalTickets([{ ticketTypeId: "unknown" }], [])).toHaveLength(1);
  });
});
