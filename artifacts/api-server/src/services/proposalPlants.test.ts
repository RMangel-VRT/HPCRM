import { describe, expect, it } from "vitest";
import { proposalPlantRows } from "./proposalPlants";
import type { PlantExhibitLine } from "./proposalExhibits";

const line = (overrides: Partial<PlantExhibitLine> = {}): PlantExhibitLine => ({
  id: "l1", plantCatalogItemId: "i1", name: "Pine", commonName: "Pine", botanicalName: "Pinus",
  detail: null, quantity: "2.00", includeInPalette: true, paletteTypeLabel: null, category: "tree",
  foliageType: "Evergreen", varietyKey: "pine", sizeLabel: "5 gal", imagePath: "/bucket/pine", ...overrides,
});
describe("proposal-local Plants projection", () => {
  it("sums identical size-item identities, not identical names; first explicit override wins, including empty", () => {
    const rows = proposalPlantRows([line(), line({ id: "l2", quantity: "3.50", paletteTypeLabel: "" }),
      line({ id: "l3", paletteTypeLabel: "ignored" }),
      line({ id: "l4", plantCatalogItemId: "i2", sizeLabel: "10 gal" }),
      line({ id: "l5", plantCatalogItemId: null }), line({ id: "l6", plantCatalogItemId: null })]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ quantity: "7.50", typeLabel: "", size: "5 gal" });
    expect(rows[1]).toMatchObject({ quantity: "2.00", typeLabel: "Evergreen Tree", size: "10 gal" });
    expect(rows.slice(2).map(r => r.quantity)).toEqual(["2.00", "2.00"]);
  });
});
