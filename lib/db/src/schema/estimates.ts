import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, boolean, numeric, timestamp, date, jsonb, uniqueIndex, index, check, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { companies, customers, tickets, users, plantCatalogItems, hardscapeCatalogItems, agreementTerms } from "./schema";
import { irrigationCatalogItems } from "./irrigation";
import { estimateQuickItems } from "./estimateSetup";
import { type ESTIMATE_STATUSES, type ESTIMATE_LINE_TYPES, type ESTIMATE_PRICE_SOURCES, type EstimateUmbrella, type ESTIMATE_SENT_METHODS, type ESTIMATE_ACCEPTANCE_METHODS } from "../estimateContracts";
import type { EstimateRevisionIdMap, IssuedEstimateAttachment } from "../estimateContracts";
export * from "../estimateContracts";

const id = () => varchar("id").notNull().default(sql`gen_random_uuid()`);
const company = () => varchar("company_id").notNull();
const times = () => ({ createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow() });
const userRef = (column: string) => varchar(column);
// Document identity belongs here; tickets.estimate_number is only a compatibility
// mirror written by createEstimate in the same transaction. Tickets own job state.
export const estimates = pgTable("estimates", {
  id: id(), companyId: company(), customerId: varchar("customer_id").notNull(),
  ticketId: varchar("ticket_id"),
  // A linked ticket owns this fact. These columns are only for standalone estimates.
  workLocationLabel: text("work_location_label"), workLocationDescription: text("work_location_description"),
  estimateNumber: text("estimate_number").notNull(), title: text("title").notNull(),
  currentVersionId: varchar("current_version_id"), voidedAt: timestamp("voided_at"), voidReason: text("void_reason"),
  createdById: userRef("created_by_id"), ...times(),
}, (t) => [
  uniqueIndex("estimates_company_number_idx").on(t.companyId, t.estimateNumber),
  uniqueIndex("estimates_live_ticket_idx").on(t.ticketId).where(sql`${t.ticketId} IS NOT NULL AND ${t.voidedAt} IS NULL`),
  index("estimates_company_customer_idx").on(t.companyId, t.customerId),
  primaryKey({ name: "estimates_pkey", columns: [t.id] }),
  foreignKey({ name: "estimates_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "estimates_created_by_id_fkey", columns: [t.createdById], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "estimates_customer_id_fkey", columns: [t.customerId], foreignColumns: [customers.id] }).onDelete("cascade"),
  foreignKey({ name: "estimates_ticket_id_fkey", columns: [t.ticketId], foreignColumns: [tickets.id] }).onDelete("set null"),
]);
export const estimateNumberCounters = pgTable("estimate_number_counters", {
  companyId: company(), year: integer("year").notNull(), lastValue: integer("last_value").notNull(),
}, (t) => [
  uniqueIndex("estimate_number_counters_company_year_idx").on(t.companyId, t.year),
  foreignKey({ name: "estimate_number_counters_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
]);
/** The original issued PDF belongs to its version, not to live location or pricing.
 * Communications own the delivery facts and recipient list. */
export interface EstimateEmailIssue extends IssuedEstimateAttachment {
  objectId: string;
  firstCommunicationId: string;
  pendingCommunicationId: string | null;
  uncertain?: true;
  /** The original delivery metadata verified that Gmail retained the reserved RFC Message-ID. */
  confirmedReservation?: true;
}
// Version owns document state; these fields are deliberately absent from CRUD inputs.
export const estimateVersions = pgTable("estimate_versions", {
  id: id(), companyId: company(), estimateId: varchar("estimate_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  scopeOfWork: text("scope_of_work"),
  includePlantTable: boolean("include_plant_table").notNull().default(true),
  status: text("status").notNull().default("draft").$type<typeof ESTIMATE_STATUSES[number]>(),
  createdFromVersionId: varchar("created_from_version_id"),
  // Immutable copy provenance, not a second owner of section or line content.
  revisionIdMap: jsonb("revision_id_map").$type<EstimateRevisionIdMap>(),
  emailIssue: jsonb("email_issue").$type<EstimateEmailIssue>(),
  sentAt: timestamp("sent_at"), sentById: userRef("sent_by_id"), sentMethod: text("sent_method").$type<typeof ESTIMATE_SENT_METHODS[number]>(),
  acceptedAt: timestamp("accepted_at"), acceptedById: userRef("accepted_by_id"), acceptanceMethod: text("acceptance_method").$type<typeof ESTIMATE_ACCEPTANCE_METHODS[number]>(),
  acceptedOn: date("accepted_on", { mode: "string" }),
  poNumber: text("po_number"), declinedAt: timestamp("declined_at"), declinedById: userRef("declined_by_id"), declineReason: text("decline_reason"),
  supersededAt: timestamp("superseded_at"), frozenSubtotalCents: integer("frozen_subtotal_cents"), frozenCostKnownCents: integer("frozen_cost_known_cents"),
  frozenCostUnknownLines: integer("frozen_cost_unknown_lines"), createdById: userRef("created_by_id"), ...times(),
}, (t) => [
  uniqueIndex("estimate_versions_number_idx").on(t.estimateId, t.versionNumber),
  uniqueIndex("estimate_versions_draft_idx").on(t.estimateId).where(sql`${t.status} = 'draft'`),
  uniqueIndex("estimate_versions_accepted_idx").on(t.estimateId).where(sql`${t.status} = 'accepted'`),
  check("estimate_versions_status_check", sql`${t.status} IN ('draft','sent','accepted','declined','superseded','void')`),
  check("estimate_versions_sent_method_check", sql`${t.sentMethod} IN ('email','hard_copy','portal','other')`),
  check("estimate_versions_acceptance_method_check", sql`${t.acceptanceMethod} IN ('email_approval','signed_pdf','phone','portal','other')`),
  primaryKey({ name: "estimate_versions_pkey", columns: [t.id] }),
  foreignKey({ name: "estimate_versions_accepted_by_id_fkey", columns: [t.acceptedById], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "estimate_versions_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "estimate_versions_created_by_id_fkey", columns: [t.createdById], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "estimate_versions_declined_by_id_fkey", columns: [t.declinedById], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "estimate_versions_estimate_id_fkey", columns: [t.estimateId], foreignColumns: [estimates.id] }).onDelete("cascade"),
  foreignKey({ name: "estimate_versions_sent_by_id_fkey", columns: [t.sentById], foreignColumns: [users.id] }).onDelete("set null"),
]);
export const estimateVersionPhotos = pgTable("estimate_version_photos", {
  id: id(), companyId: company(), versionId: varchar("version_id").notNull(),
  storageObjectPath: varchar("storage_object_path").notNull(),
  filename: varchar("filename").notNull(), mimeType: varchar("mime_type").notNull(), fileSize: integer("file_size").notNull(),
  caption: text("caption"), displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("estimate_version_photos_order_idx").on(t.versionId, t.displayOrder),
  primaryKey({ name: "estimate_version_photos_pkey", columns: [t.id] }),
  foreignKey({ name: "estimate_version_photos_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "estimate_version_photos_version_id_fkey", columns: [t.versionId], foreignColumns: [estimateVersions.id] }).onDelete("cascade"),
]);
export const estimateSections = pgTable("estimate_sections", {
  id: id(), companyId: company(), versionId: varchar("version_id").notNull(),
  name: text("name").notNull(), sortOrder: integer("sort_order").notNull().default(0), ...times(),
}, (t) => [
  index("estimate_sections_version_order_idx").on(t.versionId, t.sortOrder),
  primaryKey({ name: "estimate_sections_pkey", columns: [t.id] }),
  foreignKey({ name: "estimate_sections_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "estimate_sections_version_id_fkey", columns: [t.versionId], foreignColumns: [estimateVersions.id] }).onDelete("cascade"),
]);
// All commercial values below are intentional snapshots. Source FKs are provenance,
// not live joins. extendedCents is derived only by calculateExtendedCents.
export const estimateLines = pgTable("estimate_lines", {
  id: id(), companyId: company(), versionId: varchar("version_id").notNull(),
  sectionId: varchar("section_id").notNull(),
  lineType: text("line_type").notNull().$type<typeof ESTIMATE_LINE_TYPES[number]>(),
  plantCatalogItemId: varchar("plant_catalog_item_id"),
  hardscapeCatalogItemId: varchar("hardscape_catalog_item_id"),
  irrigationCatalogItemId: varchar("irrigation_catalog_item_id"),
  quickItemId: varchar("quick_item_id"),
  rateKey: text("rate_key"), termId: varchar("term_id"),
  priceSource: text("price_source").notNull().$type<typeof ESTIMATE_PRICE_SOURCES[number]>(),
  name: text("name").notNull(), detail: text("detail"), unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(), unitCostCents: integer("unit_cost_cents"),
  extendedCents: integer("extended_cents").notNull(), umbrellaKey: text("umbrella_key").notNull().$type<EstimateUmbrella>(),
  includeInPalette: boolean("include_in_palette").notNull().default(false), paletteTypeLabel: text("palette_type_label"),
  sortOrder: integer("sort_order").notNull().default(0), ...times(),
}, (t) => [
  index("estimate_lines_version_section_order_idx").on(t.versionId, t.sectionId, t.sortOrder),
  check("estimate_lines_type_v2_check", sql`${t.lineType} IN ('plant','hardscape','irrigation','labor','service','equipment','fee','custom')`),
  check("estimate_lines_source_check", sql`${t.priceSource} IN ('catalog','contract','rate_card','quick_list','manual')`),
  check("estimate_lines_quantity_check", sql`${t.quantity} > 0`),
  check("estimate_lines_price_check", sql`${t.unitPriceCents} >= 0`),
  check("estimate_lines_cost_check", sql`${t.unitCostCents} >= 0`),
  check("estimate_lines_umbrella_check", sql`${t.umbrellaKey} IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges')`),
  primaryKey({ name: "estimate_lines_pkey", columns: [t.id] }),
  foreignKey({ name: "estimate_lines_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "estimate_lines_hardscape_catalog_item_id_fkey", columns: [t.hardscapeCatalogItemId], foreignColumns: [hardscapeCatalogItems.id] }).onDelete("set null"),
  foreignKey({ name: "estimate_lines_irrigation_catalog_item_id_fkey", columns: [t.irrigationCatalogItemId], foreignColumns: [irrigationCatalogItems.id] }).onDelete("set null"),
  foreignKey({ name: "estimate_lines_plant_catalog_item_id_fkey", columns: [t.plantCatalogItemId], foreignColumns: [plantCatalogItems.id] }).onDelete("set null"),
  foreignKey({ name: "estimate_lines_quick_item_id_fkey", columns: [t.quickItemId], foreignColumns: [estimateQuickItems.id] }).onDelete("set null"),
  foreignKey({ name: "estimate_lines_section_id_fkey", columns: [t.sectionId], foreignColumns: [estimateSections.id] }).onDelete("cascade"),
  foreignKey({ name: "estimate_lines_term_id_fkey", columns: [t.termId], foreignColumns: [agreementTerms.id] }).onDelete("set null"),
  foreignKey({ name: "estimate_lines_version_id_fkey", columns: [t.versionId], foreignColumns: [estimateVersions.id] }).onDelete("cascade"),
]);
export type Estimate = typeof estimates.$inferSelect;
export type EstimateVersion = typeof estimateVersions.$inferSelect;
export type EstimateSection = typeof estimateSections.$inferSelect;
export type EstimateLine = typeof estimateLines.$inferSelect;
