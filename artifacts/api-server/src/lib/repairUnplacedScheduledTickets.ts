import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { companyUsers, tickets, ticketTypes, ticketTypeStatuses, ticketStatusHistory, visits } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { assertSchedulingGate, schedulingGateTypes } from "./schedulingTransition";
import { maintainScheduleBy } from "./scheduleByMaintenance";
import { lockVisitCompany, openTicketVisitPredicate } from "./visitLocks";
import { logger } from "./logger";

export const schedulingRepairNote = "Moved back to Needs scheduling: it was marked Scheduled without a visit on the schedule";
const ready = alias(ticketTypeStatuses, "ready");

function candidates(tx: Pick<AppTransaction, "select">, companyId?: string) {
  return tx.select({
    id: tickets.id, companyId: tickets.companyId, currentStatusId: tickets.currentStatusId,
    createdById: tickets.createdById, assignedToId: tickets.assignedToId,
    priority: tickets.priority, createdAt: tickets.createdAt, acceptedAt: tickets.acceptedAt, scheduleBy: tickets.scheduleBy,
    typeKey: ticketTypes.typeKey, fromOrder: ticketTypeStatuses.displayOrder,
    readyId: sql<string>`${ready.id}`.as("ready_id"), readyOrder: sql<number>`${ready.displayOrder}`.as("ready_order"),
  }).from(tickets)
    .innerJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, tickets.companyId)))
    .innerJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
    .innerJoin(ready, and(eq(ready.ticketTypeId, ticketTypes.id), eq(ready.statusKey, "ready_to_schedule")))
    .where(and(companyId ? eq(tickets.companyId, companyId) : undefined, inArray(ticketTypes.typeKey, [...schedulingGateTypes]),
      eq(ticketTypeStatuses.statusKey, "scheduled"),
      sql`NOT EXISTS (${tx.select({ id: visits.ticketId }).from(visits).where(openTicketVisitPredicate(tickets.companyId, tickets.id))})`));
}

/** Normal boot, after status setup and before legacy crew/date synthesis. */
export async function repairUnplacedScheduledTickets(companyId?: string) {
  const prerequisites = {
    company_users: ["id", "company_id", "user_id", "status", "role"],
    tickets: ["id", "company_id", "ticket_type_id", "current_status_id", "crew_id", "route_order",
      "priority", "schedule_by", "created_at", "accepted_at", "created_by_id", "assigned_to_id", "updated_at"],
    ticket_types: ["id", "company_id", "type_key"],
    ticket_type_statuses: ["id", "ticket_type_id", "status_key", "display_order"],
    visits: ["company_id", "ticket_id", "status"],
    ticket_status_history: ["ticket_id", "from_status_id", "to_status_id", "changed_by_id", "notes"],
  };
  const guard = await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
  const columns = new Set(guard.rows.map(r => `${r.table_name}.${r.column_name}`));
  if (Object.entries(prerequisites).some(([table, names]) => names.some(name => !columns.has(`${table}.${name}`)))) {
    logger.info("[schedulingRepair] skipped: required columns not installed");
    return 0;
  }
  const repairable = candidates(db, companyId).as("repairable");
  const scopes = await db.selectDistinct({ id: repairable.companyId }).from(repairable);
  let total = 0;
  for (const { id } of scopes) {
    total += await db.transaction(async tx => {
      await lockVisitCompany(tx, id);
      const rows = await candidates(tx, id).orderBy(asc(tickets.id), asc(ready.id)).for("update", { of: tickets });
      if (!rows.length) return 0;
      const members = await tx.select({ userId: companyUsers.userId }).from(companyUsers)
        .where(and(eq(companyUsers.companyId, id), eq(companyUsers.status, "active")))
        .orderBy(sql`CASE WHEN ${companyUsers.role} = 'admin' THEN 0 ELSE 1 END`, asc(companyUsers.id));
      const actorIds = new Set(members.map(member => member.userId));
      const history: (typeof ticketStatusHistory.$inferInsert)[] = [];
      const scheduleDates = new Map<string, string>();
      const seen = new Set<string>();
      for (const ticket of rows) {
        if (seen.has(ticket.id)) continue;
        seen.add(ticket.id);
        // Ticket user IDs are already backed by FKs; prefer an active member.
        const actor = [ticket.createdById, ticket.assignedToId].find(uid => uid && actorIds.has(uid))
          ?? members[0]?.userId ?? ticket.createdById ?? ticket.assignedToId;
        if (!actor) {
          logger.warn({ ticketId: ticket.id }, "[schedulingRepair] no valid audit actor");
          continue;
        }
        const statuses = [
          { id: ticket.currentStatusId, statusKey: "scheduled", name: "", displayOrder: ticket.fromOrder },
          { id: ticket.readyId, statusKey: "ready_to_schedule", name: "", displayOrder: ticket.readyOrder },
        ];
        await assertSchedulingGate(tx, ticket, ticket, statuses, ticket.readyId);
        const updates: Record<string, unknown> = { currentStatusId: ticket.readyId };
        maintainScheduleBy(updates, ticket, statuses);
        if (typeof updates.scheduleBy === "string") scheduleDates.set(ticket.id, updates.scheduleBy);
        history.push({ ticketId: ticket.id, fromStatusId: ticket.currentStatusId, toStatusId: ticket.readyId,
          changedById: actor, notes: schedulingRepairNote });
      }
      if (history.length) {
        await tx.update(tickets).set({
          currentStatusId: sql`CASE ${tickets.id} ${sql.join(history.map(row => sql`WHEN ${row.ticketId} THEN ${row.toStatusId}::varchar`), sql` `)} END`,
          crewId: null, routeOrder: null, updatedAt: new Date(),
          ...(scheduleDates.size ? { scheduleBy: sql`CASE ${tickets.id}
            ${sql.join([...scheduleDates].map(([ticketId, date]) => sql`WHEN ${ticketId} THEN ${date}::date`), sql` `)}
            ELSE ${tickets.scheduleBy} END` } : {}),
        }).where(and(eq(tickets.companyId, id), inArray(tickets.id, history.map(row => row.ticketId))));
        await tx.insert(ticketStatusHistory).values(history);
      }
      return history.length;
    });
  }
  logger.info({ repaired: total }, "[schedulingRepair] complete");
  return total;
}
