/**
 * Client visual system for tickets. Mirrors the server's identity vocabulary and
 * adds the presentation layer. Nothing imports this yet — visual slices V1+ do.
 */

import type { TicketTypeKey } from "./schema";
export type { TicketTypeKey } from "./schema";

/** Mirrors the server's TICKET_TYPE_NAMES_BY_KEY — keep in sync. */
export const TICKET_TYPE_NAMES_BY_KEY: Record<TicketTypeKey, string> = {
  todo: "To-Do",
  estimate_request: "Estimate Request",
  project: "Project",
  task: "Task",
  invoice: "Invoice",
  rfp_request: "RFP Request",
};

export interface TicketTypeIdentity {
  name: string;
  typeKey?: string | null;
}

/** Key-first. A non-null key is authoritative; only unkeyed rows fall back to name. */
export function isSeededTicketType(
  type: TicketTypeIdentity | null | undefined,
  key: TicketTypeKey,
): boolean {
  if (!type) return false;
  if (type.typeKey != null) return type.typeKey === key;
  return type.name === TICKET_TYPE_NAMES_BY_KEY[key]
    || (key === "task" && type.name === "Extra Billable")
    || (key === "invoice" && type.name === "invoice");
}

export function findSeededTicketType<T extends TicketTypeIdentity>(
  types: readonly T[], key: TicketTypeKey,
): T | undefined {
  return types.find(type => type.typeKey === key)
    ?? types.find(type => isSeededTicketType(type, key));
}

/** Task-only workflow projection; unrelated branching workflows remain unchanged. */
export function taskWorkflowStatuses<T extends { statusKey?: string | null }>(
  statuses: readonly T[],
  type: TicketTypeIdentity | null | undefined,
  billingBehavior: string | null | undefined,
): T[] {
  return statuses.filter(status => !(
    isSeededTicketType(type, "task")
    && billingBehavior !== "invoice_required"
    && status.statusKey === "ready_for_billing"
  ));
}

/** Each ticket type has its own hue, independent of its workflow status. */
const TYPE_HUE_VAR: Record<TicketTypeKey, string> = {
  estimate_request: "--tt-estimate",
  project:          "--tt-project",
  rfp_request:      "--tt-rfp",
   task:             "--tt-extra",
  invoice:          "--tt-invoice",
  todo:             "--tt-todo",
};

export function typeHueVar(type: TicketTypeIdentity | null | undefined): string {
  for (const key of Object.keys(TYPE_HUE_VAR) as Array<keyof typeof TYPE_HUE_VAR>) {
    if (isSeededTicketType(type, key)) return `var(${TYPE_HUE_VAR[key]})`;
  }
  return "var(--tt-fallback)";
}

export type TicketStatusState = "open" | "active" | "waiting" | "done" | "lost";

export const STATUS_STATE_LABEL: Record<TicketStatusState, string> = {
  open: "Not started", active: "In progress", waiting: "Waiting",
  done: "Complete", lost: "Lost",
};

export const STATUS_STATE_VAR: Record<TicketStatusState, string> = {
  open: "var(--ts-open)", active: "var(--ts-active)", waiting: "var(--ts-waiting)",
  done: "var(--ts-done)", lost: "var(--ts-lost)",
};

export interface TicketStatusIdentity {
  name?: string;
  statusKey?: string | null;
  actionType?: "needs_action" | "waiting" | null;
  isFinal?: "true" | "false" | null;
}

/** Scheduling identity mirrors the server; legacy labels apply only to unkeyed rows. */
export function isSeededStatus(
  status: TicketStatusIdentity | null | undefined,
  key: "new" | "ready_to_schedule" | "scheduled",
): boolean {
  if (!status) return false;
  if (status.statusKey != null) return status.statusKey === key;
  if (key === "new") return status.name === "New";
  return key === "ready_to_schedule"
    ? status.name === "Ready to Schedule" || status.name === "Needs scheduling"
    : status.name === "Scheduled";
}

const OPEN_KEYS = new Set(["new", "pending_invoice"]);
const DONE_KEYS = new Set(["closed_won", "invoiced", "invoicing"]);

/**
 * Collapse any workflow status onto the five universal states.
 * Order matters: `closed_lost` is also isFinal, so it is tested first.
 * A status with no key still resolves from actionType/isFinal — the graceful path.
 */
export function deriveStatusState(s: TicketStatusIdentity | null | undefined): TicketStatusState {
  if (!s) return "open";
  const key = s.statusKey ?? undefined;
  if (key === "closed_lost") return "lost";
  if (key && DONE_KEYS.has(key)) return "done";
  if (s.actionType === "waiting") return "waiting";
  if (key && OPEN_KEYS.has(key)) return "open";
  if (!key && s.isFinal === "true") return "done";
  return "active";
}