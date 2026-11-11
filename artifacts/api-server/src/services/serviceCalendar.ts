import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { agreementTerms, agreements, customers, serviceCalendar, termScopeLines, type ServiceCalendar } from "@workspace/db";
import {
  CAMPAIGN_TERM_STATUSES, STARTING_SERVICE_CALENDAR, summarizeServiceUsage,
  serviceCalendarReplacementSchema, type ServiceCalendarEntry, type ServiceCalendarResponse,
} from "../../../../lib/db/src/serviceCalendarContracts";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { db, type AppTransaction } from "../db";
import { companyToday } from "../lib/companyDay";

export class CalendarConflict extends Error { readonly status = 409; }
const dto = (row: ServiceCalendar): ServiceCalendarEntry => ({
  id: row.id, serviceKey: row.serviceKey, kind: row.kind as ServiceCalendarEntry["kind"], position: row.position,
  name: row.name, opensMd: row.opensMd, dueMd: row.dueMd, inStandard: row.inStandard,
  pattern: row.pattern, includes: row.includes, updatedAt: row.updatedAt.toISOString(),
});
export async function loadServiceCalendarUsage(companyId: string, entries: ServiceCalendarEntry[], reader: Pick<AppTransaction, "select"> = db) {
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
  return summarizeServiceUsage(SCOPE_CATALOG, lines, entries);
}
async function snapshot(tx: AppTransaction, companyId: string): Promise<ServiceCalendarResponse> {
  const rows = await tx.select().from(serviceCalendar).where(eq(serviceCalendar.companyId, companyId))
    .orderBy(asc(serviceCalendar.serviceKey), asc(serviceCalendar.kind), asc(serviceCalendar.position));
  const entries = rows.map(dto);
  return { entries, usage: await loadServiceCalendarUsage(companyId, entries, tx) };
}
/** Company gate serializes empty-only load with replacements. Shared for ordinary
 * replacements; exclusive for load. Service gate serializes all writers for one service. */
async function lockCompany(tx: AppTransaction, companyId: string, exclusive = false) {
  const key = `service-calendar:${companyId}`;
  if (exclusive) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key},0))`);
  else await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${key},0))`);
}
export async function listServiceCalendar(companyId: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    return snapshot(tx, companyId);
  });
}
export async function replaceServiceCalendar(companyId: string, updatedById: string, serviceKey: string, body: unknown) {
  const input = serviceCalendarReplacementSchema(SCOPE_CATALOG, serviceKey).parse(body);
  return db.transaction(async tx => {
    await lockCompany(tx, companyId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`service-calendar:${companyId}:${serviceKey}`},0))`);
    const filter = and(eq(serviceCalendar.companyId, companyId), eq(serviceCalendar.serviceKey, serviceKey));
    const old = await tx.select().from(serviceCalendar).where(filter).for("update");
    const byId = new Map(old.map(row => [row.id, row]));
    for (const entry of input.entries) {
      if (entry.id && (!byId.has(entry.id) || byId.get(entry.id)!.kind !== entry.kind))
        throw new CalendarConflict("An entry is stale, foreign, or belongs to a different kind. Reload before saving.");
    }
    // Removing all rounds also removes the standard, even if the supplied list is empty.
    if (old.some(e => e.inStandard) && !input.entries.some(e => e.inStandard) && !input.allowEmptyStandard)
      throw new CalendarConflict("Explicitly authorize removing the standard. Blank-count seasons become gaps.");
    // Defer only the position key, allowing stable-id swaps without temporary invalid positions.
    await tx.execute(sql`set constraints service_calendar_position_unique deferred`);
    const keep = new Set(input.entries.flatMap(e => e.id ? [e.id] : []));
    const removed = old.filter(e => !keep.has(e.id)).map(e => e.id);
    if (removed.length) await tx.delete(serviceCalendar).where(and(filter, inArray(serviceCalendar.id, removed)));
    for (const entry of input.entries) {
      const { id, ...fields } = entry;
      const values = { ...fields, pattern: fields.pattern ?? null, includes: fields.includes ?? null,
        updatedById, updatedAt: new Date() };
      if (id) await tx.update(serviceCalendar).set(values).where(and(filter, eq(serviceCalendar.id, id)));
      else await tx.insert(serviceCalendar).values({ ...values, companyId, serviceKey });
    }
    await tx.execute(sql`set constraints service_calendar_position_unique immediate`);
    return snapshot(tx, companyId);
  });
}
export async function loadStartingServiceCalendar(companyId: string, updatedById: string) {
  return db.transaction(async tx => {
    await lockCompany(tx, companyId, true);
    const existing = await tx.select({ id: serviceCalendar.id }).from(serviceCalendar)
      .where(eq(serviceCalendar.companyId, companyId)).limit(1);
    if (existing.length) throw new CalendarConflict("The starting calendar can only be loaded into an empty company calendar.");
    await tx.insert(serviceCalendar).values(STARTING_SERVICE_CALENDAR.map(e => ({ ...e, companyId, updatedById })));
    return snapshot(tx, companyId);
  });
}
