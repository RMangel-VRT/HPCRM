import { describe, expect, it } from "vitest";
import { isServiceSetup, serviceNextLabel, serviceStatusLabel, summarizeContractServices, SERVICE_STATUS_LABELS } from "./contractCustomerServices";
import { serviceRowFixture } from "./contractCustomerServices.fixtures";

describe("CP6 returned demand presentation", () => {
  it("only sums supplied known denominators and preserves row order", () => {
    const rows = [serviceRowFixture({ serviceKey: "route", owed: 10, done: 6, status: "overdue", issues: ["no_route"] }),
      serviceRowFixture({ serviceKey: "unknown", owed: null, done: 42, remaining: null, status: "no_count", issues: ["count_mismatch"] }),
      serviceRowFixture({ serviceKey: "skips", owed: 3, done: 1, skipped: 2, status: "closed_with_skips", issues: [] })];
    expect(summarizeContractServices(rows)).toMatchObject({ rows, done: 7, owed: 13, unknownCount: 1, setup: 2, overdue: 1 });
  });
  it("setup comes from metadata, never unknown/zero count inference", () => {
    expect(isServiceSetup(serviceRowFixture({ owed: null, status: "waiting_on_signature", issues: [] }))).toBe(false);
    expect(isServiceSetup(serviceRowFixture({ owed: 10, status: "overdue", issues: ["no_route"] }))).toBe(true);
    expect(isServiceSetup(serviceRowFixture({ owed: 0, status: "not_owed", issues: ["count_mismatch"] }))).toBe(false);
  });
  it("selects the earliest supplied next even when in the past, without status precedence", () => {
    const later = serviceRowFixture();
    const earlier = serviceRowFixture({ serviceKey: "earlier", status: "no_timing", next: { ...later.next!, date: "2026-03-01" } });
    expect(summarizeContractServices([later, earlier]).next).toBe(earlier);
  });
  it("distinguishes all three next meanings and keeps date-only days", () => {
    const next = serviceRowFixture().next!;
    expect(serviceNextLabel({ ...next, date: "2026-03-01" })).toBe("Window opens Mar 1");
    expect(serviceNextLabel({ ...next, kind: "chemical_promise", date: "2026-03-12" })).toBe("Promised Mar 12");
    expect(serviceNextLabel({ ...next, kind: "route_visit", date: "2026-04-07" })).toBe("Visit Tue Apr 7");
    expect(serviceNextLabel(next, "es")).toMatch(/abr/);
    expect(serviceNextLabel(next)).not.toMatch(/appointment|scheduled/i);
  });
  it("has an explicit label for every CG5 primary status and informational count mismatch", () => {
    for (const status of ["on_track", "complete", "closed_with_skips", "not_owed", "overdue", "missing_item",
      "waiting_on_signature", "no_route", "no_count", "needs_rounds", "month_outside_calendar", "legacy_chemical", "invalid_count", "duplicate_lines", "count_mismatch"]) {
      expect(SERVICE_STATUS_LABELS[status]).toBeTruthy();
      expect(serviceStatusLabel(status)).not.toContain("_");
    }
  });
});
