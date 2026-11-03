import { describe, expect, it } from "vitest";
import { buildPlantPaletteModel, buildPlantScheduleModel, derivePaletteTypeLabel, type PlantExhibitLine } from "./proposalExhibits";
import { DEFAULT_PALETTE_INTRO, proposalExhibitSettingsSchema } from "../../../../lib/db/src/plantExhibitContracts";

const line = (override: Partial<PlantExhibitLine> = {}): PlantExhibitLine => ({
  id: "l1", plantCatalogItemId: "size1", name: "Snapshot name", detail: "Snapshot size",
  quantity: "1.10", includeInPalette: true, paletteTypeLabel: null, commonName: "Pine",
  botanicalName: "Pinus", sizeLabel: "5 gal", category: "tree", varietyKey: "pine", imagePath: "/image",
  foliageType: "Evergreen", ...override,
});
describe("renderer-independent plant exhibits", () => {
  it("combines live size items into their first occurrence with exact decimal quantities", () => {
    const model = buildPlantScheduleModel([
      line(), line({ id: "l2", plantCatalogItemId: "size2", sizeLabel: "10 gal", quantity: "0.20" }),
      line({ id: "l3", quantity: "2.20", commonName: "Later name" }),
    ]);
    expect(model).toEqual([
      { quantity: "3.30", name: "Pine", botanicalName: "Pinus", size: "5 gal", imagePath: "/image" },
      { quantity: "0.20", name: "Pine", botanicalName: "Pinus", size: "10 gal", imagePath: "/image" },
    ]);
  });
  it("keeps deleted-catalog lines separate with snapshot fallbacks", () => {
    const missing = { plantCatalogItemId: null, commonName: null, botanicalName: null, sizeLabel: null, imagePath: null, category: null, varietyKey: null };
    const lines = [line({ ...missing, id: "a" }), line({ ...missing, id: "b", name: "Other selection" })];
    expect(buildPlantScheduleModel(lines)).toEqual([
      { quantity: "1.10", name: "Snapshot name", botanicalName: null, size: "Snapshot size", imagePath: null },
      { quantity: "1.10", name: "Other selection", botanicalName: null, size: "Snapshot size", imagePath: null },
    ]);
    expect(buildPlantPaletteModel(lines, "").groups[0].cards).toHaveLength(2);
  });
  it("filters palette lines, deduplicates across sizes and resolves conflicts by estimate order", () => {
    const model = buildPlantPaletteModel([
      line({ includeInPalette: false, paletteTypeLabel: "Ignored" }),
      line({ id: "selected", paletteTypeLabel: "Screening tree" }),
      line({ id: "later", plantCatalogItemId: "size2", commonName: "Later", paletteTypeLabel: "Later" }),
    ], null);
    expect(model).toEqual({ introText: DEFAULT_PALETTE_INTRO, groups: [{ category: "tree", cards: [
      { id: "variety:pine", name: "Pine", typeLabel: "Screening tree", imagePath: "/image" },
    ] }] });
    expect(buildPlantPaletteModel([line(), line({ paletteTypeLabel: "Later" })], "").groups[0].cards[0].typeLabel).toBe("Later");
  });
  it("sorts known categories first and unknown categories alphabetically; missing varieties retain selections", () => {
    const categories = ["zzz", "vine", "shrub", "aaa", "tree", "ornamental_grass", "perennial", "shrub_rose"];
    const lines = categories.map((category, i) => line({ id: String(i), varietyKey: String(i), category: category as PlantExhibitLine["category"] }));
    expect(buildPlantPaletteModel(lines, "").groups.map(g => g.category)).toEqual(["tree", "shrub", "perennial", "shrub_rose", "vine", "ornamental_grass", "aaa", "zzz"]);
    expect(buildPlantPaletteModel([line({ varietyKey: null }), line({ id: "b", varietyKey: null, plantCatalogItemId: "size2" })], "").groups[0].cards).toHaveLength(2);
  });
  it("has empty models, NULL-only intro default and a price-free allowlist", () => {
    expect(buildPlantScheduleModel([])).toEqual([]);
    expect(buildPlantPaletteModel([], "")).toEqual({ introText: "", groups: [] });
    expect(buildPlantPaletteModel([], null).introText).toBe(DEFAULT_PALETTE_INTRO);
    const dirty = { ...line(), unitPriceCents: 123, unitCostCents: 10, extendedCents: 100, totals: 999 };
    expect(JSON.stringify([buildPlantScheduleModel([dirty]), buildPlantPaletteModel([dirty], "")])).not.toMatch(/price|cost|totals|Cents/i);
  });
  it("preserves legacy labels, including optional evergreen distinction", () => {
    expect(derivePaletteTypeLabel("tree")).toBe("Tree");
    expect(derivePaletteTypeLabel("tree", "Broadleaf Evergreen")).toBe("Evergreen Tree");
    expect(derivePaletteTypeLabel("rose")).toBe("Flowering Shrub");
    expect(derivePaletteTypeLabel("unusual_category")).toBe("Unusual Category");
  });
  it("validates switches and nullable intro without injecting defaults into PATCH", () => {
    expect(proposalExhibitSettingsSchema.parse({})).toEqual({});
    expect(proposalExhibitSettingsSchema.parse({ paletteIntroText: "" })).toEqual({ paletteIntroText: "" });
    expect(proposalExhibitSettingsSchema.parse({ paletteIntroText: null })).toEqual({ paletteIntroText: null });
    for (const bad of [{ includePlantSchedule: "false" }, { includePlantPalette: null }, { paletteIntroText: 42 }]) {
      expect(proposalExhibitSettingsSchema.safeParse(bad).success).toBe(false);
    }
  });
});
