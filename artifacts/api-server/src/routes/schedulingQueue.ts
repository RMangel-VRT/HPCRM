import type { Express, Request, Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { tickets, ticketTypes, ticketTypeStatuses, customers, visits, crews } from "@workspace/db";
import { SchedulingQueueResponse } from "@workspace/api-zod";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { companyToday } from "../lib/companyDay";
import { displayTypeMetadata } from "../shared/ticketCapabilities";

export function registerSchedulingQueue(app: Express,
  authorize: (req: Request, res: Response) => UserWithContext | undefined,
  failure: (res: Response, error: unknown) => void) {
  app.get("/api/scheduling/queue", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      res.json(SchedulingQueueResponse.parse(await loadSchedulingQueue(user.activeCompanyId)));
    } catch (error) { failure(res, error); }
  });
}

/** Shared, uncapped destination population; one winning visit per scheduled ticket. */
export async function loadSchedulingQueue(companyId: string, now = new Date()) {
      const today = companyToday(now);
      const fields = {
        id: tickets.id, title: tickets.title, typeKey: ticketTypes.typeKey, typeName: ticketTypes.name,
        statusKey: ticketTypeStatuses.statusKey,
        priority: tickets.priority, scheduleBy: tickets.scheduleBy, serviceType: tickets.serviceType,
        followUpDate: tickets.followUpDate, createdAt: tickets.createdAt,
        customer: { id: customers.id, name: customers.name, city: customers.city },
      };
      // Stable identities only: a renamed workflow remains supported; deadline-only
      // To-Do/Invoice rows cannot enter even if legacy data contains an alien status.
      const scope = and(eq(tickets.companyId, companyId), eq(ticketTypeStatuses.isFinal, "false"),
        sql`(${ticketTypes.typeKey} IS NULL OR ${ticketTypes.typeKey} NOT IN ('todo', 'invoice'))`,
        sql`EXISTS (SELECT 1 FROM ticket_type_statuses capability
          WHERE capability.ticket_type_id = ${ticketTypes.id} AND capability.status_key = 'scheduled')`);
      const needsScheduling = await db.select(fields).from(tickets)
        .innerJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, companyId)))
        .innerJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
        .leftJoin(customers, and(eq(customers.id, tickets.customerId), eq(customers.companyId, companyId)))
        .where(and(scope, eq(ticketTypeStatuses.statusKey, "ready_to_schedule")))
        .orderBy(sql`${tickets.scheduleBy} ASC NULLS LAST`,
          sql`CASE ${tickets.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`,
          asc(tickets.createdAt), asc(tickets.id));
      // Same winner as visitSync: earliest upcoming, otherwise latest past,
      // then route/time/id. A future or in-progress winner prevents a slip.
      const slipped = await db.select({
        ...fields, visit: { id: visits.id, visitDate: visits.visitDate, crewId: crews.id, crewName: crews.name },
      }).from(tickets)
        .innerJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, companyId)))
        .innerJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
        .innerJoin(visits, and(eq(visits.companyId, companyId), eq(visits.ticketId, tickets.id),
          sql`${visits.id} = (SELECT winner.id FROM visits winner
            WHERE winner.company_id = ${companyId} AND winner.ticket_id = ${tickets.id}
              AND winner.status IN ('planned', 'in_progress')
            ORDER BY CASE WHEN winner.visit_date >= ${today}::date THEN 0 ELSE 1 END,
              CASE WHEN winner.visit_date >= ${today}::date THEN winner.visit_date END ASC,
              CASE WHEN winner.visit_date < ${today}::date THEN winner.visit_date END DESC,
              winner.route_order ASC NULLS LAST, winner.start_time ASC NULLS LAST, winner.id ASC LIMIT 1)`))
        .leftJoin(customers, and(eq(customers.id, tickets.customerId), eq(customers.companyId, companyId)))
        .leftJoin(crews, and(eq(crews.id, visits.crewId), eq(crews.companyId, companyId)))
        .where(and(scope, eq(ticketTypeStatuses.statusKey, "scheduled"), eq(visits.status, "planned"), sql`${visits.visitDate} < ${today}::date`))
        .orderBy(asc(visits.visitDate), asc(tickets.id));
       const enrich = <T extends { typeKey: string | null; typeName: string; statusKey: string | null }>(row: T) => ({
         ...row, ...displayTypeMetadata(row.typeKey, row.statusKey, row.typeName),
       });
       return { needsScheduling: needsScheduling.map(enrich), slipped: slipped.map(enrich) };
}
