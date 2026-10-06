import type { Ticket } from "@workspace/db";
import { computeScheduleBy } from "./scheduleBy";
import { isSeededStatus, type TicketStatusIdentity } from "../shared/ticketCapabilities";

/** Mutates only inferred date fields; explicit authorized null is also intent. */
export function maintainScheduleBy(
  body: Record<string, unknown>,
  ticket: Pick<Ticket, "priority" | "scheduleBy" | "acceptedAt" | "createdAt" | "currentStatusId">,
  statuses: readonly (TicketStatusIdentity & { id: string })[],
  now = new Date(),
): void {
  if (Object.hasOwn(body, "scheduleBy")) return;
  const current = statuses.find(s => s.id === ticket.currentStatusId);
  const target = statuses.find(s => s.id === (body.currentStatusId ?? ticket.currentStatusId));
  if (Object.hasOwn(body, "priority") && body.priority !== ticket.priority
    && (isSeededStatus(current, "new") || isSeededStatus(current, "ready_to_schedule"))) {
    body.scheduleBy = computeScheduleBy(body.priority as string, new Date(ticket.acceptedAt ?? ticket.createdAt));
  } else if (target?.id !== current?.id && isSeededStatus(target, "ready_to_schedule") && ticket.scheduleBy == null) {
    // Server-local Colorado calendar day, matching the crew app's "today".
    body.scheduleBy = computeScheduleBy((body.priority ?? ticket.priority) as string, now);
  }
}
