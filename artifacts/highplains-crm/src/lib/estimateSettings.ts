import { apiRequest } from "@/lib/queryClient";
import { companyHeaders, formatCents } from "@/lib/hardscapeCatalog";
import type { EstimateQuickItem, QboItemCacheRow, QboItemType, QboUmbrellaItem, UmbrellaKey, QuickItemKind as QuickKind } from "@shared/estimateSetup";

/** Frontend-safe mirrors of the Slice 2.3 API shapes. */
export const QUICK_ITEMS_API = "/api/quick-items";
export const QBO_UMBRELLAS_API = "/api/qbo/umbrellas";
export const QBO_ITEM_CACHE_API = "/api/qbo/items/cache";
export const QBO_ITEM_PULL_API = "/api/qbo/items/pull";
export const QBO_INCOME_ACCOUNTS_API = "/api/qbo/items/income-accounts";
export const RATES_PREVIEW_API = "/api/estimates/rates/preview";

/** Admin-only destinations; office users get guidance text instead of links. */
export const RATE_CARD_SETTINGS_PATH = "/dashboard/settings/contracts";
export const QBO_WRITE_SETTINGS_PATH = "/dashboard/settings/features";

export { UMBRELLA_KEYS, QUICK_ITEM_KINDS as QUICK_KINDS, QUICK_ITEM_UNITS as QUICK_UNITS, QUICK_ITEM_LABEL_MAX, patchQuickItemSchema } from "@shared/estimateSetup";
export type { UmbrellaKey, QuickItemKind as QuickKind, QuickItemUnit as QuickUnit, QboItemType } from "@shared/estimateSetup";
export type QuickItem = Omit<EstimateQuickItem, "createdAt" | "updatedAt">;
export type QuickItemEditable = Pick<QuickItem, "kind" | "label" | "defaultUnit" | "defaultRateCents" | "umbrellaKey" | "isActive">;

export type BindingStatus = "unlinked" | "active" | "inactive" | "missing";
export interface Umbrella extends Omit<QboUmbrellaItem, "qboItemType"> { qboItemType: string | null; bindingStatus: BindingStatus }
export interface UmbrellasResponse { items: Umbrella[]; qboWriteEnabled: boolean }
export type QboCachedItem = QboItemCacheRow;
export interface ItemCacheResponse { items: QboCachedItem[]; lastPulledAt: string | null }
export interface PullResult { missingUmbrellas?: string[]; inactiveUmbrellas?: string[]; [k: string]: unknown }
export interface IncomeAccount { id: string; name: string }
export interface DuplicateConflict { message: string; candidate?: { qboId: string; name: string; type: string; active: boolean }; canLink: boolean }

export type RateSource = "contract" | "rate_card" | "unset";
export interface RatePreviewRow {
  rateKey: string; label: string; unit: string | null; priceText: string | null;
  cardRateCents: number | null; cardPriceText: string | null; contractRateCents: number | null; contractPriceText: string | null;
  rateCents: number | null; source: RateSource; termId?: string | null;
}
export interface RatePreviewResponse { items: RatePreviewRow[] }

export function defaultUmbrellaForKind(kind: QuickKind): UmbrellaKey {
  return kind === "fee" ? "fees_surcharges" : "landscape_labor";
}
export function defaultQboType(key: UmbrellaKey): QboItemType {
  return key === "landscape_labor" || key === "irrigation_labor" || key === "fees_surcharges" ? "Service" : "NonInventory";
}

/** Money cell: exact cents first, else server text, else null (render as em dash). */
export function moneyOrText(cents: number | null | undefined, text: string | null | undefined, lang: string): string | null {
  if (cents != null) return formatCents(cents, lang);
  const s = text?.trim();
  return s ? s : null;
}

/** Quiet-cache-stale threshold for the link picker. */
export const CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
export function isCacheStale(lastPulledAt: string | null, now = Date.now()): boolean {
  if (!lastPulledAt) return true;
  const t = Date.parse(lastPulledAt);
  return Number.isNaN(t) || now - t > CACHE_STALE_MS;
}

/** Parses "409: {json}" errors from apiRequest into the duplicate shape, if that is what it is. */
export function parseConflict(err: unknown): DuplicateConflict | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^409: ([\s\S]*)$/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]);
    if (j && typeof j === "object") return { message: String(j.message ?? ""), candidate: j.candidate ?? undefined, canLink: !!j.canLink };
  } catch { /* not json */ }
  return { message: m[1], canLink: false };
}

export async function sendJson<T>(method: string, url: string, companyId: string, body?: unknown): Promise<T> {
  const res = await apiRequest(method, url, body, { headers: companyHeaders(companyId) });
  return res.json() as Promise<T>;
}

export function scopeOf(user: { id?: string; activeCompanyId?: string | null; activeRole?: string | null } | null | undefined): string {
  return `${user?.id ?? ""}|${user?.activeCompanyId ?? ""}|${user?.activeRole ?? ""}`;
}
