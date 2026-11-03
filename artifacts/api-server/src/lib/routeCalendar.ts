import { and, eq, gte } from "drizzle-orm";
import { routeStops, visits } from "@workspace/db";
import { companyToday, addCalendarDays } from "./companyDay";
import { loadContractCoverage } from "./contractCenterPersistence";
import { occurrenceDates, routeWeekday } from "./routeFill";
import { VisitError, validateVisitCrew, type VisitTransaction } from "./visitSync";
import { patchVisitInTransaction } from "../routes/visits";

/** Preserve the original occurrence identity. Map it within the same Monday
 * week, rather than treating a rain-slid date as a new pattern occurrence.
 * Cadence is evaluated against the candidate day, using the stop's anchor.
 */
export function matchingPatternDate(original: string, weekday: number) {
  return addCalendarDays(original, weekday - routeWeekday(original));
}

/** Caller holds lockVisitCompany. All eligibility reads and writes share that
 * gate, with rollback on ANY failure. A stale drawer cannot apply another
 * editor's changed pattern. Closed/past/unrelated work is never selected.
 */
export async function applyRouteCalendar(tx: VisitTransaction, companyId: string, userId: string, stopId: string, expectedUpdatedAt: string, today = companyToday()) {
  const [stop] = await tx.select().from(routeStops).where(and(eq(routeStops.id, stopId), eq(routeStops.companyId, companyId)));
  if (!stop) throw new VisitError(404, "NOT_FOUND");
  if (stop.updatedAt.toISOString() !== expectedUpdatedAt) throw new VisitError(409, "ROUTE_CHANGED", "This route changed. Reload it before updating calendar visits.");
  await validateVisitCrew(tx, companyId, stop.crewId);
  const coverage = await loadContractCoverage(tx, companyId);
  const rows = await tx.select().from(visits).where(and(
    eq(visits.companyId, companyId), eq(visits.sourceType, "route"), eq(visits.routeStopId, stop.id),
    eq(visits.status, "planned"), gte(visits.visitDate, today),
  ));
  const report = { moved: 0, cancelled: 0, unchanged: 0 };
  for (const visit of rows) {
    // Corrupt/foreign identities must not be silently rewritten.
    if (!visit.routeOccurrenceDate || visit.customerId !== stop.customerId || visit.serviceKey !== stop.serviceKey || visit.ticketId)
      throw new VisitError(409, "ROUTE_VISIT_CHANGED", "A calendar visit no longer matches this route. Reload and review it.");
    // A past occurrence manually moved into the future is not future work to
    // regenerate or shift. Retain it exactly as scheduled.
    if (visit.routeOccurrenceDate < today) { report.unchanged++; continue; }
    const date = matchingPatternDate(visit.routeOccurrenceDate, stop.weekday);
    const eligible = stop.isActive && date >= today && occurrenceDates(stop, date, date, coverage.resolve).length > 0;
    // Also guard the ORIGINAL contractual month: moving a winter occurrence
    // from a zero-spread month must never make it contractually eligible.
    const originalCoverage = coverage.resolve(stop.customerId, stop.serviceKey, Number(visit.routeOccurrenceDate.slice(0, 4)));
    const validOriginalMonth = !!stop.seasonStart || !!originalCoverage?.months.includes(Number(visit.routeOccurrenceDate.slice(5, 7)));
    if (!eligible || !validOriginalMonth) {
      await patchVisitInTransaction(tx, companyId, userId, visit.id, { status: "cancelled" });
      report.cancelled++;
    } else if (visit.crewId !== stop.crewId || visit.visitDate !== date || visit.estimatedHours !== stop.minutes / 60) {
      await patchVisitInTransaction(tx, companyId, userId, visit.id, { crewId: stop.crewId, visitDate: date, estimatedHours: stop.minutes / 60 });
      report.moved++;
    } else report.unchanged++;
  }
  return report;
}
