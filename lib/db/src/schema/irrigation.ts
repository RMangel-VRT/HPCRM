import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { companies, users } from "./schema";

export const irrigationCatalogItems = pgTable("irrigation_catalog_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  externalSku: text("external_sku").notNull(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  material: text("material"),
  size: text("size"),
  brand: text("brand"),
  fittingType: text("fitting_type"),
  detail: text("detail"),
  unit: text("unit").notNull().default("EA"),
  wholesaleCostCents: integer("wholesale_cost_cents"),
  retailPriceCents: integer("retail_price_cents"),
  umbrellaKey: text("umbrella_key").notNull().default("irrigation_materials"),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("irrigation_catalog_items_company_sku_idx").on(table.companyId, table.externalSku),
  index("irrigation_catalog_items_company_id_idx").on(table.companyId),
  index("irrigation_catalog_items_category_idx").on(table.companyId, table.category),
  index("irrigation_catalog_items_name_trgm_idx").using("gin", sql`lower(name) gin_trgm_ops`),
  check("irrigation_catalog_cost_check", sql`${table.wholesaleCostCents} >= 0`),
  check("irrigation_catalog_price_check", sql`${table.retailPriceCents} >= 0`),
  check("irrigation_catalog_umbrella_check", sql`${table.umbrellaKey} = 'irrigation_materials'`),
  foreignKey({ name: "irrigation_catalog_items_company_id_fkey", columns: [table.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
]);
export type IrrigationCatalogItem = typeof irrigationCatalogItems.$inferSelect;
export type IrrigationSkip = { line: number; reason: string };
export const irrigationSyncRuns = pgTable("irrigation_sync_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  status: text("status").notNull().$type<"running" | "success" | "partial" | "error">().default("running"),
  source: text("source").notNull().default("irrigopro_csv"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  itemsUpserted: integer("items_upserted").notNull().default(0),
  itemsDeactivated: integer("items_deactivated").notNull().default(0),
  itemsSkipped: integer("items_skipped").notNull().default(0),
  skippedRows: jsonb("skipped_rows").$type<IrrigationSkip[]>().notNull().default(sql`'[]'::jsonb`),
  errorMessage: text("error_message"),
  filename: text("filename"),
  importedById: varchar("imported_by_id"),
}, (table) => [
  index("irrigation_sync_runs_company_started_idx").on(table.companyId, table.startedAt),
  check("irrigation_sync_runs_status_check", sql`${table.status} IN ('running', 'success', 'partial', 'error')`),
  check("irrigation_sync_runs_source_check", sql`${table.source} = 'irrigopro_csv'`),
  foreignKey({ name: "irrigation_sync_runs_company_id_fkey", columns: [table.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "irrigation_sync_runs_imported_by_id_fkey", columns: [table.importedById], foreignColumns: [users.id] }).onDelete("set null"),
]);
export type IrrigationSyncRun = typeof irrigationSyncRuns.$inferSelect;
