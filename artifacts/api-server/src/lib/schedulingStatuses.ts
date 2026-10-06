import { and, eq, gt, sql } from "drizzle-orm";
import { ticketTypes, ticketTypeStatuses } from "@workspace/db";
import { db } from "../db";
import { findSeededStatus, isSeededStatus, type TicketStatusIdentity } from "../shared/ticketCapabilities";

type WorkflowStatus = TicketStatusIdentity & { id: string; displayOrder: number };
type SchedulingTypeKey = "task" | "estimate_request" | "project";

/** Refuse ambiguous workflows rather than making a forward move look like a step-back. */
export function checkSchedulingWorkflow(typeKey: SchedulingTypeKey, statuses: readonly WorkflowStatus[]): void {
  const orders = new Set<number>();
  const keys = new Set<string>();
  for (const status of statuses) {
    if (orders.has(status.displayOrder)) throw new Error(`Scheduling migration blocked: ${typeKey} has duplicate display order ${status.displayOrder}`);
    orders.add(status.displayOrder);
    if (status.statusKey && keys.has(status.statusKey)) throw new Error(`Scheduling migration blocked: ${typeKey} has duplicate key ${status.statusKey}`);
    if (status.statusKey) keys.add(status.statusKey);
  }
  const ready = findSeededStatus(statuses, "ready_to_schedule");
  if (!ready) return; // Missing scheduling steps are warned/skipped by the caller.
  const scheduled = findSeededStatus(statuses, "scheduled");
  const successor = findSeededStatus(statuses, typeKey === "task" ? "in_progress" : "work_completed");
  if (!successor || successor.displayOrder <= ready.displayOrder) {
    throw new Error(`Scheduling migration blocked: ${typeKey} has a missing or out-of-order successor`);
  }
  if (scheduled && (scheduled.displayOrder <= ready.displayOrder || scheduled.displayOrder >= successor.displayOrder)) {
    throw new Error(`Scheduling migration blocked: ${typeKey} has an out-of-order Scheduled status`);
  }
  if (statuses.some(status => status.displayOrder > ready.displayOrder
    && status.displayOrder < successor.displayOrder && !isSeededStatus(status, "scheduled"))) {
    throw new Error(`Scheduling migration blocked: ${typeKey} has an intervening custom status`);
  }
}

/** DML only. Validate every workflow before any writes; keep IDs, keys and history intact. */
export async function migrateSchedulingStatuses(): Promise<{ inserts: number; renames: number }> {
  const guard = await db.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('ticket_types', 'ticket_type_statuses')
  `);
  const columns = new Set(guard.rows.map(row => `${row.table_name}.${row.column_name}`));
  const required = [
    "ticket_types.id", "ticket_types.company_id", "ticket_types.type_key",
    ...["id", "ticket_type_id", "name", "status_key", "description", "display_order", "color", "is_final", "action_type"]
      .map(column => `ticket_type_statuses.${column}`),
  ];
  if (required.some(column => !columns.has(column))) {
    console.warn("Scheduling status migration skipped: required columns are not present");
    return { inserts: 0, renames: 0 };
  }

  const counts = await db.transaction(async tx => {
    // Serialize concurrent boots without DDL; then lock the seeded parent rows.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(664002)`);
    const types = await tx.select({
      id: ticketTypes.id, companyId: ticketTypes.companyId, typeKey: ticketTypes.typeKey,
    }).from(ticketTypes)
      .where(sql`${ticketTypes.typeKey} IN (${"task"}, ${"estimate_request"}, ${"project"})`)
      .for("update");
    const workflows = [];
    for (const type of types) {
      const statuses = await tx.select({
        id: ticketTypeStatuses.id, name: ticketTypeStatuses.name,
        statusKey: ticketTypeStatuses.statusKey, displayOrder: ticketTypeStatuses.displayOrder,
      }).from(ticketTypeStatuses)
        .where(eq(ticketTypeStatuses.ticketTypeId, type.id)).for("update");
      checkSchedulingWorkflow(type.typeKey as SchedulingTypeKey, statuses);
      workflows.push({ type, statuses });
    }
    let inserts = 0;
    let renames = 0;
    for (const { type, statuses } of workflows) {
      const ready = findSeededStatus(statuses, "ready_to_schedule");
      if (!ready) {
        console.warn(`Scheduling status migration skipped: company ${type.companyId}, type ${type.id} missing ready_to_schedule`);
        continue;
      }
      if (type.typeKey !== "project" && !findSeededStatus(statuses, "scheduled")) {
        await tx.update(ticketTypeStatuses).set({ displayOrder: sql`${ticketTypeStatuses.displayOrder} + 1` })
          .where(and(eq(ticketTypeStatuses.ticketTypeId, type.id), gt(ticketTypeStatuses.displayOrder, ready.displayOrder)));
        await tx.insert(ticketTypeStatuses).values({
          ticketTypeId: type.id, name: "Scheduled", statusKey: "scheduled",
          description: "On the calendar with a crew and date", displayOrder: ready.displayOrder + 1,
          color: "#3b82f6", isFinal: "false", actionType: "needs_action",
        });
        inserts++;
      }
      // Only the unchanged default label is renamed. Custom labels are intentional.
      if (ready.name === "Ready to Schedule") {
        await tx.update(ticketTypeStatuses).set({
          name: "Needs scheduling", description: "Accepted. Waiting for a crew and date.",
        }).where(and(eq(ticketTypeStatuses.id, ready.id), eq(ticketTypeStatuses.ticketTypeId, type.id)));
        renames++;
      }
    }
    return { inserts, renames };
  });
  console.log(`Scheduling status migration complete: ${counts.inserts} inserts, ${counts.renames} renames`);
  return counts;
}
