/** Frontend-safe mirror of lib/db/src/schema/estimateSetup.ts (no pg imports). Keep in sync. */
import { z } from "zod";

export const UMBRELLA_KEYS = ["plants", "landscape_materials", "irrigation_materials", "landscape_labor", "irrigation_labor", "fees_surcharges"] as const;
export type UmbrellaKey = (typeof UMBRELLA_KEYS)[number];
export const UMBRELLA_DEFAULTS = [
  { key: "plants", label: "Plants", description: "Trees, shrubs, perennials and other plant material." },
  { key: "landscape_materials", label: "Landscape Materials", description: "Mulch, soil, rock, pavers and other landscape materials." },
  { key: "irrigation_materials", label: "Irrigation Materials", description: "Irrigation parts, pipe, fittings and controllers." },
  { key: "landscape_labor", label: "Landscape Labor", description: "Landscape labor and equipment charges." },
  { key: "irrigation_labor", label: "Irrigation Labor", description: "Irrigation installation, service and repair labor." },
  { key: "fees_surcharges", label: "Fees & Surcharges", description: "Disposal, delivery, permits and other fees or surcharges." },
] as const;
export const QUICK_ITEM_UNITS = ["hour", "day", "week", "ea", "flat"] as const;
export type QuickItemUnit = (typeof QUICK_ITEM_UNITS)[number];
export const QUICK_ITEM_KINDS = ["equipment", "fee"] as const;
export type QuickItemKind = (typeof QUICK_ITEM_KINDS)[number];
export const QBO_ITEM_TYPES = ["Service", "NonInventory"] as const;
export type QboItemType = (typeof QBO_ITEM_TYPES)[number];
export const QUICK_ITEM_LABEL_MAX = 200;
export const MAX_RATE_CENTS = 2147483647;

export const quickItemFields = {
  kind: z.enum(QUICK_ITEM_KINDS),
  label: z.string().trim().min(1).max(QUICK_ITEM_LABEL_MAX),
  defaultUnit: z.enum(QUICK_ITEM_UNITS),
  defaultRateCents: z.number().int().min(0).max(MAX_RATE_CENTS).nullable().optional(),
  umbrellaKey: z.enum(UMBRELLA_KEYS),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(-2147483648).max(2147483647),
};
export const patchQuickItemSchema = z.object(quickItemFields).partial().strict();
const optionalUmbrella = z.preprocess(v => v === "" || v === null ? undefined : v, z.enum(UMBRELLA_KEYS).optional());
export const createQuickItemSchema = z.object({
  ...quickItemFields, defaultUnit: quickItemFields.defaultUnit.default("hour"),
  umbrellaKey: optionalUmbrella, isActive: quickItemFields.isActive.default(true),
  sortOrder: quickItemFields.sortOrder.default(0),
}).strict().transform(v => ({ ...v, umbrellaKey: v.umbrellaKey ?? (v.kind === "equipment" ? "landscape_labor" : "fees_surcharges") as UmbrellaKey }));

export interface EstimateQuickItem {
  id: string; companyId: string; kind: QuickItemKind; label: string; defaultUnit: QuickItemUnit;
  defaultRateCents: number | null; umbrellaKey: UmbrellaKey; isActive: boolean; sortOrder: number;
  createdAt?: string; updatedAt?: string;
}
export interface QboUmbrellaItem {
  id: string; key: UmbrellaKey; label: string; description: string | null; qboItemId: string | null; qboItemName: string | null;
  qboItemType: QboItemType | string | null; qboSyncedAt: string | null; sortOrder: number;
}
export interface QboItemCacheRow { qboId: string; name: string; type: string; incomeAccountName: string | null; active: boolean; fetchedAt: string }
