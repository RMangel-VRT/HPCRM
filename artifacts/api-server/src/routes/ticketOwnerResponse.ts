import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { tickets, ticketTypes, ticketTypeStatuses, ticketStatusHistory, ticketComments } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { computeScheduleBy } from "../lib/scheduleBy";
import { notifyTicketAssignment, pushReturnedTicket } from "../lib/ticketAssignmentNotification";
import { findSeededStatus, isSeededStatus, isSeededTicketType } from "../shared/ticketCapabilities";

const noteSchema = z.object({ note: z.string().trim().min(1).max(1000) });
class ResponseError extends Error {
  constructor(public status: number, public body: string | { error: string; message?: string }) {
    super(typeof body === "string" ? body : body.error);
  }
}

export function registerTicketOwnerResponseRoutes(app: Express): void {
  for (const action of ["accept", "send-back"] as const) {
    app.post(`/api/tickets/:id/${action}`, async (req, res): Promise<void> => {
      if (!req.isAuthenticated()) {
        res.status(401).send("Not authenticated");
        return;
      }
      const user = req.user as UserWithContext;
      try {
        const result = await db.transaction(async tx => {
          // Lock and recheck eligibility/assignment inside the write transaction:
          // concurrent Accept requests cannot both write audit/history.
          const [ticket] = await tx.select().from(tickets)
            .where(and(eq(tickets.id, req.params.id as string), eq(tickets.companyId, user.activeCompanyId)))
            .for("update");
          if (!ticket) throw new ResponseError(404, "Ticket not found");
          if (ticket.assignedToId !== user.id && user.activeRole !== "admin" && user.activeRole !== "office") {
            throw new ResponseError(403, "Access denied - not assigned to this ticket");
          }
          const [type] = await tx.select().from(ticketTypes)
            .where(and(eq(ticketTypes.id, ticket.ticketTypeId), eq(ticketTypes.companyId, user.activeCompanyId)));
          const statuses = await tx.select().from(ticketTypeStatuses)
            .where(eq(ticketTypeStatuses.ticketTypeId, ticket.ticketTypeId));
          const current = statuses.find(s => s.id === ticket.currentStatusId);
          if (action === "accept") {
            const target = findSeededStatus(statuses, ticket.crewId && ticket.dueDate ? "scheduled" : "ready_to_schedule");
            if ((!isSeededTicketType(type, "task") && !isSeededTicketType(type, "project"))
              || !isSeededStatus(current, "new") || !target
              || target.displayOrder <= current!.displayOrder) {
              throw new ResponseError(409, {
                error: "NOT_ACCEPTABLE", message: "Only new Tasks and Projects can be accepted.",
              });
            }
            const [updated] = await tx.update(tickets).set({
              currentStatusId: target.id, acceptedAt: new Date(), acceptedById: user.id,
              scheduleBy: ticket.scheduleBy ?? computeScheduleBy(ticket.priority, ticket.createdAt),
              // Match PATCH's approved-path correction for directly-created Projects.
              ...(isSeededTicketType(type, "project") && ticket.workType !== "estimate_request"
                ? { billingBehavior: "invoice_required" as const } : {}),
              updatedAt: new Date(),
            }).where(and(eq(tickets.id, ticket.id), eq(tickets.companyId, user.activeCompanyId))).returning();
            await tx.insert(ticketStatusHistory).values({
              ticketId: ticket.id, fromStatusId: ticket.currentStatusId,
              toStatusId: target.id, changedById: user.id, notes: "Accepted",
            });
            return { previous: ticket, updated };
          }
          if (!isSeededStatus(current, "new")) {
            throw new ResponseError(409, { error: "NOT_ACCEPTABLE", message: "Only new tickets can be sent back." });
          }
          const parsed = noteSchema.safeParse(req.body);
          if (!parsed.success) throw new ResponseError(400, { error: "INVALID_NOTE", message: "Note must be 1–1000 characters." });
          if (!ticket.createdById) throw new ResponseError(422, { error: "NO_CREATOR" });
          const [updated] = await tx.update(tickets).set({
            assignedToId: ticket.createdById, updatedAt: new Date(),
          }).where(and(eq(tickets.id, ticket.id), eq(tickets.companyId, user.activeCompanyId))).returning();
          await tx.insert(ticketComments).values({
            ticketId: ticket.id, authorId: user.id, body: `Sent back: ${parsed.data.note}`,
          });
          return { previous: ticket, updated };
        });
        if (action === "send-back" && result.updated.assignedToId
          && result.updated.assignedToId !== result.previous.assignedToId) {
          await notifyTicketAssignment(result.previous, result.updated.assignedToId, user);
          pushReturnedTicket(result.updated, user);
        }
        res.json(result.updated);
      } catch (err) {
        if (err instanceof ResponseError) {
          if (typeof err.body === "string") res.status(err.status).send(err.body);
          else res.status(err.status).json(err.body);
        } else {
          console.error(`Ticket ${action} failed:`, err);
          res.status(500).json({ error: "OWNER_RESPONSE_FAILED" });
        }
      }
    });
  }
}
