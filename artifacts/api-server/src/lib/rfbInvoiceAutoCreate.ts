/**
 * Direction-independent "Ready for Billing" invoice auto-creation helper.
 *
 * Fires on ANY landing at "Ready for Billing" — forward moves AND step-backs
 * (e.g. Done → Ready for Billing for Extra Billable tickets).
 *
 * Returns the newly-created Invoice ticket, or null when creation was skipped
 * (idempotency guard: invoice already exists, ticket type not eligible, etc.).
 */

import type { TicketTypeKey } from "@workspace/db";
import { isSeededTicketType } from "../shared/ticketCapabilities";

export interface RfbTicket {
  id: string;
  title: string;
  description?: string | null;
  companyId: string;
  ticketTypeId: string;
  customerId?: string | null;
  contractId?: string | null;
  billingBehavior?: string | null;
}

export interface RfbTicketType {
  id: string;
  name: string;
  typeKey?: TicketTypeKey | null;
  requiresInvoicing?: "true" | "false";
}

export interface RfbTicketLink {
  id: string;
  linkType: string;
  sourceTicketId: string;
  targetTicketId: string;
}

export interface RfbComment {
  authorId: string;
  body: string;
}

export interface RfbCompanyUser {
  userId: string;
  tags?: string[] | null;
  status?: string;
}

export interface RfbInvoiceTypeInfo {
  typeId: string;
  pendingStatusId: string;
}

export interface RfbCreatedTicket {
  id: string;
  [key: string]: unknown;
}

export interface RfbStorageDeps {
  getTicketTypeById(ticketTypeId: string, companyId: string): Promise<RfbTicketType | null | undefined>;
  getTicketLinks(ticketId: string): Promise<RfbTicketLink[]>;
  getCompanyUsersByCompanyId(companyId: string): Promise<RfbCompanyUser[]>;
  createTicket(data: Record<string, unknown>): Promise<RfbCreatedTicket>;
  createTicketLink(data: { sourceTicketId: string; targetTicketId: string; linkType: string }): Promise<unknown>;
  getTicketComments(ticketId: string): Promise<RfbComment[]>;
  createTicketComment(data: { ticketId: string; authorId: string; body: string }): Promise<unknown>;
}

/**
 * Checks whether a ticket type makes a ticket eligible for auto-invoice
 * when it lands on "Ready for Billing".
 *
 * Accepts either a string (legacy name-based check) or an RfbTicketType object.
 * When an object is passed: if `requiresInvoicing === "true"` return true;
 * if `"false"` return false; otherwise fall back to name check.
 *
 * @note The name-check fallback exists for rows that predate migration 0040
 *       which backfilled `requires_invoicing`. Once all rows are confirmed
 *       backfilled the fallback can be removed.
 */
export function isInvoiceEligibleType(type: RfbTicketType | string | null | undefined): boolean {
  if (type === undefined || type === null) return false;
  if (typeof type === "string") {
    return (
      type === "Project" ||
      type === "Estimate Request" ||
      type === "Extra Billable"
    );
  }
  // Object overload: prefer the stable flag, fall back to name
  if (type.requiresInvoicing === "true") return true;
  if (type.requiresInvoicing === "false") return false;
  return isSeededTicketType(type, "project")
    || isSeededTicketType(type, "estimate_request")
    || isSeededTicketType(type, "extra_billable");
}

export interface MaybeAutoCreateInvoiceParams {
  /** The ticket landing at Ready for Billing */
  ticket: RfbTicket;
  /** The new status name — used as fallback when newStatusKey is absent */
  newStatusName: string;
  /** Stable status key from ticket_type_statuses.status_key — preferred over newStatusName */
  newStatusKey?: string | null;
  /** The pending req.body.billingBehavior that will be persisted */
  pendingBillingBehavior?: string | null;
  /** ID of the user performing the action (used as createdById) */
  actingUserId: string;
  storage: RfbStorageDeps;
  ensureInvoiceTicketType: (companyId: string) => Promise<RfbInvoiceTypeInfo | null>;
}

/**
 * Idempotently creates an Invoice ticket linked to `ticket` when:
 *  - newStatusName is "Ready for Billing"
 *  - the ticket type is Project, Estimate Request, or Extra Billable
 *    OR billingBehavior is already "invoice_required"
 *  - no invoice_for link already exists from `ticket`
 *
 * Returns the newly-created Invoice ticket, or null if skipped.
 */
export async function maybeAutoCreateInvoiceOnRfb(
  params: MaybeAutoCreateInvoiceParams
): Promise<RfbCreatedTicket | null> {
  const { ticket, newStatusName, newStatusKey, pendingBillingBehavior, actingUserId, storage, ensureInvoiceTicketType } = params;

  // Prefer the stable status key; fall back to the display name for unkeyed custom statuses.
  const isRfbStatus = newStatusKey != null
    ? newStatusKey === "ready_for_billing"
    : newStatusName === "Ready for Billing";
  if (!isRfbStatus) return null;

  const ticketType = await storage.getTicketTypeById(ticket.ticketTypeId, ticket.companyId);
  const isInvoiceType = isSeededTicketType(ticketType, "invoice");
  const isExtraBillableType = isSeededTicketType(ticketType, "extra_billable");

  const invoiceEligible =
    ticket.billingBehavior === "invoice_required" ||
    pendingBillingBehavior === "invoice_required" ||
    isInvoiceEligibleType(ticketType);

  if (!invoiceEligible || isInvoiceType) return null;

  const existingLinks = await storage.getTicketLinks(ticket.id);
  const hasExistingInvoice = existingLinks.some(
    l => l.linkType === "invoice_for" && l.sourceTicketId === ticket.id
  );
  if (hasExistingInvoice) {
    console.log(`Invoice already exists for ticket ${ticket.id} at Ready for Billing — skipping creation`);
    return null;
  }

  try {
    const invoiceTypeInfo = await ensureInvoiceTicketType(ticket.companyId);
    if (!invoiceTypeInfo) return null;

    const companyUsers = await storage.getCompanyUsersByCompanyId(ticket.companyId);
    const billingUser = companyUsers.find(cu => cu.tags?.includes("billing") && cu.status === "active");

    const invoiceTicket = await storage.createTicket({
      companyId: ticket.companyId,
      customerId: ticket.customerId,
      contractId: ticket.contractId,
      ticketTypeId: invoiceTypeInfo.typeId,
      currentStatusId: invoiceTypeInfo.pendingStatusId,
      workType: "admin",
      billingBehavior: "internal",
      title: `Invoice: ${ticket.title}`,
      description: `Invoice required for completed work: ${ticket.title}\n\nOriginal description: ${ticket.description || "N/A"}`,
      priority: "normal",
      assignedToId: billingUser?.userId || null,
      createdById: actingUserId,
    });

    await storage.createTicketLink({
      sourceTicketId: ticket.id,
      targetTicketId: invoiceTicket.id,
      linkType: "invoice_for",
    });

    const sourceComments = await storage.getTicketComments(ticket.id);
    for (const comment of sourceComments) {
      await storage.createTicketComment({
        ticketId: invoiceTicket.id,
        authorId: comment.authorId,
        body: comment.body,
      });
    }

    console.log(
      `Auto-created Invoice ticket ${invoiceTicket.id} for ticket ${ticket.id} at Ready for Billing ` +
      `(direction-independent, type="${ticketType?.name}", ebNormalized=${isExtraBillableType}, ` +
      `assigned to: ${billingUser?.userId || "unassigned"}) with ${sourceComments.length} notes copied`
    );
    return invoiceTicket;
  } catch (err) {
    console.error("Failed to auto-create invoice ticket (direction-independent RFB):", err);
    return null;
  }
}
