import { type Express, type Request, type Response } from "express";
import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { storage } from "../storage";
import type { UserWithContext } from "../auth";
import { contracts, crews, seasons, ticketLinks, ticketTypes, tickets, type TicketTypeKey } from "@workspace/db";
import { findSeededStatus, findSeededTicketType } from "../shared/ticketCapabilities";
import { companyDateString, companyDayBounds, companyToday } from "../lib/companyDay";
import { loadRenewalsDue, type RenewalDueRow } from "../lib/contractCenterPersistence";
import { billingMonth, dashboardRevenueMonths, loadContractRevenueRows } from "../lib/contractRevenue";

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
  renewals: RenewalDueRow[];
  crewsToday: Array<{
    crewId: string;
    crewName: string;
    stops: number;
    complete: number;
    flagged: number;
  }>;
}


type TicketTypeRow = typeof ticketTypes.$inferSelect;
const DAY_MS = 24 * 60 * 60 * 1000;
const PULSE_TYPE_KEYS: TicketTypeKey[] = [
  "estimate_request",
  "project",
  "task",
  "invoice",
];

const READY_FOR_BILLING_TYPE_KEYS: TicketTypeKey[] = [
  "estimate_request",
  "project",
  "task",
];

type DateLike = Date | string | null;

function dateOnly(value: DateLike): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return companyDateString(value instanceof Date ? value : new Date(value));
}

function serializedDate(value: DateLike): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
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
  if (user.accessRole !== "admin" && user.accessRole !== "office") {
    res.status(403).json({ message: "Insufficient permissions - admin or office role required" });
    return null;
  }
  return user;
}

export function registerDashboardQueueRoutes(app: Express): void {
  app.get("/api/dashboard/pulse", async (req, res) => {
    const user = authorizeAdminOrOffice(req, res);
    if (!user) return;

    try {
      const companyId = user.activeCompanyId;
      const now = new Date();
      const today = companyToday(now);
      const [year, month] = today.split("-").map(Number);
      const { start: todayStart, end: tomorrowStart } = companyDayBounds(today);
      const { invoiceTypeId, readyStatusIds } = await getPulseTicketTypeContext(companyId);

      const [
        stats,
        revenueRows,
        renewals,
        seasonRows,
        snowContractRows,
        unbilledRows,
        crewRows,
      ] = await Promise.all([
        storage.getDashboardStats(companyId, month, year),
        loadContractRevenueRows(db, companyId, billingMonth(year - 1, 1), billingMonth(year, 12)),
        loadRenewalsDue(db, companyId, today),
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
          months: dashboardRevenueMonths(revenueRows, year).map(row => row.revenue),
          priorYear: year - 1,
          priorMonths: dashboardRevenueMonths(revenueRows, year - 1).map(row => row.revenue),
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
        renewals,
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