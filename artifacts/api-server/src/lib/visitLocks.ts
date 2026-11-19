import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { tickets, visits } from "@workspace/db";
import type { AppTransaction } from "../db";

export class VisitError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message); }
}
export const openVisitStatuses = ["planned", "in_progress"] as const;

/** The company gate must precede sorted ticket locks for all scheduling writes. */
export async function lockVisitCompany(tx: AppTransaction, companyId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('visits'), hashtext(${companyId}))`);
}

export async function lockVisitTickets(tx: AppTransaction, companyId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids)].sort();
  if (!uniqueIds.length) return [];
  return tx.select().from(tickets).where(and(eq(tickets.companyId, companyId), inArray(tickets.id, uniqueIds)))
    .orderBy(asc(tickets.id)).for("update");
}

export function openTicketVisitPredicate(companyId: string | typeof tickets.companyId, ticketId: string | typeof tickets.id) {
  return and(eq(visits.companyId, companyId), eq(visits.ticketId, ticketId), inArray(visits.status, [...openVisitStatuses]));
}

export async function hasOpenTicketVisit(tx: Pick<AppTransaction, "select">, companyId: string, ticketId: string) {
  const [open] = await tx.select({ id: visits.id }).from(visits).where(openTicketVisitPredicate(companyId, ticketId)).limit(1);
  return !!open;
}
