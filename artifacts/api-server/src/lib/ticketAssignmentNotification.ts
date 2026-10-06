import type { Ticket } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { storage } from "../storage";
import { sendPushToUser } from "../services/pushNotifications";

/** Shared PATCH / Send back assignment notification; failures remain secondary. */
export async function notifyTicketAssignment(
  existingTicket: Ticket,
  newAssigneeId: string,
  user: UserWithContext,
): Promise<void> {
  try {
    const customer = existingTicket.customerId
      ? await storage.getCustomerById(existingTicket.customerId, user.activeCompanyId)
      : null;
    const dueDateText = existingTicket.dueDate
      ? ` (Due: ${new Date(existingTicket.dueDate).toLocaleDateString()})`
      : "";
    const customerText = customer ? ` - ${customer.name}` : "";
    await storage.createNotification({
      companyId: user.activeCompanyId,
      recipientId: newAssigneeId,
      ticketId: existingTicket.id,
      type: "assigned",
      message: `Ticket assigned: ${existingTicket.title}${customerText}${dueDateText}`,
      isRead: false,
    });
    console.log(`Created assignment notification for ticket ${existingTicket.id} to user ${newAssigneeId}`);
  } catch (err) {
    console.error("Failed to create assignment notification:", err);
  }
}

/** Direct-assignee push for Send back; PATCH retains its deduplicated crew fan-out. */
export function pushReturnedTicket(ticket: Ticket, user: UserWithContext): void {
  if (!ticket.assignedToId || ticket.assignedToId === user.id) return;
  void (async () => {
    try {
      const customer = ticket.customerId
        ? await storage.getCustomerById(ticket.customerId, user.activeCompanyId)
        : null;
      await sendPushToUser(ticket.assignedToId!, "ticketReassignment", {
        title: "Ticket reassigned to you",
        body: `${ticket.title}${customer ? ` · ${customer.name}` : ""}`,
        data: { ticketId: ticket.id },
      });
    } catch (err) {
      console.error("Failed to send push for reassignment:", err);
    }
  })();
}
