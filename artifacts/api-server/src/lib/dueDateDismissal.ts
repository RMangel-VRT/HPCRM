import { companyDayBounds, companyToday } from "./companyDay";

/** Only an explicitly supplied, changed instant tomorrow or later dismisses reminders. */
export function dueDateExtendedToFuture(
  provided: string | Date | null | undefined,
  previous: string | Date | null,
  now = new Date(),
): boolean {
  if (provided == null) return false;
  const next = new Date(provided);
  const old = previous == null ? null : new Date(previous);
  return (!old || next.getTime() !== old.getTime())
    && next.getTime() >= companyDayBounds(companyToday(now)).end.getTime();
}
