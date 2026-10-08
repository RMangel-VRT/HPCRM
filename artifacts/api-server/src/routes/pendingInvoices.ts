import type { Express } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { customers, tickets, ticketLinks } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import { findSeededStatus, findSeededTicketType } from "../shared/ticketCapabilities";
import { localDateString } from "../lib/scheduleBy";

export function invoiceAgeDays(base: Date, now = new Date()): number {
  // Hosts can run in UTC. Project each instant onto Colorado's calendar before
  // using the shared local-day formatter; UTC day numbers avoid DST-length days.
  const dayNumber = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver", year: "numeric", month: "numeric", day: "numeric",
    }).formatToParts(date);
    const value = (name: string) => Number(parts.find(part => part.type === name)!.value);
    const day = localDateString(new Date(value("year"), value("month") - 1, value("day"), 12));
    return Date.parse(`${day}T00:00:00Z`) / 86_400_000;
  };
  return dayNumber(now) - dayNumber(base);
}

export function registerPendingInvoicesRoute(app: Express): void {
  app.get("/api/pending-invoices", async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).send("Not authenticated");
      return;
    }
    const user = req.user as UserWithContext;
    if (user.activeRole !== "admin" && user.activeRole !== "office") {
      res.status(403).send("Insufficient permissions - admin or office role required");
      return;
    }
    const ticketTypes = await storage.getTicketTypes(user.activeCompanyId);
    const invoiceType = findSeededTicketType(ticketTypes, "invoice");
    const pendingStatus = invoiceType
      ? findSeededStatus(await storage.getTicketTypeStatuses(invoiceType.id), "pending_invoice")
      : undefined;
    if (!invoiceType || !pendingStatus) {
      res.json([]);
      return;
    }
    // Deliberately independent of getTickets' general-purpose 500-row cap.
    const pendingInvoices = await db.select().from(tickets).where(and(
      eq(tickets.companyId, user.activeCompanyId),
      eq(tickets.ticketTypeId, invoiceType.id),
      eq(tickets.currentStatusId, pendingStatus.id),
    ));
    const invoiceIds = pendingInvoices.map(ticket => ticket.id);
    const customerIds = [...new Set(pendingInvoices.flatMap(ticket => ticket.customerId ? [ticket.customerId] : []))];
    const [links, allCustomers] = await Promise.all([
      invoiceIds.length ? db.select().from(ticketLinks).where(and(
        inArray(ticketLinks.targetTicketId, invoiceIds), eq(ticketLinks.linkType, "invoice_for"),
      )) : Promise.resolve([]),
      customerIds.length ? db.select().from(customers).where(and(
        inArray(customers.id, customerIds), eq(customers.companyId, user.activeCompanyId),
      )) : Promise.resolve([]),
    ]);
    // ticket_links has no company_id; never trust a link without scoped tickets.
    const sources = await storage.getTicketsByIds([...new Set(links.map(link => link.sourceTicketId))], user.activeCompanyId);
    const sourceMap = new Map(sources.map(ticket => [ticket.id, ticket]));
    const customerMap = new Map(allCustomers.map(customer => [customer.id, customer]));
    const sourceByInvoice = new Map(links.map(link => [link.targetTicketId, sourceMap.get(link.sourceTicketId)]));
    const typeMap = new Map(ticketTypes.map(type => [type.id, type]));
    const now = new Date();
    res.json(pendingInvoices.map(ticket => {
      const source = sourceByInvoice.get(ticket.id);
      const sourceType = source ? typeMap.get(source.ticketTypeId) : undefined;
      return {
        ...ticket,
        customer: ticket.customerId ? customerMap.get(ticket.customerId) ?? null : null,
        sourceTicket: source ? { ...source, typeKey: sourceType?.typeKey ?? null, typeName: sourceType?.name ?? "Unknown" } : null,
        ticketTypeName: typeMap.get(ticket.ticketTypeId)?.name ?? "Unknown",
        ageDays: invoiceAgeDays(ticket.workCompletedDate ?? ticket.createdAt, now),
      };
    }));
  });
}
