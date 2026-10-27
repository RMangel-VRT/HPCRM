import { calendarDaysBetween, companyDateString, companyToday } from "./companyDay";

export function ageDetail(context: string, days: number | null, language = "en"): string {
  const age = days === null || !Number.isFinite(days)
    ? language === "es" ? "Fecha no disponible" : "Date unavailable"
    : days < 0 ? `${language === "es" ? "en" : "in"} ${Math.abs(days)}d` : `${days}d`;
  return `${context} · ${age}`;
}

/** Date-only values stay calendar dates; instants are projected to Colorado once. */
export function calendarDetail(context: string, source: string | Date | null | undefined, now: Date, language = "en"): string {
  if (!source) return ageDetail(context, null, language);
  try {
    const date = typeof source === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source)
      ? source : companyDateString(source instanceof Date ? source : new Date(source));
    return ageDetail(context, calendarDaysBetween(date, companyToday(now)), language);
  } catch {
    return ageDetail(context, null, language);
  }
}
