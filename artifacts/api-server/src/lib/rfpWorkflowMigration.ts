import { and, eq, inArray, sql } from "drizzle-orm";
import { tickets, ticketTypes, ticketTypeFields, ticketTypeStatuses } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { logger } from "./logger";
import { rfpFieldRows, rfpStatusRows } from "./rfpWorkflowDefinitions";

const RETIRED = {
  awaiting_response: "proposal_sent",
  decision_received: "proposal_sent",
  contract_executed: "onboarding",
  crm_setup: "onboarding",
  maps_requested: "onboarding",
  maps_uploaded: "onboarding",
  contacts_collected: "onboarding",
  kickoff: "onboarding",
  handoff_ops: "onboarding",
} as const;

export async function lockRfpWorkflow(tx: AppTransaction) {
  // RFP workflow configuration only (not the per-company ticket/visit gate).
  await tx.execute(sql`SELECT pg_advisory_xact_lock(956062, 1)`);
}

export function indexRfpRows<T>(rows: T[], keyOf: (row: T) => string | null, keys: ReadonlySet<string>, typeId: string) {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null || !keys.has(key)) continue;
    if (result.has(key)) throw new Error(`RFP type ${typeId} has duplicate system key ${key}`);
    result.set(key, row);
  }
  return result;
}

async function backfillCustomerSetup(tx: AppTransaction, companyId: string, typeId: string,
  setupId: string, datesId: string, amountsId: string, servicesId: string) {
  const result = await tx.execute(sql`
    INSERT INTO ticket_field_values (ticket_id, field_id, value, captured_by_id)
    SELECT t.id, ${setupId}, 'Yes', services.captured_by_id
    FROM tickets t
    JOIN ticket_field_values dates ON dates.ticket_id = t.id AND dates.field_id = ${datesId} AND dates.value = 'Yes'
    JOIN ticket_field_values amounts ON amounts.ticket_id = t.id AND amounts.field_id = ${amountsId} AND amounts.value = 'Yes'
    JOIN ticket_field_values services ON services.ticket_id = t.id AND services.field_id = ${servicesId} AND services.value = 'Yes'
    WHERE t.company_id = ${companyId} AND t.ticket_type_id = ${typeId}
    ON CONFLICT (ticket_id, field_id) DO NOTHING
  `);
  return result.rowCount ?? 0;
}

type RetiredStatus = { id: string; oldName: string; replacementId: string };

async function moveHistory(tx: AppTransaction, companyId: string, typeId: string, retired: RetiredStatus[]) {
  const mapping = sql.join(retired.map(({ id, oldName, replacementId }) =>
    sql`(${id}::varchar, ${oldName}::text, ${replacementId}::varchar)`), sql`, `);
  const result = await tx.execute(sql`
    WITH retired(old_id, old_name, replacement_id) AS (VALUES ${mapping}),
    affected AS (
      SELECT h.id, f.replacement_id AS new_from, d.replacement_id AS new_to,
        CASE WHEN f.old_id IS NULL THEN '' ELSE '[was ' || f.old_name || '] ' END ||
        CASE WHEN d.old_id IS NULL OR d.old_id = f.old_id THEN '' ELSE '[was ' || d.old_name || '] ' END AS prefix
      FROM ticket_status_history h
      JOIN tickets t ON t.id = h.ticket_id
      LEFT JOIN retired f ON f.old_id = h.from_status_id
      LEFT JOIN retired d ON d.old_id = h.to_status_id
      WHERE t.company_id = ${companyId} AND t.ticket_type_id = ${typeId}
        AND (f.old_id IS NOT NULL OR d.old_id IS NOT NULL)
    )
    UPDATE ticket_status_history h
    SET from_status_id = coalesce(a.new_from, h.from_status_id),
        to_status_id = coalesce(a.new_to, h.to_status_id),
        notes = a.prefix || coalesce(h.notes, '')
    FROM affected a WHERE h.id = a.id
  `);
  return result.rowCount ?? 0;
}

async function assertNoStatusReferences(tx: AppTransaction, ids: string[]) {
  // Inspect the connected catalog, not just the declarations: an extra
  // CASCADE/SET NULL (including a composite FK) must not silently discard data.
  const statusIds = sql.join(ids.map(id => sql`${id}`), sql`, `);
  const { rows: catalog } = await tx.execute<{
    schema_name: string; table_name: string; name: string; child_columns: string[]; parent_columns: string[];
  }>(sql`
    SELECT ns.nspname AS schema_name, child.relname AS table_name, fk.conname AS name,
           array_agg(src.attname::text ORDER BY pair.ord) AS child_columns,
           array_agg(dst.attname::text ORDER BY pair.ord) AS parent_columns
    FROM pg_constraint fk
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace
    CROSS JOIN LATERAL unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS pair(src_num, dst_num, ord)
    JOIN pg_attribute src ON src.attrelid = fk.conrelid AND src.attnum = pair.src_num
    JOIN pg_attribute dst ON dst.attrelid = fk.confrelid AND dst.attnum = pair.dst_num
    WHERE fk.contype = 'f' AND fk.confrelid = 'ticket_type_statuses'::regclass
    GROUP BY fk.oid, ns.nspname, child.relname, fk.conname
  `);
  // Also check known application relationships if a deployment is missing
  // one of their FK constraints; orphaned references are not acceptable either.
  const refs = [
    ["tickets", "current_status_id"], ["ticket_status_history", "from_status_id"],
    ["ticket_status_history", "to_status_id"], ["ticket_type_fields", "status_id"],
  ].map(([table_name, column]) => ({
    schema_name: "public", table_name, name: column, child_columns: [column], parent_columns: ["id"],
  }));
  for (const ref of catalog) {
    if (!refs.some(known => known.schema_name === ref.schema_name && known.table_name === ref.table_name &&
      ref.child_columns.length === 1 && known.child_columns[0] === ref.child_columns[0] && ref.parent_columns[0] === "id")) refs.push(ref);
  }
  for (const ref of refs) {
    const table = sql`${sql.identifier(ref.schema_name)}.${sql.identifier(ref.table_name)}`;
    const match = sql.join(ref.child_columns.map((col, i) =>
      sql`ref.${sql.identifier(col)} = retiring.${sql.identifier(ref.parent_columns[i])}`), sql` AND `);
    const result = await tx.execute<{ id: string }>(sql`
      SELECT retiring.id FROM ticket_type_statuses retiring
      WHERE retiring.id IN (${statusIds}) AND EXISTS (SELECT 1 FROM ${table} ref WHERE ${match})
      LIMIT 1
    `);
    if (result.rows.length) {
      throw new Error(`Cannot retire RFP status ${result.rows[0].id}: reference remains in ${ref.schema_name}.${ref.table_name} (${ref.name})`);
    }
  }
}

export async function migrateRfpWorkflow() {
  const report = await db.transaction(async tx => {
    // Older installations may not yet have the two identity columns. Do not
    // infer retired rows by name or add columns from startup.
    const { rows: [columns] } = await tx.execute<{ ready: boolean }>(sql`
      SELECT count(*) = 2 AS ready FROM pg_attribute
      WHERE NOT attisdropped AND (
        (attrelid = 'ticket_types'::regclass AND attname = 'type_key') OR
        (attrelid = 'ticket_type_statuses'::regclass AND attname = 'status_key'))
    `);
    if (!columns.ready) return null;
    await lockRfpWorkflow(tx);
    const report = {
      ticketsMoved: Object.fromEntries(Object.keys(RETIRED).map(key => [key, 0])),
      historyRowsMoved: 0, fieldsArchived: 0, valuesBackfilled: 0,
      statusesCreated: 0, statusesUpdated: 0, statusesRetired: 0, checklistFieldsWritten: 0,
      customStatuses: [] as { companyId: string; typeId: string; id: string; name: string }[],
    };
    const types = await tx.select({ id: ticketTypes.id, companyId: ticketTypes.companyId })
      .from(ticketTypes).where(eq(ticketTypes.typeKey, "rfp_request")).orderBy(ticketTypes.id);
    const deletions: { typeId: string; ids: string[] }[] = [];
    for (const { id: typeId, companyId } of types) {
      const definitions = rfpStatusRows(typeId);
      const statuses = await tx.select().from(ticketTypeStatuses).where(eq(ticketTypeStatuses.ticketTypeId, typeId));
      for (const { id, name } of statuses.filter(status => status.statusKey === null)) {
        report.customStatuses.push({ companyId, typeId, id, name });
      }
      const byKey = indexRfpRows(statuses, status => status.statusKey,
        new Set([...definitions.map(s => s.statusKey), ...Object.keys(RETIRED)]), typeId);
      // Create missing destinations before moving references. A name collision
      // with an unkeyed custom status never substitutes for a system row.
      for (const definition of definitions) {
        if (byKey.has(definition.statusKey)) continue;
        const [status] = await tx.insert(ticketTypeStatuses).values(definition).returning();
        byKey.set(definition.statusKey, status);
        report.statusesCreated++;
      }
      const retiredKeys = (Object.keys(RETIRED) as (keyof typeof RETIRED)[]).filter(key => byKey.has(key));
      const retired = retiredKeys.map(key => {
        const status = byKey.get(key)!;
        return { id: status.id, oldName: status.name, replacementId: byKey.get(RETIRED[key])!.id };
      });
      const retiredIds = retired.map(row => row.id);
      if (retiredIds.length) {
        // Block concurrent foreign-key inserts/updates until the reference
        // assertion and deletion have committed.
        await tx.select({ id: ticketTypeStatuses.id }).from(ticketTypeStatuses)
          .where(and(eq(ticketTypeStatuses.ticketTypeId, typeId), inArray(ticketTypeStatuses.id, retiredIds)))
          .orderBy(ticketTypeStatuses.id).for("update");
      }
      const steps = rfpFieldRows(typeId, byKey.get("onboarding")!.id, "onboarding");
      const legacyChecks = ["contract_dates_entered", "monthly_amounts_entered", "services_configured"] as const;
      const fields = indexRfpRows(await tx.select().from(ticketTypeFields).where(eq(ticketTypeFields.ticketTypeId, typeId)),
        field => field.fieldKey, new Set([...steps.map(f => f.fieldKey), ...(retired.length ? legacyChecks : [])]), typeId);
      for (const field of steps) {
        const existing = fields.get(field.fieldKey);
        if (!existing) {
          const [created] = await tx.insert(ticketTypeFields).values(field).returning();
          fields.set(field.fieldKey, created);
        } else {
          const { ticketTypeId: _, fieldKey: __, ...metadata } = field;
          if (existing.statusId === metadata.statusId && existing.fieldLabel === metadata.fieldLabel &&
            existing.fieldType === metadata.fieldType && existing.isRequired === metadata.isRequired &&
            existing.displayOrder === metadata.displayOrder && JSON.stringify(existing.options) === JSON.stringify(metadata.options)) continue;
          await tx.update(ticketTypeFields).set(metadata)
            .where(and(eq(ticketTypeFields.id, existing.id), eq(ticketTypeFields.ticketTypeId, typeId)));
        }
        report.checklistFieldsWritten++;
      }
      if (retired.length) {
        const [dates, amounts, services] = legacyChecks.map(key => fields.get(key));
        if (dates && amounts && services) report.valuesBackfilled += await backfillCustomerSetup(tx,
          companyId, typeId, fields.get("customer_setup")!.id, dates.id, amounts.id, services.id);
        for (const [i, { id, replacementId }] of retired.entries()) {
          const moved = await tx.update(tickets).set({ currentStatusId: replacementId })
            .where(and(eq(tickets.companyId, companyId), eq(tickets.ticketTypeId, typeId), eq(tickets.currentStatusId, id)));
          report.ticketsMoved[retiredKeys[i]] += moved.rowCount ?? 0;
        }
        report.historyRowsMoved += await moveHistory(tx, companyId, typeId, retired);
        const archived = await tx.update(ticketTypeFields).set({ statusId: null })
          .where(and(eq(ticketTypeFields.ticketTypeId, typeId), inArray(ticketTypeFields.statusId, retiredIds)));
        report.fieldsArchived += archived.rowCount ?? 0;
        deletions.push({ typeId, ids: retiredIds });
      }
      for (const { color: _color, ticketTypeId: _, statusKey, ...metadata } of definitions) {
        const existing = byKey.get(statusKey)!;
        if ((Object.keys(metadata) as (keyof typeof metadata)[]).every(key => existing[key] === metadata[key])) continue;
        await tx.update(ticketTypeStatuses).set(metadata)
          .where(and(eq(ticketTypeStatuses.ticketTypeId, typeId), eq(ticketTypeStatuses.id, existing.id)));
        report.statusesUpdated++;
      }
    }
    if (deletions.length) await assertNoStatusReferences(tx, deletions.flatMap(({ ids }) => ids));
    for (const { typeId, ids } of deletions) {
      const deleted = await tx.delete(ticketTypeStatuses)
        .where(and(eq(ticketTypeStatuses.ticketTypeId, typeId), inArray(ticketTypeStatuses.id, ids)));
      report.statusesRetired += deleted.rowCount ?? 0;
    }
    return report;
  });
  if (report) logger.info(report, "RFP workflow conversion committed");
  else logger.warn("RFP workflow conversion skipped: stable ticket type/status keys are not installed");
  return report;
}
