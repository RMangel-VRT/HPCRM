export const COMPANY_TIME_ZONE = "America/Denver";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COMPANY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const clockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: COMPANY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** The Colorado calendar date (YYYY-MM-DD) that an instant falls on. */
export function companyDateString(instant: Date): string {
  const parts = dateFormatter.formatToParts(instant);
  const pick = (type: string) => parts.find(part => part.type === type)!.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Colorado "today", independent of the process timezone. */
export function companyToday(now = new Date()): string {
  return companyDateString(now);
}

function calendarInstant(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`Invalid calendar date: ${date}`);
  const [year, month, day] = date.split("-").map(Number);
  // Start from a leap-year anchor so Date.UTC's special handling of years
  // 00–99 cannot change the requested calendar year.
  const instant = new Date(Date.UTC(2000, month - 1, day));
  instant.setUTCFullYear(year);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return instant;
}

/** Pure calendar arithmetic; UTC here is a day-number representation, not a business timezone. */
export function addCalendarDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError("Calendar days must be an integer");
  const instant = calendarInstant(date);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

/** Signed distance between date-only values, not elapsed Colorado midnight hours. */
export function calendarDaysBetween(from: string, to: string): number {
  return (calendarInstant(to).getTime() - calendarInstant(from).getTime()) / 86_400_000;
}

export function isWeekend(date: string): boolean {
  const weekday = calendarInstant(date).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function companyWallTime(date: string, hour = 0): Date {
  const wallTime = calendarInstant(date).getTime() + hour * 3600000;
  let candidate = wallTime;
  // Resolve the offset at this midnight, not at noon or at the other boundary.
  // Colorado's DST changes never skip/repeat midnight.
  for (let i = 0; i < 4; i++) {
    const parts = clockFormatter.formatToParts(new Date(candidate));
    const pick = (type: string) => Number(parts.find(part => part.type === type)!.value);
    const projected = new Date(0);
    projected.setUTCFullYear(pick("year"), pick("month") - 1, pick("day"));
    projected.setUTCHours(pick("hour"), pick("minute"), pick("second"), 0);
    const correction = wallTime - projected.getTime();
    if (correction === 0) return new Date(candidate);
    candidate += correction;
  }
  throw new RangeError(`Cannot resolve Colorado midnight: ${date}`);
}

/** Inclusive start / exclusive end, independently resolved for DST-correct boundaries. */
export function companyDayBounds(date: string): { start: Date; end: Date } {
  return { start: companyWallTime(date), end: companyWallTime(addCalendarDays(date, 1)) };
}

/** Resolve noon at the day's own DST offset, never using host-local time. */
export function companyNoon(date: string): Date {
  return companyWallTime(date, 12);
}
