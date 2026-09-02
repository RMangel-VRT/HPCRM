import { type Express, type Request, type Response } from "express";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import type { UserWithContext } from "../auth";
import {
  communications,
  contracts,
  customers,
  ticketLinks,
  ticketTypeStatuses,
  ticketTypes,
  tickets,
  type TicketTypeKey,
} from "@workspace/db";
import {
  findSeededStatus,
  findSeededTicketType,
} from "../shared/ticketCapabilities";

export type QueueBand = "overdue" | "today" | "week";

export type QueueSource =
  | "pending_invoice"
  | "ready_for_billing"
  | "stale_proposal"
  | "blocked_rfp"
  | "unassigned_request"
  | "comm_draft"
  | "comm_followup"
  | "contract_renewal";

export interface ActionQueueItem {
  id: string;
  source: QueueSource;
  band: QueueBand;
  href: string;
  customerName: string | null;
  headline: string;
  ageDays: number;
  verb: string;
  amountCents: null;
  ticketType: {
    name: string;
    typeKey: string | null;
  } | null;
  ticketStatus: {
    name: string;
    statusKey: string | null;
    actionType: "needs_action" | "waiting" | null;
    isFinal: "true" | "false" | null;
  } | null;
  parentTicketId: string | null;
}

export interface ActionQueueResponse {
  items: ActionQueueItem[];
  total: number;
  byFilter: {
    billing: number;
    communications: number;
    estimates: number;
    contracts: number;
    flags: number;
  };
}

type TicketTypeRow = typeof ticketTypes.$inferSelect;
type TicketStatusRow = typeof ticketTypeStatuses.$inferSelect;
type TicketRow = typeof tickets.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;
const FIELD_FACING_ROLES = new Set([
  "field",
  "field_manager",
  "chemical_manager",
  "irrigation_manager",
  "landscape_supervisor",
]);

const SEEDED_TYPE_KEYS: TicketTypeKey[] = [
  "invoice",
  "estimate_request",
  "project",
  "extra_billable",
  "rfp_request",
  "todo",
];

const BAND_ORDER: Record<QueueBand, number> = {
  overdue: 0,
  today: 1,
  week: 2,
};

function authorizeAdminOrOffice(req: Request, res: Response): UserWithContext | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  const user = req.user as UserWithContext;
  if (FIELD_FACING_ROLES.has(user.activeRole)) {
    res.status(403).json({ message: "Insufficient permissions - admin or office role required" });
    return null;
  }
  return user;
}

function ageDaysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

function isOlderThan(date: Date, days: number, now: Date): boolean {
  return date.getTime() < now.getTime() - days * DAY_MS;
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function daysRemaining(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

function ticketIdentity(
  ticketType: TicketTypeRow,
  status: TicketStatusRow,
): Pick<ActionQueueItem, "ticketType" | "ticketStatus"> {
  return {
    ticketType: {
      name: ticketType.name,
      typeKey: ticketType.typeKey ?? null,
    },
    ticketStatus: {
      name: status.name,
      statusKey: status.statusKey ?? null,
      actionType: status.actionType ?? null,
      isFinal: status.isFinal ?? null,
    },
  };
}

function makeTicketItem(args: {
  ticket: TicketRow;
  ticketType: TicketTypeRow;
  status: TicketStatusRow;
  source: QueueSource;
  band: QueueBand;
  verb: string;
  headline: string;
  ageDays: number;
  parentTicketId?: string | null;
}): ActionQueueItem {
  return {
    id: args.ticket.id,
    source: args.source,
    band: args.band,
    href: `/dashboard/tickets/${args.ticket.id}`,
    customerName: null,
    headline: args.headline,
    ageDays: args.ageDays,
    verb: args.verb,
    amountCents: null,
    ...ticketIdentity(args.ticketType, args.status),
    parentTicketId: args.parentTicketId ?? null,
  };
}

function makeNonTicketItem(args: {
  id: string;
  source: QueueSource;
  band: QueueBand;
  href: string;
  headline: string;
  ageDays: number;
  verb: string;
}): ActionQueueItem {
  return {
    id: args.id,
    source: args.source,
    band: args.band,
    href: args.href,
    customerName: null,
    headline: args.headline,
    ageDays: args.ageDays,
    verb: args.verb,
    amountCents: null,
    ticketType: null,
    ticketStatus: null,
    parentTicketId: null,
  };
}

function ticketActivityDate(ticket: TicketRow): Date {
  return ticket.updatedAt ?? ticket.createdAt;
}

function ticketHeadline(ticket: TicketRow, status: TicketStatusRow, date: Date, ageDays: number): string {
  return `${ticket.title} — ${shortDate(date)} — ${ageDays} ${ageDays === 1 ? "day" : "days"} in ${status.name}`;
}

export function registerDashboardQueueRoutes(app: Express): void {
  app.get("/api/dashboard/action-queue", async (req, res) => {
    const user = authorizeAdminOrOffice(req, res);
    if (!user) return;

    try {
      const companyId = user.activeCompanyId;
      const now = new Date();
      const ticketTypeRows = await storage.getTicketTypes(companyId);

      const seededTypes = new Map<TicketTypeKey, TicketTypeRow>();
      for (const typeKey of SEEDED_TYPE_KEYS) {
        const type = findSeededTicketType(ticketTypeRows, typeKey);
        if (type) seededTypes.set(typeKey, type);
      }

      const statusesByTypeKey = new Map<TicketTypeKey, TicketStatusRow[]>();
      const statusRows = await Promise.all(
        [...seededTypes.entries()].map(async ([typeKey, type]) => {
          const statuses = await storage.getTicketTypeStatuses(type.id);
          return [typeKey, statuses] as const;
        }),
      );
      for (const [typeKey, statuses] of statusRows) {
        statusesByTypeKey.set(typeKey, statuses);
      }

      const statusById = new Map<string, TicketStatusRow>();
      const typeById = new Map<string, TicketTypeRow>();
      const statusIds: string[] = [];
      const statusIdsByKey = new Map<string, Set<string>>();
      const addStatus = (status: TicketStatusRow | undefined, statusKey: string) => {
        if (!status) return;
        statusById.set(status.id, status);
        statusIds.push(status.id);
        const ids = statusIdsByKey.get(statusKey) ?? new Set<string>();
        ids.add(status.id);
        statusIdsByKey.set(statusKey, ids);
      };

      for (const [typeKey, type] of seededTypes) {
        typeById.set(type.id, type);
        const statuses = statusesByTypeKey.get(typeKey) ?? [];
        for (const status of statuses) {
          statusById.set(status.id, status);
        }
        for (const statusKey of [
          "pending_invoice",
          "ready_for_billing",
          "proposal_sent",
          "awaiting_response",
          "maps_requested",
          "waiting_info",
          "new",
        ]) {
          addStatus(findSeededStatus(statuses, statusKey), statusKey);
        }
      }

      const ticketRows =
        statusIds.length > 0
          ? await db
              .select()
              .from(tickets)
              .where(and(eq(tickets.companyId, companyId), inArray(tickets.currentStatusId, statusIds)))
          : [];

      const communicationsRowsPromise = db
        .select({
          id: communications.id,
          customerId: communications.customerId,
          subject: communications.subject,
          createdAt: communications.createdAt,
          updatedAt: communications.updatedAt,
          followUpDueAt: communications.followUpDueAt,
          followUpStatus: communications.followUpStatus,
          status: communications.status,
        })
        .from(communications)
        .where(and(
          eq(communications.companyId, companyId),
          isNull(communications.deletedAt),
          or(
            eq(communications.status, "draft"),
            and(
              inArray(communications.followUpStatus, ["open", "snoozed"]),
              sql`${communications.followUpDueAt} < NOW()`,
            ),
          ),
        ));

      const contractsRowsPromise = db
        .select({
          id: contracts.id,
          customerId: contracts.customerId,
          endDate: contracts.endDate,
          createdAt: contracts.createdAt,
          updatedAt: contracts.updatedAt,
        })
        .from(contracts)
        .where(and(
          eq(contracts.companyId, companyId),
          eq(contracts.status, "active"),
          gte(contracts.endDate, now),
          lte(contracts.endDate, new Date(now.getTime() + 60 * DAY_MS)),
        ));

      const pendingTicketIds = ticketRows
        .filter((ticket) => {
          const type = typeById.get(ticket.ticketTypeId);
          const status = statusById.get(ticket.currentStatusId);
          return type?.typeKey === "invoice" && status?.statusKey === "pending_invoice";
        })
        .map((ticket) => ticket.id);
      const readyTicketIds = ticketRows
        .filter((ticket) => statusById.get(ticket.currentStatusId)?.statusKey === "ready_for_billing")
        .map((ticket) => ticket.id);
      const readyTicketIdSet = new Set(readyTicketIds);

      // ticket_links has no company column. Its target IDs come exclusively from
      // the company-scoped pending ticket query above, or its source IDs come
      // from company-scoped ready-for-billing tickets. Parent IDs are exposed
      // only after matching a ticket from the same company-scoped ticket set.
      const invoiceLinksPromise =
        pendingTicketIds.length > 0 || readyTicketIds.length > 0
          ? db
              .select()
              .from(ticketLinks)
              .where(and(
                eq(ticketLinks.linkType, "invoice_for"),
                or(
                  pendingTicketIds.length > 0
                    ? inArray(ticketLinks.targetTicketId, pendingTicketIds)
                    : sql`false`,
                  readyTicketIds.length > 0
                    ? inArray(ticketLinks.sourceTicketId, readyTicketIds)
                    : sql`false`,
                ),
              ))
          : Promise.resolve([]);

      const [communicationsRows, contractsRows, invoiceLinks] = await Promise.all([
        communicationsRowsPromise,
        contractsRowsPromise,
        invoiceLinksPromise,
      ]);

      const companyTicketIds = new Set(ticketRows.map((ticket) => ticket.id));
      const linksByInvoiceId = new Map<string, string>();
      const linkedReadyParentIds = new Set<string>();
      for (const link of invoiceLinks) {
        if (companyTicketIds.has(link.sourceTicketId) && !linksByInvoiceId.has(link.targetTicketId)) {
          linksByInvoiceId.set(link.targetTicketId, link.sourceTicketId);
        }
        if (readyTicketIdSet.has(link.sourceTicketId)) {
          linkedReadyParentIds.add(link.sourceTicketId);
        }
      }

      const readyParentIds = new Set<string>();
      for (const ticket of ticketRows) {
        const status = statusById.get(ticket.currentStatusId);
        if (status?.statusKey !== "ready_for_billing") continue;
        if (linkedReadyParentIds.has(ticket.id)) {
          readyParentIds.add(ticket.id);
        }
      }

      const items: ActionQueueItem[] = [];
      for (const ticket of ticketRows) {
        const type = typeById.get(ticket.ticketTypeId);
        const status = statusById.get(ticket.currentStatusId);
        if (!type || !status || !status.statusKey) continue;

        const date = ticketActivityDate(ticket);
        const ageDays = ageDaysSince(date, now);
        let source: QueueSource | null = null;
        let band: QueueBand = "week";
        let verb = "Open";

        if (type.typeKey === "invoice" && status.statusKey === "pending_invoice") {
          source = "pending_invoice";
          band = isOlderThan(date, 7, now) ? "overdue" : "today";
          verb = "Approve & sync";
        } else if (status.statusKey === "ready_for_billing") {
          // A linked parent is represented by its pending-invoice child. A
          // stranded parent remains navigable, but cannot claim invoice creation.
          if (readyParentIds.has(ticket.id)) continue;
          source = "ready_for_billing";
          band = isOlderThan(date, 7, now) ? "overdue" : "today";
          verb = "Open";
        } else if (status.statusKey === "proposal_sent" || status.statusKey === "awaiting_response") {
          if (!isOlderThan(date, 10, now)) continue;
          source = "stale_proposal";
          band = "overdue";
          verb = "Send follow-up";
        } else if (
          type.typeKey === "rfp_request" &&
          (status.statusKey === "maps_requested" || status.statusKey === "waiting_info")
        ) {
          if (!isOlderThan(date, 5, now)) continue;
          source = "blocked_rfp";
          band = "today";
          verb = "Nudge";
        } else if (status.statusKey === "new" && ticket.assignedToId == null) {
          source = "unassigned_request";
          band = "today";
          verb = "Assign";
        }

        if (!source) continue;
        const parentTicketId = source === "pending_invoice"
          ? linksByInvoiceId.get(ticket.id) ?? null
          : null;
        items.push(makeTicketItem({
          ticket,
          ticketType: type,
          status,
          source,
          band,
          verb,
          headline: ticketHeadline(ticket, status, date, ageDays),
          ageDays,
          parentTicketId,
        }));
      }

      for (const communication of communicationsRows) {
        const date = communication.followUpDueAt && communication.followUpStatus !== "none"
          ? communication.followUpDueAt
          : communication.updatedAt ?? communication.createdAt;
        const ageDays = ageDaysSince(date, now);
        const isFollowUp =
          communication.followUpStatus === "open" || communication.followUpStatus === "snoozed";
        const isDraft = communication.status === "draft";
        if (isFollowUp) {
          items.push(makeNonTicketItem({
            id: communication.id,
            source: "comm_followup",
            band: "overdue",
            href: `/dashboard/communications/${communication.id}`,
            headline: `${communication.subject} — follow-up was due ${shortDate(date)}`,
            ageDays,
            verb: "Follow up",
          }));
        } else if (isDraft) {
          items.push(makeNonTicketItem({
            id: communication.id,
            source: "comm_draft",
            band: isOlderThan(date, 3, now) ? "overdue" : "week",
            href: `/dashboard/communications/${communication.id}`,
            headline: `${communication.subject} — draft from ${shortDate(date)}`,
            ageDays,
            verb: "Review draft",
          }));
        }
      }

      for (const contract of contractsRows) {
        if (!contract.endDate) continue;
        const renewalDays = daysRemaining(contract.endDate, now);
        items.push(makeNonTicketItem({
          id: contract.id,
          source: "contract_renewal",
          band: renewalDays <= 30 ? "overdue" : "week",
          href: `/dashboard/contracts/${contract.id}`,
          headline: `Contract renewal due ${shortDate(contract.endDate)} — ${renewalDays} days remaining`,
          ageDays: Math.max(0, 60 - renewalDays),
          verb: "Start renewal",
        }));
      }

      const customerIds = [...new Set([
        ...ticketRows.map((ticket) => ticket.customerId),
        ...communicationsRows.map((communication) => communication.customerId),
        ...contractsRows.map((contract) => contract.customerId),
      ].filter((id): id is string => Boolean(id)))];
      const customerRows = customerIds.length > 0
        ? await db
            .select({ id: customers.id, name: customers.name })
            .from(customers)
            .where(and(eq(customers.companyId, companyId), inArray(customers.id, customerIds)))
        : [];
      const customerNames = new Map(customerRows.map((customer) => [customer.id, customer.name]));
      const ticketsById = new Map(ticketRows.map((ticket) => [ticket.id, ticket]));
      const communicationsById = new Map(communicationsRows.map((communication) => [communication.id, communication]));
      const contractsById = new Map(contractsRows.map((contract) => [contract.id, contract]));

      for (const item of items) {
        if (item.ticketType) {
          const ticket = ticketsById.get(item.id);
          item.customerName = ticket?.customerId ? customerNames.get(ticket.customerId) ?? null : null;
        } else if (item.source === "comm_draft" || item.source === "comm_followup") {
          const communication = communicationsById.get(item.id);
          item.customerName = communication?.customerId
            ? customerNames.get(communication.customerId) ?? null
            : null;
        } else if (item.source === "contract_renewal") {
          const contract = contractsById.get(item.id);
          item.customerName = contract?.customerId
            ? customerNames.get(contract.customerId) ?? null
            : null;
        }
      }

      items.sort((a, b) =>
        BAND_ORDER[a.band] - BAND_ORDER[b.band]
        || b.ageDays - a.ageDays
        || a.id.localeCompare(b.id),
      );

      const byFilter = {
        billing: items.filter((item) => item.source === "pending_invoice" || item.source === "ready_for_billing").length,
        communications: items.filter((item) => item.source === "comm_draft" || item.source === "comm_followup").length,
        estimates: items.filter((item) => item.source === "stale_proposal" || item.source === "unassigned_request").length,
        contracts: items.filter((item) => item.source === "contract_renewal").length,
        flags: 0,
      };

      res.json({
        items,
        total: items.length,
        byFilter,
      } satisfies ActionQueueResponse);
    } catch (error) {
      // Keep the normal Express error middleware responsible for logging while
      // ensuring a failed query never returns a misleading partial payload.
      res.status(500).json({ message: "Unable to load dashboard action queue" });
    }
  });
}