import { type Express, type Request, type Response } from "express";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../db";
import { storage } from "../storage";
import type { UserWithContext } from "../auth";
import {
  communications,
  contracts,
  crews,
  customers,
  seasons,
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

export interface QueueAction {
  kind: "patch";
  method: "PATCH";
  endpoint: string;
  payload: Record<string, unknown>;
  undoPayload: Record<string, unknown>;
  optimistic: "remove";
  confirmation?: {
    title: string;
    description: string;
    confirmLabel: string;
  };
}

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
  action: QueueAction | null;
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

export interface PulseResponse {
  stats: {
    customersCount: number;
    activeContractsCount: number;
    monthlyRevenue: number;
    ytdRevenue: number;
  };
  revenue: {
    year: number;
    months: number[];
    priorYear: number;
    priorMonths: number[];
  };
  unbilledTicketCount: number;
  avgDaysCloseToInvoice: number | null;
  activeSeason: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
  } | null;
  nextSeason: {
    id: string;
    name: string;
    startDate: string | null;
  } | null;
  snowBook: {
    activeSnowContracts: number;
    expiringBeforeSeasonStart: number;
  };
  renewals: Array<{
    contractId: string;
    customerId: string;
    customerName: string;
    serviceType: string;
    endDate: string;
    daysUntilExpiry: number;
  }>;
  crewsToday: Array<{
    crewId: string;
    crewName: string;
    stops: number;
    complete: number;
    flagged: number;
  }>;
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

const PULSE_TYPE_KEYS: TicketTypeKey[] = [
  "estimate_request",
  "project",
  "extra_billable",
  "invoice",
];

const READY_FOR_BILLING_TYPE_KEYS: TicketTypeKey[] = [
  "estimate_request",
  "project",
  "extra_billable",
];

type DateLike = Date | string | null;

function dateOnly(value: DateLike): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function serializedDate(value: DateLike): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function utcDayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    start,
    end: new Date(start.getTime() + DAY_MS),
  };
}

function denseRevenueMonths(rows: Array<{ month: string; revenue: number }>): number[] {
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const values = Array.from({ length: 12 }, () => 0);
  for (const row of rows) {
    const label = String(row.month).trim().toLowerCase();
    const monthIndex = monthNames.indexOf(label.slice(0, 3));
    const numericMonth = Number(label);
    const index = monthIndex >= 0 ? monthIndex : numericMonth >= 1 && numericMonth <= 12 ? numericMonth - 1 : -1;
    if (index >= 0) values[index] = Number(row.revenue) || 0;
  }
  return values;
}

async function getPulseTicketTypeContext(companyId: string): Promise<{
  invoiceTypeId: string | null;
  readyStatusIds: string[];
}> {
  const ticketTypeRows = await storage.getTicketTypes(companyId);
  const typesByKey = new Map<TicketTypeKey, TicketTypeRow>();
  for (const typeKey of PULSE_TYPE_KEYS) {
    const type = findSeededTicketType(ticketTypeRows, typeKey);
    if (type) typesByKey.set(typeKey, type);
  }

  const statusRows = await Promise.all(
    [...typesByKey.entries()].map(async ([typeKey, type]) => {
      const statuses = await storage.getTicketTypeStatuses(type.id);
      return [typeKey, statuses] as const;
    }),
  );

  const readyStatusIds: string[] = [];
  for (const [typeKey, statuses] of statusRows) {
    if (READY_FOR_BILLING_TYPE_KEYS.includes(typeKey)) {
      const readyStatus = findSeededStatus(statuses, "ready_for_billing");
      if (readyStatus) readyStatusIds.push(readyStatus.id);
    }
  }

  return {
    invoiceTypeId: typesByKey.get("invoice")?.id ?? null,
    readyStatusIds,
  };
}

function averageCloseToInvoiceDays(
  invoiceRows: Array<{ id: string; createdAt: Date }>,
  links: Array<{
    sourceTicketId: string;
    targetTicketId: string;
    workCompletedDate: Date | null;
  }>,
): number | null {
  const createdAtByInvoiceId = new Map(invoiceRows.map((invoice) => [invoice.id, invoice.createdAt]));
  const durations: number[] = [];
  for (const link of links) {
    const invoiceCreatedAt = createdAtByInvoiceId.get(link.targetTicketId);
    const workCompletedDate = link.workCompletedDate;
    if (!invoiceCreatedAt || !workCompletedDate) continue;
    durations.push((invoiceCreatedAt.getTime() - workCompletedDate.getTime()) / DAY_MS);
  }
  return durations.length > 0
    ? durations.reduce((total, duration) => total + duration, 0) / durations.length
    : null;
}

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
  action?: QueueAction | null;
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
    action: args.action ?? null,
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
  action?: QueueAction | null;
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
    action: args.action ?? null,
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
        let action: QueueAction | null = null;

        if (type.typeKey === "invoice" && status.statusKey === "pending_invoice") {
          source = "pending_invoice";
          band = isOlderThan(date, 7, now) ? "overdue" : "today";
          const invoicedStatus = findSeededStatus(
            statusesByTypeKey.get("invoice") ?? [],
            "invoiced",
          );
          if (invoicedStatus) {
            verb = "Mark invoiced";
            action = {
              kind: "patch",
              method: "PATCH",
              endpoint: `/api/tickets/${ticket.id}`,
              payload: { currentStatusId: invoicedStatus.id },
              undoPayload: { currentStatusId: ticket.currentStatusId },
              optimistic: "remove",
              confirmation: {
                title: "Mark invoice as invoiced?",
                description: "This changes the ticket status only. It does not create or sync an invoice in QuickBooks.",
                confirmLabel: "Mark invoiced",
              },
            };
          }
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
          verb = "Assign to me";
          action = {
            kind: "patch",
            method: "PATCH",
            endpoint: `/api/tickets/${ticket.id}`,
            payload: { assignedToId: user.id },
            undoPayload: { assignedToId: null },
            optimistic: "remove",
          };
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
          action,
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
            verb: "Mark done",
            action: {
              kind: "patch",
              method: "PATCH",
              endpoint: `/api/communications/${communication.id}`,
              payload: { followUpStatus: "done" },
              undoPayload: {
                followUpStatus: communication.followUpStatus,
                followUpDueAt: serializedDate(communication.followUpDueAt),
              },
              optimistic: "remove",
            },
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

  app.get("/api/dashboard/pulse", async (req, res) => {
    const user = authorizeAdminOrOffice(req, res);
    if (!user) return;

    try {
      const companyId = user.activeCompanyId;
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;
      const { start: todayStart, end: tomorrowStart } = utcDayBounds(now);
      const { invoiceTypeId, readyStatusIds } = await getPulseTicketTypeContext(companyId);

      const [
        stats,
        currentRevenue,
        priorRevenue,
        renewals,
        seasonRows,
        snowContractRows,
        unbilledRows,
        crewRows,
      ] = await Promise.all([
        storage.getDashboardStats(companyId, month, year),
        storage.getMonthlyRevenueData(companyId, year),
        storage.getMonthlyRevenueData(companyId, year - 1),
        storage.getUpcomingRenewals(companyId, 60),
        db
          .select({
            id: seasons.id,
            name: seasons.name,
            startDate: seasons.startDate,
            endDate: seasons.endDate,
          })
          .from(seasons)
          .where(eq(seasons.companyId, companyId)),
        db
          .select({ endDate: contracts.endDate })
          .from(contracts)
          .where(and(
            eq(contracts.companyId, companyId),
            eq(contracts.serviceType, "Snow"),
            eq(contracts.status, "active"),
          )),
        readyStatusIds.length > 0
          ? db
              .select({ count: sql<number>`count(*)::int` })
              .from(tickets)
              .where(and(
                eq(tickets.companyId, companyId),
                inArray(tickets.currentStatusId, readyStatusIds),
              ))
          : Promise.resolve([{ count: 0 }]),
        db
          .select({
            crewId: tickets.crewId,
            crewName: crews.name,
            stops: sql<number>`count(*)::int`,
            complete: sql<number>`count(*) FILTER (WHERE ${tickets.mobileStatus} = 'complete')::int`,
            flagged: sql<number>`count(*) FILTER (WHERE ${tickets.mobileStatus} = 'flagged')::int`,
          })
          .from(tickets)
          .innerJoin(crews, eq(tickets.crewId, crews.id))
          .where(and(
            eq(tickets.companyId, companyId),
            isNotNull(tickets.crewId),
            gte(tickets.dueDate, todayStart),
            lt(tickets.dueDate, tomorrowStart),
            eq(crews.companyId, companyId),
          ))
          .groupBy(tickets.crewId, crews.name)
          .orderBy(asc(crews.name)),
      ]);

      let avgDaysCloseToInvoice: number | null = null;
      if (invoiceTypeId) {
        const sourceTickets = alias(tickets, "invoice_source_tickets");
        const invoiceRows = await db
          .select({
            id: tickets.id,
            createdAt: tickets.createdAt,
          })
          .from(tickets)
          .where(and(
            eq(tickets.companyId, companyId),
            eq(tickets.ticketTypeId, invoiceTypeId),
            gte(tickets.createdAt, new Date(now.getTime() - 90 * DAY_MS)),
          ));
        const invoiceIds = invoiceRows.map((invoice) => invoice.id);
        if (invoiceIds.length > 0) {
          const invoiceLinks = await db
            .select({
              sourceTicketId: ticketLinks.sourceTicketId,
              targetTicketId: ticketLinks.targetTicketId,
              workCompletedDate: sourceTickets.workCompletedDate,
            })
            .from(ticketLinks)
            .innerJoin(sourceTickets, eq(ticketLinks.sourceTicketId, sourceTickets.id))
            .where(and(
              eq(ticketLinks.linkType, "invoice_for"),
              inArray(ticketLinks.targetTicketId, invoiceIds),
              eq(sourceTickets.companyId, companyId),
              isNotNull(sourceTickets.workCompletedDate),
            ));
          avgDaysCloseToInvoice = averageCloseToInvoiceDays(
            invoiceRows,
            invoiceLinks,
          );
        }
      }

      const today = todayStart.toISOString().slice(0, 10);
      const activeSeasons = seasonRows
        .filter((season) => {
          const startDate = dateOnly(season.startDate);
          const endDate = dateOnly(season.endDate);
          return startDate != null && endDate != null && startDate <= today && endDate >= today;
        })
        .sort((a, b) => (dateOnly(b.startDate) ?? "").localeCompare(dateOnly(a.startDate) ?? ""));
      const nextSeasons = seasonRows
        .filter((season) => {
          const startDate = dateOnly(season.startDate);
          return startDate != null && startDate > today;
        })
        .sort((a, b) => (dateOnly(a.startDate) ?? "").localeCompare(dateOnly(b.startDate) ?? ""));
      const activeSeasonRow = activeSeasons[0];
      const nextSeasonRow = nextSeasons[0];
      const nextSeasonStartDate = nextSeasonRow ? dateOnly(nextSeasonRow.startDate) : null;
      const snowRenewalCutoff = nextSeasonStartDate ?? `${year}-11-01`;

      res.json({
        stats: {
          customersCount: stats.customersCount,
          activeContractsCount: stats.activeContractsCount,
          monthlyRevenue: stats.monthlyRevenue,
          ytdRevenue: stats.ytdRevenue,
        },
        revenue: {
          year,
          months: denseRevenueMonths(currentRevenue),
          priorYear: year - 1,
          priorMonths: denseRevenueMonths(priorRevenue),
        },
        unbilledTicketCount: Number(unbilledRows[0]?.count) || 0,
        avgDaysCloseToInvoice,
        activeSeason: activeSeasonRow
          ? {
              id: activeSeasonRow.id,
              name: activeSeasonRow.name,
              startDate: serializedDate(activeSeasonRow.startDate),
              endDate: serializedDate(activeSeasonRow.endDate),
            }
          : null,
        nextSeason: nextSeasonRow
          ? {
              id: nextSeasonRow.id,
              name: nextSeasonRow.name,
              startDate: serializedDate(nextSeasonRow.startDate),
            }
          : null,
        snowBook: {
          activeSnowContracts: snowContractRows.length,
          expiringBeforeSeasonStart: snowContractRows.filter((contract) => {
            const endDate = dateOnly(contract.endDate);
            return endDate != null && endDate < snowRenewalCutoff;
          }).length,
        },
        renewals: renewals.map((renewal) => ({
          contractId: renewal.contractId,
          customerId: renewal.customerId,
          customerName: renewal.customerName,
          serviceType: renewal.serviceType,
          endDate: renewal.endDate.toISOString(),
          daysUntilExpiry: renewal.daysUntilExpiry,
        })),
        crewsToday: crewRows.map((crew) => ({
          crewId: crew.crewId!,
          crewName: crew.crewName,
          stops: Number(crew.stops) || 0,
          complete: Number(crew.complete) || 0,
          flagged: Number(crew.flagged) || 0,
        })),
      } satisfies PulseResponse);
    } catch (error) {
      res.status(500).json({ message: "Unable to load dashboard pulse" });
    }
  });
}