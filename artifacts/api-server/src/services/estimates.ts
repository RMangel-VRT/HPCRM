import { and, eq, isNull, sql } from "drizzle-orm";
import { estimates, estimateVersions, estimateSections, estimateLines, estimateNumberCounters, customers, tickets, ticketTypes,
  type CreateEstimateInput, type CreateEstimateLineInput, type PatchEstimateLineInput, type Estimate, type EstimateVersion } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { companyToday } from "../lib/companyDay";
import { isSeededTicketType } from "../shared/ticketCapabilities";
import { parentCustomerError } from "../utils/parentGuard";
import { estimatePayload } from "./estimateReads";
import { EstimateError, requireEstimate, postgresCode } from "./estimateErrors";
import { normalizeQuantity, calculateExtendedCents } from "./estimateMath";
import { snapshotEstimateLine } from "./estimateSnapshots";

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
/** Every existing-document mutation takes the company-qualified container lock
 * FIRST. This serializes ownership checks, last-section deletion and totals. */
async function mutateEstimate(companyId: string, id: string, versionId: string | undefined, work: (context: MutationContext) => Promise<void>) {
  return db.transaction(async tx => {
    const estimate = requireEstimate((await tx.select().from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))).for("update"))[0]);
    if (estimate.voidedAt) throw new EstimateError(409, "ESTIMATE_VOIDED");
    let version: EstimateVersion | undefined;
    if (versionId) {
      version = requireEstimate((await tx.select().from(estimateVersions).where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, id), eq(estimateVersions.id, versionId))))[0]);
      if (version.status !== "draft") throw new EstimateError(409, "VERSION_LOCKED");
    }
    await work({ tx, estimate, version });
    const now = new Date();
    const [refreshed] = await tx.update(estimates).set({ updatedAt: now }).where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))).returning();
    if (version) await tx.update(estimateVersions).set({ updatedAt: now }).where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.id, version.id)));
    // Read before commit also enforces total/frozen-column bounds; any overflow rolls back.
    return estimatePayload(tx, companyId, refreshed, undefined, version?.id);
  });
}
export function retitleEstimate(companyId: string, id: string, title: string) {
  return mutateEstimate(companyId, id, undefined, async ({ tx }) => {
    await tx.update(estimates).set({ title }).where(and(eq(estimates.companyId, companyId), eq(estimates.id, id)));
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
export function createLine(companyId: string, id: string, versionId: string, input: CreateEstimateLineInput) {
  return mutateEstimate(companyId, id, versionId, async ({ tx, estimate }) => {
    await sectionFor(tx, companyId, versionId, input.sectionId);
    const snapshot = await snapshotEstimateLine(tx, companyId, estimate.customerId, input);
    const quantity = normalizeQuantity(input.quantity);
    const rows = await tx.select({ sortOrder: estimateLines.sortOrder }).from(estimateLines).where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, versionId), eq(estimateLines.sectionId, input.sectionId)));
    const sortOrder = rows.reduce((max, l) => Math.max(max, l.sortOrder), -1) + 1;
    if (sortOrder > 2147483647) throw new RangeError("Sort order overflow");
    await tx.insert(estimateLines).values({ ...snapshot, companyId, versionId, sectionId: input.sectionId, lineType: input.lineType, quantity,
      extendedCents: calculateExtendedCents(quantity, snapshot.unitPriceCents), includeInPalette: input.lineType === "plant", sortOrder });
    await touchSection(tx, companyId, input.sectionId);
  });
}
export function patchLine(companyId: string, id: string, versionId: string, lineId: string, raw: PatchEstimateLineInput) {
  // Drop undefined while retaining explicit null. No create defaults are reused.
  const input = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as PatchEstimateLineInput;
  return mutateEstimate(companyId, id, versionId, async ({ tx }) => {
    const line = requireEstimate((await tx.select().from(estimateLines).where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, versionId), eq(estimateLines.id, lineId))))[0]);
    if (!["equipment", "fee", "custom"].includes(line.lineType) && ["unit", "name", "detail", "umbrellaKey"].some(k => Object.hasOwn(input, k))) throw new EstimateError(400, "FIELD_NOT_EDITABLE");
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
