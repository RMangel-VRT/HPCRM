import { and, eq } from "drizzle-orm";
import { customers, settings, tickets, ticketTypeStatuses, users, companyUsers, type Estimate } from "@workspace/db";
import type { EstimateConnection } from "./estimateReads";

/** Read-through display facts only; never persist copies into commercial snapshots. */
export async function estimateDisplay(tx: EstimateConnection, companyId: string, estimate: Estimate) {
  const [row] = await tx.select({
    customer: { name: customers.name, street: customers.street, city: customers.city, state: customers.state, zip: customers.zip },
    companyName: settings.companyName, createdByName: users.name,
    ticket: { id: tickets.id, title: tickets.title },
    status: {
      name: ticketTypeStatuses.name, statusKey: ticketTypeStatuses.statusKey,
      actionType: ticketTypeStatuses.actionType, isFinal: ticketTypeStatuses.isFinal,
    },
  }).from(customers)
    .leftJoin(settings, eq(settings.companyId, companyId))
    .leftJoin(companyUsers, and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, estimate.createdById ?? "")))
    .leftJoin(users, eq(users.id, companyUsers.userId))
    .leftJoin(tickets, and(eq(tickets.companyId, companyId), eq(tickets.id, estimate.ticketId ?? "")))
    .leftJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, tickets.ticketTypeId)))
    .where(and(eq(customers.companyId, companyId), eq(customers.id, estimate.customerId))).limit(1);
  const customer = row?.customer;
  return {
    companyName: row?.companyName || "High Plains Property Maintenance",
    customerName: customer?.name ?? "",
    customerAddress: customer ? [customer.street, [customer.city, customer.state, customer.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
    createdByName: row?.createdByName ?? null,
    ticket: row?.ticket ? { ...row.ticket, status: row.status, shortId: row.ticket.id.slice(0, 8) } : null,
  };
}
