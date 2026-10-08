// Cross-artifact integration tests live outside the API compilation root.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  schedulingStatusIds, isNeedsSchedulingStatus, companyToday, addDaysYmd,
  previewScheduleBy, isBeforeCompanyToday, invalidateTicketScheduling,
} from "../../highplains-crm/src/lib/schedulingStatus";

describe("scheduling release client contracts", () => {
  afterEach(() => vi.useRealTimers());
  it("uses all status IDs, respects an authoritative empty set, and only falls back for old responses", () => {
    const set = schedulingStatusIds({
      schedulingStatusId: "task", schedulingStatusIds: ["task", "project", "estimate", "custom-ready"],
    });
    for (const id of ["task", "project", "estimate", "custom-ready"]) {
      expect(isNeedsSchedulingStatus(set, id)).toBe(true);
    }
    expect(isNeedsSchedulingStatus(set, "scheduled")).toBe(false);
    expect(isNeedsSchedulingStatus(set, null)).toBe(false);
    expect(schedulingStatusIds({ schedulingStatusId: "task", schedulingStatusIds: [] }).size).toBe(0);
    expect([...schedulingStatusIds({ schedulingStatusId: "legacy" })]).toEqual(["legacy"]);
  });
  it("compares Colorado dates across UTC midnight and DST without marking today overdue", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-10-07T02:00:00Z"));
    expect(companyToday()).toBe("2026-10-06");
    expect(isBeforeCompanyToday("2026-10-05")).toBe(true);
    expect(isBeforeCompanyToday("2026-10-06")).toBe(false);
    expect(isBeforeCompanyToday("2026-10-07")).toBe(false);
    expect(companyToday(new Date("2026-03-08T08:30:00Z"))).toBe("2026-03-08");
    expect(companyToday(new Date("2026-11-01T07:30:00Z"))).toBe("2026-11-01");
    expect(addDaysYmd("2026-03-07", 3)).toBe("2026-03-10");
    expect(addDaysYmd("2026-10-31", 3)).toBe("2026-11-03");
  });
  it("previews each priority using the company day and next business day for urgent", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-10-10T02:00:00Z")); // Friday in Colorado.
    expect(previewScheduleBy("urgent")).toBe("2026-10-12");
    expect(previewScheduleBy("high")).toBe("2026-10-12");
    expect(previewScheduleBy("normal")).toBe("2026-10-16");
    expect(previewScheduleBy("low")).toBe("2026-10-30");
  });
  it("refreshes official details, lists, owner queues, scheduling metadata and customer tickets", () => {
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const client = { invalidateQueries: invalidate } as unknown as Parameters<typeof invalidateTicketScheduling>[0];
    invalidateTicketScheduling(client, "job", "property");
    for (const queryKey of [
      ["/api/tickets", "job", "details"], ["/api/tickets"], ["/api/tickets/my"],
      ["/api/dashboard/action-queue"], ["/api/scheduling-status"],
      ["/api/customers", "property", "tickets"],
    ]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  });
});
