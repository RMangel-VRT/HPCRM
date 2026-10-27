import type { IrrigationCatalogItem, IrrigationSyncRun } from "@shared/schema";

export const IRRIGATION_API = "/api/irrigation-catalog";
export const IRRIGATION_RUNS_URL = `${IRRIGATION_API}/sync-runs?limit=10`;
export const IRRIGATION_IMPORT_URL = `${IRRIGATION_API}/import`;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface IrrigationListResponse { items: IrrigationCatalogItem[]; categories: string[]; brands: string[] }

export function irrigationListUrl(p: { search: string; category: string | null; brand: string | null; includeInactive: boolean }): string {
  const q = new URLSearchParams();
  if (p.search) q.set("search", p.search);
  if (p.category) q.set("category", p.category);
  if (p.brand) q.set("brand", p.brand);
  if (p.includeInactive) q.set("includeInactive", "true");
  const s = q.toString();
  return s ? `${IRRIGATION_API}?${s}` : IRRIGATION_API;
}

/** material · size · brand · fittingType, skipping blanks. */
export function condensedSpec(it: Pick<IrrigationCatalogItem, "material" | "size" | "brand" | "fittingType">): string {
  return [it.material, it.size, it.brand, it.fittingType].map((v) => (v ?? "").trim()).filter(Boolean).join(" · ");
}

/** apiRequest throws "400: {json}"; failed imports carry {message, run}. */
export function runFromError(err: unknown): IrrigationSyncRun | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^\d{3}: ([\s\S]*)$/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]);
    return j && j.run && typeof j.run === "object" && typeof j.run.status === "string" ? (j.run as IrrigationSyncRun) : null;
  } catch { return null; }
}

export function formatRunTime(iso: string | null, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const FIXED_REASONS: Record<string, string> = {
  "Invalid CSV header: malformed, blank or duplicate column names": "invalidHeader",
  "Duplicate SKU: first occurrence wins": "duplicateSku",
  "Column count does not match header": "columnCount",
  "Active must be true/false, yes/no or 1/0": "activeValue",
  "CSV has no valid parts; catalog was not replaced": "noValidParts",
  "Malformed CSV quoting": "malformedQuoting",
  "Unterminated quoted field": "unterminatedQuote",
  "Invalid dollar amount (use nonnegative dollars with at most two decimal places)": "invalidDollars",
  "Dollar amount exceeds the supported maximum": "dollarsTooLarge",
  "Unable to save irrigation catalog; no catalog changes were applied. Retry the upload.": "persistFailed",
  "CSV file required": "fileRequired",
  "CSV exceeds the 5 MB upload limit": "fileTooLarge",
  "Invalid CSV upload": "invalidUpload",
};
const KNOWN_FIELDS = new Set(["sku", "name", "category", "price"]);

type T = (key: string, opts?: Record<string, unknown>) => string;
/** Server reasons are fixed English strings; translate the known ones, generic translated fallback otherwise. */
export function translateServerReason(raw: string | null | undefined, t: T): string {
  const s = (raw ?? "").trim();
  if (!s) return t("irrigationCatalog.reason.unknown");
  const fixed = FIXED_REASONS[s] ?? FIXED_REASONS[s.replace(/\.$/, "")];
  if (fixed) return t(`irrigationCatalog.reason.${fixed}`);
  const headers = s.match(/^Missing required CSV headers: (.+)$/);
  if (headers) return t("irrigationCatalog.reason.missingHeaders", { headers: headers[1] });
  const value = s.match(/^Required value missing: (\w+)$/);
  if (value && KNOWN_FIELDS.has(value[1])) return t("irrigationCatalog.reason.requiredValue", { field: value[1] });
  return t("irrigationCatalog.reason.unknown");
}

/** Newest run by startedAt; ties keep server order. */
export function newestRun(runs: { startedAt: string }[]): number {
  let best = -1, bestT = -Infinity;
  runs.forEach((r, i) => { const v = Date.parse(r.startedAt); const tv = Number.isNaN(v) ? -Infinity : v; if (best < 0 || tv > bestT) { best = i; bestT = tv; } });
  return best;
}
