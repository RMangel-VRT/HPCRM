import type { EstimateDetailDto, EstimateVersionSummaryDto } from "@shared/schema";
import { apiRequest } from "./queryClient";
import { companyHeaders } from "./hardscapeCatalog";
import { denverToday } from "./estimateBuilder";

export type EstimateState = Pick<EstimateDetailDto, "id" | "ticketId" | "voidedAt" | "versions">;
export interface TicketState {
  id: string; companyId: string; ticketTypeId: string; currentStatusId: string;
}
export interface TicketStatus { id: string; statusKey?: string | null; name: string; displayOrder: number; isFinal: string }
export interface TicketField { id: string; fieldKey: string; options?: string[] | null; fieldType: string }
export interface TicketValue { fieldId: string; value: string | null }
export interface LinkedTicketState { ticket: TicketState; statuses: TicketStatus[]; fields: TicketField[]; values: TicketValue[] }
export type RecoveryReason = "missingTarget" | "missingCurrent" | "behind" | "fieldsIncomplete" | "loadFailed" | "changed";
export interface AdvancePlan {
  reason: RecoveryReason | null; target?: TicketStatus; move: boolean; writes: { fieldId: string; value: string }[];
}
export type TicketRequest = (method: string, url: string, body?: unknown) => Promise<unknown>;
export const ticketRequest = (companyId: string, active: () => boolean = () => true): TicketRequest =>
  async (method, url, body) => {
    if (!active()) throw new Error("Scope changed");
    const res = await apiRequest(method, url, body, { headers: companyHeaders(companyId) });
    if (!active()) throw new Error("Scope changed");
    return res.json();
  };
const enc = encodeURIComponent;

/** Latest committed lifecycle event wins, not the current-version pointer.
 * New drafts have no event; an older accepted version remains operative.
 * Superseded audit data is retained by 3.3; equal timestamps prefer decisions. */
export function linkedTicketEvent(estimate: EstimateState): { kind: "send" | "accept" | "decline"; version: EstimateVersionSummaryDto } | null {
  if (!estimate.ticketId || estimate.voidedAt) return null;
  const versions = [...estimate.versions].filter(v => v.status !== "void");
  const events = versions.flatMap(version => [
    ...(version.acceptedAt ? [{ kind: "accept" as const, version, at: version.acceptedAt }] : []),
    ...(version.declinedAt ? [{ kind: "decline" as const, version, at: version.declinedAt }] : []),
    ...(version.sentAt ? [{ kind: "send" as const, version, at: version.sentAt }] : []),
  ]).sort((a, b) => b.at.localeCompare(a.at) || b.version.versionNumber - a.version.versionNumber
    || Number(a.kind === "send") - Number(b.kind === "send"));
  return events[0] ?? null;
}

/** 3.3 persists one reason string, not separate chip/notes. Match exact known
 * English/Spanish chip labels; arbitrary prose stays free text, never guessed. */
export function lossChip(reason: string): string | undefined {
  const pairs: [string, string[]][] = [
    ["Price", ["Price", "Precio"]], ["Timing", ["Timing", "Plazos", "Tiempo"]],
    ["Went with competitor", ["Went with competitor", "Eligió a la competencia", "Eligieron a la competencia"]],
    ["No longer needed", ["No longer needed", "Ya no es necesario", "Ya no se necesita", "Ya no lo necesita"]],
    ["Other", ["Other", "Otro"]],
  ];
  return pairs.find(([, labels]) => labels.some(label => label.toLowerCase() === reason.trim().toLowerCase()))?.[0];
}

export async function loadLinkedTicket(ticketId: string, request: TicketRequest): Promise<LinkedTicketState> {
  const ticket = await request("GET", `/api/tickets/${enc(ticketId)}`) as TicketState;
  const [statuses, fields, values] = await Promise.all([
    request("GET", `/api/ticket-types/${enc(ticket.ticketTypeId)}/statuses`),
    request("GET", `/api/ticket-types/${enc(ticket.ticketTypeId)}/fields`),
    request("GET", `/api/tickets/${enc(ticketId)}/field-values`),
  ]);
  return { ticket, statuses: statuses as TicketStatus[], fields: fields as TicketField[], values: values as TicketValue[] };
}

export function planLinkedTicket(estimate: EstimateState, state: LinkedTicketState): AdvancePlan {
  const skip: AdvancePlan = { reason: null, move: false, writes: [] };
  const event = linkedTicketEvent(estimate);
  if (!event) return skip;
  const targetKey = { send: "proposal_sent", accept: "ready_to_schedule", decline: "closed_lost" }[event.kind];
  const current = state.statuses.find(s => s.id === state.ticket.currentStatusId);
  if (!current) return { ...skip, reason: "missingCurrent" };
  // An unrelated final ticket is never touched, even in a custom workflow.
  if (current.isFinal === "true" && current.statusKey !== targetKey) return skip;
  const target = state.statuses.find(s => s.statusKey === targetKey);
  if (!target) return { ...skip, reason: "missingTarget" };
  if (current.displayOrder > target.displayOrder || (current.id !== target.id && current.displayOrder === target.displayOrder)) return skip;
  const move = current.id !== target.id && current.isFinal !== "true";
  if (current.id !== target.id && !move) return skip;
  const v = event.version;
  const expected: Record<string, string | null | undefined> = event.kind === "send" ? {
    proposal_sent_date: v.sentAt ? denverToday(new Date(v.sentAt)) : undefined,
    proposal_delivery_method: v.sentMethod === "email" ? "Email" : v.sentMethod === "hard_copy" ? "Hard Copy" : v.sentMethod ? "Other" : undefined,
  } : event.kind === "accept" ? {
    decision_outcome: "Approved", decision_date: v.acceptedOn, po_number: v.poNumber || undefined,
  } : {
    decision_outcome: "Denied", denial_reason: v.declineReason,
    loss_reason: lossChip(v.declineReason ?? ""), loss_notes: v.declineReason,
  };
  const writes = state.fields.flatMap(field => {
    const value = expected[field.fieldKey];
    if (value == null || (field.fieldType === "select" && !field.options?.includes(value))) return [];
    if (state.values.some(v => v.fieldId === field.id && v.value === value)) return [];
    return [{ fieldId: field.id, value }];
  });
  return { target, move, writes, reason: move ? "behind" : writes.length ? "fieldsIncomplete" : null };
}

export interface AdvanceResult { moved: boolean; ticketNumber?: string | number; statusName?: string; reason: RecoveryReason | null }
/** Only this routine writes status, through the existing PATCH, before any PUT.
 * At-target recovery repairs just mismatched fields without replaying PATCH. */
export async function advanceLinkedTicket(estimate: EstimateState, request: TicketRequest): Promise<AdvanceResult> {
  if (!linkedTicketEvent(estimate) || !estimate.ticketId) return { moved: false, reason: null };
  let moved = false;
  try {
    // Re-read the estimate too: a retry must not replay a stale decision/version.
    const authoritative = await request("GET", `/api/estimates/${enc(estimate.id)}`) as EstimateDetailDto;
    if (authoritative.ticketId !== estimate.ticketId || !linkedTicketEvent(authoritative)) return { moved, reason: null };
    const state = await loadLinkedTicket(estimate.ticketId, request);
    const plan = planLinkedTicket(authoritative, state);
    if (!plan.target) return { moved, reason: plan.reason };
    if (!plan.reason) return { moved, reason: null };
    if (plan.move) {
      await request("PATCH", `/api/tickets/${enc(estimate.ticketId)}`, { currentStatusId: plan.target.id });
      moved = true;
    }
    for (const write of plan.writes) {
      // A concurrent manual step-back must not activate the legacy decision-field side path.
      const current = await request("GET", `/api/tickets/${enc(estimate.ticketId)}`) as TicketState;
      if (current.currentStatusId !== plan.target.id) return { moved, reason: "changed" };
      await request("PUT", `/api/tickets/${enc(estimate.ticketId)}/field-values/${enc(write.fieldId)}`, { value: write.value });
    }
    // Tickets have UUID IDs, displayed as #<first 8> throughout Tickets/My Tickets.
    return { moved, reason: null, ticketNumber: state.ticket.id.slice(0, 8), statusName: plan.target.name };
  } catch {
    // Estimate lifecycle success is independent. No compensating estimate write.
    return { moved, reason: "loadFailed" };
  }
}
