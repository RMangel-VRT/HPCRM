import type { Ticket, TicketType, TicketTypeStatus } from "@workspace/db";
import type { AppTransaction } from "../db";
import { findSeededStatus, isSeededStatus } from "../shared/ticketCapabilities";
import { hasOpenTicketVisit, VisitError } from "./visitLocks";

export const schedulingGateTypes = ["task", "project", "estimate_request"] as const;
export const scheduleRequiredMessage = "Put this job on the schedule first, or skip scheduling with a reason.";
export const alreadyScheduledMessage = "It’s already on the schedule; remove that stop first.";
type Status = Pick<TicketTypeStatus, "id" | "name" | "statusKey" | "displayOrder">;
type TicketTypeIdentity = Pick<TicketType, "typeKey"> | null | undefined;

export function isSchedulingGateType(type: TicketTypeIdentity) {
  return schedulingGateTypes.some(key => key === type?.typeKey);
}
export function isAtSchedulingGate(current: Status | undefined) {
  return !!current?.statusKey && (isSeededStatus(current, "new") || isSeededStatus(current, "ready_to_schedule"));
}
const stableScheduled = <T extends Status>(statuses: readonly T[]) =>
  findSeededStatus(statuses.filter(s => s.statusKey != null), "scheduled");
const compareSteps = (a: Status, b: Status) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id);
export function schedulingSkipTarget<T extends Status>(statuses: readonly T[]): T | undefined {
  const ladder = [...statuses].sort(compareSteps);
  const index = ladder.findIndex(s => s.statusKey === "scheduled");
  return index < 0 ? undefined : ladder[index + 1];
}

/** Call only under the company gate and fresh ticket lock. The only bypass is
 * the dedicated skip action, whose eligibility is rechecked here. */
export async function assertSchedulingGate(
  tx: Pick<AppTransaction, "select">,
  ticket: Pick<Ticket, "id" | "companyId" | "currentStatusId">,
  type: TicketTypeIdentity,
  statuses: readonly Status[],
  targetId: string,
  skip = false,
) {
  const target = statuses.find(s => s.id === targetId);
  if (!target) throw new VisitError(422, "INVALID_STATUS", "That status does not belong to this ticket’s workflow.");
  const scheduled = stableScheduled(statuses);
  if (!isSchedulingGateType(type) || !scheduled) return;
  const current = statuses.find(s => s.id === ticket.currentStatusId);
  if (skip) {
    if (await hasOpenTicketVisit(tx, ticket.companyId, ticket.id)) {
      throw new VisitError(409, "ALREADY_SCHEDULED", alreadyScheduledMessage);
    }
    if (!isAtSchedulingGate(current) || schedulingSkipTarget(statuses)?.id !== targetId) {
      throw new VisitError(409, "NOT_SKIPPABLE", "This job is no longer at a scheduling step.");
    }
    return;
  }
  if (target.id === ticket.currentStatusId) return;
  if ((target.id === scheduled.id && !await hasOpenTicketVisit(tx, ticket.companyId, ticket.id))
    || (isAtSchedulingGate(current) && compareSteps(target, scheduled) > 0)) {
    throw new VisitError(422, "SCHEDULE_REQUIRED", scheduleRequiredMessage);
  }
}

/** Creation ignores caller-supplied status. A misconfigured ladder must not
 * make the server-selected initial stage a way around scheduling. */
export function assertSchedulingInitialStatus(type: TicketTypeIdentity, statuses: readonly Status[], initial: Status) {
  const scheduled = stableScheduled(statuses);
  if (isSchedulingGateType(type) && scheduled && !isAtSchedulingGate(initial) && compareSteps(initial, scheduled) >= 0) {
    throw new VisitError(422, "SCHEDULE_REQUIRED", scheduleRequiredMessage);
  }
}

/** A newly placed stop (not a legacy crew/date mirror) can schedule a job.
 * New Estimate Requests must still go through their approval workflow. */
export function applySchedulingTransition(
  updates: Record<string, unknown>,
  existing: Pick<Ticket, "currentStatusId">,
  statuses: readonly TicketTypeStatus[],
  hasOpen: boolean,
  placeNew = false,
): void {
  if (Object.hasOwn(updates, "currentStatusId")) return;
  const current = statuses.find(s => s.id === existing.currentStatusId);
  const scheduled = findSeededStatus(statuses, "scheduled");
  const ready = findSeededStatus(statuses, "ready_to_schedule");
  if (!scheduled || !ready) return;
  if (hasOpen && (isSeededStatus(current, "ready_to_schedule") || (placeNew && isSeededStatus(current, "new")))) {
    updates.currentStatusId = scheduled.id;
    updates.statusChangeNotes = "Crew and date set";
  } else if (!hasOpen && isSeededStatus(current, "scheduled")) {
    updates.currentStatusId = ready.id;
    updates.statusChangeNotes = "Crew or date cleared";
  }
}
