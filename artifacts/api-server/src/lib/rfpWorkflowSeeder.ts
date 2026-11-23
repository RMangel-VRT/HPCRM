import { and, eq } from "drizzle-orm";
import { ticketTypes, ticketTypeStatuses, ticketTypeFields } from "@workspace/db";
import { db } from "../db";
import { TICKET_TYPE_CAPABILITIES } from "../shared/ticketCapabilities";
import { rfpFieldRows, rfpStatusRows } from "./rfpWorkflowDefinitions";
import { indexRfpRows, lockRfpWorkflow } from "./rfpWorkflowMigration";

export async function ensureRFPRequestTicketType(companyId: string) {
  return db.transaction(async tx => {
    await lockRfpWorkflow(tx);
    let [type] = await tx.select().from(ticketTypes).where(and(
      eq(ticketTypes.companyId, companyId), eq(ticketTypes.typeKey, "rfp_request"),
    )).orderBy(ticketTypes.id);
    if (!type) {
      [type] = await tx.insert(ticketTypes).values({
        companyId, name: "RFP Request", typeKey: "rfp_request",
        description: "Track the full lifecycle of a community requesting a proposal for maintenance services",
        category: "project", icon: "file-plus", color: "#8b5cf6", isActive: "true",
        ...TICKET_TYPE_CAPABILITIES["RFP Request"],
      }).returning();
    }
    const definitions = rfpStatusRows(type.id);
    const existingStatuses = await tx.select().from(ticketTypeStatuses).where(eq(ticketTypeStatuses.ticketTypeId, type.id));
    const statuses = indexRfpRows(existingStatuses, status => status.statusKey, new Set(definitions.map(row => row.statusKey)), type.id);
    const existingFields = await tx.select({ key: ticketTypeFields.fieldKey }).from(ticketTypeFields)
      .where(eq(ticketTypeFields.ticketTypeId, type.id));
    const fieldKeys = new Set(existingFields.map(row => row.key));
    for (const definition of definitions) {
      let status = statuses.get(definition.statusKey);
      if (!status) [status] = await tx.insert(ticketTypeStatuses).values(definition).returning();
      const fields = rfpFieldRows(type.id, status.id, definition.statusKey).filter(field => !fieldKeys.has(field.fieldKey));
      if (fields.length) await tx.insert(ticketTypeFields).values(fields);
    }
    return { typeId: type.id };
  });
}
