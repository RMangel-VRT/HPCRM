/**
 * Client visual system for tickets. Mirrors the server's identity vocabulary and
 * adds the presentation layer. Nothing imports this yet — visual slices V1+ do.
 */

export type TicketTypeKey =
  | "todo" | "estimate_request" | "project" | "extra_billable" | "invoice" | "rfp_request";

/** Mirrors the server's TICKET_TYPE_NAMES_BY_KEY — keep in sync. */
export const TICKET_TYPE_NAMES_BY_KEY: Record<TicketTypeKey, string> = {
  todo: "To-Do",
  estimate_request: "Estimate Request",
  project: "Project",
  extra_billable: "Extra Billable",
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
  return type.name === TICKET_TYPE_NAMES_BY_KEY[key];
}

/**
 * `invoice` is deliberately absent — an Invoice ticket inherits its parent's hue.
 * Callers resolve the parent first and use the fallback only for a standalone one.
 */
const TYPE_HUE_VAR: Record<Exclude<TicketTypeKey, "invoice">, string> = {
  estimate_request: "--tt-estimate",
  project:          "--tt-project",
  rfp_request:      "--tt-rfp",
  extra_billable:   "--tt-extra",
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
  statusKey?: string | null;
  actionType?: "needs_action" | "waiting" | null;
  isFinal?: "true" | "false" | null;
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