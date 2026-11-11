import { QUICK_ITEM_UNITS } from "@shared/estimateSetup";
import type { EstimateUmbrella } from "@/lib/estimateBuilder";

/** Exact custom-line unit list (Slice 4.7). Quick-item catalogs accept QUICK_ITEM_UNITS only. */
export const CUSTOM_UNITS = ["ea", "hour", "day", "week", "flat", "sq ft", "1,000 sq ft", "lin ft", "cu yd", "ton", "visit"] as const;
export type CustomUnit = (typeof CUSTOM_UNITS)[number];

export const CATALOG_MATCHES_API = "/api/estimates/catalog-matches";
export type SaveCatalog = "hardscape" | "equipment" | "fee" | "service";
export type SaveToCatalog = { catalog: "hardscape" } | { catalog: "equipment" } | { catalog: "fee" } | { catalog: "service"; serviceCategoryId: string };
export interface CatalogMatch { id: string; name: string; unit: string; priceCents: number | null; categoryName: string | null }

/** Fixed category chips; active service categories are inserted between irrigation labor and equipment. */
export type FixedCategory = "plants" | "hardscape" | "irrigation_parts" | "landscape_labor" | "irrigation_labor" | "equipment" | "fees";
export const FIXED_BEFORE: FixedCategory[] = ["plants", "hardscape", "irrigation_parts", "landscape_labor", "irrigation_labor"];
export const FIXED_AFTER: FixedCategory[] = ["equipment", "fees"];

export interface CategoryTarget {
  umbrella: EstimateUmbrella;
  /** Save target, or the i18n reason key when this category cannot be saved. */
  save: { catalog: SaveCatalog; serviceCategoryId?: string } | { reason: "plants" | "irrigation" | "labor" };
}

export const FIXED_TARGETS: Record<FixedCategory, CategoryTarget> = {
  plants: { umbrella: "plants", save: { reason: "plants" } },
  hardscape: { umbrella: "landscape_materials", save: { catalog: "hardscape" } },
  irrigation_parts: { umbrella: "irrigation_materials", save: { reason: "irrigation" } },
  landscape_labor: { umbrella: "landscape_labor", save: { reason: "labor" } },
  irrigation_labor: { umbrella: "irrigation_labor", save: { reason: "labor" } },
  equipment: { umbrella: "landscape_labor", save: { catalog: "equipment" } },
  fees: { umbrella: "fees_surcharges", save: { catalog: "fee" } },
};

/** Hardscape accepts any unit; quick-item catalogs accept their unit list only. */
export function unitAllowed(catalog: SaveCatalog, unit: string): boolean {
  return catalog === "hardscape" || (QUICK_ITEM_UNITS as readonly string[]).includes(unit);
}

export function saveToCatalogBody(save: { catalog: SaveCatalog; serviceCategoryId?: string }): SaveToCatalog {
  return save.catalog === "service" ? { catalog: "service", serviceCategoryId: save.serviceCategoryId! } : { catalog: save.catalog } as SaveToCatalog;
}

export function catalogMatchesUrl(save: { catalog: SaveCatalog; serviceCategoryId?: string }, name: string): string {
  const p = new URLSearchParams({ catalog: save.catalog });
  if (save.catalog === "service" && save.serviceCategoryId) p.set("serviceCategoryId", save.serviceCategoryId);
  p.set("name", name);
  return `${CATALOG_MATCHES_API}?${p}`;
}

/** Correctly typed reference body for reusing an existing catalog item. */
export function referenceBody(kind: SaveCatalog, id: string): Record<string, unknown> & { lineType: SaveCatalog } {
  return kind === "hardscape" ? { lineType: "hardscape", hardscapeCatalogItemId: id } : { lineType: kind, quickItemId: id };
}

export interface ExistingItem { id: string; name: string; kind: "equipment" | "fee" | "service"; isActive: boolean; serviceCategoryIsActive: boolean | null }
export interface CustomSaveError { status: number | null; code: string | null; existing?: ExistingItem }

/** Parses apiRequest's "NNN: {json}" envelope without losing structured fields. */
export function customSaveError(err: unknown): CustomSaveError {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^(\d{3}): ([\s\S]*)$/);
  if (!m) return { status: null, code: null };
  const status = Number(m[1]);
  try {
    const b = JSON.parse(m[2]);
    const code = b && typeof b.error === "string" ? b.error : null;
    const e = b?.existing;
    const existing = e && typeof e.id === "string" && typeof e.name === "string" && ["equipment", "fee", "service"].includes(e.kind)
      ? { id: e.id, name: e.name, kind: e.kind, isActive: e.isActive === true, serviceCategoryIsActive: typeof e.serviceCategoryIsActive === "boolean" ? e.serviceCategoryIsActive : null } as ExistingItem
      : undefined;
    return { status, code, existing };
  } catch { return { status, code: null }; }
}

/** An existing item may be reused only when it, and (for services) its category, is active. */
export function canReuse(e: ExistingItem): boolean {
  return e.isActive && (e.kind !== "service" || e.serviceCategoryIsActive === true);
}
