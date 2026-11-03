import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import { crews, routeStops, visits, type RouteStop, type InsertVisit } from "@workspace/db";
import { db } from "../db";
import { addCalendarDays, calendarDaysBetween, companyToday } from "./companyDay";
import { loadContractCoverage } from "./contractCenterPersistence";
import { lockVisitCompany, VisitError, type VisitTransaction } from "./visitSync";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { routeDate } from "@workspace/db";

export type ResolveCoverage = Awaited<ReturnType<typeof loadContractCoverage>>["resolve"];
export function routeSeason(stop: Pick<RouteStop, "customerId" | "serviceKey" | "seasonStart" | "seasonEnd">, year: number, resolve: ResolveCoverage) {
  if (!stop.customerId) return null;
  if (stop.seasonStart && stop.seasonEnd) return { start: stop.seasonStart, end: stop.seasonEnd, contractStatus: "override" as const };
  const coverage = resolve(stop.customerId, stop.serviceKey, year);
  return coverage?.window ? { ...coverage.window, months: coverage.months, contractStatus: "covered" as const } : null;
}
/** Date-only weekday; companyNoon/host-local midnight are deliberately not used. */
export function routeWeekday(date: string) {
  return ((calendarDaysBetween("2000-01-03", date) % 7) + 7) % 7 + 1;
}
export function nextWorkingDay(date: string) {
  const next = addCalendarDays(date, 1);
  return routeWeekday(next) === 7 ? addCalendarDays(next, 1) : next;
}
export function occurrenceDates(stop: RouteStop, from: string, through: string, resolve: ResolveCoverage): string[] {
  const result: string[] = [];
  for (let day = from; day <= through; day = addCalendarDays(day, 1)) {
    if (day < stop.anchorDate || (stop.pausedUntil && day < stop.pausedUntil) || routeWeekday(day) !== stop.weekday) continue;
    const window = routeSeason(stop, Number(day.slice(0, 4)), resolve);
    if (!window || day < window.start || day > window.end) continue;
    // An outer seasonal window can contain holes (e.g. winter Jan-Mar/Nov-Dec).
    // Manual overrides are deliberately independent of contractual timing.
    if (window.contractStatus === "covered" && !window.months.includes(Number(day.slice(5, 7)))) continue;
    if (stop.everyWeeks === 2 && calendarDaysBetween(stop.anchorDate, day) % 14 !== 0) continue;
    result.push(day);
  }
  return result;
}
export function fillHorizon(through?: string, today = companyToday()) {
  const end = routeDate.parse(through ?? addCalendarDays(today, 21));
  if (end < today || end > addCalendarDays(today, 42)) throw new VisitError(400, "INVALID_HORIZON", "Through must be today through today + 42 Colorado days");
  return { today, through: end };
}
export interface FillReport {
  from: string; through: string; dryRun: boolean; created: number;
  byService: Record<string, number>; byCrew: Record<string, number>;
  skipped: { stopId: string; reason: string }[];
}
export async function fillRouteVisitsInTransaction(tx: VisitTransaction, companyId: string, opts: { through?: string; dryRun?: boolean; today?: string } = {}): Promise<FillReport> {
  const { today, through } = fillHorizon(opts.through, opts.today);
  const stops = await tx.select().from(routeStops).where(and(eq(routeStops.companyId, companyId), eq(routeStops.isActive, true)));
  stops.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const standing = await tx.select().from(crews).where(eq(crews.companyId, companyId));
  const active = new Set(standing.filter(c => c.isActive).map(c => c.id));
  const coverage = await loadContractCoverage(tx, companyId);
  // Include whole original weeks. A weekday edit must not generate a second
  // occurrence for a week already put on the calendar under the old weekday,
  // including moved/cancelled rows. Current visit dates are never the identity.
  const occurrenceFrom = addCalendarDays(today, 1 - routeWeekday(today));
  const occurrenceThrough = addCalendarDays(through, 7 - routeWeekday(through));
  const existing = await tx.select().from(visits).where(and(eq(visits.companyId, companyId), or(
    and(gte(visits.visitDate, today), lte(visits.visitDate, through)),
    and(gte(visits.routeOccurrenceDate, occurrenceFrom), lte(visits.routeOccurrenceDate, occurrenceThrough)),
  )));
  const identities = new Set(existing.filter(v => v.routeStopId).map(v => `${v.routeStopId}/${v.routeOccurrenceDate}`));
  const weekIdentity = (id: string, day: string) => `${id}/${addCalendarDays(day, 1 - routeWeekday(day))}`;
  const occupiedWeeks = new Set(existing.filter(v => v.routeStopId && v.routeOccurrenceDate)
    .map(v => weekIdentity(v.routeStopId!, v.routeOccurrenceDate!)));
  const maxima = new Map<string, number>();
  for (const visit of existing) {
    const key = `${visit.crewId}/${visit.visitDate}`;
    maxima.set(key, Math.max(maxima.get(key) ?? 0, visit.routeOrder ?? 0));
  }
  const report: FillReport = { from: today, through, dryRun: !!opts.dryRun, created: 0, byService: {}, byCrew: {}, skipped: [] };
  const candidates: InsertVisit[] = [];
  for (const stop of stops) {
    let reason: string | undefined;
    if (!active.has(stop.crewId)) reason = "Inactive crew";
    else if (stop.pausedUntil && stop.pausedUntil > through) reason = "Paused";
    else if (!Array.from({ length: Number(through.slice(0, 4)) - Number(today.slice(0, 4)) + 1 }, (_, i) =>
      routeSeason(stop, Number(today.slice(0, 4)) + i, coverage.resolve)).some(Boolean)) {
      const covered = Array.from({ length: Number(through.slice(0, 4)) - Number(today.slice(0, 4)) + 1 },
        (_, i) => coverage.resolve(stop.customerId, stop.serviceKey, Number(today.slice(0, 4)) + i)).some(Boolean);
      reason = covered ? "Contract has no seasonal month spread" : "No contract for this season";
    }
    if (reason) { report.skipped.push({ stopId: stop.id, reason }); continue; }
    for (const date of occurrenceDates(stop, today, through, coverage.resolve)) {
      if (identities.has(`${stop.id}/${date}`) || occupiedWeeks.has(weekIdentity(stop.id, date))) continue;
      const key = `${stop.crewId}/${date}`, order = (maxima.get(key) ?? 0) + 1;
      maxima.set(key, order);
      // Frozen occurrence snapshot. Later stop edits never rewrite this visit.
      candidates.push({ companyId, crewId: stop.crewId, customerId: stop.customerId,
        sourceType: "route", routeStopId: stop.id, routeOccurrenceDate: date, visitDate: date,
        title: SCOPE_CATALOG.find(s => s.key === stop.serviceKey)?.label ?? stop.serviceKey,
        serviceKey: stop.serviceKey, estimatedHours: stop.minutes / 60, routeOrder: order,
        status: "planned", notes: stop.notes });
    }
  }
  // Bound batch size to stay below PostgreSQL's parameter limit, not one query/stop.
  const inserted: { serviceKey: string | null; crewId: string | null }[] = [];
  if (opts.dryRun) inserted.push(...candidates.map(v => ({ serviceKey: v.serviceKey ?? null, crewId: v.crewId ?? null })));
  else for (let i = 0; i < candidates.length; i += 1000) {
    inserted.push(...await tx.insert(visits).values(candidates.slice(i, i + 1000)).onConflictDoNothing({
      target: [visits.routeStopId, visits.routeOccurrenceDate],
      where: sql`${visits.routeStopId} IS NOT NULL`,
    }).returning({ serviceKey: visits.serviceKey, crewId: visits.crewId }));
  }
  for (const row of inserted) {
    report.created++;
    report.byService[row.serviceKey!] = (report.byService[row.serviceKey!] ?? 0) + 1;
    report.byCrew[row.crewId!] = (report.byCrew[row.crewId!] ?? 0) + 1;
  }
  return report;
}
export async function fillRouteVisits(companyId: string, opts: { through?: string; dryRun?: boolean; today?: string } = {}) {
  return db.transaction(async tx => {
    if (!opts.dryRun) await lockVisitCompany(tx, companyId);
    return fillRouteVisitsInTransaction(tx, companyId, opts);
  }, opts.dryRun ? { isolationLevel: "repeatable read", accessMode: "read only" } : undefined);
}
