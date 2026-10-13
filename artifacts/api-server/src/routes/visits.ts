import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import { and, asc, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { visits, visitFields, tickets, ticketTypes, ticketTypeStatuses, crews, customers } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { pickProvided } from "../lib/patchBody";
import { addCalendarDays } from "../lib/companyDay";
import {
  VisitError, lockVisitCompany, lockVisitTickets, validateVisitCrew, schedulableTicket,
  appendVisitOrder, syncTicketFromVisits, openVisitStatuses, type VisitTransaction,
} from "../lib/visitSync";
import { logger } from "../lib/logger";
import { CreateVisitBody, UpdateVisitBody, ReorderVisitsBody, ListVisitsResponse, VisitSummaryResponse, UpdateVisitResponse } from "@workspace/api-zod";

export const visitCreateBody = z.object({
  ticketId: z.string().min(1).optional(), crewId: z.string().min(1), visitDate: visitFields.visitDate,
  routeOrder: visitFields.routeOrder, startTime: visitFields.startTime,
  estimatedHours: visitFields.estimatedHours, notes: visitFields.notes, title: visitFields.title,
}).refine(v => v.ticketId || v.title, "Ticket or internal title required");
export const visitUpdateBody = z.object({
  crewId: z.string().min(1).optional(), visitDate: visitFields.visitDate.optional(),
  routeOrder: visitFields.routeOrder, startTime: visitFields.startTime,
  estimatedHours: visitFields.estimatedHours, notes: visitFields.notes, status: visitFields.status.optional(),
});
const rangeBody = z.object({ from: visitFields.visitDate, to: visitFields.visitDate }).refine(
  v => visitFields.visitDate.safeParse(v.from).success && v.from <= v.to && v.to <= addCalendarDays(v.from, 62), "Ordered range must be at most 62 days apart",
);
const reorderBody = z.object({ crewId: z.string().min(1), visitDate: visitFields.visitDate, visitIds: z.array(z.string().min(1)) });

function authorize(req: Request, res: Response): UserWithContext | undefined {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const user = req.user as UserWithContext;
  if (!["admin", "office", "field_manager"].includes(user.activeRole)) { res.status(403).json({ error: "Insufficient permissions" }); return; }
  return user;
}
function failure(res: Response, error: unknown) {
  if (error instanceof VisitError) res.status(error.status).json({ error: error.code, message: error.message });
  else if (error instanceof z.ZodError) res.status(400).json({ error: "INVALID_VISIT", message: error.message });
  else { logger.error({ err: error }, "Visit operation failed"); res.status(500).json({ error: "Visit operation failed" }); }
}
async function write<T>(companyId: string, fn: (tx: VisitTransaction) => Promise<T>) {
  return db.transaction(async tx => { await lockVisitCompany(tx, companyId); return fn(tx); });
}

export function registerVisitRoutes(app: Express) {
  app.get("/api/visits", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const range = rangeBody.parse(req.query);
      const filters = z.object({ crewId: z.string().min(1).optional(), customerId: z.string().min(1).optional(), ticketId: z.string().min(1).optional() }).parse(req.query);
      const companyId = user.activeCompanyId;
      // Scoped joins are bulk enrichment in one query; no foreign counterpart can leak.
      const rows = await db.select({
        visit: visits,
        ticket: { id: tickets.id, title: tickets.title, typeKey: ticketTypes.typeKey, typeName: ticketTypes.name,
          statusKey: ticketTypeStatuses.statusKey, statusName: ticketTypeStatuses.name, priority: tickets.priority, scheduleBy: tickets.scheduleBy },
        customer: { id: customers.id, name: customers.name },
        crew: { id: crews.id, name: crews.name, color: crews.color },
      }).from(visits)
        .leftJoin(tickets, and(eq(tickets.id, visits.ticketId), eq(tickets.companyId, companyId)))
        .leftJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, companyId)))
        .leftJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
        .leftJoin(customers, and(eq(customers.id, visits.customerId), eq(customers.companyId, companyId)))
        .leftJoin(crews, and(eq(crews.id, visits.crewId), eq(crews.companyId, companyId)))
        .where(and(eq(visits.companyId, companyId), gte(visits.visitDate, range.from), lte(visits.visitDate, range.to),
          filters.crewId ? eq(visits.crewId, filters.crewId) : undefined,
          filters.customerId ? eq(visits.customerId, filters.customerId) : undefined,
          filters.ticketId ? eq(visits.ticketId, filters.ticketId) : undefined))
        .orderBy(asc(visits.visitDate), sql`${crews.displayOrder} NULLS LAST`,
          sql`${visits.routeOrder} NULLS LAST`, sql`${visits.startTime} NULLS LAST`, asc(visits.id));
      res.json(ListVisitsResponse.parse(rows.map(row => ({ ...row.visit, ticket: row.ticket?.id ? row.ticket : null,
        customer: row.customer?.id ? row.customer : null, crew: row.crew?.id ? row.crew : null }))));
    } catch (error) { failure(res, error); }
  });
  app.get("/api/visits/summary", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const range = rangeBody.parse(req.query);
      const rows = await db.select({
        crewId: crews.id, date: visits.visitDate,
        visitCount: sql<number>`count(*)::int`,
        plannedHours: sql<number>`coalesce(sum(${visits.estimatedHours}), 0)::real`,
        capacityHours: sql<number>`coalesce(${crews.defaultHoursPerDay}, 8)::real`,
      }).from(visits).leftJoin(crews, and(eq(crews.id, visits.crewId), eq(crews.companyId, user.activeCompanyId)))
        .where(and(eq(visits.companyId, user.activeCompanyId), gte(visits.visitDate, range.from), lte(visits.visitDate, range.to), inArray(visits.status, [...openVisitStatuses])))
        .groupBy(crews.id, visits.visitDate, crews.defaultHoursPerDay).orderBy(asc(visits.visitDate), asc(crews.id));
      res.json(VisitSummaryResponse.parse(rows));
    } catch (error) { failure(res, error); }
  });
  app.post("/api/visits", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const contract = CreateVisitBody.safeParse(req.body);
      if (!contract.success) throw new VisitError(400, "INVALID_VISIT", contract.error.message);
      const body = visitCreateBody.parse(contract.data);
      const result = await write(user.activeCompanyId, async tx => {
        const ticket = body.ticketId ? await schedulableTicket(tx, user.activeCompanyId, body.ticketId) : undefined;
        await validateVisitCrew(tx, user.activeCompanyId, body.crewId);
        // Do not copy foreign customer identity even from a corrupt legacy ticket.
        const [customer] = ticket?.customerId ? await tx.select({ id: customers.id }).from(customers)
          .where(and(eq(customers.id, ticket.customerId), eq(customers.companyId, user.activeCompanyId))) : [];
        const [visit] = await tx.insert(visits).values({
          ...body, companyId: user.activeCompanyId, sourceType: ticket ? "ticket" : "internal",
          customerId: customer?.id ?? null, createdById: user.id, status: "planned",
          routeOrder: Object.hasOwn(body, "routeOrder") ? body.routeOrder : await appendVisitOrder(tx, user.activeCompanyId, body.crewId, body.visitDate),
        }).returning();
        const ticketSync = ticket ? await syncTicketFromVisits(ticket.id, user.activeCompanyId, user.id, tx) : { statusChanged: false, newStatusKey: null };
        return UpdateVisitResponse.parse({ ...visit, ticketSync });
      });
      res.status(201).json(result);
    } catch (error) { failure(res, error); }
  });
  app.post("/api/visits/reorder", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const contract = ReorderVisitsBody.safeParse(req.body);
      if (!contract.success) throw new VisitError(400, "INVALID_VISIT", contract.error.message);
      const body = reorderBody.parse(contract.data);
      const result = await write(user.activeCompanyId, async tx => {
        await validateVisitCrew(tx, user.activeCompanyId, body.crewId);
        const rows = await tx.select({ id: visits.id, ticketId: visits.ticketId }).from(visits).where(and(eq(visits.companyId, user.activeCompanyId), eq(visits.crewId, body.crewId),
          eq(visits.visitDate, body.visitDate), inArray(visits.status, [...openVisitStatuses])));
        if (new Set(body.visitIds).size !== body.visitIds.length || rows.length !== body.visitIds.length || rows.some(v => !body.visitIds.includes(v.id)))
          throw new VisitError(400, "INVALID_VISIT_IDS", "IDs must exactly match the open crew-day visits");
        const ticketIds = [...new Set(rows.flatMap(v => v.ticketId ? [v.ticketId] : []))].sort();
        await lockVisitTickets(tx, user.activeCompanyId, ticketIds);
        if (body.visitIds.length) await tx.update(visits).set({
          routeOrder: sql`CASE ${visits.id} ${sql.join(body.visitIds.map((id, i) => sql`WHEN ${id} THEN ${i + 1}::integer`), sql` `)} END`,
          updatedAt: new Date(),
        }).where(and(eq(visits.companyId, user.activeCompanyId), inArray(visits.id, body.visitIds)));
        for (const id of ticketIds) await syncTicketFromVisits(id, user.activeCompanyId, user.id, tx);
        return { ok: true };
      });
      res.json(result);
    } catch (error) { failure(res, error); }
  });
  app.patch("/api/visits/:id", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const contract = UpdateVisitBody.safeParse(req.body);
      if (!contract.success) throw new VisitError(400, "INVALID_VISIT", contract.error.message);
      const body = pickProvided(visitUpdateBody.parse(contract.data), req.body);
      const id = z.string().parse(req.params.id);
      const result = await write(user.activeCompanyId, async tx => {
        // Discover identity only, then read scheduling values under ticket lock.
        // The company gate prevents the visit identity changing between reads.
        const [identity] = await tx.select({ ticketId: visits.ticketId }).from(visits).where(and(eq(visits.id, id), eq(visits.companyId, user.activeCompanyId)));
        if (!identity) throw new VisitError(404, "NOT_FOUND");
        if (identity.ticketId) await lockVisitTickets(tx, user.activeCompanyId, [identity.ticketId]);
        const [existing] = await tx.select().from(visits).where(and(eq(visits.id, id), eq(visits.companyId, user.activeCompanyId)));
        const moved = (body.crewId !== undefined && body.crewId !== existing.crewId) || (body.visitDate !== undefined && body.visitDate !== existing.visitDate);
        if (["done", "skipped", "cancelled"].includes(existing.status) && moved) throw new VisitError(409, "VISIT_CLOSED");
        if (existing.ticketId && (moved || (body.status !== undefined && openVisitStatuses.includes(body.status as "planned" | "in_progress") && !openVisitStatuses.includes(existing.status as "planned" | "in_progress"))))
          await schedulableTicket(tx, user.activeCompanyId, existing.ticketId);
        if (body.crewId !== undefined) await validateVisitCrew(tx, user.activeCompanyId, body.crewId);
        if (moved && !Object.hasOwn(body, "routeOrder")) {
          const crewId = body.crewId ?? existing.crewId;
          if (!crewId) throw new VisitError(400, "INVALID_CREW");
          await validateVisitCrew(tx, user.activeCompanyId, crewId);
          body.routeOrder = await appendVisitOrder(tx, user.activeCompanyId, crewId, body.visitDate ?? existing.visitDate);
        }
        const [visit] = await tx.update(visits).set({ ...body, updatedAt: new Date() })
          .where(and(eq(visits.id, id), eq(visits.companyId, user.activeCompanyId))).returning();
        const ticketSync = existing.ticketId ? await syncTicketFromVisits(existing.ticketId, user.activeCompanyId, user.id, tx) : { statusChanged: false, newStatusKey: null };
        return UpdateVisitResponse.parse({ ...visit, ticketSync });
      });
      res.json(result);
    } catch (error) { failure(res, error); }
  });
  app.delete("/api/visits/:id", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const id = z.string().parse(req.params.id);
      await write(user.activeCompanyId, async tx => {
        const [identity] = await tx.select({ ticketId: visits.ticketId }).from(visits).where(and(eq(visits.id, id), eq(visits.companyId, user.activeCompanyId)));
        if (!identity) throw new VisitError(404, "NOT_FOUND");
        if (identity.ticketId) await lockVisitTickets(tx, user.activeCompanyId, [identity.ticketId]);
        const [existing] = await tx.select().from(visits).where(and(eq(visits.id, id), eq(visits.companyId, user.activeCompanyId)));
        if (existing.status !== "planned") throw new VisitError(409, "VISIT_CLOSED", "Only planned visits can be deleted; cancel instead");
        await tx.delete(visits).where(and(eq(visits.id, id), eq(visits.companyId, user.activeCompanyId)));
        if (existing.ticketId) await syncTicketFromVisits(existing.ticketId, user.activeCompanyId, user.id, tx);
      });
      res.status(204).end();
    } catch (error) { failure(res, error); }
  });
}
