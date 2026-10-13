import { and, eq } from "drizzle-orm";
import { visits, customers, type Ticket, type TicketTypeStatus } from "@workspace/db";
import { findSeededStatus } from "../shared/ticketCapabilities";
import { companyDateString } from "./companyDay";
import {
  VisitError, type VisitTransaction, openVisitStatuses, schedulableTicket,
  validateVisitCrew, appendVisitOrder, visitMirrorUpdates,
} from "./visitSync";

/** Caller holds company gate + ticket lock before any workflow side effect.
 * Feed mirror into the existing PATCH transition/history, never infer a second status. */
export async function applyVisitTicketEdit(
  tx: VisitTransaction, body: Record<string, unknown>, ticket: Ticket,
  statuses: TicketTypeStatus[], companyId: string, userId: string,
) {
  if (!findSeededStatus(statuses, "scheduled")) return;
  const scheduling = Object.hasOwn(body, "crewId") || Object.hasOwn(body, "dueDate");
  if (!scheduling && !Object.hasOwn(body, "routeOrder")) return;
  const allVisits = await tx.select().from(visits).where(and(eq(visits.companyId, companyId), eq(visits.ticketId, ticket.id)));
  const rows = allVisits.filter(visit => openVisitStatuses.includes(visit.status as "planned" | "in_progress"));
  if (!scheduling) {
    if (allVisits.length) throw new VisitError(409, "VISIT_ROUTE_ORDER", "Change route order on the schedule.");
    return;
  }
  if (rows.length > 1) throw new VisitError(409, "MULTIPLE_VISITS", "This job has several visits. Change them on the schedule.");
  const crewId = Object.hasOwn(body, "crewId") ? body.crewId : ticket.crewId;
  const dueDate = Object.hasOwn(body, "dueDate") ? body.dueDate : ticket.dueDate;
  if (!crewId || !dueDate) {
    if (rows[0]?.status === "in_progress") throw new VisitError(409, "VISIT_IN_PROGRESS");
    if (rows[0]) {
      await tx.delete(visits).where(and(eq(visits.id, rows[0].id), eq(visits.companyId, companyId)));
    }
    if (allVisits.length) {
      Object.assign(body, await visitMirrorUpdates(tx, ticket, companyId));
      // No winner never writes dueDate: an explicit null survives.
    }
    return;
  }
  const dateInstant = dueDate instanceof Date ? dueDate : new Date(dueDate as string);
  if (!Number.isFinite(dateInstant.getTime())) throw new VisitError(400, "INVALID_DATE");
  const visitDate = companyDateString(dateInstant);
  await validateVisitCrew(tx, companyId, crewId as string);
  if (!rows.length) await schedulableTicket(tx, companyId, ticket.id);
  const changedDay = !rows[0] || rows[0].crewId !== crewId || rows[0].visitDate !== visitDate;
  const routeOrder = Object.hasOwn(body, "routeOrder") ? body.routeOrder as number | null
    : changedDay ? await appendVisitOrder(tx, companyId, crewId as string, visitDate) : rows[0].routeOrder;
  if (rows[0]) await tx.update(visits).set({ crewId: crewId as string, visitDate, routeOrder, updatedAt: new Date() })
    .where(and(eq(visits.id, rows[0].id), eq(visits.companyId, companyId)));
  else {
    const [customer] = ticket.customerId ? await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, ticket.customerId), eq(customers.companyId, companyId))) : [];
    await tx.insert(visits).values({
      companyId, crewId: crewId as string, visitDate, routeOrder, ticketId: ticket.id,
      customerId: customer?.id ?? null, createdById: userId, sourceType: "ticket", status: "planned",
    });
  }
  Object.assign(body, await visitMirrorUpdates(tx, ticket, companyId));
}
