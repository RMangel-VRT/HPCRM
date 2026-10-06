import { and, eq, isNull, sql } from "drizzle-orm";
import { tickets, ticketTypes, ticketTypeStatuses } from "@workspace/db";
import { db } from "../db";
import { computeScheduleBy } from "./scheduleBy";

/** Boot DML only, after migrateSchedulingStatuses. Old jobs intentionally stay overdue. */
export async function backfillScheduleBy(): Promise<number> {
  const guard = await db.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('tickets', 'ticket_types', 'ticket_type_statuses')
  `);
  const columns = new Set(guard.rows.map(row => `${row.table_name}.${row.column_name}`));
  const required = [
    ...["id", "company_id", "ticket_type_id", "current_status_id", "schedule_by", "priority", "created_at"].map(c => `tickets.${c}`),
    ...["id", "company_id", "type_key"].map(c => `ticket_types.${c}`),
    ...["id", "ticket_type_id", "status_key"].map(c => `ticket_type_statuses.${c}`),
  ];
  if (required.some(c => !columns.has(c))) {
    console.warn("Schedule-by backfill skipped: required columns are not present");
    return 0;
  }
  const count = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(665003)`);
    const rows = await tx.select({
      id: tickets.id, companyId: tickets.companyId, priority: tickets.priority, createdAt: tickets.createdAt,
    }).from(tickets)
      .innerJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, tickets.companyId)))
      .innerJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId), eq(ticketTypeStatuses.ticketTypeId, tickets.ticketTypeId)))
      .where(and(isNull(tickets.scheduleBy),
        sql`${ticketTypes.typeKey} IN ('task', 'project', 'estimate_request')`,
        sql`${ticketTypeStatuses.statusKey} IN ('new', 'ready_to_schedule')`))
      .for("update", { of: tickets });
    let updated = 0;
    for (const row of rows) {
      const changed = await tx.update(tickets).set({
        scheduleBy: computeScheduleBy(row.priority, row.createdAt),
      }).where(and(eq(tickets.id, row.id), eq(tickets.companyId, row.companyId), isNull(tickets.scheduleBy)))
        .returning({ id: tickets.id });
      updated += changed.length;
    }
    return updated;
  });
  console.log(`Schedule-by backfill complete: ${count} tickets updated`);
  return count;
}
