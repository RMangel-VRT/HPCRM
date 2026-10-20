import { and, asc, eq, isNotNull, sql, inArray } from "drizzle-orm";
import { companies, tickets, ticketTypes, ticketTypeStatuses, visits, crews, customers } from "@workspace/db";
import { db } from "../db";
import { companyDateString } from "./companyDay";
import { lockVisitCompany, lockVisitTickets } from "./visitSync";
import { logger } from "./logger";

/** Guarded DML only. Company gate and ticket locks are identical to API writes. */
export async function backfillVisitsFromTickets(companyId?: string) {
  const guard = await db.execute(sql`SELECT to_regclass('public.visits') AS table_name`);
  if (!guard.rows[0]?.table_name) { logger.info("[backfillVisits] skipped: visits table not installed"); return; }
  const companyRows = await db.select({ id: companies.id }).from(companies).where(companyId ? eq(companies.id, companyId) : undefined);
  let total = 0;
  for (const company of companyRows) {
    const created = await db.transaction(async tx => {
      await lockVisitCompany(tx, company.id);
      const candidates = await tx.select({ id: tickets.id }).from(tickets)
        .innerJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, company.id)))
        .innerJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
        .innerJoin(crews, and(eq(crews.id, tickets.crewId), eq(crews.companyId, company.id)))
        .where(and(eq(tickets.companyId, company.id), isNotNull(tickets.crewId), isNotNull(tickets.dueDate), eq(ticketTypeStatuses.isFinal, "false")))
        .orderBy(asc(tickets.id));
      await lockVisitTickets(tx, company.id, candidates.map(c => c.id));
      if (!candidates.length) return 0;
      // Bulk re-read under locks. No per-ticket counterpart or no-visits queries.
      const current = await tx.select({ ticket: tickets, customerId: customers.id }).from(tickets)
        .innerJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, company.id)))
        .innerJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
        .innerJoin(crews, and(eq(crews.id, tickets.crewId), eq(crews.companyId, company.id)))
        .leftJoin(customers, and(eq(customers.id, tickets.customerId), eq(customers.companyId, company.id)))
        .where(and(eq(tickets.companyId, company.id), inArray(tickets.id, candidates.map(c => c.id)),
          isNotNull(tickets.crewId), isNotNull(tickets.dueDate), eq(ticketTypeStatuses.isFinal, "false"),
          sql`NOT EXISTS (SELECT 1 FROM visits v WHERE v.company_id = ${company.id} AND v.ticket_id = ${tickets.id})`));
      if (!current.length) return 0;
      const inserted = await tx.insert(visits).values(current.map(({ ticket, customerId }) => ({
        companyId: company.id, crewId: ticket.crewId, ticketId: ticket.id, customerId,
        visitDate: companyDateString(ticket.dueDate!), routeOrder: ticket.routeOrder, sourceType: "ticket" as const, status: "planned" as const,
        serviceKey: ticket.serviceType,
      }))).returning({ id: visits.id });
      return inserted.length;
    });
    total += created;
    logger.info(`[backfillVisits] company=${company.id} created=${created}`);
  }
  return total;
}
