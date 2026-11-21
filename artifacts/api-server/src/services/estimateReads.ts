import { and, eq, inArray, isNull, isNotNull, ilike, or, desc, asc, getTableColumns } from "drizzle-orm";
import { estimates, estimateVersions, estimateSections, estimateLines, estimateVersionPhotos, communications, customers, estimateLineNeedsPrice, type Estimate, type EstimateVersion, type EstimateLine } from "@workspace/db";
import type { IssuedEstimateAttachment } from "@workspace/db/estimate-contracts";
import { db, type AppTransaction } from "../db";
import { computeVersionTotals } from "./estimateMath";
import { requireEstimate } from "./estimateErrors";
import { estimateDisplay } from "./estimateDisplay";
import { loadPlantLinesForVersion, derivePaletteTypeLabel } from "./proposalExhibits";

export type EstimateConnection = typeof db | AppTransaction;
const { revisionIdMap: _revisionIdMap, emailIssue: _emailIssue, ...versionColumns } = getTableColumns(estimateVersions);
type VisibleEstimateVersion = Omit<EstimateVersion, "revisionIdMap" | "emailIssue"> & {
  issuedAttachment?: IssuedEstimateAttachment; emailedTo?: string[]; emailDelivery?: "sending" | "delivered" | "uncertain";
};
export function estimateLinePayload(line: EstimateLine) {
  return { ...line, needsPrice: estimateLineNeedsPrice(line) };
}
export function readEstimatePhotoRows(tx: EstimateConnection, companyId: string, versionId: string) {
  return tx.select().from(estimateVersionPhotos)
    .where(and(eq(estimateVersionPhotos.companyId, companyId), eq(estimateVersionPhotos.versionId, versionId)))
    .orderBy(asc(estimateVersionPhotos.displayOrder), asc(estimateVersionPhotos.id));
}
export async function versionPayload(tx: EstimateConnection, companyId: string, version: VisibleEstimateVersion) {
  const sections = await tx.select().from(estimateSections).where(and(eq(estimateSections.companyId, companyId), eq(estimateSections.versionId, version.id)))
    .orderBy(asc(estimateSections.sortOrder), asc(estimateSections.createdAt), asc(estimateSections.id));
  const lines = await tx.select().from(estimateLines).where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, version.id)))
    .orderBy(asc(estimateLines.sortOrder), asc(estimateLines.createdAt), asc(estimateLines.id));
  const totals = computeVersionTotals(lines);
  const plantDefaults = new Map((lines.some(l => l.lineType === "plant")
    ? await loadPlantLinesForVersion(companyId, version.id, tx) : [])
    .map(l => [l.id, derivePaletteTypeLabel(l.category || "other", l.foliageType)]));
  // Aggregate snapshots are authoritative once frozen. Breakdown/margin still
  // derive from the immutable line snapshots, never from live catalog values.
  if (version.status !== "draft" && version.frozenSubtotalCents !== null) {
    totals.subtotalCents = version.frozenSubtotalCents;
    totals.costKnownCents = version.frozenCostKnownCents ?? totals.costKnownCents;
    totals.costUnknownLines = version.frozenCostUnknownLines ?? totals.costUnknownLines;
  }
  // Empty sections still have an authoritative zero subtotal.
  for (const section of sections) totals.bySection[section.id] ??= 0;
  const grouped = new Map<string, ReturnType<typeof estimateLinePayload>[]>();
  for (const line of lines) {
    const group = grouped.get(line.sectionId) ?? [];
    group.push(estimateLinePayload(line)); grouped.set(line.sectionId, group);
  }
  // Live presentation metadata is separate from immutable commercial line snapshots.
  const photos = (await readEstimatePhotoRows(tx, companyId, version.id))
    .map(({ id, filename, mimeType, fileSize, caption, displayOrder, createdAt }) =>
      ({ id, filename, mimeType, fileSize, caption, displayOrder, createdAt }));
  return { ...version, photos, plantPaletteDefaults: Object.fromEntries(plantDefaults),
    sections: sections.map(section => ({ ...section, lines: grouped.get(section.id) ?? [] })), totals };
}
export async function estimatePayload(tx: EstimateConnection, companyId: string, estimate: Estimate, versionNumber?: number, affectedVersionId?: string) {
  const rows = await tx.select({ ...versionColumns, emailIssue: estimateVersions.emailIssue }).from(estimateVersions).where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimate.id)))
    .orderBy(desc(estimateVersions.versionNumber));
  const issuedIds = rows.flatMap(v => v.emailIssue && v.emailIssue.firstCommunicationId !== v.emailIssue.pendingCommunicationId
    ? [v.emailIssue.firstCommunicationId] : []);
  const receipts = issuedIds.length ? await tx.select({ id: communications.id, to: communications.toAddresses,
    fromName: communications.fromName, fromAddress: communications.fromAddress }).from(communications)
    .where(and(eq(communications.companyId, companyId), eq(communications.routingMethod, "estimate_email"),
      eq(communications.deliveryStatus, "sent"), inArray(communications.id, issuedIds))) : [];
  const byId = new Map(receipts.map(r => [r.id, r]));
  const versions: VisibleEstimateVersion[] = rows.map(({ emailIssue, ...row }) => {
    if (!emailIssue) return row;
    const emailDelivery = emailIssue.uncertain ? "uncertain" : emailIssue.pendingCommunicationId ? "sending" : "delivered";
    if (emailIssue.firstCommunicationId === emailIssue.pendingCommunicationId) return { ...row, emailDelivery };
    const receipt = byId.get(emailIssue.firstCommunicationId);
    return { ...row, emailDelivery,
      issuedAttachment: { filename: emailIssue.filename, pageCount: emailIssue.pageCount },
      emailedTo: receipt?.to ?? [],
      ...(receipt?.fromAddress ? { emailedFrom: { name: receipt.fromName, address: receipt.fromAddress } } : {}) };
  });
  const version = requireEstimate(versions.find(v => versionNumber !== undefined ? v.versionNumber === versionNumber : v.id === (affectedVersionId ?? estimate.currentVersionId)));
  return { ...estimate, versions,
    display: await estimateDisplay(tx, companyId, estimate),
    version: await versionPayload(tx, companyId, version) };
}
export async function readEstimate(companyId: string, id: string, versionNumber?: number) {
  return db.transaction(async tx => {
    const estimate = requireEstimate((await tx.select().from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))))[0]);
    return estimatePayload(tx, companyId, estimate, versionNumber);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export interface EstimateListFilters { customerId?: string; ticketId?: string; search?: string; includeVoid?: "true" | "false"; status?: "open" | "sent" | "accepted" | "declined" | "void" }
/** At most three bounded queries irrespective of container count; no catalog/rate joins. */
export async function listEstimates(companyId: string, filters: EstimateListFilters) {
  return db.transaction(async tx => {
    const rows = await tx.select({ estimate: estimates, customerName: customers.name, currentVersion: versionColumns })
      .from(estimates).innerJoin(customers, and(eq(customers.id, estimates.customerId), eq(customers.companyId, companyId)))
      .leftJoin(estimateVersions, and(eq(estimateVersions.id, estimates.currentVersionId), eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimates.id)))
      .where(and(eq(estimates.companyId, companyId),
        filters.status === "void" ? isNotNull(estimates.voidedAt) : filters.status === "open" || filters.includeVoid !== "true" ? isNull(estimates.voidedAt) : undefined,
        filters.status === "open" ? inArray(estimateVersions.status, ["draft", "sent"])
          : filters.status && filters.status !== "void" ? eq(estimateVersions.status, filters.status) : undefined,
        filters.customerId ? eq(estimates.customerId, filters.customerId) : undefined,
        filters.ticketId ? eq(estimates.ticketId, filters.ticketId) : undefined,
        filters.search ? or(ilike(estimates.title, `%${filters.search}%`), ilike(estimates.estimateNumber, `%${filters.search}%`), ilike(customers.name, `%${filters.search}%`)) : undefined))
      .orderBy(desc(estimates.updatedAt), desc(estimates.id));
    const draftIds = rows.flatMap(r => r.currentVersion?.status === "draft" ? [r.currentVersion.id] : []);
    const lines = draftIds.length ? await tx.select().from(estimateLines).where(and(eq(estimateLines.companyId, companyId), inArray(estimateLines.versionId, draftIds))) : [];
    const grouped = new Map<string, EstimateLine[]>();
    for (const line of lines) { const group = grouped.get(line.versionId) ?? []; group.push(line); grouped.set(line.versionId, group); }
    const versions = rows.length ? await tx.select(versionColumns).from(estimateVersions).where(and(eq(estimateVersions.companyId, companyId),
      inArray(estimateVersions.estimateId, rows.map(r => r.estimate.id)))).orderBy(desc(estimateVersions.versionNumber)) : [];
    const histories = new Map<string, VisibleEstimateVersion[]>();
    for (const v of versions) { const history = histories.get(v.estimateId) ?? []; history.push(v); histories.set(v.estimateId, history); }
    return rows.map(({ estimate, customerName, currentVersion }) => ({
      ...estimate, customerName, currentVersionNumber: currentVersion?.versionNumber ?? null, currentVersionStatus: currentVersion?.status ?? null,
      versions: histories.get(estimate.id) ?? [],
      subtotalCents: currentVersion?.status === "draft" ? computeVersionTotals(grouped.get(currentVersion.id) ?? []).subtotalCents : currentVersion?.frozenSubtotalCents ?? null,
    }));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
