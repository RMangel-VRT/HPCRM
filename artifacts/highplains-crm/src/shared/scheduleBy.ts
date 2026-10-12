export type Priority = "urgent" | "high" | "normal" | "low";

export const COMPANY_TIME_ZONE = "America/Denver";

/** An instant's Colorado calendar day; not a date-picker serializer. */
export function localDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const pick = (type: string) => parts.find(part => part.type === type)!.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Calendar-string math, with UTC used only as a day-number representation. */
export function addCalendarDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** Calendar date (YYYY-MM-DD) the job must be on the calendar by. */
export function computeScheduleBy(priority: Priority | string | null | undefined, base: Date): string {
  let day = localDateString(base);
  if (priority === "urgent") {
    do { day = addCalendarDays(day, 1); } while ([0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()));
  } else {
    day = addCalendarDays(day, priority === "high" ? 3 : priority === "low" ? 21 : 7);
  }
  return day;
}
