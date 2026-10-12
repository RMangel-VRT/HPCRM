import { addCalendarDays, companyDateString, isWeekend } from "./companyDay";

export type Priority = "urgent" | "high" | "normal" | "low";

/** Compatibility formatter: an instant's Colorado day, never the host-local day. */
export function localDateString(d: Date): string {
  return companyDateString(d);
}

/** Calendar date (YYYY-MM-DD) the job must be on the calendar by. */
export function computeScheduleBy(priority: Priority | string | null | undefined, base: Date): string {
  let day = companyDateString(base);
  if (priority === "urgent") {
    do { day = addCalendarDays(day, 1); } while (isWeekend(day));
  } else {
    day = addCalendarDays(day, priority === "high" ? 3 : priority === "low" ? 21 : 7);
  }
  return day;
}
