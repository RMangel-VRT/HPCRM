import { storage } from "./storage";
import { db } from "./db";
import { tickets, ticketTypeStatuses, customers, ticketNotifications } from "@shared/schema";
import { eq, and, isNotNull, ne, lte, gte, sql } from "drizzle-orm";

async function checkAndCreateDueDateNotifications() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  try {
    const ticketsWithDueDates = await db.select({
      ticket: tickets,
      statusIsFinal: ticketTypeStatuses.isFinal,
    })
      .from(tickets)
      .leftJoin(ticketTypeStatuses, eq(tickets.currentStatusId, ticketTypeStatuses.id))
      .where(and(
        isNotNull(tickets.dueDate),
        isNotNull(tickets.assignedToId),
        lte(tickets.dueDate, tomorrowEnd)
      ));

    for (const row of ticketsWithDueDates) {
      const ticket = row.ticket;
      const isFinal = row.statusIsFinal === "true";
      
      if (isFinal) continue;
      
      if (!ticket.assignedToId || !ticket.dueDate) continue;

      const dueDate = new Date(ticket.dueDate);
      let notificationType: "due_tomorrow" | "due_today" | "overdue" | null = null;

      if (dueDate < todayStart) {
        notificationType = "overdue";
      } else if (dueDate >= todayStart && dueDate <= todayEnd) {
        notificationType = "due_today";
      } else if (dueDate >= tomorrowStart && dueDate <= tomorrowEnd) {
        notificationType = "due_tomorrow";
      }

      if (!notificationType) continue;

      const todayDateStr = todayStart.toISOString().split('T')[0];
      const existingToday = await db.select()
        .from(ticketNotifications)
        .where(and(
          eq(ticketNotifications.ticketId, ticket.id),
          eq(ticketNotifications.recipientId, ticket.assignedToId),
          eq(ticketNotifications.type, notificationType),
          gte(ticketNotifications.createdAt, todayStart)
        ))
        .limit(1);

      if (existingToday.length > 0) continue;

      const customer = ticket.customerId 
        ? await storage.getCustomerById(ticket.customerId, ticket.companyId)
        : null;
      const customerText = customer ? ` - ${customer.name}` : "";

      let message: string;
      switch (notificationType) {
        case "due_tomorrow":
          message = `Due tomorrow: ${ticket.title}${customerText}`;
          break;
        case "due_today":
          message = `Due today: ${ticket.title}${customerText}`;
          break;
        case "overdue":
          message = `Overdue: ${ticket.title}${customerText}`;
          break;
      }

      await storage.createNotification({
        companyId: ticket.companyId,
        recipientId: ticket.assignedToId,
        ticketId: ticket.id,
        type: notificationType,
        message,
      });

      console.log(`Created ${notificationType} notification for ticket ${ticket.id} to user ${ticket.assignedToId}`);
    }
  } catch (err) {
    console.error("Error running due date notifications:", err);
  }
}

export function runDueDateNotifications() {
  console.log("Starting due date notification service...");
  
  checkAndCreateDueDateNotifications();
  
  const ONE_HOUR = 60 * 60 * 1000;
  setInterval(() => {
    console.log("Running scheduled due date notification check...");
    checkAndCreateDueDateNotifications();
  }, ONE_HOUR);
}
