import { deriveStatusState, type TicketStatusIdentity } from "@shared/ticketVisuals";
import type { ServiceState } from "@/hooks/useCustomerServices";

/** CP4: the one customer-page status vocabulary. Presentation only; stored states never change. */
export const DISPLAY_STATUSES = ["draft", "pending", "active", "in_window", "upcoming", "overdue", "done", "skipped", "ended"] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];
export type StatusModule = "ticket" | "service" | "proposal" | "contract";

/** Semantic tone per display status, drawn from the existing --ts-* status scale. */
export const DISPLAY_STATUS_VAR: Record<DisplayStatus, string> = {
  draft: "var(--ts-open)", pending: "var(--ts-waiting)", active: "var(--ts-active)", in_window: "var(--ts-active)",
  upcoming: "var(--ts-open)", overdue: "var(--ts-lost)", done: "var(--ts-done)", skipped: "var(--ts-open)", ended: "var(--ts-open)",
};

/** Every known module state. Tests assert each maps into DISPLAY_STATUSES. */
export const KNOWN_MODULE_STATES: Record<Exclude<StatusModule, "ticket">, readonly string[]> = {
  service: ["done", "skipped", "overdue", "in_window", "upcoming"] satisfies readonly ServiceState[],
  proposal: ["draft", "finalized", "sent", "pending", "accepted", "rejected", "declined", "expired", "archived"],
  contract: ["draft", "sent", "pending", "signed", "active", "renewed", "current", "upcoming", "future", "paused", "ended", "expired", "previous", "lost", "cancelled", "terminated", "non_renewed"],
};

const PROPOSAL: Record<string, DisplayStatus> = {
  draft: "draft", finalized: "pending", sent: "pending", pending: "pending",
  accepted: "done", rejected: "ended", declined: "ended", expired: "ended", archived: "ended",
};
const CONTRACT: Record<string, DisplayStatus> = {
  draft: "draft", sent: "pending", pending: "pending", paused: "pending",
  signed: "active", active: "active", renewed: "active", current: "active",
  upcoming: "upcoming", future: "upcoming",
  ended: "ended", expired: "ended", previous: "ended", lost: "ended", cancelled: "ended", terminated: "ended", non_renewed: "ended",
};
const TICKET: Record<ReturnType<typeof deriveStatusState>, DisplayStatus> = {
  open: "pending", waiting: "pending", active: "active", done: "done", lost: "ended",
};

/** Map one module's stored state onto the shared vocabulary. Unknown values fall back safely, never to raw text. */
export function displayStatus(module: "ticket", state: TicketStatusIdentity | null | undefined): DisplayStatus;
export function displayStatus(module: Exclude<StatusModule, "ticket">, state: string | null | undefined): DisplayStatus;
export function displayStatus(module: StatusModule, state: unknown): DisplayStatus {
  if (module === "ticket") return TICKET[deriveStatusState(state as TicketStatusIdentity | null | undefined)];
  const key = typeof state === "string" ? state.toLowerCase() : "";
  if (module === "service") return (KNOWN_MODULE_STATES.service as readonly string[]).includes(key) ? key as DisplayStatus : "upcoming";
  if (module === "proposal") return PROPOSAL[key] ?? "pending";
  return CONTRACT[key] ?? "active";
}
