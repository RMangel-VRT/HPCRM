import type { Express } from "express";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { communications, flags, tickets, ticketTypes, ticketTypeStatuses, ticketStatusHistory } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import { companyDateString, companyToday } from "../lib/companyDay";
import { loadEstimatesBoard, estimateDaysInStage } from "./estimatesBoard";
import { loadSchedulingQueue } from "./schedulingQueue";
import { loadPendingInvoices } from "./pendingInvoices";
import { resolveVisibleMailboxes } from "../services/mailboxScope";

export type SectionKey = "estimates" | "scheduling" | "invoicing" | "inbox" | "flags" | "contracts" | "mine";
type Oldest = { label: string; detail: string; href: string };
export interface SectionSummary {
  key: SectionKey; href: string; total: number; overdue: number; oldest: Oldest | null; flow: null;
}
const destinations: Record<SectionKey, string> = {
  estimates: "/dashboard/estimates", scheduling: "/dashboard/scheduling", invoicing: "/dashboard/invoicing",
  inbox: "/dashboard/communications/inbox", flags: "/dashboard/flags",
  contracts: "/dashboard/contracts", mine: "/dashboard/tickets/my",
};
const PERSONAL_ROLES = ["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager",
  "shop_manager", "landscape_supervisor", "crew_supervisor"];

/** Mirrors navConfig/workNav, not the broader billing API permission. */
export function permittedSections(user: Pick<UserWithContext, "activeRole" | "activeTags" | "isSuperAdminBool">): SectionKey[] {
  const office = ["admin", "office"].includes(user.activeRole);
  const billingNav = user.activeRole === "admin" || (user.activeRole === "office" && !user.activeTags?.includes("billing"));
  if (user.isSuperAdminBool) return billingNav ? ["invoicing", "mine"] : [];
  return ([
    ["estimates", office], ["scheduling", office || user.activeRole === "field_manager"],
    ["invoicing", billingNav], ["inbox", office], ["flags", office], ["contracts", office],
    ["mine", PERSONAL_ROLES.includes(user.activeRole) || user.activeTags?.includes("billing")],
  ] as const).filter(([, allowed]) => allowed).map(([key]) => key);
}

const ticketHref = (id: string) => `/dashboard/tickets/${encodeURIComponent(id)}`;
function summary(key: SectionKey, total: number, overdue: number, oldest: Oldest | null): SectionSummary {
  return { key, href: destinations[key], total, overdue, oldest, flow: null };
}
const dayDifference = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export async function estimatesSummary(companyId: string, now: Date) {
  const board = await loadEstimatesBoard(companyId, undefined, now);
  const rows = board.stages.flatMap(stage => stage.tickets).sort((a, b) => b.daysInStage - a.daysInStage || a.id.localeCompare(b.id));
  const first = rows[0];
  return summary("estimates", rows.length, rows.filter(row => row.daysInStage >= 7).length, first ? {
    label: first.customer?.name ?? first.title,
    detail: `${first.statusName} · ${first.daysInStage}d`, href: ticketHref(first.id),
  } : null);
}

export async function schedulingSummary(companyId: string, now: Date) {
  const queue = await loadSchedulingQueue(companyId, now);
  // The destination's two sets are disjoint; defend the summary against duplicate visit rows too.
  const rows = [...new Map([...queue.needsScheduling, ...queue.slipped].map(row => [row.id, row])).values()];
  const today = companyToday(now);
  // Stable sort preserves the source's sensible priority/visit ordering for undated work.
  rows.sort((a, b) => (a.scheduleBy ?? "9999").localeCompare(b.scheduleBy ?? "9999"));
  const first = rows[0];
  return summary("scheduling", rows.length, rows.filter(row => row.scheduleBy && row.scheduleBy < today).length, first ? {
    label: first.customer?.name ?? first.title, detail: first.scheduleBy ? `${first.title} · ${first.scheduleBy}` : first.title,
    href: ticketHref(first.id),
  } : null);
}

export async function invoicingSummary(user: UserWithContext, now: Date) {
  const rows = await loadPendingInvoices(user, { now });
  // Only histories for the authorized charge population and their scoped source tickets.
  // The existing ticket_id index serves this lookup; no weekly/company-wide history scan.
  const sourceIds = [...new Set(rows.map(row => row.sourceTicket?.id ?? row.id))];
  const entries = sourceIds.length ? await db.select({
    ticketId: ticketStatusHistory.ticketId,
    enteredAt: sql<Date>`max(${ticketStatusHistory.createdAt})`.mapWith(ticketStatusHistory.createdAt),
  }).from(ticketStatusHistory)
    .innerJoin(tickets, eq(tickets.id, ticketStatusHistory.ticketId))
    .innerJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, ticketStatusHistory.toStatusId),
      eq(ticketTypeStatuses.ticketTypeId, tickets.ticketTypeId)))
    .where(and(eq(tickets.companyId, user.activeCompanyId), inArray(ticketStatusHistory.ticketId, sourceIds),
      eq(ticketTypeStatuses.statusKey, "ready_for_billing")))
    .groupBy(ticketStatusHistory.ticketId) : [];
  const entered = new Map(entries.map(row => [row.ticketId, row.enteredAt]));
  const aged = rows.map(row => {
    const source = row.sourceTicket;
    // A standalone invoice enters billing at creation. Do not invent a billing
    // entry date for legacy linked work whose transition history is unavailable.
    const base = entered.get(source?.id ?? row.id) ?? (!source && row.kind === "invoice" ? row.createdAt : null);
    return { row, days: base ? estimateDaysInStage(base, now) : null };
  }).sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || a.row.id.localeCompare(b.row.id));
  const first = aged[0];
  return summary("invoicing", rows.length, aged.filter(item => item.days !== null && item.days >= 7).length, first ? {
    label: first.row.customer?.name ?? first.row.title,
    detail: first.days === null ? first.row.title : `${first.row.title} · ${first.days}d`, href: ticketHref(first.row.id),
  } : null);
}

export async function inboxSummary(user: UserWithContext, now: Date) {
  const companyId = user.activeCompanyId;
  const [stats, visible] = await Promise.all([
    storage.getCommunicationStats(companyId),
    resolveVisibleMailboxes({ companyId, userId: user.id, role: user.activeRole, isSuperAdmin: user.isSuperAdminBool }),
  ]);
  const nullMailbox = visible.includeNullMailbox ? isNull(communications.mailboxAccountId)
    : visible.nullMailboxSentByUserId ? and(isNull(communications.mailboxAccountId), eq(communications.sentById, visible.nullMailboxSentByUserId)) : undefined;
  const mailboxScope = visible.mailboxIds === null ? undefined : or(
    visible.mailboxIds.length ? inArray(communications.mailboxAccountId, visible.mailboxIds) : sql`false`, nullMailbox,
  );
  const [first] = await db.select({
    id: communications.id, subject: communications.subject, status: communications.status,
    followUpDueAt: communications.followUpDueAt,
  }).from(communications).where(and(eq(communications.companyId, companyId), isNull(communications.deletedAt), mailboxScope,
    or(eq(communications.status, "draft"), eq(communications.followUpStatus, "open"),
      and(eq(communications.followUpStatus, "snoozed"), lt(communications.followUpDueAt, now)))))
    .orderBy(sql`${communications.followUpDueAt} ASC NULLS LAST`, asc(communications.createdAt), asc(communications.id)).limit(1);
  return summary("inbox", stats.drafts + stats.openFollowUps, stats.overdueFollowUps, first ? {
    label: first.subject, detail: first.followUpDueAt ? companyDateString(first.followUpDueAt) : user.language === "es" ? "Borrador" : "Draft",
    href: `/dashboard/communications/all?focusId=${encodeURIComponent(first.id)}`,
  } : null);
}

export async function flagsSummary(companyId: string) {
  const scope = and(eq(flags.companyId, companyId), eq(flags.status, "new"));
  const [[count], [first]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(flags).where(scope),
    db.select({ id: flags.id, note: flags.note, tag: flags.tag, createdAt: flags.createdAt }).from(flags).where(scope)
      .orderBy(asc(flags.createdAt), asc(flags.id)).limit(1),
  ]);
  return summary("flags", count?.total ?? 0, count?.total ?? 0, first ? {
    label: first.note || first.tag, detail: companyDateString(first.createdAt), href: `/dashboard/flags/${encodeURIComponent(first.id)}`,
  } : null);
}

export async function contractsSummary(companyId: string, now: Date) {
  const rows = await storage.getUpcomingRenewals(companyId, 60);
  const today = companyToday(now);
  const first = rows[0];
  return summary("contracts", rows.length,
    rows.filter(row => dayDifference(today, companyDateString(row.endDate)) <= 30).length, first ? {
      label: first.customerName, detail: `${first.serviceType} · ${companyDateString(first.endDate)}`,
      href: `/dashboard/contracts/${encodeURIComponent(first.contractId)}`,
    } : null);
}

export async function mineSummary(user: UserWithContext, now: Date) {
  const today = companyToday(now);
  // schedule_by is a Postgres date, while due_date is a UTC timestamp without
  // timezone. Convert both branches to date before COALESCE, then serialize.
  const deadline = sql<string>`coalesce(${tickets.scheduleBy},
    (${tickets.dueDate} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Denver')::date)::text`;
  // Status keys are stable seeded identity, joined to their own company/type.
  const owned = ["new", "estimating", "reviewing", "waiting_info", "site_visit", "proposal_draft", "proposal_sent",
    "awaiting_response", "decision_received", "ready_to_schedule", "scheduled", "ready_for_billing", "pending_invoice"];
  const scope = and(eq(tickets.companyId, user.activeCompanyId), eq(tickets.assignedToId, user.id), isNull(tickets.completedAt),
    eq(ticketTypeStatuses.isFinal, "false"), eq(ticketTypeStatuses.actionType, "needs_action"),
    // To-Do's seeded new status belongs here, not Estimates.
    sql`NOT (coalesce((${ticketTypes.typeKey} IN ('estimate_request','rfp_request') AND ${ticketTypeStatuses.statusKey} IN (${sql.join(owned.map(key => sql`${key}`), sql`, `)})), false)
      OR coalesce(${ticketTypeStatuses.statusKey} IN ('ready_to_schedule','scheduled','ready_for_billing','pending_invoice'), false))`);
  const rows = await db.select({ id: tickets.id, title: tickets.title, deadline }).from(tickets)
    .innerJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, user.activeCompanyId)))
    .innerJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
    .where(scope).orderBy(sql`${deadline} ASC NULLS LAST`, asc(tickets.createdAt), asc(tickets.id));
  const first = rows[0];
  return summary("mine", rows.length, rows.filter(row => row.deadline && row.deadline < today).length, first ? {
    label: first.title, detail: first.deadline ?? (user.language === "es" ? "Asignado a ti" : "Assigned to you"), href: ticketHref(first.id),
  } : null);
}

export async function loadDashboardSections(user: UserWithContext, now = new Date()) {
  const companyId = user.activeCompanyId;
  const loaders: Record<SectionKey, () => Promise<SectionSummary>> = {
    estimates: () => estimatesSummary(companyId, now), scheduling: () => schedulingSummary(companyId, now),
    invoicing: () => invoicingSummary(user, now), inbox: () => inboxSummary(user, now),
    flags: () => flagsSummary(companyId), contracts: () => contractsSummary(companyId, now), mine: () => mineSummary(user, now),
  };
  return { sections: await Promise.all(permittedSections(user).map(key => loaders[key]())) };
}

export function registerDashboardSectionsRoutes(app: Express): void {
  app.get("/api/dashboard/sections", async (req, res) => {
    if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId) { res.status(403).json({ message: "Active company required" }); return; }
    try { res.json(await loadDashboardSections(user)); }
    catch (error) {
      req.log?.error({ err: error }, "Failed to load dashboard sections");
      res.status(500).json({ message: "Unable to load dashboard sections" });
    }
  });
}
