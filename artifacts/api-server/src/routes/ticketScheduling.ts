import { createHmac } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { crews, customers, tickets, visits, type Ticket } from "@workspace/db";
import { SkipTicketSchedulingResponse, TicketNextStopResponse, UpdateVisitResponse } from "@workspace/api-zod";
import type { UserWithContext } from "../auth";
import { db, inTransaction, type AppTransaction } from "../db";
import { storage } from "../storage";
import { companyToday } from "../lib/companyDay";
import { VisitError, lockVisitCompany, lockVisitTickets, openVisitStatuses } from "../lib/visitLocks";
import { syncTicketFromVisits, validateVisitTicket } from "../lib/visitSync";
import { applyTicketStatus } from "../lib/ticketStatusChange";
import { isSchedulingGateType, schedulingSkipTarget } from "../lib/schedulingTransition";

const skipReason = z.string().trim().min(3).max(500).refine(value => !/^(other|otro)$/i.test(value));
const staleStop = () => new VisitError(409, "STALE_NEXT_STOP", "That stop is no longer on the schedule");

async function selectNextStop(tx: Pick<AppTransaction, "select">, ticket: Ticket) {
  if (!ticket.customerId) return undefined;
  const [next] = await tx.select({
    id: visits.id, date: visits.visitDate, routeOrder: visits.routeOrder,
    crew: { id: crews.id, name: crews.name }, propertyName: customers.name, propertyId: customers.id,
  }).from(visits)
    .innerJoin(customers, and(eq(customers.id, visits.customerId), eq(customers.companyId, ticket.companyId)))
    .innerJoin(crews, and(eq(crews.id, visits.crewId), eq(crews.companyId, ticket.companyId), eq(crews.isActive, true)))
    .where(and(eq(visits.companyId, ticket.companyId), eq(visits.customerId, ticket.customerId),
      sql`${visits.ticketId} IS DISTINCT FROM ${ticket.id}`, gte(visits.visitDate, companyToday()),
      inArray(visits.status, [...openVisitStatuses])))
    .orderBy(asc(visits.visitDate), asc(visits.routeOrder), asc(crews.displayOrder), asc(visits.id)).limit(1);
  return next;
}

function snapshot(ticket: Ticket, stop: NonNullable<Awaited<ReturnType<typeof selectNextStop>>>) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Session signing is not configured");
  return `"${createHmac("sha256", secret).update(JSON.stringify([
    "next-ticket-stop", ticket.companyId, ticket.id, stop.propertyId, stop.id, stop.crew.id, stop.date, stop.routeOrder,
  ])).digest("base64url")}"`;
}

async function placeAfterNextStop(ticketId: string, user: UserWithContext, offered: string | undefined) {
  if (!offered) throw staleStop();
  return db.transaction(async tx => {
    const companyId = user.activeCompanyId;
    await lockVisitCompany(tx, companyId);
    const [initial] = await tx.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.companyId, companyId)));
    if (!initial) throw new VisitError(404, "NOT_FOUND", "Ticket not found");
    const next = await selectNextStop(tx, initial);
    if (!next || snapshot(initial, next) !== offered) throw staleStop();
    const open = await tx.select({ id: visits.id, ticketId: visits.ticketId, routeOrder: visits.routeOrder }).from(visits)
      .where(and(eq(visits.companyId, companyId), eq(visits.crewId, next.crew.id), eq(visits.visitDate, next.date),
        inArray(visits.status, [...openVisitStatuses])))
      .orderBy(asc(visits.routeOrder), asc(visits.startTime), asc(visits.id));
    const index = open.findIndex(row => row.id === next.id);
    if (index < 0) throw staleStop();
    const locked = await lockVisitTickets(tx, companyId, [ticketId, ...open.flatMap(row => row.ticketId ? [row.ticketId] : [])]);
    const ticket = await validateVisitTicket(tx, companyId, locked.find(row => row.id === ticketId));
    // Recheck property, activity, and ordering after the ticket locks as well.
    const confirmed = await selectNextStop(tx, ticket);
    if (!confirmed || snapshot(ticket, confirmed) !== offered) throw staleStop();

    const order = open.flatMap((row, i) => {
      const n = i < index + 1 ? i + 1 : i + 2;
      return row.routeOrder === n ? [] : [{ ...row, n }];
    });
    if (order.length) await tx.update(visits).set({
      routeOrder: sql`CASE ${visits.id} ${sql.join(order.map(row => sql`WHEN ${row.id} THEN ${row.n}::integer`), sql` `)} END`,
      updatedAt: new Date(),
    }).where(and(eq(visits.companyId, companyId), inArray(visits.id, order.map(row => row.id))));
    const [visit] = await tx.insert(visits).values({
      companyId, ticketId, customerId: confirmed.propertyId, crewId: confirmed.crew.id, visitDate: confirmed.date,
      routeOrder: index + 2, status: "planned", sourceType: "ticket", serviceKey: ticket.serviceType, createdById: user.id,
    }).returning();
    const ticketSync = await syncTicketFromVisits(ticketId, companyId, user.id, tx, true);
    for (const id of new Set(order.flatMap(row => row.ticketId && row.ticketId !== ticketId ? [row.ticketId] : []))) {
      await syncTicketFromVisits(id, companyId, user.id, tx);
    }
    return UpdateVisitResponse.parse({ ...visit, ticketSync });
  });
}

export function registerTicketSchedulingRoutes(
  app: Express, authorizeVisits: (req: Request, res: Response) => UserWithContext | undefined,
  fail: (res: Response, err: unknown) => void,
) {
  app.get("/api/tickets/:id/next-stop", async (req, res) => {
    const user = authorizeVisits(req, res); if (!user) return;
    try {
      const [row] = await db.select().from(tickets).where(and(eq(tickets.id, req.params.id), eq(tickets.companyId, user.activeCompanyId)));
      if (!row) throw new VisitError(404, "NOT_FOUND", "Ticket not found");
      const ticket = await validateVisitTicket(db, user.activeCompanyId, row);
      const stop = await selectNextStop(db, ticket);
      res.set("Cache-Control", "no-store");
      if (!stop) { res.json(null); return; }
      res.set("X-Next-Stop-Snapshot", snapshot(ticket, stop));
      const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
        .format(new Date(`${stop.date}T12:00:00Z`)).replace(",", "");
      res.json(TicketNextStopResponse.parse({ date: stop.date, crew: stop.crew, routeOrder: stop.routeOrder, label: `${date} · ${stop.crew.name}` }));
    } catch (error) { fail(res, error); }
  });
  app.post("/api/tickets/:id/schedule-next-stop", async (req, res) => {
    const user = authorizeVisits(req, res); if (!user) return;
    try {
      const result = await placeAfterNextStop(req.params.id, user, req.get("If-Match"));
      res.status(201).json(result);
    } catch (error) { fail(res, error); }
  });
  app.post("/api/tickets/:id/skip-scheduling", async (req, res) => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    try {
      const reason = skipReason.safeParse(req.body?.reason);
      if (!reason.success) throw new VisitError(400, "INVALID_REASON", "Enter a scheduling skip reason of 3–500 characters.");
      const result = await db.transaction(async tx => {
        await lockVisitCompany(tx, user.activeCompanyId);
        const [ticket] = await lockVisitTickets(tx, user.activeCompanyId, [req.params.id]);
        if (!ticket) throw new VisitError(404, "NOT_FOUND", "Ticket not found");
        if (ticket.assignedToId !== user.id && !["admin", "office", "field_manager"].includes(user.accessRole))
          throw new VisitError(403, "ACCESS_DENIED", "Access denied");
        return inTransaction(tx, async () => {
          const type = await storage.getTicketTypeById(ticket.ticketTypeId, ticket.companyId);
          const statuses = await storage.getTicketTypeStatuses(ticket.ticketTypeId);
          const target = isSchedulingGateType(type) ? schedulingSkipTarget(statuses) : undefined;
          if (!target) throw new VisitError(409, "NOT_SKIPPABLE", "This workflow does not support skipping scheduling.");
          const updated = await applyTicketStatus(db as unknown as AppTransaction, {
            ticket, userId: user.id, skipScheduling: true, note: `Scheduling skipped: ${reason.data}`,
            updates: { currentStatusId: target.id, scheduleBy: null, crewId: null, routeOrder: null },
          });
          return SkipTicketSchedulingResponse.parse({ currentStatusId: updated.currentStatusId });
        });
      });
      res.json(result);
    } catch (error) { fail(res, error); }
  });
}
