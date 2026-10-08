import type { Ticket } from "@workspace/db";
import type { IStorage } from "../storage";

type CompletionStorage = Pick<IStorage,
  "getTicketLinks" | "getTicketById" | "getTicketTypeById" | "getTicketTypeStatuses"
  | "getTicketFieldValues" | "getTicketTypeFields" | "createTicketComment"
  | "getTicketsByIds" | "getTicketTypeStatusesByTypeIds" | "updateTicket"
  | "createTicketStatusHistory" | "dismissDueDateNotificationsForTicket">;

/** Called only when an Invoice is moving into a final status. */
export async function propagateInvoiceCompletion(
  existingTicket: Ticket, companyId: string, actorId: string, storage: CompletionStorage,
): Promise<void> {
  const links = await storage.getTicketLinks(existingTicket.id);
  const parentLink = links.find(link => link.linkType === "invoice_for" && link.targetTicketId === existingTicket.id);
  if (!parentLink) return;
  const parentTicket = await storage.getTicketById(parentLink.sourceTicketId, companyId);
  if (!parentTicket) return;
  const parentTicketType = await storage.getTicketTypeById(parentTicket.ticketTypeId, companyId);
  const parentStatuses = await storage.getTicketTypeStatuses(parentTicket.ticketTypeId);
  const invoiceFieldValues = await storage.getTicketFieldValues(existingTicket.id);
  const invoiceFields = await storage.getTicketTypeFields(existingTicket.ticketTypeId);
  const invoiceDataParts: string[] = [];
  for (const fv of invoiceFieldValues) {
    const field = invoiceFields.find(field => field.id === fv.fieldId);
    if (field && fv.value) invoiceDataParts.push(`${field.fieldLabel}: ${fv.value}`);
  }
  // Keep the existing comment behavior even when the parent must wait.
  if (invoiceDataParts.length > 0) {
    await storage.createTicketComment({
      ticketId: parentTicket.id, authorId: actorId,
      body: `[Invoice Completed] ${invoiceDataParts.join(" | ")}`,
    });
  }
  const parentLinks = await storage.getTicketLinks(parentTicket.id);
  const siblingIds = [...new Set(parentLinks.filter(link =>
    link.linkType === "invoice_for" && link.sourceTicketId === parentTicket.id,
  ).map(link => link.targetTicketId))];
  // Bulk-load company-scoped counterparts; cross-company links are skipped.
  const siblings = await storage.getTicketsByIds(siblingIds, companyId);
  const siblingStatuses = await storage.getTicketTypeStatusesByTypeIds(
    [...new Set(siblings.map(ticket => ticket.ticketTypeId))],
  );
  const finalStatusIds = new Set(siblingStatuses.filter(status => status.isFinal === "true").map(status => status.id));
  // The PATCH persists the invoice after this block, so count this one as final.
  if (siblings.some(ticket => ticket.id !== existingTicket.id && !finalStatusIds.has(ticket.currentStatusId))) {
    console.log(`Waiting to advance parent ticket ${parentTicket.id}: another linked Invoice is still open`);
    return;
  }
  const sortedParentStatuses = [...parentStatuses].sort((a, b) => a.displayOrder - b.displayOrder);
  const currentStatusIndex = sortedParentStatuses.findIndex(status => status.id === parentTicket.currentStatusId);
  const nextFinalStatus = sortedParentStatuses.find((status, index) => index > currentStatusIndex && status.isFinal === "true");
  if (nextFinalStatus) {
    await storage.updateTicket(parentTicket.id, companyId, {
      currentStatusId: nextFinalStatus.id, completedAt: new Date(),
    });
    await storage.createTicketStatusHistory({
      ticketId: parentTicket.id, toStatusId: nextFinalStatus.id, changedById: actorId,
      notes: "Auto-advanced: linked Invoice ticket completed",
    });
    await storage.dismissDueDateNotificationsForTicket(parentTicket.id).catch(err => {
      console.error("Failed to dismiss due-date notifications for parent ticket:", err);
    });
    console.log(`Auto-advanced parent ticket ${parentTicket.id} (${parentTicketType?.name}) to "${nextFinalStatus.name}" after Invoice completion`);
  }
}
