import { describe, expect, it } from "vitest";
import { estimateNextAction } from "./estimateNextAction";
import { companyToday } from "../lib/companyDay";
import { estimateLineNeedsPrice } from "@workspace/db";
const today = "2026-11-12";
const base = { stage: "sent", daysInStage: 0, assignee: null, owner: null, followUpDate: null, followUpNote: null,
  estimate: { sentAt: "2026-11-05T18:00:00Z", validUntil: "2026-12-05", draftEditedAt: null, linesNeedingPrice: 0 } } as any;
function action(overrides: any = {}, day = today) { return estimateNextAction({ ...base, ...overrides }, day); }
describe("ordered next actions", () => {
  it("won and decision take precedence over expiry", () => {
    expect(action({ stage: "won", owner: { sectionKey: "invoicing" } })).toMatchObject({ bucket: "won", urgency: null, reason: { key: "estimates.owner.invoicing" } });
    expect(action({ stage: "decision", daysInStage: 2 })).toMatchObject({ bucket: "decide", urgency: "amber", reason: { params: { count: 2 } } });
  });
  it.each([[-1, "follow_up", "red"], [0, "follow_up", "red"], [5, "follow_up", "red"], [6, "waiting", null]])("expiry distance %s", (days, bucket, urgency) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
    expect(action({ followUpDate: "2026-11-25", estimate: { ...base.estimate, validUntil: date.toISOString().slice(0, 10) } })).toMatchObject({ bucket, urgency });
  });
  it.each([["2026-11-12", "amber", "due"], ["2026-11-11", "amber", "overdue"], ["2026-11-10", "red", "overdue"]])("follow-up %s", (date, urgency, reason) => {
    expect(action({ followUpDate: date, followUpNote: "Called" })).toMatchObject({ bucket: "follow_up", urgency, reason: { key: `estimateActions.reason.${reason}` }, detail: { params: { note: "Called" } } });
  });
  it("expiry precedes an overdue follow-up", () => {
    expect(action({ followUpDate: "2026-11-01", estimate: { ...base.estimate, validUntil: "2026-11-10" } }).reason.key).toBe("estimateActions.reason.expired");
  });
  it.each([6, 7])("unanswered at %s days", days => {
    expect(action({ estimate: { ...base.estimate, sentAt: `2026-11-${12 - days < 10 ? "0" : ""}${12 - days}T18:00:00Z` } })).toMatchObject({ bucket: days === 7 ? "follow_up" : "waiting", urgency: days === 7 ? "amber" : null });
  });
  it("future follow-up waits even after seven days; missing sent date uses stage age", () => {
    expect(action({ followUpDate: "2026-11-20" }).bucket).toBe("waiting");
    expect(action({ estimate: { ...base.estimate, sentAt: null }, daysInStage: 8 }).bucket).toBe("follow_up");
  });
  it.each([2, 3])("proposal age %s", daysInStage => expect(action({ stage: "proposal", daysInStage }).urgency).toBe(daysInStage === 3 ? "amber" : null));
  it.each([[4, null], [5, "amber"], [9, "amber"], [10, "red"]])("draft idle %s", (days, urgency) => {
    expect(action({ stage: "estimating", daysInStage: days, estimate: null })).toMatchObject({ bucket: "finish", urgency });
  });
  it("uses draft edit day rather than stage age, and price detail", () => {
    expect(action({ stage: "estimating", daysInStage: 99, estimate: { ...base.estimate, draftEditedAt: "2026-11-12T02:00:00Z", linesNeedingPrice: 2 } })).toMatchObject({
      bucket: "finish", urgency: null, reason: { params: { count: 1 } }, detail: { params: { count: 2 } },
    });
  });
  it.each(["new", "sent", "proposal"])("missing estimate %s starts safely", stage => {
    expect(action({ stage, estimate: null, daysInStage: 3 })).toMatchObject({ bucket: "start", urgency: "red" });
    expect(action({ stage, estimate: null, daysInStage: 3, assignee: { id: "a" } }).urgency).toBe("amber");
    expect(action({ stage, estimate: null, daysInStage: 2 }).urgency).toBeNull();
  });
  it.each([["2026-03-09T06:00:00Z", "2026-03-07T20:00:00Z", 2], ["2026-11-02T07:00:00Z", "2026-10-31T20:00:00Z", 2],
    ["2026-11-13T02:00:00Z", "2026-11-12T02:00:00Z", 1]])("Colorado DST / evening %s", (now, edited, count) => {
    expect(action({ stage: "estimating", estimate: { ...base.estimate, draftEditedAt: edited } }, companyToday(new Date(now))).reason.params?.count).toBe(count);
  });
  it.each(["catalog", "contract", "rate_card", "quick_list", "manual"])("shared send predicate %s", priceSource => {
    expect(estimateLineNeedsPrice({ unitPriceCents: 0, priceSource })).toBe(priceSource !== "manual");
    expect(estimateLineNeedsPrice({ unitPriceCents: 1, priceSource })).toBe(false);
  });
});
