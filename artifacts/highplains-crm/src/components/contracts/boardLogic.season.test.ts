import { describe, expect, it } from "vitest";
import { boardColumns, rowForm, rowLine, tableRows } from "./boardLogic";
import type { ContractListItem, TermSummary } from "./contractTypes";

const today = "2027-08-15";
const term = (o: Partial<TermSummary> = {}): TermSummary => ({ id: "t", seasonLabel: "2026–27", startDate: "2026-10-01", endDate: "2027-09-30",
  status: "active", displayStatus: "active", annualPriceCents: 3000000, snowPricing: null, needsReview: false, line: "landscape", form: "theirs", ...o });
const item = (o: Partial<ContractListItem> = {}): ContractListItem => ({ id: "a", customerId: "c", customerName: "Summerfield", line: "landscape", form: "theirs",
  current: term(), renewalDraft: null, renewalDue: true, ...o });

describe("board and list follow the season's line and form", () => {
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
