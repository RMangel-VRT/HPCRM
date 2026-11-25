import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { estimates, estimateVersions, estimateSections, estimateLines, estimateNumberCounters, customers, tickets, ticketTypes,
  type CreateEstimateInput, type CreateEstimateLineInput, type PatchEstimateLineInput, type Estimate, type EstimateVersion } from "@workspace/db";
import { estimateCatalogReference, matchesEstimateCatalogReference, type EstimateOrderInput, type ReplaceEstimateLineInput,
  type EstimateDiscountInput, type PatchEstimateVersionInput } from "@workspace/db/estimate-contracts";
import { db, type AppTransaction } from "../db";
import { companyToday } from "../lib/companyDay";
import { isSeededTicketType } from "../shared/ticketCapabilities";
import { parentCustomerError } from "../utils/parentGuard";
import { estimatePayload } from "./estimateReads";
import { EstimateError, requireEstimate, postgresCode } from "./estimateErrors";
import { normalizeQuantity, calculateExtendedCents, moneyStringToCents, percentStringToBasisPoints } from "./estimateMath";
import { snapshotEstimateLine } from "./estimateSnapshots";
import { saveCustomCatalogItem, conflictingQuickItem } from "./estimateCatalogSaves";

export async function createEstimate(companyId: string, userId: string | null, input: CreateEstimateInput, now = new Date()) {
  try {
    return await db.transaction(async tx => {
    // Ticket lock makes duplicate races deterministic before allocating a number.
    // The partial unique index remains the final database-enforced authority.
    if (input.ticketId) {
      const ticket = requireEstimate((await tx.select().from(tickets).where(and(eq(tickets.companyId, companyId), eq(tickets.id, input.ticketId))).for("update"))[0]);
      const type = requireEstimate((await tx.select().from(ticketTypes).where(and(eq(ticketTypes.companyId, companyId), eq(ticketTypes.id, ticket.ticketTypeId))))[0]);
      if (!isSeededTicketType(type, "estimate_request")) throw new EstimateError(400, "INVALID_TICKET_TYPE");
      if (!ticket.customerId || ticket.customerId !== input.customerId) throw new EstimateError(400, "TICKET_CUSTOMER_MISMATCH");
      const existing = (await tx.select({ id: estimates.id }).from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.ticketId, ticket.id), isNull(estimates.voidedAt))))[0];
      if (existing) throw new EstimateError(409, "ESTIMATE_EXISTS", { existingEstimateId: existing.id });
    }
    const customer = requireEstimate((await tx.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, input.customerId))).for("share"))[0]);
    const parent = parentCustomerError(customer);
    if (parent) throw new EstimateError(400, parent.error, { message: parent.message, parentCustomerId: parent.parentCustomerId });
    const year = Number(companyToday(now).slice(0, 4));
    const [counter] = await tx.insert(estimateNumberCounters).values({ companyId, year, lastValue: 1 })
      .onConflictDoUpdate({ target: [estimateNumberCounters.companyId, estimateNumberCounters.year], set: { lastValue: sql`${estimateNumberCounters.lastValue} + 1` } }).returning();
    const estimateNumber = `EST-${year}-${String(counter.lastValue).padStart(4, "0")}`;
    let [estimate] = await tx.insert(estimates).values({ companyId, customerId: customer.id, title: input.title, ticketId: input.ticketId ?? null, estimateNumber, createdById: userId }).returning();
    const [version] = await tx.insert(estimateVersions).values({ companyId, estimateId: estimate.id, versionNumber: 1, createdById: userId }).returning();
    await tx.insert(estimateSections).values({ companyId, versionId: version.id, name: "Main" });
    [estimate] = await tx.update(estimates).set({ currentVersionId: version.id }).where(and(eq(estimates.companyId, companyId), eq(estimates.id, estimate.id))).returning();
    // Automatic compatibility mirror, NOT a second numbering authority.
    if (input.ticketId) await tx.update(tickets).set({ estimateNumber, updatedAt: new Date() }).where(and(eq(tickets.companyId, companyId), eq(tickets.id, input.ticketId)));
    return estimatePayload(tx, companyId, estimate);
    });
  } catch (error) {
    // Also cover a unique-index race with another trusted writer. Query only
    // after the failed transaction has rolled back; never return PG detail.
    if (input.ticketId && postgresCode(error) === "23505") {
      const [existing] = await db.select({ id: estimates.id }).from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.ticketId, input.ticketId), isNull(estimates.voidedAt)));
      if (existing) throw new EstimateError(409, "ESTIMATE_EXISTS", { existingEstimateId: existing.id });
    }
    throw error;
  }
}

type MutationContext = { tx: AppTransaction; estimate: Estimate; version?: EstimateVersion };
export async function withDraftEstimate<T>(companyId: string, id: string, versionId: string | undefined, work: (context: MutationContext) => Promise<T>) {
  return db.transaction(async tx => {
    const estimate = requireEstimate((await tx.select().from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))).for("update"))[0]);
    if (estimate.voidedAt) throw new EstimateError(409, "ESTIMATE_VOIDED");
    let version: EstimateVersion | undefined;
    if (versionId) {
      version = requireEstimate((await tx.select().from(estimateVersions).where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, id), eq(estimateVersions.id, versionId))))[0]);
      if (version.status !== "draft") throw new EstimateError(409, "VERSION_LOCKED");
      if (version.emailIssue) throw new EstimateError(409, "ESTIMATE_EMAIL_IN_PROGRESS");
    } else if (estimate.currentVersionId) {
      const [current] = await tx.select({ status: estimateVersions.status, emailIssue: estimateVersions.emailIssue }).from(estimateVersions)
        .where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, id), eq(estimateVersions.id, estimate.currentVersionId)));
      if (current?.status === "draft" && current.emailIssue) throw new EstimateError(409, "ESTIMATE_EMAIL_IN_PROGRESS");
    }
    return work({ tx, estimate, version });
  });
}
/** Every existing-document mutation takes the company-qualified container lock
 * FIRST. This serializes ownership checks, last-section deletion and totals. */
export async function mutateEstimate(companyId: string, id: string, versionId: string | undefined, work: (context: MutationContext) => Promise<void | string>) {
  return withDraftEstimate(companyId, id, versionId, async ({ tx, estimate, version }) => {
    const affectedLineId = await work({ tx, estimate, version });
    const now = new Date();
    const [refreshed] = await tx.update(estimates).set({ updatedAt: now }).where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))).returning();
    if (version) await tx.update(estimateVersions).set({ updatedAt: now }).where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.id, version.id)));
    // Read before commit also enforces total/frozen-column bounds; any overflow rolls back.
    const payload = await estimatePayload(tx, companyId, refreshed, undefined, version?.id);
    return affectedLineId ? { ...payload, affectedLineId } : payload;
  });
}
export function retitleEstimate(companyId: string, id: string, title: string) {
  return mutateEstimate(companyId, id, undefined, async ({ tx }) => {
    await tx.update(estimates).set({ title }).where(and(eq(estimates.companyId, companyId), eq(estimates.id, id)));
  });
}
/** Exact wire → stored conversion: percent string → basis points, dollars → cents.
 * Blank labels store NULL so documents render the default label. */
function discountColumns(input: EstimateDiscountInput | null | undefined) {
  if (input === undefined) return { kind: undefined, value: undefined, label: undefined };
  if (input === null) return { kind: null, value: null, label: null };
  return { kind: input.kind, value: input.kind === "percent" ? percentStringToBasisPoints(input.value) : moneyStringToCents(input.value),
    label: input.label?.trim() || null };
}
export function patchVersion(companyId: string, id: string, versionId: string, input: PatchEstimateVersionInput) {
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    const labor = discountColumns(input.laborDiscount), total = discountColumns(input.totalDiscount);
    await tx.update(estimateVersions).set({
      scopeOfWork: input.scopeOfWork === undefined ? undefined : input.scopeOfWork?.trim() ? input.scopeOfWork : null,
      includePlantTable: input.includePlantTable,
      laborDiscountKind: labor.kind, laborDiscountValue: labor.value, laborDiscountLabel: labor.label,
      totalDiscountKind: total.kind, totalDiscountValue: total.value, totalDiscountLabel: total.label,
    })
      .where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, id), eq(estimateVersions.id, versionId)));
  });
}
async function sectionFor(tx: AppTransaction, companyId: string, versionId: string, sectionId: string) {
  return requireEstimate((await tx.select().from(estimateSections).where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.versionId, versionId), eq(estimateSections.id, sectionId))))[0]);
}
async function touchSection(tx: AppTransaction, companyId: string, sectionId: string) {
  await tx.update(estimateSections).set({ updatedAt: new Date() }).where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.id, sectionId)));
}
export function createSection(companyId: string, id: string, versionId: string, name: string) {
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    const existing = await tx.select({ sortOrder: estimateSections.sortOrder }).from(estimateSections).where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.versionId, versionId)));
    const next = existing.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;
    if (next > 2147483647) throw new RangeError("Sort order overflow");
    await tx.insert(estimateSections).values({ companyId, versionId, name, sortOrder: next });
  });
}
export function patchSection(companyId: string, id: string, versionId: string, sectionId: string, input: { name?: string; sortOrder?: number }) {
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    await sectionFor(tx, companyId, versionId, sectionId);
    await tx.update(estimateSections).set({ ...input, updatedAt: new Date() }).where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.id, sectionId)));
  });
}
export function deleteSection(companyId: string, id: string, versionId: string, sectionId: string) {
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    await sectionFor(tx, companyId, versionId, sectionId);
    const sections = await tx.select({ id: estimateSections.id }).from(estimateSections).where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.versionId, versionId)));
    if (sections.length <= 1) throw new EstimateError(409, "LAST_SECTION");
    await tx.delete(estimateSections).where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.id, sectionId)));
  });
}
export async function createLine(companyId: string, id: string, versionId: string, input: CreateEstimateLineInput) {
  try {
  return await mutateEstimate(companyId, id, versionId, async ({ tx, estimate }) => {
    await sectionFor(tx, companyId, versionId, input.sectionId);
    const reference = input.lineType === "custom" && input.saveToCatalog
      ? await saveCustomCatalogItem(tx, companyId, input) : input;
    const snapshot = await snapshotEstimateLine(tx, companyId, estimate.customerId, reference);
    const quantity = normalizeQuantity(input.quantity);
    const rows = await tx.select({ sortOrder: estimateLines.sortOrder }).from(estimateLines).where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, versionId), eq(estimateLines.sectionId, input.sectionId)));
    const sortOrder = rows.reduce((max, l) => Math.max(max, l.sortOrder), -1) + 1;
    if (sortOrder > 2147483647) throw new RangeError("Sort order overflow");
    const [inserted] = await tx.insert(estimateLines).values({ ...snapshot, companyId, versionId, sectionId: input.sectionId, lineType: reference.lineType, quantity,
      extendedCents: calculateExtendedCents(quantity, snapshot.unitPriceCents), includeInPalette: input.lineType === "plant", sortOrder }).returning({ id: estimateLines.id });
    await touchSection(tx, companyId, input.sectionId);
    return inserted.id;
  });
  } catch (error) {
    if (input.lineType === "custom" && input.saveToCatalog && input.saveToCatalog.catalog !== "hardscape" && postgresCode(error) === "23505") {
      const existing = await conflictingQuickItem(companyId, input.name);
      if (existing) throw new EstimateError(409, "CATALOG_ITEM_EXISTS", { existing });
    }
    throw error;
  }
}
export function patchLine(companyId: string, id: string, versionId: string, lineId: string, raw: PatchEstimateLineInput) {
  // Drop undefined while retaining explicit null. No create defaults are reused.
  const input = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as PatchEstimateLineInput;
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    const line = requireEstimate((await tx.select().from(estimateLines).where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, versionId), eq(estimateLines.id, lineId))))[0]);
    if ((estimateCatalogReference(line) || line.priceSource === "quick_list" || !["service", "equipment", "fee", "custom"].includes(line.lineType))
      && ["unit", "name", "umbrellaKey"].some(k => Object.hasOwn(input, k))) throw new EstimateError(400, "FIELD_NOT_EDITABLE");
    if (line.lineType !== "plant" && ["includeInPalette", "paletteTypeLabel"].some(k => Object.hasOwn(input, k))) throw new EstimateError(400, "PLANT_ONLY_FIELD");
    await sectionFor(tx, companyId, versionId, line.sectionId);
    if (input.sectionId) await sectionFor(tx, companyId, versionId, input.sectionId);
    const quantity = normalizeQuantity(input.quantity ?? line.quantity);
    const unitPriceCents = input.unitPriceCents ?? line.unitPriceCents;
    await tx.update(estimateLines).set({ ...input, quantity, unitPriceCents, extendedCents: calculateExtendedCents(quantity, unitPriceCents),
      priceSource: unitPriceCents !== line.unitPriceCents ? "manual" : line.priceSource, updatedAt: new Date() })
      .where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.id, lineId)));
    await touchSection(tx, companyId, line.sectionId);
    if (input.sectionId && input.sectionId !== line.sectionId) await touchSection(tx, companyId, input.sectionId);
  });
}
export function deleteLine(companyId: string, id: string, versionId: string, lineId: string) {
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    const line = requireEstimate((await tx.select().from(estimateLines).where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, versionId), eq(estimateLines.id, lineId))))[0]);
    await sectionFor(tx, companyId, versionId, line.sectionId);
    await tx.delete(estimateLines).where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.id, lineId)));
    await touchSection(tx, companyId, line.sectionId);
  });
}

/** Feed the updates as bound data so even a large estimate uses a fixed number of statements. */
async function writeLineOrder(tx: AppTransaction, companyId: string, versionId: string,
  rows: { id: string; section_id: string; sort_order: number }[]) {
  if (!rows.length) return;
  await tx.execute(sql`UPDATE ${estimateLines} AS l
    SET section_id = x.section_id, sort_order = x.sort_order, updated_at = now()
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(id text, section_id text, sort_order integer)
    WHERE l.company_id = ${companyId} AND l.version_id = ${versionId} AND l.id = x.id
      AND (l.section_id, l.sort_order) IS DISTINCT FROM (x.section_id, x.sort_order)`);
}

export function reorderEstimate(companyId: string, id: string, versionId: string, input: EstimateOrderInput) {
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    const sections = new Set((await tx.select({ id: estimateSections.id }).from(estimateSections)
      .where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.versionId, versionId)))).map(s => s.id));
    const lines = new Set((await tx.select({ id: estimateLines.id }).from(estimateLines)
      .where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, versionId)))).map(l => l.id));
    for (const section of input.sections) {
      if (!sections.delete(section.id)) throw new EstimateError(400, "INVALID_ESTIMATE_ORDER");
      for (const lineId of section.lineIds) if (!lines.delete(lineId)) throw new EstimateError(400, "INVALID_ESTIMATE_ORDER");
    }
    if (sections.size || lines.size) throw new EstimateError(400, "INVALID_ESTIMATE_ORDER");
    await tx.execute(sql`UPDATE ${estimateSections} AS s
      SET sort_order = x.sort_order, updated_at = now()
      FROM jsonb_to_recordset(${JSON.stringify(input.sections.map((s, i) => ({ id: s.id, sort_order: i })))}::jsonb) AS x(id text, sort_order integer)
      WHERE s.company_id = ${companyId} AND s.version_id = ${versionId} AND s.id = x.id`);
    await writeLineOrder(tx, companyId, versionId, input.sections.flatMap(s => s.lineIds.map((lineId, i) =>
      ({ id: lineId, section_id: s.id, sort_order: i }))));
  });
}

async function lineFor(tx: AppTransaction, companyId: string, versionId: string, lineId: string) {
  return requireEstimate((await tx.select().from(estimateLines).where(and(eq(estimateLines.companyId, companyId),
    eq(estimateLines.versionId, versionId), eq(estimateLines.id, lineId))))[0]);
}

export function duplicateEstimateLine(companyId: string, id: string, versionId: string, lineId: string) {
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    const line = await lineFor(tx, companyId, versionId, lineId);
    const siblings = await tx.select({ id: estimateLines.id }).from(estimateLines).where(and(eq(estimateLines.companyId, companyId),
      eq(estimateLines.versionId, versionId), eq(estimateLines.sectionId, line.sectionId)))
      .orderBy(asc(estimateLines.sortOrder), asc(estimateLines.createdAt), asc(estimateLines.id));
    // Resequence legacy rows as well: tied positions otherwise make "after" ambiguous.
    const next = siblings.findIndex(s => s.id === lineId) + 1;
    await writeLineOrder(tx, companyId, versionId, siblings.map((s, i) =>
      ({ id: s.id, section_id: line.sectionId, sort_order: i < next ? i : i + 1 })));
    const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = line;
    const [inserted] = await tx.insert(estimateLines).values({ ...copy, sortOrder: next }).returning({ id: estimateLines.id });
    await touchSection(tx, companyId, line.sectionId);
    return inserted.id;
  });
}

export function replaceEstimateLine(companyId: string, id: string, versionId: string, lineId: string, input: ReplaceEstimateLineInput) {
  return mutateEstimate(companyId, id, versionId, async ({ tx, estimate }) => {
    const line = await lineFor(tx, companyId, versionId, lineId);
    const { keepPrice, priceOnly, ...reference } = input;
    const sameReference = matchesEstimateCatalogReference(line, reference);
    if (priceOnly && keepPrice !== false) throw new EstimateError(400, "INVALID_REQUEST");
    if (priceOnly && !sameReference) throw new EstimateError(409, "ESTIMATE_LINE_CHANGED");
    const snapshot = await snapshotEstimateLine(tx, companyId, estimate.customerId, { ...reference, sectionId: line.sectionId, quantity: line.quantity });
    const scope = and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, versionId), eq(estimateLines.id, lineId));
    if (keepPrice === false && sameReference) {
      // Refresh rate provenance, not the product snapshot or customer edits.
      await tx.update(estimateLines).set({
        unitPriceCents: snapshot.unitPriceCents, priceSource: snapshot.priceSource, termId: snapshot.termId ?? null,
        extendedCents: calculateExtendedCents(line.quantity, snapshot.unitPriceCents), updatedAt: new Date(),
      }).where(scope);
      await touchSection(tx, companyId, line.sectionId);
      return;
    }
    const manual = keepPrice && line.priceSource === "manual";
    const unitPriceCents = manual ? line.unitPriceCents : snapshot.unitPriceCents;
    await tx.update(estimateLines).set({
      plantCatalogItemId: null, hardscapeCatalogItemId: null, irrigationCatalogItemId: null, quickItemId: null, rateKey: null, termId: null,
      ...snapshot, lineType: reference.lineType, unitPriceCents, priceSource: manual ? "manual" : snapshot.priceSource,
      includeInPalette: reference.lineType === "plant",
      paletteTypeLabel: reference.lineType === "plant" && line.plantCatalogItemId === reference.plantCatalogItemId ? line.paletteTypeLabel : null,
      extendedCents: calculateExtendedCents(line.quantity, unitPriceCents), updatedAt: new Date(),
    }).where(scope);
    await touchSection(tx, companyId, line.sectionId);
  });
}
