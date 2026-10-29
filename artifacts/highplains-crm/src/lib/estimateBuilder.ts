import { apiRequest } from "@/lib/queryClient";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import type {
  EstimateDetailDto, EstimateListItemDto, EstimateLineDto, EstimateSectionDto, EstimateUmbrella,
} from "@shared/schema";
import type { RatePreviewRow } from "@/lib/estimateSettings";

export type { EstimateDetailDto, EstimateListItemDto, EstimateLineDto, EstimateSectionDto, EstimateUmbrella };
export type EstimateLineType = EstimateLineDto["lineType"];
export type EstimatePriceSource = EstimateLineDto["priceSource"];
export type EstimateStatus = EstimateDetailDto["version"]["status"];

export const ESTIMATES_API = "/api/estimates";
export const ESTIMATE_BUILDER_PATH = "/dashboard/estimates/builder";
export const builderPath = (id: string, version?: number) =>
  `${ESTIMATE_BUILDER_PATH}/${encodeURIComponent(id)}${version ? `?version=${version}` : ""}`;

export const LINE_TYPES: EstimateLineType[] = ["plant", "hardscape", "irrigation", "labor", "equipment", "fee", "custom"];
export const UMBRELLAS: EstimateUmbrella[] = ["plants", "landscape_materials", "irrigation_materials", "landscape_labor", "irrigation_labor", "fees_surcharges"];
export const FREE_UNITS = ["hour", "day", "week", "ea", "flat"] as const;
export const FREE_UNIT_TYPES: EstimateLineType[] = ["equipment", "fee", "custom"];
export const DEFAULT_UMBRELLA: Record<"equipment" | "fee" | "custom", EstimateUmbrella> = {
  equipment: "landscape_labor", fee: "fees_surcharges", custom: "landscape_materials",
};

/** Mirrors estimateQuantitySchema exactly: never rounds. */
export function validQuantity(raw: string): string | null {
  const s = raw.trim();
  return /^\d{1,10}(?:\.\d{1,2})?$/.test(s) && /[1-9]/.test(s) ? s : null;
}

/** Rates preview with governing-term metadata (backward-compatible addition). */
export interface GoverningContext { line: string; termId: string | null; seasonLabel: string | null }
export interface RatesPreviewWithContext { items: RatePreviewRow[]; governingContexts?: GoverningContext[] }

/** Distinct contexts, never an arbitrary pick: one entry per distinct term (null = rate card). */
export function distinctContexts(ctx: GoverningContext[]): { termId: string | null; seasonLabel: string | null; lines: string[] }[] {
  const map = new Map<string, { termId: string | null; seasonLabel: string | null; lines: string[] }>();
  for (const c of ctx) {
    const k = c.termId ?? "__card";
    const cur = map.get(k) ?? { termId: c.termId, seasonLabel: c.seasonLabel, lines: [] };
    if (!cur.lines.includes(c.line)) cur.lines.push(c.line);
    map.set(k, cur);
  }
  return [...map.values()];
}

/** Plant library size rows; `id` is the size-row reference the line API requires. */
export interface PlantSize { id?: string; isActive?: boolean; productCode: string; sizeCode: string | null; sizeLabel: string; onHand: number; salePrice: string | null; wholesaleCost: string | null }
export interface PlantVariety { varietyKey: string; commonName: string; botanicalName: string | null; category: string; sizes: PlantSize[] }

export function isVersionLocked(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^409: ([\s\S]*)$/);
  if (!m) return false;
  try { return JSON.parse(m[1])?.error === "VERSION_LOCKED"; } catch { return false; }
}
export function errorStatus(err: unknown): number | null {
  const m = (err instanceof Error ? err.message : String(err)).match(/^(\d{3}):/);
  return m ? Number(m[1]) : null;
}

export async function sendEstimate(method: string, url: string, companyId: string, body?: unknown, signal?: AbortSignal): Promise<EstimateDetailDto> {
  const res = await apiRequest(method, url, body, { headers: companyHeaders(companyId), signal });
  return res.json() as Promise<EstimateDetailDto>;
}

export function listUrl(search: string, includeVoid: boolean): string {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  if (includeVoid) q.set("includeVoid", "true");
  const s = q.toString();
  return s ? `${ESTIMATES_API}?${s}` : ESTIMATES_API;
}

export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Distinct tints per line type (HSL triplets). */
export const LINE_TINT: Record<EstimateLineType, string> = {
  plant: "142 45% 34%", hardscape: "25 45% 40%", irrigation: "199 70% 38%", labor: "262 35% 45%",
  equipment: "38 80% 36%", fee: "340 50% 42%", custom: "210 10% 40%",
};
