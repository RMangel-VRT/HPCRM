import { and, eq, inArray, sql } from "drizzle-orm";
import { agreements, agreementTerms, customers, tickets, ticketTypes, ticketTypeStatuses, type Customer, type Ticket } from "@workspace/db";
import { ContractCenterError, displayStatus } from "./contractCenterService";
import type { Reader, Transaction } from "./contractCenterPersistence";
import { lockVisitCompany, lockVisitTickets } from "./visitSync";
import { applyTicketStatus } from "./ticketStatusChange";

export async function lockRfp(tx: Transaction, companyId: string, id: string) {
  // Matches ticket PATCH's lock order. This gate also serializes all sibling
  // agreement writes before the aggregate is read under READ COMMITTED.
  await lockVisitCompany(tx, companyId);
  const [ticket] = await lockVisitTickets(tx, companyId, [id]);
  return ticket;
}
export async function rfpWorkflow(reader: Reader, ticket: Ticket) {
  const [type] = await reader.select().from(ticketTypes).where(and(eq(ticketTypes.id, ticket.ticketTypeId), eq(ticketTypes.companyId, ticket.companyId)));
  if (type?.typeKey !== "rfp_request") return null;
  const statuses = await reader.select().from(ticketTypeStatuses).where(eq(ticketTypeStatuses.ticketTypeId, ticket.ticketTypeId));
  return { statuses, current: statuses.find(s => s.id === ticket.currentStatusId),
    draft: statuses.find(s => s.statusKey === "proposal_draft"),
    awarded: statuses.find(s => s.statusKey === "awarded"),
    executed: statuses.find(s => s.statusKey === "contract_executed") };
}
export async function validateRfpCreation(tx: Transaction, companyId: string, id: string, customer: Customer) {
  const ticket = await lockRfp(tx, companyId, id);
  const flow = ticket && await rfpWorkflow(tx, ticket);
  if (!flow) throw new ContractCenterError(400, "Only an RFP Request can produce a contract.");
  if (flow.current?.isFinal === "true" || ["closed_lost", "closed_won"].includes(flow.current?.statusKey ?? ""))
    throw new ContractCenterError(409, "This RFP is closed");
  if (!flow.current || !flow.draft || flow.current.displayOrder < flow.draft.displayOrder)
    throw new ContractCenterError(409, "Move the RFP to Proposal Drafted first");
  const [owner] = ticket.customerId ? await tx.select().from(customers)
    .where(and(eq(customers.id, ticket.customerId), eq(customers.companyId, companyId))) : [];
  const [freshCustomer] = await tx.select().from(customers).where(and(eq(customers.id, customer.id), eq(customers.companyId, companyId)));
  customer = freshCustomer;
  if (!owner || !customer || customer.companyId !== companyId || !(customer.id === owner.id ||
    customer.id === owner.parentCustomerId || customer.parentCustomerId === owner.id))
    throw new ContractCenterError(400, "Choose the RFP customer, its parent or a direct branch.");
  return ticket;
}
export async function linkedSeasons(reader: Reader, companyId: string, ticketId: string) {
  return reader.select().from(agreementTerms).where(and(eq(agreementTerms.companyId, companyId), eq(agreementTerms.bidTicketId, ticketId)));
}
export async function guardManualRfpStatus(tx: Transaction, ticket: Ticket, toStatusId: string) {
  if (ticket.currentStatusId === toStatusId) return;
  const flow = await rfpWorkflow(tx, ticket);
  const target = flow?.statuses.find(s => s.id === toStatusId);
  if (!flow?.awarded || !target || target.displayOrder < flow.awarded.displayOrder ||
    target.statusKey === "closed_lost") return;
  const terms = await linkedSeasons(tx, ticket.companyId, ticket.id);
  if (terms.length && !terms.some(t => t.status === "signed"))
    throw new ContractCenterError(409, "Mark the contract signed in the Contract Center; the RFP follows it.");
}
/** Pure precedence/forward guards; signed sync deliberately requires BEFORE Awarded. */
export function rfpSyncTargets(flow: NonNullable<Awaited<ReturnType<typeof rfpWorkflow>>>, terms: { status: string }[]) {
  const { current, awarded, executed, statuses } = flow;
  if (!current || current.isFinal === "true" || ["closed_lost", "closed_won"].includes(current.statusKey ?? "") ||
    !executed || current.displayOrder >= executed.displayOrder) return [];
  if (terms.some(t => t.status === "signed"))
    return awarded && current.displayOrder < awarded.displayOrder ? ["awarded", "contract_executed"] : [];
  const sent = statuses.find(s => s.statusKey === "proposal_sent");
  if (terms.some(t => t.status === "sent"))
    return sent && current.displayOrder < sent.displayOrder ? ["proposal_sent"] : [];
  if (terms.length && terms.every(t => ["lost", "cancelled"].includes(t.status)) && terms.some(t => t.status === "lost")) return ["closed_lost"];
  return [];
}
export async function syncRfp(tx: Transaction, companyId: string, ticketId: string, userId: string, note: string) {
  let ticket = await lockRfp(tx, companyId, ticketId);
  if (!ticket) return;
  const flow = await rfpWorkflow(tx, ticket);
  if (!flow) return;
  for (const key of rfpSyncTargets(flow, await linkedSeasons(tx, companyId, ticketId))) {
    ticket = await applyTicketStatus(tx, { ticket, toStatusKey: key, userId, note });
  }
}
/** One joined query, used only by Bids and the explicit linked-seasons list.
 * Display computation may need sibling seasons but never substitutes one for
 * the exact term carrying the relationship. */
export async function loadLinkedContracts(reader: Reader, companyId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await reader.select({ term: agreementTerms, customerName: customers.name,
    signedRenewal: sql<boolean>`exists (select 1 from agreement_terms successor
      where successor.renewed_from_term_id = agreement_terms.id
      and successor.company_id = agreement_terms.company_id
      and successor.status in ('signed', 'active', 'renewed'))` })
    .from(agreementTerms)
    .innerJoin(agreements, and(eq(agreements.id, agreementTerms.agreementId), eq(agreements.companyId, companyId)))
    .innerJoin(customers, and(eq(customers.id, agreements.customerId), eq(customers.companyId, companyId)))
    .where(and(eq(agreementTerms.companyId, companyId), inArray(agreementTerms.bidTicketId, ids)));
  return rows.map(({ term, customerName, signedRenewal }) => ({
    bidTicketId: term.bidTicketId, agreementId: term.agreementId, termId: term.id, customerName,
    line: term.line, form: term.form, seasonLabel: term.seasonLabel,
    displayStatus: displayStatus(term, signedRenewal ? [{ ...term, id: "successor", renewedFromTermId: term.id, status: "signed" }] : []),
    annualPriceCents: term.annualPriceCents, snowPricing: term.snowPricing,
  }));
}
