import type { Ticket, TicketTypeStatus } from "@workspace/db";
import { findSeededStatus, isSeededStatus } from "../shared/ticketCapabilities";

/** Explicit status intent and follow-up-only edits always win. */
export function applySchedulingTransition(
  updates: Record<string, unknown>,
  existing: Pick<Ticket, "currentStatusId" | "crewId" | "dueDate">,
  statuses: readonly TicketTypeStatus[],
): void {
  if (Object.hasOwn(updates, "currentStatusId")
    || (Object.hasOwn(updates, "followUpDate") && !Object.hasOwn(updates, "crewId") && !Object.hasOwn(updates, "dueDate"))) return;
  const current = statuses.find(s => s.id === existing.currentStatusId);
  const scheduled = findSeededStatus(statuses, "scheduled");
  const ready = findSeededStatus(statuses, "ready_to_schedule");
  const crew = Object.hasOwn(updates, "crewId") ? updates.crewId : existing.crewId;
  const date = Object.hasOwn(updates, "dueDate") ? updates.dueDate : existing.dueDate;
  if (!scheduled || !ready) return;
  if (isSeededStatus(current, "ready_to_schedule") && crew != null && date != null) {
    updates.currentStatusId = scheduled.id;
    updates.statusChangeNotes = "Crew and date set";
  } else if (isSeededStatus(current, "scheduled") && (crew == null || date == null)) {
    updates.currentStatusId = ready.id;
    updates.statusChangeNotes = "Crew or date cleared";
  }
}
