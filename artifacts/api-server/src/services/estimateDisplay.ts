import { and, eq } from "drizzle-orm";
import { customers, settings, tickets, ticketTypeStatuses, users, companyUsers, type Estimate,
  type EstimateWorkLocationInput, type ResolvedWorkLocation } from "@workspace/db";
import type { EstimateConnection } from "./estimateReads";

/** Owner selection is based on the FK, never on whether a joined row or its text exists. */
export function resolveEstimateWorkLocation(
  estimate: Pick<Estimate, "ticketId" | "workLocationLabel" | "workLocationDescription">,
  ticket: EstimateWorkLocationInput | null,
  propertyAddress: string,
): ResolvedWorkLocation & { input: EstimateWorkLocationInput } {
  const owner = estimate.ticketId !== null ? "ticket" : "estimate";
  const value = owner === "ticket" ? ticket : { label: estimate.workLocationLabel, details: estimate.workLocationDescription };
  const input = { label: value?.label?.trim() || null, details: value?.details?.trim() || null };
  const text = [input.label, input.details].filter(Boolean).join("\n");
  return { input, text: text || propertyAddress || null, source: text ? owner : "property" };
}

/** Read-through display facts only; never persist copies into commercial snapshots. */
export async function estimateDisplay(tx: EstimateConnection, companyId: string, estimate: Estimate) {
  const [row] = await tx.select({
    customer: { name: customers.name, street: customers.street, city: customers.city, state: customers.state, zip: customers.zip },
    companyName: settings.companyName, createdByName: users.name,
    ticket: { id: tickets.id, title: tickets.title },
    locationLabel: tickets.locationLabel, locationDescription: tickets.locationDescription,
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
  const addressParts = customer ? [customer.street, [customer.city, customer.state, customer.zip].filter(Boolean).join(" ")].filter(Boolean) : [];
  const propertyAddressLines = addressParts.join("\n");
  const location = resolveEstimateWorkLocation(estimate, row?.ticket ? { label: row.locationLabel, details: row.locationDescription } : null, propertyAddressLines);
  return {
    companyName: row?.companyName || "High Plains Property Maintenance",
    customerName: customer?.name ?? "",
    customerAddress: addressParts.join(", "),
    propertyAddressLines,
    createdByName: row?.createdByName ?? null,
    workLocation: location.text,
    workLocationSource: location.source,
    workLocationInput: location.input,
    ticket: row?.ticket ? { ...row.ticket, status: row.status, shortId: row.ticket.id.slice(0, 8) } : null,
  };
}
