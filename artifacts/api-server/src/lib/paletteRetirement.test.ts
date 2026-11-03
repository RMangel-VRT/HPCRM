import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { plantPalettes, plantPaletteItems, proposals } from "@workspace/db";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const dormant = "Dormant since Slice 4.3. Drop in a dedicated, reviewed migration once no unlinked draft proposal references a palette.";
describe("palette retirement safety", () => {
  it("preserves dormant tables, columns, foreign keys and compatibility definitions", () => {
    const palette = getTableConfig(plantPalettes), items = getTableConfig(plantPaletteItems);
    expect(palette.name).toBe("plant_palettes");
    expect(palette.columns.map(c => c.name)).toEqual(["id", "company_id", "customer_id", "is_template", "created_by_id", "title", "intro_text", "palette_date", "status", "created_at", "updated_at"]);
    expect(items.name).toBe("plant_palette_items");
    expect(items.columns.map(c => c.name)).toEqual(["id", "palette_id", "company_id", "plant_catalog_item_id", "variety_key", "name_snapshot", "type_label", "category", "image_storage_path_snapshot", "image_url_snapshot", "display_order", "created_at"]);
    const proposal = getTableConfig(proposals);
    expect(proposal.columns.find(c => c.name === "plant_palette_id")?.notNull).toBe(false);
    expect(proposal.foreignKeys.some(f => f.reference().foreignTable === plantPalettes && f.onDelete === "set null")).toBe(true);
    expect(items.foreignKeys.some(f => f.reference().foreignTable === plantPalettes && f.onDelete === "cascade")).toBe(true);
    for (const path of ["../../../../lib/db/src/schema/schema.ts", "../../../highplains-crm/src/shared/schema.ts"]) {
      const schema = read(path);
      expect(schema).toContain(`/** @deprecated ${dormant} */\n  plantPaletteId:`);
      expect(schema).toContain(dormant);
    }
    const frontend = read("../../../highplains-crm/src/shared/schema.ts");
    for (const name of ["PlantPalette", "PlantPaletteItem", "PlantPaletteWithItems"]) expect(frontend).toContain(`export interface ${name}`);
  });
  it("has no public palette API, tool components, or alternate palette writes", () => {
    const routes = read("../routes/routes.ts");
    expect(routes).not.toContain("/api/plant-palettes");
    expect(routes).not.toMatch(/(?:insert|update|delete)\(plantPalette/);
    for (const name of ["PlantPalettes", "PlantPaletteDraft"]) {
      expect(existsSync(new URL(`../../../highplains-crm/src/pages/${name}.tsx`, import.meta.url))).toBe(false);
      expect(read("../../../highplains-crm/src/App.tsx")).not.toContain(`import("@/pages/${name}")`);
    }
  });
});
