import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, boolean, numeric, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { companies, customers, tickets, users, plantCatalogItems, hardscapeCatalogItems, agreementTerms } from "./schema";
import { irrigationCatalogItems } from "./irrigation";
import { estimateQuickItems } from "./estimateSetup";
import { type ESTIMATE_STATUSES, type ESTIMATE_LINE_TYPES, type ESTIMATE_PRICE_SOURCES, type EstimateUmbrella, type ESTIMATE_SENT_METHODS, type ESTIMATE_ACCEPTANCE_METHODS } from "../estimateContracts";
export * from "../estimateContracts";

const id = () => varchar("id").primaryKey().default(sql`gen_random_uuid()`);
const company = () => varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" });
const times = () => ({ createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow() });
const userRef = (column: string) => varchar(column).references(() => users.id, { onDelete: "set null" });
// Document identity belongs here; tickets.estimate_number is only a compatibility
// mirror written by createEstimate in the same transaction. Tickets own job state.
export const estimates = pgTable("estimates", {
  id: id(), companyId: company(), customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  ticketId: varchar("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
  estimateNumber: text("estimate_number").notNull(), title: text("title").notNull(),
  currentVersionId: varchar("current_version_id"), voidedAt: timestamp("voided_at"), voidReason: text("void_reason"),
  createdById: userRef("created_by_id"), ...times(),
}, t => ({
  number: uniqueIndex("estimates_company_number_idx").on(t.companyId, t.estimateNumber),
  liveTicket: uniqueIndex("estimates_live_ticket_idx").on(t.ticketId).where(sql`${t.ticketId} IS NOT NULL AND ${t.voidedAt} IS NULL`),
  customer: index("estimates_company_customer_idx").on(t.companyId, t.customerId),
}));
export const estimateNumberCounters = pgTable("estimate_number_counters", {
  companyId: company(), year: integer("year").notNull(), lastValue: integer("last_value").notNull(),
}, t => ({ companyYear: uniqueIndex("estimate_number_counters_company_year_idx").on(t.companyId, t.year) }));
// Version owns document state; these fields are deliberately absent from CRUD inputs.
export const estimateVersions = pgTable("estimate_versions", {
  id: id(), companyId: company(), estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  status: text("status").notNull().default("draft").$type<typeof ESTIMATE_STATUSES[number]>(),
  createdFromVersionId: varchar("created_from_version_id"),
  sentAt: timestamp("sent_at"), sentById: userRef("sent_by_id"), sentMethod: text("sent_method").$type<typeof ESTIMATE_SENT_METHODS[number]>(),
  acceptedAt: timestamp("accepted_at"), acceptedById: userRef("accepted_by_id"), acceptanceMethod: text("acceptance_method").$type<typeof ESTIMATE_ACCEPTANCE_METHODS[number]>(),
  poNumber: text("po_number"), declinedAt: timestamp("declined_at"), declinedById: userRef("declined_by_id"), declineReason: text("decline_reason"),
  supersededAt: timestamp("superseded_at"), frozenSubtotalCents: integer("frozen_subtotal_cents"), frozenCostKnownCents: integer("frozen_cost_known_cents"),
  frozenCostUnknownLines: integer("frozen_cost_unknown_lines"), createdById: userRef("created_by_id"), ...times(),
}, t => ({
  number: uniqueIndex("estimate_versions_number_idx").on(t.estimateId, t.versionNumber),
  draft: uniqueIndex("estimate_versions_draft_idx").on(t.estimateId).where(sql`${t.status} = 'draft'`),
  accepted: uniqueIndex("estimate_versions_accepted_idx").on(t.estimateId).where(sql`${t.status} = 'accepted'`),
  status: check("estimate_versions_status_check", sql`${t.status} IN ('draft','sent','accepted','declined','superseded','void')`),
  sent: check("estimate_versions_sent_method_check", sql`${t.sentMethod} IN ('email','hard_copy','portal','other')`),
  acceptance: check("estimate_versions_acceptance_method_check", sql`${t.acceptanceMethod} IN ('email_approval','signed_pdf','phone','portal','other')`),
}));
export const estimateSections = pgTable("estimate_sections", {
  id: id(), companyId: company(), versionId: varchar("version_id").notNull().references(() => estimateVersions.id, { onDelete: "cascade" }),
  name: text("name").notNull(), sortOrder: integer("sort_order").notNull().default(0), ...times(),
}, t => ({ order: index("estimate_sections_version_order_idx").on(t.versionId, t.sortOrder) }));
// All commercial values below are intentional snapshots. Source FKs are provenance,
// not live joins. extendedCents is derived only by calculateExtendedCents.
export const estimateLines = pgTable("estimate_lines", {
  id: id(), companyId: company(), versionId: varchar("version_id").notNull().references(() => estimateVersions.id, { onDelete: "cascade" }),
  sectionId: varchar("section_id").notNull().references(() => estimateSections.id, { onDelete: "cascade" }),
  lineType: text("line_type").notNull().$type<typeof ESTIMATE_LINE_TYPES[number]>(),
  plantCatalogItemId: varchar("plant_catalog_item_id").references(() => plantCatalogItems.id, { onDelete: "set null" }),
  hardscapeCatalogItemId: varchar("hardscape_catalog_item_id").references(() => hardscapeCatalogItems.id, { onDelete: "set null" }),
  irrigationCatalogItemId: varchar("irrigation_catalog_item_id").references(() => irrigationCatalogItems.id, { onDelete: "set null" }),
  quickItemId: varchar("quick_item_id").references(() => estimateQuickItems.id, { onDelete: "set null" }),
  rateKey: text("rate_key"), termId: varchar("term_id").references(() => agreementTerms.id, { onDelete: "set null" }),
  priceSource: text("price_source").notNull().$type<typeof ESTIMATE_PRICE_SOURCES[number]>(),
  name: text("name").notNull(), detail: text("detail"), unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(), unitCostCents: integer("unit_cost_cents"),
  extendedCents: integer("extended_cents").notNull(), umbrellaKey: text("umbrella_key").notNull().$type<EstimateUmbrella>(),
  includeInPalette: boolean("include_in_palette").notNull().default(false), paletteTypeLabel: text("palette_type_label"),
  sortOrder: integer("sort_order").notNull().default(0), ...times(),
}, t => ({
  order: index("estimate_lines_version_section_order_idx").on(t.versionId, t.sectionId, t.sortOrder),
  type: check("estimate_lines_type_check", sql`${t.lineType} IN ('plant','hardscape','irrigation','labor','equipment','fee','custom')`),
  source: check("estimate_lines_source_check", sql`${t.priceSource} IN ('catalog','contract','rate_card','quick_list','manual')`),
  quantity: check("estimate_lines_quantity_check", sql`${t.quantity} > 0`),
  price: check("estimate_lines_price_check", sql`${t.unitPriceCents} >= 0`),
  cost: check("estimate_lines_cost_check", sql`${t.unitCostCents} >= 0`),
  umbrella: check("estimate_lines_umbrella_check", sql`${t.umbrellaKey} IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges')`),
}));
export type Estimate = typeof estimates.$inferSelect;
export type EstimateVersion = typeof estimateVersions.$inferSelect;
export type EstimateSection = typeof estimateSections.$inferSelect;
export type EstimateLine = typeof estimateLines.$inferSelect;
