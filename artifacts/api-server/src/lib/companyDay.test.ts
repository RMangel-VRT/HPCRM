import { describe, expect, it } from "vitest";
import { addCalendarDays, companyDateString, companyDayBounds, companyToday, isWeekend } from "./companyDay";
import { dueDateExtendedToFuture } from "./dueDateDismissal";

describe("explicit Colorado calendar", () => {
  it.each([
    ["2026-10-09T23:30:00-06:00", "2026-10-09"],
    ["2026-10-10T00:00:00-06:00", "2026-10-10"],
    ["2026-03-08T01:59:59-07:00", "2026-03-08"],
    ["2026-03-08T03:00:00-06:00", "2026-03-08"],
    ["2026-11-01T01:30:00-06:00", "2026-11-01"],
    ["2026-11-01T01:30:00-07:00", "2026-11-01"],
    ["2026-11-01T23:59:59-07:00", "2026-11-01"],
    ["2026-11-02T00:00:00-07:00", "2026-11-02"],
  ])("%s belongs to %s", (instant, date) => {
    expect(companyDateString(new Date(instant))).toBe(date);
    expect(companyToday(new Date(instant))).toBe(date);
  });
  it.each([
    ["2026-03-08", "2026-03-08T07:00:00Z", "2026-03-09T06:00:00Z", 23],
    ["2026-11-01", "2026-11-01T06:00:00Z", "2026-11-02T07:00:00Z", 25],
    ["2026-10-09", "2026-10-09T06:00:00Z", "2026-10-10T06:00:00Z", 24],
  ])("%s resolves independent midnight offsets", (date, start, end, hours) => {
    const bounds = companyDayBounds(date);
    expect(bounds.start.getTime()).toBe(new Date(start).getTime());
    expect(bounds.end.getTime()).toBe(new Date(end).getTime());
    expect((bounds.end.getTime() - bounds.start.getTime()) / 3_600_000).toBe(hours);
    expect(companyDateString(bounds.start)).toBe(date);
    expect(companyDateString(new Date(bounds.end.getTime() - 1))).toBe(date);
    expect(companyDateString(bounds.end)).toBe(addCalendarDays(date, 1));
  });
  it.each([
    ["2026-03-06", "2026-03-13", 167],
    ["2026-10-30", "2026-11-06", 169],
  ])("seven dates across DST from %s", (startDate, endDate, hours) => {
    const dates = Array.from({ length: 7 }, (_, i) => addCalendarDays(startDate, i));
    expect(new Set(dates).size).toBe(7);
    expect(addCalendarDays(startDate, 7)).toBe(endDate);
    expect((companyDayBounds(endDate).start.getTime() - companyDayBounds(startDate).start.getTime()) / 3_600_000).toBe(hours);
  });
  it("uses pure calendar arithmetic for weekends, year ends and leap days", () => {
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(isWeekend("2026-10-10")).toBe(true);
    expect(isWeekend("2026-10-11")).toBe(true);
    expect(isWeekend("2026-10-12")).toBe(false);
  });
  it.each(["invalid", "2026-02-29", "2026-04-31"])("rejects invalid calendar date %s", date => {
    expect(() => companyDayBounds(date)).toThrow(RangeError);
  });
});

describe("due-date dismissal tomorrow boundary", () => {
  const now = new Date("2026-10-09T20:00:00-06:00");
  it.each([null, undefined, "2026-10-09T23:59:59.999-06:00", "invalid"])("does not dismiss for %s", value => {
    expect(dueDateExtendedToFuture(value, null, now)).toBe(false);
  });
  it("requires an actual explicit change, but accepts exact Colorado tomorrow", () => {
    const tomorrow = "2026-10-10T00:00:00-06:00";
    expect(dueDateExtendedToFuture(tomorrow, tomorrow, now)).toBe(false);
    expect(dueDateExtendedToFuture(tomorrow, "2026-10-09T18:00:00-06:00", now)).toBe(true);
    expect(dueDateExtendedToFuture(undefined, tomorrow, now)).toBe(false);
  });
  it.each([
    ["2026-03-08T20:00:00-06:00", "2026-03-09T00:00:00-06:00"],
    ["2026-11-01T20:00:00-07:00", "2026-11-02T00:00:00-07:00"],
  ])("uses tomorrow even on the DST day %s", (instant, tomorrow) => {
    expect(dueDateExtendedToFuture(tomorrow, null, new Date(instant))).toBe(true);
    expect(dueDateExtendedToFuture(new Date(new Date(tomorrow).getTime() - 1), null, new Date(instant))).toBe(false);
  });
});
