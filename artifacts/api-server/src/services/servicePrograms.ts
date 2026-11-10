import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { agreementTerms, agreements, customers, servicePrograms, termScopeLines } from "@workspace/db";
import { CAMPAIGN_TERM_STATUSES, summarizeServiceUsage, type ServiceProgramInput } from "../../../../lib/db/src/serviceProgramContracts";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { db, type AppTransaction } from "../db";
import { companyToday } from "../lib/companyDay";

export class ProgramConflict extends Error {
  readonly status = 409;
}
export async function loadServiceProgramUsage(companyId: string, reader: Pick<AppTransaction, "select"> = db) {
  const lines = await reader.select({
    termId: agreementTerms.id, agreementId: agreements.id, customerId: customers.id,
    customerName: customers.name, serviceKey: termScopeLines.serviceKey,
    quantity: termScopeLines.quantity, monthSpread: termScopeLines.monthSpread,
  }).from(termScopeLines)
    .innerJoin(agreementTerms, and(eq(agreementTerms.id, termScopeLines.termId), eq(agreementTerms.companyId, companyId)))
    .innerJoin(agreements, and(eq(agreements.id, agreementTerms.agreementId), eq(agreements.companyId, companyId)))
    .innerJoin(customers, and(eq(customers.id, agreements.customerId), eq(customers.companyId, companyId)))
    .where(and(eq(termScopeLines.companyId, companyId), eq(termScopeLines.included, true),
      inArray(agreementTerms.status, [...CAMPAIGN_TERM_STATUSES]), gte(agreementTerms.endDate, companyToday())));
  return summarizeServiceUsage(SCOPE_CATALOG, lines);
}
/** Serialize all writers, including clear and delete, on the same company/service gate. */
export async function writeServiceProgram<T>(companyId: string, serviceKey: string, write: (tx: AppTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`service-program:${companyId}:${serviceKey}`}, 0))`);
    return write(tx);
  });
}
export async function listServicePrograms(companyId: string) {
  // One snapshot prevents a clear/upsert between the rows and usage projections.
  return db.transaction(async tx => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    const rows = await tx.select().from(servicePrograms).where(eq(servicePrograms.companyId, companyId));
    return { rows, countsInUse: await loadServiceProgramUsage(companyId, tx) };
  });
}
export async function saveServiceProgram(companyId: string, updatedById: string, input: ServiceProgramInput) {
  return writeServiceProgram(companyId, input.serviceKey, async tx => {
    if (input.isStandard) await tx.update(servicePrograms).set({ isStandard: false, updatedById, updatedAt: new Date() })
      .where(and(eq(servicePrograms.companyId, companyId), eq(servicePrograms.serviceKey, input.serviceKey), eq(servicePrograms.isStandard, true)));
    const [row] = await tx.insert(servicePrograms).values({ companyId, updatedById, ...input })
      .onConflictDoUpdate({ target: [servicePrograms.companyId, servicePrograms.serviceKey, servicePrograms.rounds],
        set: { monthSpread: input.monthSpread, isStandard: input.isStandard, updatedById, updatedAt: new Date() } }).returning();
    return row;
  });
}
export async function clearServiceStandard(companyId: string, serviceKey: string, updatedById: string) {
  return writeServiceProgram(companyId, serviceKey, async tx => {
    await tx.update(servicePrograms).set({ isStandard: false, updatedById, updatedAt: new Date() })
      .where(and(eq(servicePrograms.companyId, companyId), eq(servicePrograms.serviceKey, serviceKey), eq(servicePrograms.isStandard, true)));
  });
}
export async function deleteServiceProgram(companyId: string, serviceKey: string, rounds: number) {
  return writeServiceProgram(companyId, serviceKey, async tx => {
    const filter = and(eq(servicePrograms.companyId, companyId), eq(servicePrograms.serviceKey, serviceKey), eq(servicePrograms.rounds, rounds));
    const [row] = await tx.select().from(servicePrograms).where(filter);
    if (!row) return;
    if (row.isStandard) throw new ProgramConflict("Clear the standard before deleting its timing row.");
    const usage = (await loadServiceProgramUsage(companyId, tx)).find(s => s.serviceKey === serviceKey);
    if (usage?.counts.some(c => c.rounds === rounds && c.seasons > 0))
      throw new ProgramConflict("This timing row's count is used by contract seasons. Only unused, non-standard rows can be deleted.");
    await tx.delete(servicePrograms).where(filter);
  });
}
