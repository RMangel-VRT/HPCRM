import { describe, expect, it } from "vitest";
import { isOpenTicket, openTicketCount, pendingProposalCount, qboNeedsAttention } from "./customerBadges";

const card = (over: Record<string, unknown> = {}) => ({ reviews: [], billTo: { name: "W", lines: [] }, ...over }) as any;

describe("CP2 badge rules", () => {
  it("finalized, accepted and rejected proposals are not pending", () => {
    expect(pendingProposalCount([{ status: "draft" }, { status: "sent" }, { status: "finalized" }, { status: "accepted" }, { status: "rejected" }])).toBe(2);
  });
  it("open tickets use the company's status isFinal by currentStatusId; completedAt only as fallback", () => {
    const statuses = [{ id: "s-done", isFinal: "true" }, { id: "s-open", isFinal: "false" }];
    expect(isOpenTicket({ currentStatusId: "s-done", completedAt: null }, statuses)).toBe(false);
    expect(isOpenTicket({ currentStatusId: "s-open", completedAt: "2026-01-01" }, statuses)).toBe(true);
    expect(isOpenTicket({ currentStatusId: "unknown", completedAt: null }, statuses)).toBe(true);
    expect(openTicketCount([{ completedAt: null }, { completedAt: "2026-01-01" }])).toBe(1);
  });
  it("QBO attention matches the card: error, collision, any review, incomplete bill-to", () => {
    expect(qboNeedsAttention(card(), "linked")).toBe(false);
    expect(qboNeedsAttention(card(), "error")).toBe(true);
    expect(qboNeedsAttention(card(), "collision")).toBe(true);
    expect(qboNeedsAttention(card({ reviews: [{ id: "r", kind: "address_changed" }] }), "linked")).toBe(true);
    expect(qboNeedsAttention(card({ billTo: { problem: "BILL_TO_INCOMPLETE" } }), "linked")).toBe(true);
    expect(qboNeedsAttention(undefined, null)).toBe(false);
  });
});
