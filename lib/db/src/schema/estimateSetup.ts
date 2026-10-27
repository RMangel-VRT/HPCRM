import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, boolean, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { companies } from "./schema";

export const UMBRELLA_KEYS = ["plants", "landscape_materials", "irrigation_materials", "landscape_labor", "irrigation_labor", "fees_surcharges"] as const;
export const UMBRELLA_DEFAULTS = [
  { key: "plants", label: "Plants", description: "Trees, shrubs, perennials and other plant material." },
  { key: "landscape_materials", label: "Landscape Materials", description: "Mulch, soil, rock, pavers and other landscape materials." },
  { key: "irrigation_materials", label: "Irrigation Materials", description: "Irrigation parts, pipe, fittings and controllers." },
  { key: "landscape_labor", label: "Landscape Labor", description: "Landscape labor and equipment charges." },
  { key: "irrigation_labor", label: "Irrigation Labor", description: "Irrigation installation, service and repair labor." },
  { key: "fees_surcharges", label: "Fees & Surcharges", description: "Disposal, delivery, permits and other fees or surcharges." },
] as const;
export const QUICK_ITEM_UNITS = ["hour", "day", "week", "ea", "flat"] as const;
export const QUICK_ITEM_KINDS = ["equipment", "fee"] as const;
export const quickItemFields = {
  kind: z.enum(QUICK_ITEM_KINDS),
  label: z.string().trim().min(1).max(200),
  defaultUnit: z.enum(QUICK_ITEM_UNITS),
  defaultRateCents: z.number().int().min(0).max(2147483647).nullable().optional(),
  umbrellaKey: z.enum(UMBRELLA_KEYS),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(-2147483648).max(2147483647),
};
const optionalUmbrella = z.preprocess(v => v === "" || v === null ? undefined : v, z.enum(UMBRELLA_KEYS).optional());
export const createQuickItemSchema = z.object({
  ...quickItemFields, defaultUnit: quickItemFields.defaultUnit.default("hour"),
  umbrellaKey: optionalUmbrella, isActive: quickItemFields.isActive.default(true),
  sortOrder: quickItemFields.sortOrder.default(0),
}).strict().transform(v => ({ ...v, umbrellaKey: v.umbrellaKey ?? (v.kind === "equipment" ? "landscape_labor" : "fees_surcharges") as typeof UMBRELLA_KEYS[number] }));
export const patchQuickItemSchema = z.object(quickItemFields).partial().strict();

export const qboUmbrellaItems = pgTable("qbo_umbrella_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  key: text("key").notNull().$type<typeof UMBRELLA_KEYS[number]>(),
  label: text("label").notNull(), description: text("description"),
  qboItemId: varchar("qbo_item_id"), qboItemName: text("qbo_item_name"), qboItemType: text("qbo_item_type"),
  qboSyncedAt: timestamp("qbo_synced_at"), sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => ({
  companyKey: uniqueIndex("qbo_umbrella_items_company_key_idx").on(t.companyId, t.key),
  keyCheck: check("qbo_umbrella_items_key_check", sql`${t.key} IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges')`),
  typeCheck: check("qbo_umbrella_items_type_check", sql`${t.qboItemType} IN ('Service','NonInventory')`),
}));
export const qboItemCache = pgTable("qbo_item_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  qboId: varchar("qbo_id").notNull(), name: text("name").notNull(), type: text("type").notNull(),
  incomeAccountName: text("income_account_name"), active: boolean("active").notNull().default(true),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
}, t => ({ companyQbo: uniqueIndex("qbo_item_cache_company_qbo_idx").on(t.companyId, t.qboId) }));
export const estimateQuickItems = pgTable("estimate_quick_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().$type<"equipment" | "fee">(), label: text("label").notNull(),
  defaultUnit: text("default_unit").notNull().default("hour").$type<typeof QUICK_ITEM_UNITS[number]>(),
  defaultRateCents: integer("default_rate_cents"), umbrellaKey: text("umbrella_key").notNull().$type<typeof UMBRELLA_KEYS[number]>(),
  isActive: boolean("is_active").notNull().default(true), sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => ({
  companyKind: index("estimate_quick_items_company_idx").on(t.companyId, t.kind),
  companyLabel: uniqueIndex("estimate_quick_items_company_label_idx").on(t.companyId, sql`lower(${t.label})`),
  kindCheck: check("estimate_quick_items_kind_check", sql`${t.kind} IN ('equipment','fee')`),
  unitCheck: check("estimate_quick_items_unit_check", sql`${t.defaultUnit} IN ('hour','day','week','ea','flat')`),
  rateCheck: check("estimate_quick_items_rate_check", sql`${t.defaultRateCents} >= 0`),
  labelCheck: check("estimate_quick_items_label_check", sql`length(trim(${t.label})) > 0`),
  keyCheck: check("estimate_quick_items_key_check", sql`${t.umbrellaKey} IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges')`),
}));
export type EstimateQuickItem = typeof estimateQuickItems.$inferSelect;
export type QboUmbrellaItem = typeof qboUmbrellaItems.$inferSelect;
export type QboItemCache = typeof qboItemCache.$inferSelect;
