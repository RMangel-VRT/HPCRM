import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { tickets, visits, crews, ticketTypes, ticketTypeStatuses, ticketStatusHistory, type Visit, type Ticket } from "@workspace/db";
import { db } from "../db";
import { companyNoon, companyToday } from "./companyDay";
import { applySchedulingTransition } from "./schedulingTransition";
import { maintainScheduleBy } from "./scheduleByMaintenance";
import { findSeededStatus } from "../shared/ticketCapabilities";

export type VisitTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class VisitError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}
export const openVisitStatuses = ["planned", "in_progress"] as const;

/** Company gate precedes ticket/day locks everywhere (including compatibility/backfill).
 * This intentionally serializes company scheduling writes, avoiding reorder/append phantoms
 * and lock-order inversions when a drag moves between two crew-days. */
export async function lockVisitCompany(tx: VisitTransaction, companyId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('visits'), hashtext(${companyId}))`);
}
export async function lockVisitTickets(tx: VisitTransaction, companyId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids)].sort();
  if (!uniqueIds.length) return [];
  return tx.select().from(tickets).where(and(eq(tickets.companyId, companyId), inArray(tickets.id, uniqueIds)))
    .orderBy(asc(tickets.id)).for("update");
}
export async function validateVisitCrew(tx: VisitTransaction, companyId: string, crewId: string) {
  const [crew] = await tx.select().from(crews).where(and(eq(crews.id, crewId), eq(crews.companyId, companyId), eq(crews.isActive, true)));
  if (!crew) throw new VisitError(400, "INVALID_CREW", "Crew must be active and belong to this company");
  return crew;
}
export async function schedulableTicket(tx: VisitTransaction, companyId: string, ticketId: string) {
  const [ticket] = await lockVisitTickets(tx, companyId, [ticketId]);
  if (!ticket) throw new VisitError(422, "NOT_SCHEDULABLE");
  const [type] = await tx.select().from(ticketTypes).where(and(eq(ticketTypes.id, ticket.ticketTypeId), eq(ticketTypes.companyId, companyId)));
  const statuses = type ? await tx.select().from(ticketTypeStatuses).where(eq(ticketTypeStatuses.ticketTypeId, type.id)) : [];
  const current = statuses.find(s => s.id === ticket.currentStatusId);
  if (!current || current.isFinal === "true" || !findSeededStatus(statuses, "scheduled")) throw new VisitError(422, "NOT_SCHEDULABLE");
  return ticket;
}
export async function appendVisitOrder(tx: VisitTransaction, companyId: string, crewId: string, date: string): Promise<number> {
  const [row] = await tx.select({ n: sql<number>`coalesce(max(${visits.routeOrder}), 0)::int` }).from(visits)
    .where(and(eq(visits.companyId, companyId), eq(visits.crewId, crewId), eq(visits.visitDate, date)));
  return row.n + 1;
}

/** Earliest upcoming day, otherwise latest past day; stable ties by route/time/id. */
export function winningVisit(rows: Visit[], today = companyToday()): Visit | undefined {
  const upcoming = rows.filter(v => v.visitDate >= today);
  const candidates = upcoming.length ? upcoming : rows;
  return [...candidates].sort((a, b) => {
    const day = a.visitDate.localeCompare(b.visitDate);
    return (upcoming.length ? day : -day)
      || (a.routeOrder ?? Infinity) - (b.routeOrder ?? Infinity)
      || (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")
      || a.id.localeCompare(b.id);
  })[0];
}

/** Also used before PATCH's existing workflow, so history is written exactly once there. */
export async function visitMirrorUpdates(tx: VisitTransaction, ticket: Ticket, companyId: string) {
  const rows = await tx.select().from(visits).where(and(eq(visits.companyId, companyId), eq(visits.ticketId, ticket.id), inArray(visits.status, [...openVisitStatuses])));
  const winner = winningVisit(rows);
  let crewId = winner?.crewId ?? null;
  if (crewId) {
    const [crew] = await tx.select({ id: crews.id }).from(crews).where(and(eq(crews.id, crewId), eq(crews.companyId, companyId)));
    if (!crew) crewId = null;
  }
  return winner ? { crewId, dueDate: companyNoon(winner.visitDate), routeOrder: winner.routeOrder }
    : { crewId: null, routeOrder: null };
}

export async function syncTicketFromVisits(ticketId: string, companyId: string, actingUserId: string, tx: VisitTransaction) {
  const [existing] = await lockVisitTickets(tx, companyId, [ticketId]);
  if (!existing) return { statusChanged: false, newStatusKey: null };
  const [type] = await tx.select().from(ticketTypes).where(and(eq(ticketTypes.id, existing.ticketTypeId), eq(ticketTypes.companyId, companyId)));
  if (!type) return { statusChanged: false, newStatusKey: null };
  const statuses = await tx.select().from(ticketTypeStatuses).where(eq(ticketTypeStatuses.ticketTypeId, type.id));
  const updates: Record<string, unknown> = await visitMirrorUpdates(tx, existing, companyId);
  applySchedulingTransition(updates, existing, statuses);
  maintainScheduleBy(updates, existing, statuses);
  const statusChanged = typeof updates.currentStatusId === "string" && updates.currentStatusId !== existing.currentStatusId;
  const note = updates.statusChangeNotes;
  delete updates.statusChangeNotes;
  const changed = Object.entries(updates).some(([key, value]) => {
    const before = existing[key as keyof Ticket];
    return value instanceof Date ? !(before instanceof Date) || value.getTime() !== before.getTime() : value !== before;
  });
  if (changed) {
    await tx.update(tickets).set({ ...updates, updatedAt: new Date() }).where(and(eq(tickets.id, ticketId), eq(tickets.companyId, companyId)));
    if (statusChanged) await tx.insert(ticketStatusHistory).values({
      ticketId, fromStatusId: existing.currentStatusId, toStatusId: updates.currentStatusId as string,
      changedById: actingUserId, notes: note as string,
    });
  }
  return { statusChanged, newStatusKey: statuses.find(s => s.id === (updates.currentStatusId ?? existing.currentStatusId))?.statusKey ?? null };
}
