import type { Express } from "express";
import { and, eq, inArray, or, isNull, gte, lt, ne } from "drizzle-orm";
import { companyUsers, customers, tickets, ticketLinks, users, type TicketLink } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import { findSeededStatus, findSeededTicketType, isSeededStatus } from "../shared/ticketCapabilities";
import { localDateString } from "../lib/scheduleBy";
import { canSeeBilling, isStrandedEligible } from "../lib/billing";
import { addCalendarDays, companyDayBounds, companyToday } from "../lib/companyDay";

/** Thirty Colorado calendar dates including today, half-open at tomorrow midnight. */
export function recentInvoiceBounds(now = new Date()) {
  const today = companyToday(now);
  return { start: companyDayBounds(addCalendarDays(today, -29)).start, end: companyDayBounds(today).end };
}

export function invoiceAgeDays(base: Date, now = new Date()): number {
  // Project exactly once; UTC day numbers preserve calendar age across DST.
  const dayNumber = (date: Date) => Date.parse(`${localDateString(date)}T00:00:00Z`) / 86_400_000;
  return dayNumber(now) - dayNumber(base);
}

export function registerPendingInvoicesRoute(app: Express): void {
  app.get("/api/pending-invoices", async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).send("Not authenticated");
      return;
    }
    const user = req.user as UserWithContext;
    if (!canSeeBilling(user)) {
      res.status(403).send("Billing access required");
      return;
    }
    if ((req.query.scope && !["mine", "all"].includes(String(req.query.scope)))
      || (req.query.view && !["waiting", "recent"].includes(String(req.query.view)))) {
      res.status(400).send("Invalid billing scope or view");
      return;
    }
    const mine = req.query.scope === "mine";
    const recent = req.query.view === "recent";
    const now = new Date();
    const ticketTypes = await storage.getTicketTypes(user.activeCompanyId);
    const invoiceType = findSeededTicketType(ticketTypes, "invoice");
    const statuses = await storage.getTicketTypeStatusesByTypeIds(ticketTypes.map(type => type.id));
    const invoiceStatuses = statuses.filter(status => status.ticketTypeId === invoiceType?.id);
    const pendingStatus = findSeededStatus(invoiceStatuses, "pending_invoice");
    if (!ticketTypes.length) {
      res.json([]);
      return;
    }
    const bounds = recentInvoiceBounds(now);
    const finalIds = invoiceStatuses.filter(status => status.isFinal === "true").map(status => status.id);
    // Deliberately independent of getTickets' general-purpose 500-row cap.
    const pendingInvoices = invoiceType && (recent ? finalIds.length : pendingStatus)
      ? await db.select().from(tickets).where(and(
      eq(tickets.companyId, user.activeCompanyId),
      eq(tickets.ticketTypeId, invoiceType.id),
      recent ? inArray(tickets.currentStatusId, finalIds) : eq(tickets.currentStatusId, pendingStatus!.id),
      mine ? or(eq(tickets.assignedToId, user.id), isNull(tickets.assignedToId)) : undefined,
      recent ? gte(tickets.completedAt, bounds.start) : undefined,
      recent ? lt(tickets.completedAt, bounds.end) : undefined,
    )) : [];
    const typeMap = new Map(ticketTypes.map(type => [type.id, type]));
    const rfbIds = statuses.filter(status => isSeededStatus(status, "ready_for_billing")).map(status => status.id);
    const rfbJobs = !recent && rfbIds.length ? (await db.select().from(tickets).where(and(
      eq(tickets.companyId, user.activeCompanyId),
      inArray(tickets.currentStatusId, rfbIds),
      invoiceType ? ne(tickets.ticketTypeId, invoiceType.id) : undefined,
    ))).filter(ticket => isStrandedEligible(ticket, typeMap.get(ticket.ticketTypeId))) : [];
    const invoiceIds = pendingInvoices.map(ticket => ticket.id);
    const jobIds = rfbJobs.map(ticket => ticket.id);
    const customerIds = [...new Set([...pendingInvoices, ...rfbJobs].flatMap(ticket => ticket.customerId ? [ticket.customerId] : []))];
    const [rawLinks, allCustomers] = await Promise.all([
      invoiceIds.length || jobIds.length ? db.select().from(ticketLinks).where(and(
        or(invoiceIds.length ? inArray(ticketLinks.targetTicketId, invoiceIds) : undefined,
          jobIds.length ? inArray(ticketLinks.sourceTicketId, jobIds) : undefined),
        eq(ticketLinks.linkType, "invoice_for"),
      )) : Promise.resolve([]),
      customerIds.length ? db.select().from(customers).where(and(
        inArray(customers.id, customerIds), eq(customers.companyId, user.activeCompanyId),
      )) : Promise.resolve([]),
    ]);
    const links = rawLinks as TicketLink[];
    // ticket_links has no company_id; never trust a link without scoped tickets.
    const sources = await storage.getTicketsByIds([...new Set(links.flatMap(link => [link.sourceTicketId, link.targetTicketId]))], user.activeCompanyId);
    const sourceMap = new Map(sources.map(ticket => [ticket.id, ticket]));
    const jobsWithInvoice = new Set(links.filter(link => {
      const target = sourceMap.get(link.targetTicketId);
      return target && target.ticketTypeId === invoiceType?.id;
    }).map(link => link.sourceTicketId));
    const stranded = rfbJobs.filter(ticket => !jobsWithInvoice.has(ticket.id));
    const customerMap = new Map(allCustomers.map(customer => [customer.id, customer]));
    const sourceByInvoice = new Map(links.map(link => [link.targetTicketId, sourceMap.get(link.sourceTicketId)]));
    const assignedIds = [...new Set([...pendingInvoices, ...stranded].map(ticket => ticket.assignedToId).filter((id): id is string => !!id))];
    // Supply just the names needed by authorized charge rows; do not widen
    // administrative membership-directory access for tagged field users.
    const assignees = assignedIds.length ? await db.select({ id: users.id, name: users.name })
      .from(companyUsers).innerJoin(users, eq(companyUsers.userId, users.id))
      .where(and(eq(companyUsers.companyId, user.activeCompanyId), inArray(companyUsers.userId, assignedIds))) : [];
    const assigneeNames = new Map(assignees.map(assignee => [assignee.id, assignee.name]));
    const rows = [
      ...pendingInvoices.map(ticket => ({ ticket, kind: "invoice" as const })),
      ...stranded.map(ticket => ({ ticket, kind: "stranded" as const })),
    ].map(({ ticket, kind }) => {
      const source = kind === "stranded" ? ticket : sourceByInvoice.get(ticket.id);
      const sourceType = source ? typeMap.get(source.ticketTypeId) : undefined;
      return {
        ...ticket,
        kind,
        assigneeName: ticket.assignedToId ? assigneeNames.get(ticket.assignedToId) ?? null : null,
        invoiceCategory: kind === "stranded" ? null : ticket.invoiceCategory,
        customer: ticket.customerId ? customerMap.get(ticket.customerId) ?? null : null,
        sourceTicket: source ? { ...source, typeKey: sourceType?.typeKey ?? null, typeName: sourceType?.name ?? "Unknown" } : null,
        ticketTypeName: typeMap.get(ticket.ticketTypeId)?.name ?? "Unknown",
        ageDays: invoiceAgeDays(ticket.workCompletedDate ?? ticket.createdAt, now),
      };
    });
    if (recent) rows.sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime() || a.id.localeCompare(b.id));
    res.json(rows);
  });
}
