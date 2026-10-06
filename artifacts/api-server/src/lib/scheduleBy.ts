export type Priority = "urgent" | "high" | "normal" | "low";

/** Server-local company day (Colorado), matching the crew app's "today".
 * Do not use toISOString(): UTC can be the next day in the evening.
 */
export function localDateString(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Calendar date (YYYY-MM-DD) the job must be on the calendar by. */
export function computeScheduleBy(priority: Priority | string | null | undefined, base: Date): string {
  const day = new Date(base.getTime());
  // Local noon keeps calendar arithmetic stable across daylight-saving changes.
  day.setHours(12, 0, 0, 0);
  if (priority === "urgent") {
    do { day.setDate(day.getDate() + 1); } while (day.getDay() === 0 || day.getDay() === 6);
  } else {
    day.setDate(day.getDate() + (priority === "high" ? 3 : priority === "low" ? 21 : 7));
  }
  return localDateString(day);
}
