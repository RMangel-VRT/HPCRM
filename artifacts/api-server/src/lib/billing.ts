import type { UserWithContext } from "../auth";
import { isSeededStatus, isSeededTicketType } from "../shared/ticketCapabilities";
import { isInvoiceEligibleType, type RfbTicketType } from "./rfbInvoiceAutoCreate";

export function canSeeBilling(user: Pick<UserWithContext, "activeRole" | "activeTags">): boolean {
  return user.activeRole === "admin" || user.activeRole === "office" || user.activeTags?.includes("billing") === true;
}

/** The additional field-role privilege is only Pending Invoice → Invoiced. */
export function isBillingInvoiceAction(
  body: Record<string, unknown> | null | undefined,
  ticket: { currentStatusId?: string | null; completedAt?: Date | null },
  type: Parameters<typeof isSeededTicketType>[0],
  statuses: (NonNullable<Parameters<typeof isSeededStatus>[0]> & { id: string; isFinal?: string | null })[],
): boolean {
  if (!body || typeof body.currentStatusId !== "string" || ticket.completedAt
    || !isSeededTicketType(type, "invoice")
    || !Object.keys(body).every(key => key === "currentStatusId" || key === "invoiceNumber")) return false;
  const current = statuses.find(status => status.id === ticket.currentStatusId);
  const target = statuses.find(status => status.id === body.currentStatusId);
  return isSeededStatus(current, "pending_invoice")
    && isSeededStatus(target, "invoiced") && target?.isFinal === "true";
}

export function isStrandedEligible(
  ticket: { billingBehavior?: string | null },
  type: RfbTicketType | null | undefined,
): boolean {
  if (!type || isSeededTicketType(type, "invoice")) return false;
  // Contract Tasks must never be recovered as charges, even with bad legacy status data.
  if (isSeededTicketType(type, "task") && ticket.billingBehavior !== "invoice_required") return false;
  return ticket.billingBehavior === "invoice_required" || isInvoiceEligibleType(type);
}

export function canManuallyInvoice(
  ticket: { billingBehavior?: string | null },
  type: Parameters<typeof isSeededTicketType>[0],
  status: Parameters<typeof isSeededStatus>[0],
): boolean {
  return isSeededTicketType(type, "estimate_request") || isSeededTicketType(type, "project")
    || (!!type && !isSeededTicketType(type, "invoice") && isSeededStatus(status, "ready_for_billing")
      && ticket.billingBehavior === "invoice_required");
}
