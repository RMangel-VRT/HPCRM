import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { crews, visits } from "@workspace/db";
import { db } from "../db";
import { addCalendarDays } from "./companyDay";
import { nextWorkingDay, routeWeekday } from "./routeFill";
import { lockVisitCompany, VisitError, type VisitTransaction } from "./visitSync";

export interface SlideInput { date: string; crewIds: string[] | "all"; mode: "week" | "day" }
export async function slideRouteVisitsInTransaction(tx: VisitTransaction, companyId: string, body: SlideInput) {
  const standing = await tx.select().from(crews).where(eq(crews.companyId, companyId));
  const ids = body.crewIds === "all" ? standing.map(c => c.id) : body.crewIds;
  if (new Set(ids).size !== ids.length || ids.some(id => !standing.some(c => c.id === id)))
    throw new VisitError(400, "INVALID_CREW", "Invalid crew selection");
  const end = body.mode === "day" ? body.date : addCalendarDays(body.date, 6 - routeWeekday(body.date));
  if (!ids.length || end < body.date) return { moved: 0, byCrew: {} as Record<string, number> };
  const all = await tx.select().from(visits).where(and(eq(visits.companyId, companyId),
    inArray(visits.crewId, ids), gte(visits.visitDate, body.date), lte(visits.visitDate, nextWorkingDay(end))));
  const moving = all.filter(v => v.sourceType === "route" && v.status === "planned" && v.visitDate <= end)
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || (a.routeOrder ?? Infinity) - (b.routeOrder ?? Infinity) || a.id.localeCompare(b.id));
  const maxima = new Map<string, number>();
  for (const v of all) {
    const key = `${v.crewId}/${v.visitDate}`;
    maxima.set(key, Math.max(maxima.get(key) ?? 0, v.routeOrder ?? 0));
  }
  const byCrew: Record<string, number> = {};
  const moves = moving.map(v => {
    const date = nextWorkingDay(v.visitDate), key = `${v.crewId}/${date}`, order = (maxima.get(key) ?? 0) + 1;
    maxima.set(key, order); byCrew[v.crewId!] = (byCrew[v.crewId!] ?? 0) + 1;
    return { id: v.id, date, order };
  });
  // One atomic bulk update; original occurrence identity is intentionally absent.
  if (moves.length) await tx.update(visits).set({
    visitDate: sql`CASE ${visits.id} ${sql.join(moves.map(m => sql`WHEN ${m.id} THEN ${m.date}::date`), sql` `)} END`,
    routeOrder: sql`CASE ${visits.id} ${sql.join(moves.map(m => sql`WHEN ${m.id} THEN ${m.order}::integer`), sql` `)} END`,
    updatedAt: new Date(),
  }).where(and(eq(visits.companyId, companyId), inArray(visits.id, moves.map(m => m.id))));
  return { moved: moves.length, byCrew };
}
export async function slideRouteVisits(companyId: string, body: SlideInput) {
  return db.transaction(async tx => {
    await lockVisitCompany(tx, companyId);
    return slideRouteVisitsInTransaction(tx, companyId, body);
  });
}
