import { afterEach, describe, expect, it, vi } from "vitest";
import { computeScheduleBy, localDateString } from "../shared/scheduleBy";
import { addDaysYmd, calendarDateString, companyToday, parseCalendarDate, previewScheduleBy } from "./schedulingStatus";

afterEach(() => vi.useRealTimers());
describe("scheduling calendar-only UI values", () => {
  it("previews creation and defaults follow-up from Colorado today in the evening", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T19:00:00-06:00"));
    expect(companyToday()).toBe("2026-10-09");
    expect(previewScheduleBy("urgent")).toBe("2026-10-12");
    expect(previewScheduleBy("high")).toBe("2026-10-12");
    expect(previewScheduleBy("normal")).toBe("2026-10-16");
    expect(previewScheduleBy("low")).toBe("2026-10-30");
    const defaultDate = parseCalendarDate(addDaysYmd(companyToday(), 3));
    expect(calendarDateString(defaultDate)).toBe("2026-10-12");
  });
  it.each(["2026-03-08", "2026-11-01", "2028-02-29", "2027-01-01"])(
    "selected date %s survives edit/save as calendar components", selected => {
      expect(calendarDateString(parseCalendarDate(selected))).toBe(selected);
      expect(calendarDateString(new Date(`${selected}T00:00:00`))).toBe(selected);
    },
  );
  it("keeps calendar serialization distinct from instant projection", () => {
    const instant = new Date("2026-10-10T00:30:00Z");
    expect(localDateString(instant)).toBe("2026-10-09");
    expect(computeScheduleBy("urgent", instant)).toBe("2026-10-12");
    expect(addDaysYmd("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDaysYmd("2026-10-31", 2)).toBe("2026-11-02");
  });
});
