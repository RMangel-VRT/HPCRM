import { describe, expect, it } from "vitest";
import { boardColumns, rowForm, rowLine, tableRows, placements, renewalProgress } from "./boardLogic";
import type { ContractListItem, TermSummary } from "./contractTypes";

const today = "2027-08-15";
const term = (o: Partial<TermSummary> = {}): TermSummary => ({ id: "t", seasonLabel: "2026–27", startDate: "2026-10-01", endDate: "2027-09-30",
  status: "active", displayStatus: "active", annualPriceCents: 3000000, snowPricing: null, needsReview: false, line: "landscape", form: "theirs", ...o });
const item = (o: Partial<ContractListItem> = {}): ContractListItem => ({ id: "a", customerId: "c", customerName: "Summerfield", line: "landscape", form: "theirs",
  current: term(), renewalDraft: null, renewalDue: true, state: "renewal_due", applicableLines: ["landscape"], ...o });

describe("board and list follow the season's line and form", () => {
  it("hides a marked agreement until its inclusive source end, ignoring a later lost pending draft", () => {
    const source = term({ nonRenewalOn: "2027-08-01", endDate: today, signedAt: today });
    const lostDraft = term({ id: "pending", status: "lost", displayStatus: "lost", endDate: "2028-08-14" });
    const i = item({ state: "serving_not_renewing", current: source, renewalSource: source, notRenewing: true, latest: lostDraft, recentSigned: source,
      renewalProgress: { due: true, signed: false, notRenewing: true } });
    expect(placements(i)).toEqual([]);
    expect(renewalProgress([i], "landscape", "")).toEqual({ due: 1, signed: 0, notRenewing: 1 });
    const ended = { ...i, state: "closed_recently" as const, renewalSource: { ...source, displayStatus: "lost" } };
    expect(placements(ended)).toEqual([]);
    expect(tableRows([ended], "landscape", "", ["lost"], "customer", "asc")).toHaveLength(1);
    expect(tableRows([i], "landscape", "", ["lost"], "customer", "asc")).toHaveLength(0);
  });
  it("a drafted Both/ours renewal appears on both boards while the current season is landscape", () => {
    const i = item({ state: "renewal_in_progress", applicableLines: ["landscape", "snow"],
      renewalDraft: term({ id: "d", status: "draft", displayStatus: "draft", line: "both", form: "ours", startDate: "2027-10-01" }) });
    expect(boardColumns([i], "snow", "").drafted).toHaveLength(1);
    expect(boardColumns([i], "landscape", "").drafted).toHaveLength(1);
  });
  it("a renewal-due landscape card stays off the snow board", () => {
    expect(boardColumns([item()], "snow", "").renewal).toHaveLength(0);
    expect(boardColumns([item()], "landscape", "").renewal).toHaveLength(1);
  });
  it("the table uses rowTerm's line and form", () => {
    const i = item({ line: "snow", applicableLines: ["snow"], form: "theirs", current: term({ line: "snow", form: "ours" }) });
    expect(rowLine(i)).toBe("snow"); expect(rowForm(i)).toBe("ours");
    expect(tableRows([i], "snow", "", [], "customer", "asc")).toHaveLength(1);
    expect(tableRows([i], "landscape", "", [], "customer", "asc")).toHaveLength(0);
  });
  it("falls back to the item's derived line for older payloads", () => {
    const i = item({ line: "both", current: term({ line: undefined }) });
    expect(rowLine(i)).toBe("both");
  });
  it("keeps an explicitly lost renewal in the Lost view without calling empty history lost", () => {
    const lost = term({ id: "lost", status: "lost", displayStatus: "lost" });
    const closed = item({ state: "closed_recently", current: term({ displayStatus: "expired" }), latest: lost });
    expect(tableRows([closed], "landscape", "", ["lost"], "customer", "asc")).toHaveLength(1);
    expect(tableRows([item({ state: "closed", current: null })], "landscape", "", ["lost"], "customer", "asc")).toHaveLength(0);
  });
});
