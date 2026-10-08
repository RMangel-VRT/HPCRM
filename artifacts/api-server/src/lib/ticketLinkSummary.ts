import { and, eq, inArray, or } from "drizzle-orm";
import { ticketLinks } from "@workspace/db";
import { db } from "../db";
import { storage } from "../storage";
import { isSeededTicketType } from "../shared/ticketCapabilities";

export interface TicketLinkSummary {
  invoices: Array<{
    id: string; title: string; statusKey: string | null; statusName: string; isFinal: boolean;
  }>;
  parent: { id: string; title: string; typeKey: string | null; typeName: string } | null;
}

/**
 * Four bulk operations, independent of list size. The existing all-statuses
 * storage method uses two SQL reads, so the total SQL budget is at most five.
 * Links have no company scope.
 */
export async function getInvoiceLinkSummaries(
  companyId: string, ticketIds: string[],
): Promise<Map<string, TicketLinkSummary>> {
  const summaries = new Map<string, TicketLinkSummary>(
    ticketIds.map(id => [id, { invoices: [], parent: null }]),
  );
  if (summaries.size === 0) return summaries;

  const ids = [...summaries.keys()];
  const links = await db.select().from(ticketLinks).where(and(
    eq(ticketLinks.linkType, "invoice_for"),
    or(inArray(ticketLinks.sourceTicketId, ids), inArray(ticketLinks.targetTicketId, ids)),
  ));
  const counterpartIds = new Set<string>();
  for (const link of links) {
    if (summaries.has(link.sourceTicketId)) counterpartIds.add(link.targetTicketId);
    if (summaries.has(link.targetTicketId)) counterpartIds.add(link.sourceTicketId);
  }
  const [counterparts, statuses, types] = await Promise.all([
    storage.getTicketsByIds([...counterpartIds], companyId),
    storage.getAllTicketTypeStatuses(companyId),
    storage.getTicketTypes(companyId),
  ]);
  // Defense in depth: never expose a foreign ticket even if a storage adapter regresses.
  const ticketMap = new Map(counterparts.filter(t => t.companyId === companyId).map(t => [t.id, t]));
  const statusMap = new Map(statuses.map(s => [s.id, s]));
  const typeMap = new Map(types.map(t => [t.id, t]));
  for (const link of links) {
    const sourceSummary = summaries.get(link.sourceTicketId);
    const invoice = ticketMap.get(link.targetTicketId);
    if (sourceSummary && invoice && isSeededTicketType(typeMap.get(invoice.ticketTypeId), "invoice")) {
      const status = statusMap.get(invoice.currentStatusId);
      if (!sourceSummary.invoices.some(i => i.id === invoice.id)) {
        sourceSummary.invoices.push({
          id: invoice.id, title: invoice.title, statusKey: status?.statusKey ?? null,
          statusName: status?.name ?? "Unknown", isFinal: status?.isFinal === "true",
        });
      }
    }
    const targetSummary = summaries.get(link.targetTicketId);
    const parent = ticketMap.get(link.sourceTicketId);
    if (targetSummary && parent) {
      const type = typeMap.get(parent.ticketTypeId);
      targetSummary.parent = {
        id: parent.id, title: parent.title, typeKey: type?.typeKey ?? null,
        typeName: type?.name ?? "Unknown",
      };
    }
  }
  return summaries;
}

export async function withInvoiceLinkSummaries<T extends { id: string }>(
  companyId: string, tickets: T[],
): Promise<Array<T & { linkSummary: TicketLinkSummary }>> {
  const summaries = await getInvoiceLinkSummaries(companyId, tickets.map(t => t.id));
  return tickets.map(ticket => ({ ...ticket, linkSummary: summaries.get(ticket.id)! }));
}
