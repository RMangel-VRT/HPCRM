import type { TFunction } from "i18next";
import { catalogListUrl, fetchJson, formatCents, parseDollarsToCents, type HardscapeListResponse } from "@/lib/hardscapeCatalog";
import { irrigationListUrl, type IrrigationListResponse } from "@/lib/irrigationCatalog";
import { QUICK_ITEMS_API, RATES_PREVIEW_API, moneyOrText, type QuickItem } from "@/lib/estimateSettings";
import type { EstimateLineType, PlantVariety, RatesPreviewWithContext } from "@/lib/estimateBuilder";

/**
 * Shared picker data contracts (Slice 4.7).
 * Both the typed picker (AddLineDialog/PickerBody) and the section-wide search
 * go through these helpers, so a search result is exactly the row that type's
 * picker would show: same endpoint, filters, disabled reason and request body.
 */
export interface PickerRow {
  key: string; title: string; detail?: string; meta?: string; badge?: string; warn?: string; disabled?: string;
  body?: Record<string, unknown>; free?: boolean;
  /** Service rows only: the (active) service category the row belongs to. */
  group?: { id: string; name: string };
}
export interface PickerFilters { search: string; category: string | null; brand: string | null; customerId: string }
export type PickerScope = readonly [string | null | undefined, string | null | undefined, string | null | undefined];

/** The seven catalog-backed types the section search fans out to (custom is not a catalog). */
export const SEARCH_TYPES = ["plant", "hardscape", "irrigation", "labor", "service", "equipment", "fee"] as const satisfies readonly EstimateLineType[];
export type SearchType = (typeof SEARCH_TYPES)[number];
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_GROUP_MAX = 5;

/** Cache key. Service category chips filter locally, so they never split the cache. */
export function pickerQueryKey(type: EstimateLineType, scope: PickerScope, f: PickerFilters) {
  return ["estimate-picker", type, ...scope, f.search, type === "service" ? null : f.category, f.brand, f.customerId] as const;
}

/** Routes one picker type to its existing endpoint with its existing filters. */
export function pickerFetch(type: EstimateLineType, f: PickerFilters, companyId: string, signal?: AbortSignal): Promise<unknown> {
  const { search, category, brand, customerId } = f;
  switch (type) {
    case "plant": {
      const p = new URLSearchParams({ inStockOnly: "false", activeOnly: "true" }); if (search) p.set("search", search);
      return fetchJson<PlantVariety[]>(`/api/plant-library/items?${p}`, companyId, signal);
    }
    case "hardscape": return fetchJson<HardscapeListResponse>(catalogListUrl({ search, category, includeInactive: false }), companyId, signal);
    case "irrigation": return fetchJson<IrrigationListResponse>(irrigationListUrl({ search, category, brand, includeInactive: false }), companyId, signal);
    case "labor": return fetchJson<RatesPreviewWithContext>(`${RATES_PREVIEW_API}?customerId=${encodeURIComponent(customerId)}`, companyId, signal);
    default: return fetchJson<QuickItem[]>(`${QUICK_ITEMS_API}?kind=${type}`, companyId, signal);
  }
}

/** Plant dollar strings ("12.5") -> cents for display only. */
function plantDollars(s: string | null, lang: string): string | null {
  if (s == null || s === "") return null;
  const c = parseDollarsToCents(s);
  return typeof c === "number" ? formatCents(c, lang) : s;
}

export interface PickerProjection { rows: PickerRow[]; categories: string[]; brands: string[]; serviceCats: { id: string; name: string }[] }

/** Projects one type's response into picker rows. `withFree` appends the Free-type row (picker only). */
export function pickerRows(type: EstimateLineType, d: unknown, o: { search: string; category: string | null; t: TFunction; lang: string; withFree?: boolean }): PickerProjection {
  const { t, lang, category } = o;
  const s = o.search.toLowerCase();
  let rows: PickerRow[] = []; let categories: string[] = []; let brands: string[] = [];
  const serviceCats: { id: string; name: string }[] = [];
  if (!d) return { rows, categories, brands, serviceCats };
  const free = (): PickerRow => ({ key: "__free", title: t("estimateBuilder.picker.freeType"), detail: t("estimateBuilder.picker.freeTypeHint"), free: true });
  if (type === "plant") {
    for (const v of d as PlantVariety[]) for (const sz of v.sizes.filter((x) => x.isActive !== false)) {
      rows.push({
        key: `${v.varietyKey}-${sz.productCode}`, title: v.commonName, detail: [v.botanicalName, sz.sizeLabel].filter(Boolean).join(" · "),
        meta: [t("estimateBuilder.picker.onHand", { count: sz.onHand }), plantDollars(sz.wholesaleCost, lang) && t("estimateBuilder.picker.cost", { amount: plantDollars(sz.wholesaleCost, lang) }),
          plantDollars(sz.salePrice, lang) && t("estimateBuilder.picker.price", { amount: plantDollars(sz.salePrice, lang) })].filter(Boolean).join(" · "),
        disabled: sz.id ? undefined : t("estimateBuilder.picker.noRef"),
        body: sz.id ? { plantCatalogItemId: sz.id } : undefined,
      });
    }
  } else if (type === "hardscape" || type === "irrigation") {
    const r = d as HardscapeListResponse & Partial<IrrigationListResponse>;
    categories = r.categories ?? []; brands = r.brands ?? [];
    rows = r.items.filter((i) => i.isActive).map((i) => ({
      key: i.id, title: i.name, detail: [i.sku, i.description].filter(Boolean).join(" · "),
      meta: [i.unit, i.retailPriceCents != null && t("estimateBuilder.picker.price", { amount: formatCents(i.retailPriceCents, lang) }),
        i.wholesaleCostCents != null && t("estimateBuilder.picker.cost", { amount: formatCents(i.wholesaleCostCents, lang) })].filter(Boolean).join(" · "),
      body: type === "hardscape" ? { hardscapeCatalogItemId: i.id } : { irrigationCatalogItemId: i.id },
    }));
  } else if (type === "labor") {
    // Customer-specific rate preview, filtered locally. Text-only rates stay pickable; unset rates stay disabled.
    rows = (d as RatesPreviewWithContext).items.filter((r) => !s || r.label.toLowerCase().includes(s) || r.rateKey.toLowerCase().includes(s)).map((r) => {
      const textOnly = r.rateCents == null && !!r.priceText?.trim();
      return {
        key: r.rateKey, title: r.label, detail: r.unit ?? undefined,
        meta: moneyOrText(r.rateCents, null, lang) ?? undefined,
        badge: r.source === "unset" ? undefined : t(`estimateBuilder.line.source.${r.source}`),
        warn: textOnly ? t("estimateBuilder.picker.textRate", { text: r.priceText }) : undefined,
        disabled: r.source === "unset" || (r.rateCents == null && !textOnly) ? t("estimateBuilder.picker.unset") : undefined,
        body: { rateKey: r.rateKey },
      };
    });
  } else if (type === "service") {
    // Only active services in active categories; category chips filter client-side.
    const pickable = (d as QuickItem[]).filter((i) => i.kind === "service" && i.isActive && i.serviceCategoryId && i.serviceCategoryIsActive === true);
    for (const i of pickable) if (!serviceCats.some((c) => c.id === i.serviceCategoryId)) serviceCats.push({ id: i.serviceCategoryId!, name: i.serviceCategoryName ?? "" });
    serviceCats.sort((a, b) => a.name.localeCompare(b.name));
    rows = pickable.filter((i) => (!category || i.serviceCategoryId === category) && (!s || i.label.toLowerCase().includes(s)))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((i) => ({
        key: i.id, title: i.label,
        detail: [i.serviceCategoryName, t(`estimateBuilder.unit.${i.defaultUnit}`, { defaultValue: i.defaultUnit })].filter(Boolean).join(" · "),
        meta: i.defaultRateCents != null ? formatCents(i.defaultRateCents, lang) : t("estimateBuilder.picker.noDefault"),
        body: { quickItemId: i.id },
        group: { id: i.serviceCategoryId!, name: i.serviceCategoryName ?? "" },
      }));
    if (o.withFree) rows.push(free());
  } else if (type !== "custom") {
    rows = (d as QuickItem[]).filter((i) => i.isActive && (!s || i.label.toLowerCase().includes(s))).sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        key: i.id, title: i.label, detail: t(`estimateBuilder.unit.${i.defaultUnit}`, { defaultValue: i.defaultUnit }),
        meta: i.defaultRateCents != null ? formatCents(i.defaultRateCents, lang) : t("estimateBuilder.picker.noDefault"),
        body: { quickItemId: i.id },
      }));
    if (o.withFree) rows.push(free());
  }
  return { rows, categories, brands, serviceCats };
}

/** One group of section-search results: a catalog, or one service category within Services. */
export interface SearchGroup { id: string; type: SearchType; label?: string; rows: PickerRow[]; total: number }

export function groupSearchRows(type: SearchType, rows: PickerRow[]): SearchGroup[] {
  const pickable = rows.filter((r) => !r.free);
  if (type !== "service") return pickable.length ? [{ id: type, type, rows: pickable.slice(0, SEARCH_GROUP_MAX), total: pickable.length }] : [];
  const by = new Map<string, SearchGroup>();
  for (const r of pickable) {
    const gid = r.group?.id ?? "__none";
    const g = by.get(gid) ?? { id: `service-${gid}`, type, label: r.group?.name, rows: [], total: 0 };
    g.total++; if (g.rows.length < SEARCH_GROUP_MAX) g.rows.push(r);
    by.set(gid, g);
  }
  return [...by.values()].sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
}

/** Injective DOM-safe id fragment: every char outside [A-Za-z0-9-] (including "_") becomes _<hex>_. */
export function idPart(s: string): string { return s.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}_`); }
