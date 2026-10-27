import { apiRequest } from "@/lib/queryClient";
import type { HardscapeCatalogItem } from "@shared/schema";

export const HARDSCAPE_API = "/api/hardscape-catalog";
export const MAX_CENTS = 2147483647;
export const SUGGESTED_CATEGORIES = ["general", "rock_cobble", "pavers", "edging", "boulders", "mulch", "steel", "wall_block", "flagstone"];
export const SUGGESTED_UNITS = ["ea", "sqft", "ton", "lf", "yd3", "bag", "pallet"];

export interface HardscapeListResponse { items: HardscapeCatalogItem[]; categories: string[] }
export interface HardscapeImportResult { inserted: number; updated: number; skipped: { line: number; reason: string }[] }
export type HardscapeEditable = Pick<HardscapeCatalogItem,
  "sku" | "category" | "name" | "description" | "unit" | "wholesaleCostCents" | "retailPriceCents" | "isActive">;

const DOLLARS = /^\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

/** Strict dollars -> cents, mirroring the server. Blank -> null; invalid -> "invalid"; out of range -> "tooLarge". */
export function parseDollarsToCents(raw: string): number | null | "invalid" | "tooLarge" {
  const s = raw.trim();
  if (s === "") return null;
  if (!DOLLARS.test(s)) return "invalid";
  const [whole, frac = ""] = s.replace(/[$,]/g, "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return "tooLarge";
  return cents;
}

export function centsToInput(c: number | null): string {
  return c == null ? "" : (c / 100).toFixed(2);
}

export function formatCents(c: number | null, lang: string): string {
  if (c == null) return "";
  return (c / 100).toLocaleString(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD" });
}

export function catalogListUrl(p: { search: string; category: string | null; includeInactive: boolean }): string {
  const q = new URLSearchParams();
  if (p.search) q.set("search", p.search);
  if (p.category) q.set("category", p.category);
  if (p.includeInactive) q.set("includeInactive", "true");
  const s = q.toString();
  return s ? `${HARDSCAPE_API}?${s}` : HARDSCAPE_API;
}

/** Readable message from apiRequest errors of the form "409: {json}". */
export function apiErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^\d{3}: ([\s\S]*)$/);
  const body = m ? m[1] : msg;
  try {
    const j = JSON.parse(body);
    if (j && typeof j.message === "string") return j.message;
    if (j && typeof j.error === "string") return j.error;
  } catch { /* plain text */ }
  return body;
}

/** GET with abort support; same credentials/error contract as apiRequest. */
/** Tenant guard: the server rejects (409) when this differs from the session's active company. */
export function companyHeaders(companyId: string): Record<string, string> {
  return { "X-Company-Id": companyId };
}

export async function fetchJson<T>(url: string, companyId: string, signal?: AbortSignal): Promise<T> {
  const res = await apiRequest("GET", url, undefined, { headers: companyHeaders(companyId), signal });
  return res.json() as Promise<T>;
}

export function filenameFromDisposition(h: string | null, fallback: string): string {
  const m = h?.match(/filename="?([^";]+)"?/i);
  return m ? m[1] : fallback;
}
