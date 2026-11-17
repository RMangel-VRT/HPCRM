import { buildPlantScheduleModel, derivePaletteTypeLabel, type PlantExhibitLine } from "./proposalExhibits";

/** Internal PDF projection only: preserve schedule identity, never join by name. */
export function proposalPlantRows(lines: readonly PlantExhibitLine[]) {
  const keys = new Map<string, { typeLabel: string; overridden: boolean }>();
  const ordered: { typeLabel: string; overridden: boolean }[] = [];
  for (const line of lines) {
    const key = line.plantCatalogItemId ? `item:${line.plantCatalogItemId}` : `line:${line.id}`;
    const existing = keys.get(key);
    if (existing) {
      if (!existing.overridden && line.paletteTypeLabel !== null) {
        existing.typeLabel = line.paletteTypeLabel;
        existing.overridden = true;
      }
    } else {
      const label = { typeLabel: line.paletteTypeLabel ?? derivePaletteTypeLabel(line.category || "other", line.foliageType),
        overridden: line.paletteTypeLabel !== null };
      keys.set(key, label);
      ordered.push(label);
    }
  }
  return buildPlantScheduleModel(lines).map((row, i) => ({ ...row, typeLabel: ordered[i].typeLabel }));
}
