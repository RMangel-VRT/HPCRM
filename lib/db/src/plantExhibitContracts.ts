import { z } from "zod/v4";
export const EXHIBITS_KEY = "/api/proposal-exhibits";

export const DEFAULT_PALETTE_INTRO = "Every plant in this palette is Colorado-hardy and was selected for this site’s sun exposure, soil, and water needs. Final selections may be substituted with comparable varieties based on nursery availability at the time of installation.";
export const PALETTE_CATEGORY_TOKEN_ORDER = ["tree", "shrub", "perennial", "shrub_rose", "vine", "ornamental_grass"];
export const PALETTE_CATEGORY_LABEL_MAP: Record<string, string> = {
  tree: "Trees", shrub: "Shrubs & Evergreens", perennial: "Perennials",
  shrub_rose: "Roses", vine: "Vines", ornamental_grass: "Ornamental Grasses",
};
/** Shared by legacy palettes, estimate exhibits and the browser. */
export function derivePaletteTypeLabel(category: string, foliageType?: string | null): string {
  switch (category) {
    case "tree": return foliageType?.toLowerCase().includes("evergreen") ? "Evergreen Tree" : "Tree";
    case "shrub": return "Shrub";
    case "shrub_rose": case "rose": return "Flowering Shrub";
    case "ornamental_grass": return "Ornamental Grass";
    case "perennial": return "Perennial";
    case "vine": return "Vine";
    case "annual": return "Annual";
    default: return category.split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
}
// No defaults here: an omitted PATCH field must stay omitted, including intro.
export const proposalExhibitSettingsSchema = z.object({
  includePlantSchedule: z.boolean().optional(),
  includePlantPalette: z.boolean().optional(),
  paletteIntroText: z.string().max(10000).nullable().optional(),
});
export interface PlantScheduleRow {
  quantity: string; name: string; botanicalName: string | null; size: string | null; imagePath: string | null;
}
export interface PlantPaletteCard { id: string; name: string; typeLabel: string; imagePath: string | null }
export interface PlantPaletteModel {
  introText: string;
  groups: { category: string; cards: PlantPaletteCard[] }[];
}
export interface ProposalExhibits {
  schedule: PlantScheduleRow[];
  palette: PlantPaletteModel;
  provenance: { estimateId: string; estimateNumber: string; versionId: string; versionNumber: number };
}
