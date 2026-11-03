import { and, asc, eq } from "drizzle-orm";
import { estimateLines, estimateSections, estimateVersions, plantCatalogItems, plantEnrichment } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import {
  DEFAULT_PALETTE_INTRO, PALETTE_CATEGORY_TOKEN_ORDER, derivePaletteTypeLabel,
  type PlantScheduleRow, type PlantPaletteModel, type ProposalExhibits,
} from "../../../../lib/db/src/plantExhibitContracts";
export { derivePaletteTypeLabel } from "../../../../lib/db/src/plantExhibitContracts";

/** Explicit price-free projection. Every join qualifies company, including enrichment. */
export async function loadPlantLinesForVersion(companyId: string, estimateVersionId: string, connection: typeof db | AppTransaction = db) {
  return connection.select({
    id: estimateLines.id, plantCatalogItemId: plantCatalogItems.id,
    name: estimateLines.name, detail: estimateLines.detail, quantity: estimateLines.quantity,
    includeInPalette: estimateLines.includeInPalette, paletteTypeLabel: estimateLines.paletteTypeLabel,
    commonName: plantCatalogItems.commonName, botanicalName: plantCatalogItems.botanicalName,
    sizeLabel: plantCatalogItems.sizeLabel, category: plantCatalogItems.category, varietyKey: plantCatalogItems.varietyKey,
    imagePath: plantEnrichment.imageStoragePath, foliageType: plantEnrichment.foliageType,
  }).from(estimateLines)
    .innerJoin(estimateVersions, and(eq(estimateVersions.id, estimateLines.versionId), eq(estimateVersions.companyId, companyId)))
    .innerJoin(estimateSections, and(eq(estimateSections.id, estimateLines.sectionId),
      eq(estimateSections.versionId, estimateVersionId), eq(estimateSections.companyId, companyId)))
    .leftJoin(plantCatalogItems, and(eq(plantCatalogItems.id, estimateLines.plantCatalogItemId), eq(plantCatalogItems.companyId, companyId)))
    .leftJoin(plantEnrichment, and(eq(plantEnrichment.varietyKey, plantCatalogItems.varietyKey), eq(plantEnrichment.companyId, companyId)))
    .where(and(eq(estimateLines.companyId, companyId), eq(estimateLines.versionId, estimateVersionId), eq(estimateLines.lineType, "plant")))
    .orderBy(asc(estimateSections.sortOrder), asc(estimateSections.createdAt), asc(estimateSections.id),
      asc(estimateLines.sortOrder), asc(estimateLines.createdAt), asc(estimateLines.id));
}
export type PlantExhibitLine = Awaited<ReturnType<typeof loadPlantLinesForVersion>>[number];
function hundredths(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function quantity(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
/** Input is ordered by section, then line. Only a live size-item ID can combine rows. */
export function buildPlantScheduleModel(lines: readonly PlantExhibitLine[]): PlantScheduleRow[] {
  const rows: PlantScheduleRow[] = [];
  const byItem = new Map<string, PlantScheduleRow>();
  for (const line of lines) {
    const existing = line.plantCatalogItemId ? byItem.get(line.plantCatalogItemId) : undefined;
    if (existing) { existing.quantity = quantity(hundredths(existing.quantity) + hundredths(line.quantity)); continue; }
    const row: PlantScheduleRow = {
      quantity: quantity(hundredths(line.quantity)), name: line.commonName ?? line.name,
      botanicalName: line.botanicalName, size: line.sizeLabel ?? line.detail, imagePath: line.imagePath,
    };
    rows.push(row);
    if (line.plantCatalogItemId) byItem.set(line.plantCatalogItemId, row);
  }
  return rows;
}
/** First occurrence owns display fields; first explicit override beats any category default. */
export function buildPlantPaletteModel(lines: readonly PlantExhibitLine[], introText: string | null): PlantPaletteModel {
  const grouped = new Map<string, PlantPaletteModel["groups"][number]["cards"]>();
  const seen = new Map<string, { card: PlantPaletteModel["groups"][number]["cards"][number]; overridden: boolean }>();
  for (const line of lines) {
    if (!line.includeInPalette) continue;
    const key = line.varietyKey ? `variety:${line.varietyKey}` : line.plantCatalogItemId ? `item:${line.plantCatalogItemId}` : `line:${line.id}`;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.overridden && line.paletteTypeLabel !== null) {
        existing.card.typeLabel = line.paletteTypeLabel;
        existing.overridden = true;
      }
      continue;
    }
    const category = line.category || "other";
    const cards = grouped.get(category) ?? [];
    const card = { id: key, name: line.commonName ?? line.name,
      typeLabel: line.paletteTypeLabel ?? derivePaletteTypeLabel(category, line.foliageType), imagePath: line.imagePath };
    cards.push(card);
    seen.set(key, { card, overridden: line.paletteTypeLabel !== null });
    grouped.set(category, cards);
  }
  const order = [...PALETTE_CATEGORY_TOKEN_ORDER.filter(c => grouped.has(c)),
    ...[...grouped.keys()].filter(c => !PALETTE_CATEGORY_TOKEN_ORDER.includes(c)).sort()];
  return { introText: introText ?? DEFAULT_PALETTE_INTRO, groups: order.map(category => ({ category, cards: grouped.get(category)! })) };
}
/** The caller selects the version once and carries this same model through PDF + snapshot. */
export async function loadProposalExhibits(companyId: string, proposal: {
  estimateId: string | null; paletteIntroText?: string | null;
  estimate?: { number: string; currentVersion: { id: string; versionNumber: number } | null } | null;
}, selectedVersionId?: string): Promise<ProposalExhibits> {
  const versionId = selectedVersionId ?? proposal.estimate?.currentVersion?.id;
  if (!proposal.estimateId || !versionId) throw Object.assign(new Error("ESTIMATE_VERSION_MISSING"), { statusCode: 409 });
  const [version] = await db.select({ id: estimateVersions.id, versionNumber: estimateVersions.versionNumber })
    .from(estimateVersions).where(and(eq(estimateVersions.id, versionId), eq(estimateVersions.companyId, companyId),
      eq(estimateVersions.estimateId, proposal.estimateId)));
  if (!version) throw Object.assign(new Error("ESTIMATE_VERSION_MISSING"), { statusCode: 409 });
  const lines = await loadPlantLinesForVersion(companyId, versionId);
  return { schedule: buildPlantScheduleModel(lines), palette: buildPlantPaletteModel(lines, proposal.paletteIntroText ?? null),
    provenance: { estimateId: proposal.estimateId, estimateNumber: proposal.estimate?.number ?? "",
      versionId, versionNumber: version.versionNumber } };
}
