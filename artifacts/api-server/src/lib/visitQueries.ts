import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { visits, tickets, ticketTypes, ticketTypeStatuses, customers, crews } from "@workspace/db";
import { db } from "../db";

/** One company-scoped bulk enrichment query shared by bounded board and complete history. */
export async function loadEnrichedVisits(companyId: string, filters: (SQL | undefined)[]) {
  const rows = await db.select({
    visit: visits,
    ticket: { id: tickets.id, title: tickets.title, typeKey: ticketTypes.typeKey, typeName: ticketTypes.name,
      statusKey: ticketTypeStatuses.statusKey, statusName: ticketTypeStatuses.name, priority: tickets.priority, scheduleBy: tickets.scheduleBy },
    customer: { id: customers.id, name: customers.name, street: customers.street, city: customers.city, state: customers.state, zip: customers.zip },
    crew: { id: crews.id, name: crews.name, color: crews.color },
  }).from(visits)
    .leftJoin(tickets, and(eq(tickets.id, visits.ticketId), eq(tickets.companyId, companyId)))
    .leftJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, companyId)))
    .leftJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
    .leftJoin(customers, and(eq(customers.id, visits.customerId), eq(customers.companyId, companyId)))
    .leftJoin(crews, and(eq(crews.id, visits.crewId), eq(crews.companyId, companyId)))
    .where(and(eq(visits.companyId, companyId), ...filters))
    .orderBy(asc(visits.visitDate), sql`${crews.displayOrder} NULLS LAST`,
      sql`${visits.routeOrder} NULLS LAST`, sql`${visits.startTime} NULLS LAST`, asc(visits.id));
  return rows.map(row => ({ ...row.visit, ticket: row.ticket?.id ? row.ticket : null,
    customer: row.customer?.id ? row.customer : null, crew: row.crew?.id ? row.crew : null }));
}
