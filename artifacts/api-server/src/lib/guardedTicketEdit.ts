import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  agreementTerms, campaignItems, contracts, customers, estimates, ticketLinks, tickets, visits,
  type Ticket, type TicketType, type TicketTypeStatus, type WorkType,
} from "@workspace/db";
import {
  TICKET_CREATION_TYPE_KEYS, TICKET_EDIT_REASONS, type TicketEditAvailability, type TicketEditReason,
} from "../../../../lib/db/src/ticketEditContracts";
import type { AppTransaction } from "../db";
import { storage } from "../storage";
import { findSeededTicketType, isSeededTicketType } from "../shared/ticketCapabilities";
import { getBillingBehaviorForWorkType } from "../shared/workTypeCatalog";
import { parentCustomerError } from "../utils/parentGuard";
import { assertSchedulingInitialStatus } from "./schedulingTransition";
import { computeScheduleBy } from "./scheduleBy";
import { openVisitStatuses, VisitError } from "./visitLocks";

type Reader = Pick<AppTransaction, "select">;
type RoleContext = { accessRole: string };
export const canEditTicketIdentity = ({ accessRole }: RoleContext) => accessRole === "admin" || accessRole === "office";
const fail = (status: number, code: TicketEditReason): never => {
  throw new VisitError(status, code, TICKET_EDIT_REASONS[code]);
};

export function firstTicketStatus(statuses: readonly TicketTypeStatus[]) {
  return [...statuses].sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))[0];
}

/** Called inside the company-before-ticket write lock, or as a read-only UI hint. */
async function editRelationships(reader: Reader, ticket: Ticket) {
  const { companyId, id } = ticket;
  const visit = and(eq(visits.companyId, companyId), eq(visits.ticketId, id));
  const [facts] = await reader.select({
    estimate: sql<boolean>`exists (select 1 from ${estimates} where ${and(
      eq(estimates.companyId, companyId), eq(estimates.ticketId, id), isNull(estimates.voidedAt))})`,
    invoice: sql<boolean>`exists (select 1 from ${ticketLinks} where ${and(
      eq(ticketLinks.linkType, "invoice_for"), or(eq(ticketLinks.sourceTicketId, id), eq(ticketLinks.targetTicketId, id)))})`,
    contractCenter: sql<boolean>`exists (select 1 from ${agreementTerms} where ${and(
      eq(agreementTerms.companyId, companyId), eq(agreementTerms.bidTicketId, id))})`,
    visit: sql<boolean>`exists (select 1 from ${visits} where ${visit})`,
    activeOrDoneVisit: sql<boolean>`exists (select 1 from ${visits} where ${and(visit,
      inArray(visits.status, [...openVisitStatuses, "done"]))})`,
    campaign: sql<boolean>`exists (select 1 from ${campaignItems} where ${and(
      eq(campaignItems.companyId, companyId), eq(campaignItems.ticketId, id))})`,
  }).from(tickets).where(and(eq(tickets.companyId, companyId), eq(tickets.id, id)));
  // The invoice link table has no company column; either endpoint is the
  // already scoped ticket. Even a malformed legacy link must prevent editing.
  return facts;
}

type Relationships = Awaited<ReturnType<typeof editRelationships>>;
function customerBlock(ticket: Ticket, facts: Relationships): TicketEditReason | null {
  if (facts?.estimate) return "TICKET_EDIT_ESTIMATE";
  if (facts?.invoice) return "TICKET_EDIT_INVOICE_LINK";
  if (ticket.contractId) return "TICKET_EDIT_CONTRACT";
  if (facts?.contractCenter) return "TICKET_EDIT_CONTRACT_CENTER";
  if (facts?.activeOrDoneVisit) return "TICKET_EDIT_VISIT";
  if (facts?.campaign) return "TICKET_EDIT_CAMPAIGN";
  return null;
}

function typeBlock(ticket: Ticket, type: TicketType | undefined, statuses: readonly TicketTypeStatus[], facts: Relationships): TicketEditReason | null {
  if (isSeededTicketType(type, "invoice") || ticket.workType === "invoice") return "TICKET_EDIT_INVOICE_TYPE";
  if (ticket.workType === "shop_todo" || ticket.equipmentId) return "TICKET_EDIT_SHOP_TYPE";
  if (facts?.estimate) return "TICKET_EDIT_ESTIMATE";
  if (facts?.invoice) return "TICKET_EDIT_INVOICE_LINK";
  if (facts?.contractCenter) return "TICKET_EDIT_CONTRACT_CENTER";
  if (facts?.visit) return "TICKET_EDIT_VISIT";
  if (facts?.campaign) return "TICKET_EDIT_CAMPAIGN";
  if (!type || firstTicketStatus(statuses)?.id !== ticket.currentStatusId) return "TICKET_EDIT_STARTED";
  return null;
}

export async function ticketEditAvailability(reader: Reader, user: RoleContext, ticket: Ticket,
  type: TicketType | undefined, statuses: readonly TicketTypeStatus[]): Promise<TicketEditAvailability> {
  if (!canEditTicketIdentity(user)) return { customer: "TICKET_EDIT_PERMISSION", type: "TICKET_EDIT_PERMISSION" };
  const facts = await editRelationships(reader, ticket);
  return { customer: customerBlock(ticket, facts), type: typeBlock(ticket, type, statuses, facts) };
}

export type CustomerChange = { id: string; oldName: string; newName: string };

/** Validate before any PATCH side effects, under the same write locks as PATCH. */
export async function guardTicketCustomerChange(tx: AppTransaction, user: RoleContext, ticket: Ticket,
  body: { customerId?: unknown; contractId?: unknown }): Promise<CustomerChange | null> {
  if (!Object.hasOwn(body, "customerId") || body.customerId === ticket.customerId) return null;
  if (!canEditTicketIdentity(user)) return fail(403, "TICKET_EDIT_PERMISSION");
  const reason = customerBlock(ticket, await editRelationships(tx, ticket));
  if (reason) return fail(409, reason);
  if (typeof body.customerId !== "string" || !body.customerId) return fail(400, "TICKET_EDIT_INVALID_CUSTOMER");
  const [next] = await tx.select().from(customers).where(and(
    eq(customers.companyId, ticket.companyId), eq(customers.id, body.customerId))).for("share");
  if (!next) return fail(400, "TICKET_EDIT_INVALID_CUSTOMER");
  if (parentCustomerError(next)) return fail(400, "PARENT_CUSTOMER_NOT_ALLOWED");
  // Normally no contract survives the guard above. Also validate an explicit
  // contract in the same request so it cannot reattach the old customer's deal.
  if (body.contractId != null) {
    if (typeof body.contractId !== "string") return fail(400, "TICKET_EDIT_CONTRACT");
    const [contract] = await tx.select({ id: contracts.id }).from(contracts).where(and(
      eq(contracts.companyId, ticket.companyId), eq(contracts.id, body.contractId), eq(contracts.customerId, next.id))).for("share");
    if (!contract) return fail(409, "TICKET_EDIT_CONTRACT");
  }
  const previous = ticket.customerId ? await storage.getCustomerById(ticket.customerId, ticket.companyId) : undefined;
  return { id: next.id, oldName: previous?.name ?? "no customer", newName: next.name };
}

export async function changeTicketType(tx: AppTransaction, ticket: Ticket, userId: string,
  input: { ticketTypeId: string; workType?: WorkType }) {
  const types = await storage.getTicketTypes(ticket.companyId);
  const current = types.find(type => type.id === ticket.ticketTypeId);
  const target = types.find(type => type.id === input.ticketTypeId);
  if (!target) return fail(400, "TICKET_EDIT_INVALID_TYPE");
  if (isSeededTicketType(target, "invoice") || input.workType === "invoice") return fail(409, "TICKET_EDIT_INVOICE_TYPE");
  if (input.workType === "shop_todo") return fail(409, "TICKET_EDIT_SHOP_TYPE");
  if (target.id === ticket.ticketTypeId) return ticket;
  const active = types.filter(type => type.isActive === "true");
  const key = TICKET_CREATION_TYPE_KEYS.find(key => findSeededTicketType(active, key)?.id === target.id);
  if (!key) return fail(400, "TICKET_EDIT_INVALID_TYPE");

  const statuses = await storage.getTicketTypeStatuses(ticket.ticketTypeId);
  const facts = await editRelationships(tx, ticket);
  const reason = typeBlock(ticket, current, statuses, facts);
  if (reason) return fail(409, reason);
  if (ticket.customerId) {
    const [customer] = await tx.select().from(customers).where(and(
      eq(customers.companyId, ticket.companyId), eq(customers.id, ticket.customerId))).for("share");
    if (!customer) return fail(400, "TICKET_EDIT_INVALID_CUSTOMER");
    if (parentCustomerError(customer)) return fail(400, "PARENT_CUSTOMER_NOT_ALLOWED");
  } else if (target.requiresCustomer === "true") {
    return fail(409, "TICKET_EDIT_CUSTOMER_REQUIRED");
  }

  // Match New Ticket's classifications for the non-Task choices.
  const defaultWork = key === "task" ? "contract" : key === "estimate_request" || key === "project" ? "estimate_request" : "admin";
  if (input.workType !== undefined &&
    (key === "task" ? input.workType !== "contract" && input.workType !== "extra_work" : input.workType !== defaultWork)) {
    return fail(422, "TICKET_EDIT_INVALID_WORK_TYPE");
  }
  const workType = key === "task" && input.workType === "extra_work" ? "extra_work" : defaultWork;
  const targetStatuses = await storage.getTicketTypeStatuses(target.id);
  const first = firstTicketStatus(targetStatuses);
  if (!first) return fail(409, "TICKET_EDIT_MISSING_STATUS");
  assertSchedulingInitialStatus(target, targetStatuses, first);

  const oldFields = await storage.getTicketTypeFields(ticket.ticketTypeId);
  const newFields = await storage.getTicketTypeFields(target.id);
  const values = await storage.getTicketFieldValues(ticket.id);
  const valuesById = new Map(values.map(row => [row.fieldId, row.value]));
  const byKey = new Map<string, string>();
  for (const f of oldFields) {
    const value = valuesById.get(f.id);
    if (value !== undefined && (!byKey.has(f.fieldKey) || f.statusId === ticket.currentStatusId)) byKey.set(f.fieldKey, value);
  }
  for (const f of newFields) {
    const value = byKey.get(f.fieldKey);
    if (value !== undefined && value !== valuesById.get(f.id)) {
      await storage.upsertTicketFieldValue({ ticketId: ticket.id, fieldId: f.id, value, capturedById: userId });
    }
  }

  const updated = await storage.updateTicket(ticket.id, ticket.companyId, {
    ticketTypeId: target.id,
    currentStatusId: first.id,
    workType,
    billingBehavior: getBillingBehaviorForWorkType(workType),
    ...((key === "task" || key === "project") && !ticket.scheduleBy
      ? { scheduleBy: computeScheduleBy(ticket.priority, new Date(ticket.acceptedAt ?? ticket.createdAt)) } : {}),
  });
  if (!updated) throw new VisitError(404, "TICKET_NOT_FOUND", "Ticket not found");
  await storage.createTicketStatusHistory({
    ticketId: ticket.id, fromStatusId: ticket.currentStatusId, toStatusId: first.id, changedById: userId,
    notes: `Ticket type changed from ${current!.name} to ${target.name}`,
  });
  return updated;
}
