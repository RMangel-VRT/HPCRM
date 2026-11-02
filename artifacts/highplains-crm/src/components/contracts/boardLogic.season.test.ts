import { describe, expect, it } from "vitest";
import { boardColumns, rowForm, rowLine, tableRows, placements, renewalProgress } from "./boardLogic";
import type { ContractListItem, TermSummary } from "./contractTypes";

const today = "2027-08-15";
const term = (o: Partial<TermSummary> = {}): TermSummary => ({ id: "t", seasonLabel: "2026–27", startDate: "2026-10-01", endDate: "2027-09-30",
  status: "active", displayStatus: "active", annualPriceCents: 3000000, snowPricing: null, needsReview: false, line: "landscape", form: "theirs", ...o });
const item = (o: Partial<ContractListItem> = {}): ContractListItem => ({ id: "a", customerId: "c", customerName: "Summerfield", line: "landscape", form: "theirs",
  current: term(), renewalDraft: null, renewalDue: true, ...o });

describe("board and list follow the season's line and form", () => {
  it("hides a marked agreement until its inclusive source end, ignoring a later lost pending draft", () => {
    const source = term({ nonRenewalOn: "2027-08-01", endDate: today, signedAt: today });
    const lostDraft = term({ id: "pending", status: "lost", displayStatus: "lost", endDate: "2028-08-14" });
    const i = item({ current: source, renewalSource: source, notRenewing: true, latest: lostDraft, recentSigned: source,
      renewalProgress: { due: true, signed: false, notRenewing: true } });
    expect(placements(i, today)).toEqual([]);
    expect(renewalProgress([i], "landscape", "")).toEqual({ due: 1, signed: 0, notRenewing: 1 });
    const ended = { ...i, renewalSource: { ...source, displayStatus: "lost" } };
    expect(placements(ended, "2027-08-16")).toMatchObject([{ term: { id: source.id }, column: "lost" }]);
    expect(placements(ended, "2027-11-14")).toEqual([]);
    expect(tableRows([ended], "landscape", "", ["lost"], "customer", "asc")).toHaveLength(1);
    expect(tableRows([i], "landscape", "", ["lost"], "customer", "asc")).toHaveLength(0);
  });
  it("a drafted Both/ours renewal appears on both boards while the current season is landscape", () => {
    const i = item({ renewalDraft: term({ id: "d", status: "draft", displayStatus: "draft", line: "both", form: "ours", startDate: "2027-10-01" }) });
    expect(boardColumns([i], "snow", "", today).drafted).toHaveLength(1);
    expect(boardColumns([i], "landscape", "", today).drafted).toHaveLength(1);
  });
  it("a renewal-due landscape card stays off the snow board", () => {
    expect(boardColumns([item()], "snow", "", today).renewal).toHaveLength(0);
    expect(boardColumns([item()], "landscape", "", today).renewal).toHaveLength(1);
  });
  it("the table uses rowTerm's line and form", () => {
    const i = item({ line: "landscape", form: "theirs", current: term({ line: "snow", form: "ours" }) });
    expect(rowLine(i)).toBe("snow"); expect(rowForm(i)).toBe("ours");
    expect(tableRows([i], "snow", "", [], "customer", "asc")).toHaveLength(1);
    expect(tableRows([i], "landscape", "", [], "customer", "asc")).toHaveLength(0);
  });
  it("falls back to the item's derived line for older payloads", () => {
    const i = item({ line: "both", current: term({ line: undefined }) });
    expect(rowLine(i)).toBe("both");
  });
});
