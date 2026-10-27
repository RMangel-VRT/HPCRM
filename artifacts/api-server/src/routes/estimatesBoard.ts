import type { Express } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companyUsers, tickets, ticketStatusHistory, users } from "@workspace/db";
import { db } from "../db";
import { storage } from "../storage";
import type { UserWithContext } from "../auth";
import { findSeededTicketType } from "../shared/ticketCapabilities";
import { companyDateString } from "../lib/companyDay";

/** Estimate-only workflow. Display names never determine membership. */
export const ESTIMATE_STAGES = [
  { key: "new", statusKeys: ["new"] },
  { key: "estimating", statusKeys: ["estimating"] },
  { key: "proposal", statusKeys: ["proposal_draft"] },
  { key: "sent", statusKeys: ["proposal_sent"] },
  { key: "decision", statusKeys: ["decision_received"] },
] as const;

interface BoardTicket {
  contracts?: Awaited<ReturnType<typeof import("../lib/rfpContracts").loadLinkedContracts>>;
  id: string; title: string; typeKey: string; statusKey: string; statusName: string;
  customer: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  priority: string; estimateNumber: string | null; daysInStage: number;
}

/** Subtract Colorado calendar day numbers, not elapsed hours or host midnights. */
export function estimateDaysInStage(enteredAt: Date, now: Date): number {
  const dayNumber = (instant: Date) => {
    const [year, month, day] = companyDateString(instant).split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  return Math.max(0, dayNumber(now) - dayNumber(enteredAt));
}

export function loadEstimatesBoard(companyId: string, now = new Date()) {
  return loadOpportunityBoard(companyId, "estimate_request", ESTIMATE_STAGES, now);
}

/** One type per invocation, SQL-scoped and uncapped, with constant bulk queries. */
export async function loadOpportunityBoard<T extends Parameters<typeof findSeededTicketType>[1], S extends string>(
  companyId: string, typeKey: T,
  definitions: readonly { key: S; statusKeys: readonly string[] }[], now = new Date(),
  enrich?: (ids: string[]) => Promise<Awaited<ReturnType<typeof import("../lib/rfpContracts").loadLinkedContracts>>>,
) {
  const stages: { key: S; tickets: BoardTicket[] }[] =
    definitions.map(stage => ({ key: stage.key, tickets: [] }));
  const types = await storage.getTicketTypes(companyId);
  const statusMap = new Map<string, { typeId: string; typeKey: T; stageKey: S; statusKey: string; statusName: string }>();
  const type = findSeededTicketType(types, typeKey);
  if (!type) return { stages };
  for (const status of await storage.getTicketTypeStatuses(type.id)) {
    const stage = definitions.find(stage => stage.statusKeys.includes(status.statusKey ?? ""));
    if (stage) statusMap.set(status.id, {
      typeId: type.id, typeKey, stageKey: stage.key, statusKey: status.statusKey!, statusName: status.name,
    });
  }
  if (!statusMap.size) return { stages };
  // Deliberately uncapped: this is the complete open-bid population, not a queue preview.
  const rows = await db.select({
    id: tickets.id, title: tickets.title, ticketTypeId: tickets.ticketTypeId,
    currentStatusId: tickets.currentStatusId, customerId: tickets.customerId,
    assignedToId: tickets.assignedToId, priority: tickets.priority,
    estimateNumber: tickets.estimateNumber, createdAt: tickets.createdAt,
  }).from(tickets).where(and(
    eq(tickets.companyId, companyId), inArray(tickets.ticketTypeId, [type.id]),
    inArray(tickets.currentStatusId, [...statusMap.keys()]),
  ));
  if (!rows.length) return { stages };
  const customerIds = [...new Set(rows.flatMap(row => row.customerId ? [row.customerId] : []))];
  const assigneeIds = [...new Set(rows.flatMap(row => row.assignedToId ? [row.assignedToId] : []))];
  const [customersById, assignees, history] = await Promise.all([
    storage.getCustomersByIds(customerIds, companyId),
    assigneeIds.length ? db.selectDistinct({ id: users.id, name: users.name }).from(users)
      .innerJoin(companyUsers, eq(companyUsers.userId, users.id))
      .where(and(eq(companyUsers.companyId, companyId), inArray(users.id, assigneeIds))) : [],
    // Join the *current* status before MAX: re-entry resets the age; unrelated history cannot.
    db.select({
      ticketId: ticketStatusHistory.ticketId,
      enteredAt: sql<Date>`max(${ticketStatusHistory.createdAt})`.mapWith(ticketStatusHistory.createdAt),
    }).from(ticketStatusHistory)
      .innerJoin(tickets, and(eq(tickets.id, ticketStatusHistory.ticketId), eq(tickets.currentStatusId, ticketStatusHistory.toStatusId)))
      .where(and(eq(tickets.companyId, companyId), inArray(ticketStatusHistory.ticketId, rows.map(row => row.id))))
      .groupBy(ticketStatusHistory.ticketId),
  ]);
  const assigneesById = new Map(assignees.map(row => [row.id, row]));
  const enteredById = new Map(history.map(row => [row.ticketId, row.enteredAt]));
  const linked = enrich ? await enrich(rows.map(row => row.id)) : undefined;
  for (const row of rows) {
    const status = statusMap.get(row.currentStatusId);
    if (!status || status.typeId !== row.ticketTypeId) continue;
    const customer = row.customerId ? customersById.get(row.customerId) : null;
    stages.find(stage => stage.key === status.stageKey)!.tickets.push({
      id: row.id, title: row.title, typeKey: status.typeKey, statusKey: status.statusKey,
      statusName: status.statusName, customer: customer ? { id: customer.id, name: customer.name } : null,
      assignee: row.assignedToId ? assigneesById.get(row.assignedToId) ?? null : null,
      priority: row.priority, estimateNumber: row.estimateNumber,
      daysInStage: estimateDaysInStage(enteredById.get(row.id) ?? row.createdAt, now),
      ...(linked ? { contracts: linked.filter(c => c.bidTicketId === row.id) } : {}),
    });
  }
  for (const stage of stages) stage.tickets.sort((a, b) => b.daysInStage - a.daysInStage || a.id.localeCompare(b.id));
  return { stages };
}

export function registerEstimatesBoardRoutes(app: Express): void {
  app.get("/api/estimates/board", async (req, res) => {
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    const user = req.user as UserWithContext;
    if (!["admin", "office"].includes(user.activeRole) || !user.activeCompanyId) {
      res.status(403).json({ message: "Access denied" });
      return;
    }
    try {
      res.json(await loadEstimatesBoard(user.activeCompanyId));
    } catch (error) {
      req.log?.error({ err: error }, "Failed to load estimates board");
      res.status(500).json({ message: "Failed to load estimates board" });
    }
  });
}
