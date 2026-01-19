import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, unique, integer, jsonb, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  subscriptionPlan: text("subscription_plan").$type<"free" | "basic" | "pro" | "enterprise">().default("free"),
  subscriptionStatus: text("subscription_status").$type<"active" | "canceled" | "past_due" | "trialing">().default("active"),
  billingEmail: text("billing_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  subscriptionPlan: z.enum(["free", "basic", "pro", "enterprise"]).default("free"),
  subscriptionStatus: z.enum(["active", "canceled", "past_due", "trialing"]).default("active"),
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  isSuperAdmin: text("is_super_admin").notNull().default("false").$type<"true" | "false">(),
  defaultCompanyId: varchar("default_company_id").references(() => companies.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  isSuperAdmin: z.enum(["true", "false"]).default("false"),
  defaultCompanyId: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const companyUsers = pgTable("company_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"admin" | "office" | "field_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping">(),
  status: text("status").notNull().$type<"active" | "invited" | "suspended">().default("active"),
  invitedAt: timestamp("invited_at"),
  joinedAt: timestamp("joined_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userCompanyUnique: unique().on(table.userId, table.companyId),
}));

export const insertCompanyUserSchema = createInsertSchema(companyUsers).omit({
  id: true,
  createdAt: true,
}).extend({
  role: z.enum(["admin", "office", "field_manager", "field", "irrigation_manager", "shop_manager", "mapping"]),
  status: z.enum(["active", "invited", "suspended"]).default("active"),
});

export type InsertCompanyUser = z.infer<typeof insertCompanyUserSchema>;
export type CompanyUser = typeof companyUsers.$inferSelect;

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  customerNumber: text("customer_number"),
  street: text("street").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  status: text("status").notNull().$type<"active" | "prospect" | "inactive">().default("active"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  acres: text("acres"),
  complexityScore: text("complexity_score").$type<"1" | "2" | "3" | "4" | "5">(),
  managementCompany: text("management_company"),
  propertyManagementCompanyId: varchar("property_management_company_id"),
  propertyManagerId: varchar("property_manager_id"),
  active: text("active").notNull().default("true").$type<"true" | "false">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["active", "prospect", "inactive"]).default("active"),
  tags: z.array(z.string()).default([]),
  complexityScore: z.enum(["1", "2", "3", "4", "5"]).optional(),
  active: z.enum(["true", "false"]).default("true"),
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  propertyManagerId: varchar("property_manager_id"),
  name: text("name").notNull(),
  phones: text("phones").array().default(sql`ARRAY[]::text[]`),
  emails: text("emails").array().default(sql`ARRAY[]::text[]`),
  role: text("role"),
  isPrimary: text("is_primary").notNull().default("false").$type<"true" | "false">(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
}).extend({
  isPrimary: z.enum(["true", "false"]).default("false"),
  phones: z.array(z.string()).default([]),
  emails: z.array(z.string()).default([]),
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const notes = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorId: varchar("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  createdAt: true,
}).extend({
  body: z.string().min(1).max(5000),
});

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  serviceType: text("service_type").notNull().$type<"Maintenance" | "Chemical" | "Snow" | "Irrigation" | "Other">(),
  billingPattern: text("billing_pattern").notNull().$type<"monthly" | "seasonal" | "12-of-12">(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: text("status").notNull().$type<"active" | "paused" | "ended">().default("active"),
  po: text("po"),
  notes: text("notes"),
  hasMobilizationFee: boolean("has_mobilization_fee").notNull().default(false),
  mobilizationFeeAmount: integer("mobilization_fee_amount").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  serviceType: z.enum(["Maintenance", "Chemical", "Snow", "Irrigation", "Other"]),
  billingPattern: z.enum(["monthly", "seasonal", "12-of-12"]),
  status: z.enum(["active", "paused", "ended"]).default("active"),
  hasMobilizationFee: z.boolean().default(false),
  mobilizationFeeAmount: z.number().int().min(0).default(0),
});

export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

export const contractStatusHistory = pgTable("contract_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  oldStatus: text("old_status").$type<"active" | "paused" | "ended">(),
  newStatus: text("new_status").notNull().$type<"active" | "paused" | "ended">(),
  changedBy: varchar("changed_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContractStatusHistorySchema = createInsertSchema(contractStatusHistory).omit({
  id: true,
  createdAt: true,
}).extend({
  oldStatus: z.enum(["active", "paused", "ended"]).optional(),
  newStatus: z.enum(["active", "paused", "ended"]),
});

export type InsertContractStatusHistory = z.infer<typeof insertContractStatusHistorySchema>;
export type ContractStatusHistory = typeof contractStatusHistory.$inferSelect;

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  companyName: text("company_name").notNull(),
  mowingSeasonMonths: text("mowing_season_months").array().notNull().default(sql`ARRAY[]::text[]`),
  cleanupSeasonMonths: text("cleanup_season_months").array().notNull().default(sql`ARRAY[]::text[]`),
  hourlyRateBenchmarks: text("hourly_rate_benchmarks").notNull().default('{}'),
  featureFlags: text("feature_flags").notNull().default('{}'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  mowingSeasonMonths: z.array(z.string()).default([]),
  cleanupSeasonMonths: z.array(z.string()).default([]),
  hourlyRateBenchmarks: z.string().default('{}'),
  featureFlags: z.string().default('{}'),
});

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export const contractDocuments = pgTable("contract_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  filename: text("filename").notNull(),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  fileSize: integer("file_size").notNull(),
  storageObjectPath: text("storage_object_path").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContractDocumentSchema = createInsertSchema(contractDocuments).omit({
  id: true,
  uploadedAt: true,
  createdAt: true,
});

export type InsertContractDocument = z.infer<typeof insertContractDocumentSchema>;
export type ContractDocument = typeof contractDocuments.$inferSelect;

export const contractMonthlyAmounts = pgTable("contract_monthly_amounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  month: integer("month").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  contractMonthUnique: unique().on(table.contractId, table.month),
}));

export const insertContractMonthlyAmountSchema = createInsertSchema(contractMonthlyAmounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  month: z.number().int().min(1).max(12),
  amount: z.number().int().min(0),
});

export type InsertContractMonthlyAmount = z.infer<typeof insertContractMonthlyAmountSchema>;
export type ContractMonthlyAmount = typeof contractMonthlyAmounts.$inferSelect;

export const customerRateSheets = pgTable("customer_rate_sheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }).unique(),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  
  // Maintenance & Emergency Labor (per hour, in cents)
  generalLabor: integer("general_labor"),
  operatorLabor: integer("operator_labor"),
  irrigationLabor: integer("irrigation_labor"),
  emergencyGeneralLabor: integer("emergency_general_labor"),
  emergencyIrrigationLabor: integer("emergency_irrigation_labor"),
  
  // Snow & Ice Services (in cents)
  handShovelLabor: integer("hand_shovel_labor"),
  plowTruck: integer("plow_truck"),
  atv: integer("atv"),
  skidSteer: integer("skid_steer"),
  snowBlower: integer("snow_blower"),
  iceMeltMaterial: integer("ice_melt_material"),
  iceMeltApplicationLabor: integer("ice_melt_application_labor"),
  
  // Metadata
  notes: text("notes"),
  lastUpdatedBy: varchar("last_updated_by").references(() => users.id),
  lastUpdatedAt: timestamp("last_updated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomerRateSheetSchema = createInsertSchema(customerRateSheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // All rate fields are optional (nullable) and must be non-negative integers if provided
  generalLabor: z.number().int().min(0).optional().nullable(),
  operatorLabor: z.number().int().min(0).optional().nullable(),
  irrigationLabor: z.number().int().min(0).optional().nullable(),
  emergencyGeneralLabor: z.number().int().min(0).optional().nullable(),
  emergencyIrrigationLabor: z.number().int().min(0).optional().nullable(),
  handShovelLabor: z.number().int().min(0).optional().nullable(),
  plowTruck: z.number().int().min(0).optional().nullable(),
  atv: z.number().int().min(0).optional().nullable(),
  skidSteer: z.number().int().min(0).optional().nullable(),
  snowBlower: z.number().int().min(0).optional().nullable(),
  iceMeltMaterial: z.number().int().min(0).optional().nullable(),
  iceMeltApplicationLabor: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
  lastUpdatedBy: z.string().optional().nullable(),
  lastUpdatedAt: z.date().optional().nullable(),
});

export type InsertCustomerRateSheet = z.infer<typeof insertCustomerRateSheetSchema>;
export type CustomerRateSheet = typeof customerRateSheets.$inferSelect;

export const contractServices = pgTable("contract_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  serviceType: text("service_type").notNull().$type<
    "mowing" | "pet_station" | "chemical" | "shrub_trimming" | 
    "ornamental_grass" | "aeration" | "cleanups" | "tree_pruning"
  >(),
  annualCount: integer("annual_count").notNull(),
  monthlyDistribution: integer("monthly_distribution").array().notNull(),
  serviceParameters: jsonb("service_parameters").$type<{
    organic?: boolean;
    stationCount?: number;
    visitsPerWeek?: number;
  }>().default(sql`'{}'::jsonb`),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContractServiceSchema = createInsertSchema(contractServices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  serviceType: z.enum(["mowing", "pet_station", "chemical", "shrub_trimming", "ornamental_grass", "aeration", "cleanups", "tree_pruning"]),
  annualCount: z.number().int().min(0),
  monthlyDistribution: z.array(z.number().int().min(0)).length(12),
  serviceParameters: z.object({
    organic: z.boolean().optional(),
    stationCount: z.number().int().min(0).optional(),
    visitsPerWeek: z.number().int().min(0).optional(),
  }).optional(),
});

export type InsertContractService = z.infer<typeof insertContractServiceSchema>;
export type ContractService = typeof contractServices.$inferSelect;

// Contract Builder Tables
export const contractTemplates = pgTable("contract_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionKey: text("section_key").notNull().unique(),
  sectionTitle: text("section_title").notNull(),
  sectionNumber: text("section_number"),
  defaultContent: text("default_content").notNull(),
  displayOrder: integer("display_order").notNull(),
  isOptional: text("is_optional").notNull().default("true").$type<"true" | "false">(),
  category: text("category").notNull().$type<"header" | "terms" | "maintenance" | "irrigation" | "snow" | "payments" | "acceptance">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  isOptional: z.enum(["true", "false"]).default("true"),
  category: z.enum(["header", "terms", "maintenance", "irrigation", "snow", "payments", "acceptance"]),
});

export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type ContractTemplate = typeof contractTemplates.$inferSelect;

export const contractBuilderDocuments = pgTable("contract_builder_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  documentTitle: text("document_title").notNull(),
  status: text("status").notNull().$type<"draft" | "published">().default("draft"),
  version: integer("version").notNull().default(1),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  updatedBy: varchar("updated_by").notNull().references(() => users.id),
  publishedAt: timestamp("published_at"),
  pdfStorageObjectPath: text("pdf_storage_object_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContractBuilderDocumentSchema = createInsertSchema(contractBuilderDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["draft", "published"]).default("draft"),
  version: z.number().int().min(1).default(1),
});

export type InsertContractBuilderDocument = z.infer<typeof insertContractBuilderDocumentSchema>;
export type ContractBuilderDocument = typeof contractBuilderDocuments.$inferSelect;

export const contractBuilderSections = pgTable("contract_builder_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => contractBuilderDocuments.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull().references(() => contractTemplates.id, { onDelete: "cascade" }),
  customContent: text("custom_content"),
  isIncluded: text("is_included").notNull().default("true").$type<"true" | "false">(),
  displayOrder: integer("display_order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  docTemplateUnique: unique().on(table.documentId, table.templateId),
}));

export const insertContractBuilderSectionSchema = createInsertSchema(contractBuilderSections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  isIncluded: z.enum(["true", "false"]).default("true"),
});

export type InsertContractBuilderSection = z.infer<typeof insertContractBuilderSectionSchema>;
export type ContractBuilderSection = typeof contractBuilderSections.$inferSelect;

export const contractBuilderVariables = pgTable("contract_builder_variables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => contractBuilderDocuments.id, { onDelete: "cascade" }),
  variableKey: text("variable_key").notNull(),
  variableValue: text("variable_value").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  docVarUnique: unique().on(table.documentId, table.variableKey),
}));

export const insertContractBuilderVariableSchema = createInsertSchema(contractBuilderVariables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractBuilderVariable = z.infer<typeof insertContractBuilderVariableSchema>;
export type ContractBuilderVariable = typeof contractBuilderVariables.$inferSelect;

// Ticketing System Tables

// Ticket Type Categories - classifies the nature of ticket types
export type TicketTypeCategory = "quick_task" | "project" | "service";

// Ticket Types - configurable workflow definitions (e.g., "Quick Task", "Project", "Estimate Request")
export const ticketTypes = pgTable("ticket_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().$type<TicketTypeCategory>().default("quick_task"),
  icon: text("icon").default("clipboard-list"),
  color: text("color").default("#2563eb"),
  isActive: text("is_active").notNull().default("true").$type<"true" | "false">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTicketTypeSchema = createInsertSchema(ticketTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: z.enum(["quick_task", "project", "service"]).default("quick_task"),
  isActive: z.enum(["true", "false"]).default("true"),
});

export type InsertTicketType = z.infer<typeof insertTicketTypeSchema>;
export type TicketType = typeof ticketTypes.$inferSelect;

// Ticket Type Statuses - workflow steps for each ticket type (ordered)
export const ticketTypeStatuses = pgTable("ticket_type_statuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketTypeId: varchar("ticket_type_id").notNull().references(() => ticketTypes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  displayOrder: integer("display_order").notNull(),
  color: text("color").default("#6b7280"),
  isFinal: text("is_final").notNull().default("false").$type<"true" | "false">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketTypeStatusSchema = createInsertSchema(ticketTypeStatuses).omit({
  id: true,
  createdAt: true,
}).extend({
  displayOrder: z.number().int().min(0),
  isFinal: z.enum(["true", "false"]).default("false"),
});

export type InsertTicketTypeStatus = z.infer<typeof insertTicketTypeStatusSchema>;
export type TicketTypeStatus = typeof ticketTypeStatuses.$inferSelect;

// Ticket Type Fields - custom fields that can be captured at specific statuses
export const ticketTypeFields = pgTable("ticket_type_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketTypeId: varchar("ticket_type_id").notNull().references(() => ticketTypes.id, { onDelete: "cascade" }),
  statusId: varchar("status_id").references(() => ticketTypeStatuses.id, { onDelete: "cascade" }),
  fieldKey: text("field_key").notNull(),
  fieldLabel: text("field_label").notNull(),
  fieldType: text("field_type").notNull().$type<"text" | "number" | "date" | "currency" | "select" | "textarea">(),
  isRequired: text("is_required").notNull().default("false").$type<"true" | "false">(),
  options: text("options").array().default(sql`ARRAY[]::text[]`),
  displayOrder: integer("display_order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketTypeFieldSchema = createInsertSchema(ticketTypeFields).omit({
  id: true,
  createdAt: true,
}).extend({
  fieldType: z.enum(["text", "number", "date", "currency", "select", "textarea"]),
  isRequired: z.enum(["true", "false"]).default("false"),
  options: z.array(z.string()).optional().default([]),
  displayOrder: z.number().int().min(0),
});

export type InsertTicketTypeField = z.infer<typeof insertTicketTypeFieldSchema>;
export type TicketTypeField = typeof ticketTypeFields.$inferSelect;

// Ticket Source Types - where the ticket originated from
export type TicketSourceType = "manual" | "contract_service";

// Service type for ticket tagging (imported from serviceCatalog)
export type TicketServiceType = "mowing" | "pet_station" | "chemical" | "shrub_trimming" | "ornamental_grass" | "aeration" | "cleanups" | "tree_pruning";

// Work Type - classifies what kind of work the ticket represents (billing-driven)
export type WorkType = "contract" | "extra_work" | "project" | "admin" | "estimate_request" | "shop_todo";

// Billing Behavior - determines how the ticket affects invoicing
export type BillingBehavior = "no_invoice" | "invoice_required" | "internal";

// Tickets - actual work items
export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "cascade" }), // Optional for shop_todo tickets
  contractId: varchar("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  serviceType: text("service_type").$type<TicketServiceType>(), // Optional service type tagging
  workType: text("work_type").notNull().$type<WorkType>().default("contract"), // Required work classification
  billingBehavior: text("billing_behavior").notNull().$type<BillingBehavior>().default("no_invoice"), // Billing flag
  ticketTypeId: varchar("ticket_type_id").notNull().references(() => ticketTypes.id, { onDelete: "restrict" }),
  currentStatusId: varchar("current_status_id").notNull().references(() => ticketTypeStatuses.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().$type<"low" | "normal" | "high" | "urgent">().default("normal"),
  // Location fields for GPS/map functionality
  locationLat: real("location_lat"), // Latitude coordinate
  locationLng: real("location_lng"), // Longitude coordinate
  locationLabel: text("location_label"), // User-friendly name like "Near the pool"
  locationDescription: text("location_description"), // Additional location notes
  // Photos - array of object storage paths
  photos: text("photos").array(), // Array of photo paths in object storage
  assignedToId: varchar("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  // Invoice/External reference fields
  invoiceNumber: text("invoice_number"), // QuickBooks invoice number
  estimateNumber: text("estimate_number"), // QuickBooks estimate number
  workCompletedDate: timestamp("work_completed_date"), // Date work was completed (for billing reference)
  invoiceCategory: text("invoice_category").$type<"general_maintenance" | "snow">(), // Category for invoice tickets to determine which rates to display
  equipmentId: varchar("equipment_id"), // Optional link to equipment for Shop to-do tickets (FK added via migration)
  createdById: varchar("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  customerId: z.string().nullable().optional(), // Optional for shop_todo tickets
  contractId: z.string().nullable().optional(),
  serviceType: z.enum(["mowing", "pet_station", "chemical", "shrub_trimming", "ornamental_grass", "aeration", "cleanups", "tree_pruning"]).nullable().optional(),
  workType: z.enum(["contract", "extra_work", "project", "admin", "estimate_request", "shop_todo"]).default("contract"),
  billingBehavior: z.enum(["no_invoice", "invoice_required", "internal"]).default("no_invoice"),
  locationLat: z.number().nullable().optional(),
  locationLng: z.number().nullable().optional(),
  locationLabel: z.string().nullable().optional(),
  locationDescription: z.string().nullable().optional(),
  photos: z.array(z.string()).nullable().optional(),
  assignedToId: z.string().nullable().optional(), // Optional - Invoice tickets can be unassigned
  dueDate: z.coerce.date().nullable().optional(), // Coerce ISO string to Date
  completedAt: z.coerce.date().nullable().optional(), // Coerce ISO string to Date
  invoiceNumber: z.string().nullable().optional(), // QuickBooks invoice number
  estimateNumber: z.string().nullable().optional(), // QuickBooks estimate number
  workCompletedDate: z.coerce.date().nullable().optional(), // Date work was completed (for billing reference)
  invoiceCategory: z.enum(["general_maintenance", "snow"]).nullable().optional(), // Category for invoice tickets
  equipmentId: z.string().nullable().optional(), // Optional link to equipment for Shop to-do tickets
});

export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof tickets.$inferSelect;

// Ticket Field Values - captured data for custom fields
export const ticketFieldValues = pgTable("ticket_field_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  fieldId: varchar("field_id").notNull().references(() => ticketTypeFields.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  capturedById: varchar("captured_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => ({
  ticketFieldUnique: unique().on(table.ticketId, table.fieldId),
}));

export const insertTicketFieldValueSchema = createInsertSchema(ticketFieldValues).omit({
  id: true,
  capturedAt: true,
});

export type InsertTicketFieldValue = z.infer<typeof insertTicketFieldValueSchema>;
export type TicketFieldValue = typeof ticketFieldValues.$inferSelect;

// Ticket Status History - audit trail of status changes
export const ticketStatusHistory = pgTable("ticket_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  fromStatusId: varchar("from_status_id").references(() => ticketTypeStatuses.id, { onDelete: "set null" }),
  toStatusId: varchar("to_status_id").notNull().references(() => ticketTypeStatuses.id, { onDelete: "cascade" }),
  changedById: varchar("changed_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketStatusHistorySchema = createInsertSchema(ticketStatusHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertTicketStatusHistory = z.infer<typeof insertTicketStatusHistorySchema>;
export type TicketStatusHistory = typeof ticketStatusHistory.$inferSelect;

// Ticket Comments
export const ticketComments = pgTable("ticket_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentCommentId: varchar("parent_comment_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({
  id: true,
  createdAt: true,
}).extend({
  body: z.string().min(1).max(5000),
  parentCommentId: z.string().nullable().optional(),
});

export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type TicketComment = typeof ticketComments.$inferSelect;

// Ticket Comment Mentions - tracks @mentions in comments
export const ticketCommentMentions = pgTable("ticket_comment_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => ticketComments.id, { onDelete: "cascade" }),
  mentionedUserId: varchar("mentioned_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketCommentMentionSchema = createInsertSchema(ticketCommentMentions).omit({
  id: true,
  createdAt: true,
});

export type InsertTicketCommentMention = z.infer<typeof insertTicketCommentMentionSchema>;
export type TicketCommentMention = typeof ticketCommentMentions.$inferSelect;

// Ticket Sources - tracks origin of tickets for future service occurrence linking
export const ticketSources = pgTable("ticket_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull().$type<TicketSourceType>().default("manual"),
  sourceId: text("source_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketSourceSchema = createInsertSchema(ticketSources).omit({
  id: true,
  createdAt: true,
}).extend({
  sourceType: z.enum(["manual", "contract_service"]).default("manual"),
});

export type InsertTicketSource = z.infer<typeof insertTicketSourceSchema>;
export type TicketSource = typeof ticketSources.$inferSelect;

// Ticket Links - connects related tickets (e.g., billable → invoice, estimate → project)
export type TicketLinkType = "source_of" | "invoice_for" | "project_for" | "execution_for";

export const ticketLinks = pgTable("ticket_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceTicketId: varchar("source_ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  targetTicketId: varchar("target_ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  linkType: text("link_type").notNull().$type<TicketLinkType>(), // "invoice_for" = target is invoice for source
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueLink: unique().on(table.sourceTicketId, table.targetTicketId, table.linkType),
}));

export const insertTicketLinkSchema = createInsertSchema(ticketLinks).omit({
  id: true,
  createdAt: true,
}).extend({
  linkType: z.enum(["source_of", "invoice_for", "project_for", "execution_for"]),
});

export type InsertTicketLink = z.infer<typeof insertTicketLinkSchema>;
export type TicketLink = typeof ticketLinks.$inferSelect;

// Customer Map Layers - KML files for property mapping
export type MapLayerCategory = "base" | "community" | "snow" | "custom";
export type MapLayerType = 
  // Base layers
  | "community_outline"
  // Community season layers
  | "mowing" | "native_grass" | "landscape_beds" | "pet_stations"
  // Snow season layers
  | "atv_route" | "truck_plow" | "hand_shovel" | "ice_melt"
  // Custom layer type
  | "custom";

// Preset colors optimized for satellite map visibility - high contrast, vibrant colors
export const MAP_LAYER_PRESET_COLORS = [
  { hex: "#FF0000", name: "Red" },           // Bright red
  { hex: "#00FF00", name: "Lime" },          // Bright lime green
  { hex: "#FFFF00", name: "Yellow" },        // Bright yellow
  { hex: "#FF00FF", name: "Magenta" },       // Magenta/fuchsia
  { hex: "#00FFFF", name: "Cyan" },          // Bright cyan
  { hex: "#FF6600", name: "Orange" },        // Bright orange
  { hex: "#FF69B4", name: "Hot Pink" },      // Hot pink
  { hex: "#ADFF2F", name: "Green Yellow" },  // Green-yellow
  { hex: "#FFD700", name: "Gold" },          // Gold
  { hex: "#7FFF00", name: "Chartreuse" },    // Chartreuse
  { hex: "#FF1493", name: "Deep Pink" },     // Deep pink
  { hex: "#00FF7F", name: "Spring Green" },  // Spring green
  { hex: "#FF4500", name: "Orange Red" },    // Orange red
  { hex: "#1E90FF", name: "Dodger Blue" },   // Dodger blue (still visible on satellite)
  { hex: "#FFFFFF", name: "White" },         // White for outlines
] as const;

export const customerMapLayers = pgTable("customer_map_layers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  category: text("category").notNull().$type<MapLayerCategory>(), // community or snow
  layerType: text("layer_type").notNull().$type<MapLayerType>(), // specific layer type
  name: text("name").notNull(), // Custom display name
  kmlPath: text("kml_path").notNull(), // Object storage path
  color: text("color").notNull().default("#3B82F6"), // Hex color for display
  isActive: text("is_active").notNull().default("true").$type<"true" | "false">(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomerMapLayerSchema = createInsertSchema(customerMapLayers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: z.enum(["base", "community", "snow", "custom"]),
  layerType: z.enum(["community_outline", "mowing", "native_grass", "landscape_beds", "pet_stations", "atv_route", "truck_plow", "hand_shovel", "ice_melt", "ice_melt_buckets", "custom"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3B82F6"),
  isActive: z.enum(["true", "false"]).default("true"),
  displayOrder: z.number().int().default(0),
});

export type InsertCustomerMapLayer = z.infer<typeof insertCustomerMapLayerSchema>;
export type CustomerMapLayer = typeof customerMapLayers.$inferSelect;

// Customer Map Documents - PDF maps and documents
export const customerMapDocuments = pgTable("customer_map_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Custom display name
  filePath: text("file_path").notNull(), // Object storage path
  fileType: text("file_type").notNull().default("pdf"), // pdf, image, etc.
  fileSize: integer("file_size"), // Size in bytes
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerMapDocumentSchema = createInsertSchema(customerMapDocuments).omit({
  id: true,
  createdAt: true,
}).extend({
  fileType: z.string().default("pdf"),
  fileSize: z.number().int().optional(),
});

export type InsertCustomerMapDocument = z.infer<typeof insertCustomerMapDocumentSchema>;
export type CustomerMapDocument = typeof customerMapDocuments.$inferSelect;

// ==================== SCHEDULING SYSTEM ====================

// Day of week type for scheduling
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

// Maintenance Crews
// Preset crew colors for visual differentiation
export const CREW_COLORS = [
  "#2563eb", // blue
  "#16a34a", // green
  "#ea580c", // orange
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#dc2626", // red
  "#ca8a04", // yellow
  "#db2777", // pink
  "#059669", // emerald
  "#6366f1", // indigo
] as const;

export const maintenanceCrews = pgTable("maintenance_crews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").default("#2563eb"), // Crew color for schedule display
  defaultHoursPerDay: real("default_hours_per_day").default(8),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMaintenanceCrewSchema = createInsertSchema(maintenanceCrews).omit({
  id: true,
  createdAt: true,
}).extend({
  color: z.string().default("#2563eb"),
  defaultHoursPerDay: z.number().min(0).max(24).default(8),
  isActive: z.boolean().default(true),
});

export type InsertMaintenanceCrew = z.infer<typeof insertMaintenanceCrewSchema>;
export type MaintenanceCrew = typeof maintenanceCrews.$inferSelect;

// Per-property mowing/maintenance visit configuration
export const maintenanceVisitConfigs = pgTable("maintenance_visit_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  estimatedDurationMinutes: integer("estimated_duration_minutes").notNull(),
  crewSize: integer("crew_size").notNull().default(2),
  preferredDay: text("preferred_day").$type<DayOfWeek>(),
  preferredCrewId: varchar("preferred_crew_id").references(() => maintenanceCrews.id, { onDelete: "set null" }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  customerUnique: unique().on(table.customerId, table.companyId),
}));

export const insertMaintenanceVisitConfigSchema = createInsertSchema(maintenanceVisitConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  estimatedDurationMinutes: z.number().int().min(1),
  crewSize: z.number().int().min(1).max(10).default(2),
  preferredDay: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]).optional(),
  isActive: z.boolean().default(true),
});

export type InsertMaintenanceVisitConfig = z.infer<typeof insertMaintenanceVisitConfigSchema>;
export type MaintenanceVisitConfig = typeof maintenanceVisitConfigs.$inferSelect;

// Weekly schedule template (repeats April-October by default)
export const weeklyScheduleTemplates = pgTable("weekly_schedule_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Season Template"),
  seasonStartMonth: integer("season_start_month").default(4), // April
  seasonStartWeek: integer("season_start_week").default(2),
  seasonEndMonth: integer("season_end_month").default(10), // October
  seasonEndWeek: integer("season_end_week").default(2),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWeeklyScheduleTemplateSchema = createInsertSchema(weeklyScheduleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  seasonStartMonth: z.number().int().min(1).max(12).default(4),
  seasonStartWeek: z.number().int().min(1).max(5).default(2),
  seasonEndMonth: z.number().int().min(1).max(12).default(10),
  seasonEndWeek: z.number().int().min(1).max(5).default(2),
  isActive: z.boolean().default(true),
});

export type InsertWeeklyScheduleTemplate = z.infer<typeof insertWeeklyScheduleTemplateSchema>;
export type WeeklyScheduleTemplate = typeof weeklyScheduleTemplates.$inferSelect;

// Schedule blocks - property placements on the weekly grid
export const scheduleBlocks = pgTable("schedule_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => weeklyScheduleTemplates.id, { onDelete: "cascade" }),
  visitConfigId: varchar("visit_config_id").notNull().references(() => maintenanceVisitConfigs.id, { onDelete: "cascade" }),
  crewId: varchar("crew_id").notNull().references(() => maintenanceCrews.id, { onDelete: "cascade" }),
  dayOfWeek: text("day_of_week").notNull().$type<DayOfWeek>(),
  sortOrder: integer("sort_order").default(0),
  startTime: text("start_time"), // Optional HH:MM format
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScheduleBlockSchema = createInsertSchema(scheduleBlocks).omit({
  id: true,
  createdAt: true,
}).extend({
  dayOfWeek: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]),
  sortOrder: z.number().int().default(0),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
});

export type InsertScheduleBlock = z.infer<typeof insertScheduleBlockSchema>;
export type ScheduleBlock = typeof scheduleBlocks.$inferSelect;

// Notification types for the ticket notification system
export type NotificationType = "assigned" | "completed" | "due_tomorrow" | "due_today" | "overdue" | "mentioned";

// Ticket notifications table
export const ticketNotifications = pgTable("ticket_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  recipientId: varchar("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ticketId: varchar("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<NotificationType>(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketNotificationSchema = createInsertSchema(ticketNotifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
}).extend({
  type: z.enum(["assigned", "completed", "due_tomorrow", "due_today", "overdue", "mentioned"]),
  isRead: z.boolean().optional().default(false),
});

export type InsertTicketNotification = z.infer<typeof insertTicketNotificationSchema>;
export type TicketNotification = typeof ticketNotifications.$inferSelect;

// Property Management Companies - companies that manage multiple properties
export const propertyManagementCompanies = pgTable("property_management_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().$type<"active" | "inactive">().default("active"),
  phone: text("phone"),
  email: text("email"),
  street: text("street"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  website: text("website"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPropertyManagementCompanySchema = createInsertSchema(propertyManagementCompanies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["active", "inactive"]).default("active"),
});

export type InsertPropertyManagementCompany = z.infer<typeof insertPropertyManagementCompanySchema>;
export type PropertyManagementCompany = typeof propertyManagementCompanies.$inferSelect;

// Property Managers - individuals who work for property management companies
export const propertyManagers = pgTable("property_managers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  propertyManagementCompanyId: varchar("property_management_company_id").notNull().references(() => propertyManagementCompanies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title"),
  phone: text("phone"),
  email: text("email"),
  isPrimary: text("is_primary").notNull().default("false").$type<"true" | "false">(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPropertyManagerSchema = createInsertSchema(propertyManagers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  isPrimary: z.enum(["true", "false"]).default("false"),
});

export type InsertPropertyManager = z.infer<typeof insertPropertyManagerSchema>;
export type PropertyManager = typeof propertyManagers.$inferSelect;

// Property Manager Emails - multiple emails per manager
export const propertyManagerEmails = pgTable("property_manager_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  propertyManagerId: varchar("property_manager_id").notNull().references(() => propertyManagers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  isPrimary: text("is_primary").notNull().default("false").$type<"true" | "false">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPropertyManagerEmailSchema = createInsertSchema(propertyManagerEmails).omit({
  id: true,
  createdAt: true,
}).extend({
  isPrimary: z.enum(["true", "false"]).default("false"),
});

export type InsertPropertyManagerEmail = z.infer<typeof insertPropertyManagerEmailSchema>;
export type PropertyManagerEmail = typeof propertyManagerEmails.$inferSelect;

// Property Manager Phones - multiple phones per manager with type (personal/company)
export const propertyManagerPhones = pgTable("property_manager_phones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  propertyManagerId: varchar("property_manager_id").notNull().references(() => propertyManagers.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  phoneType: text("phone_type").notNull().default("company").$type<"personal" | "company">(),
  isPrimary: text("is_primary").notNull().default("false").$type<"true" | "false">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPropertyManagerPhoneSchema = createInsertSchema(propertyManagerPhones).omit({
  id: true,
  createdAt: true,
}).extend({
  phoneType: z.enum(["personal", "company"]).default("company"),
  isPrimary: z.enum(["true", "false"]).default("false"),
});

export type InsertPropertyManagerPhone = z.infer<typeof insertPropertyManagerPhoneSchema>;
export type PropertyManagerPhone = typeof propertyManagerPhones.$inferSelect;

// Extended type for property manager with emails and phones
export type PropertyManagerWithContacts = PropertyManager & {
  emails: PropertyManagerEmail[];
  phones: PropertyManagerPhone[];
};

// ==================== EQUIPMENT TRACKING MODULE ====================

// Equipment types for categorization
export type EquipmentType = "truck" | "mower" | "trailer" | "skid_steer" | "atv_utv" | "specialty" | "other_vehicle";

// Equipment status for lifecycle tracking
export type EquipmentStatus = "active" | "in_repair" | "out_of_service" | "retired";

// Equipment table - core equipment assets
export const equipment = pgTable("equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  equipmentType: text("equipment_type").notNull().$type<EquipmentType>(),
  name: text("name").notNull(), // e.g., "Truck 12", "Wright Stand-On #3"
  status: text("status").notNull().$type<EquipmentStatus>().default("active"),
  assignedToId: varchar("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  location: text("location"), // Shop, Yard, In-field, etc.
  make: text("make"), // Manufacturer/brand
  model: text("model"),
  year: integer("year"),
  serialNumber: text("serial_number"), // VIN for vehicles
  licensePlate: text("license_plate"),
  registrationExpiration: timestamp("registration_expiration"),
  insuranceExpiration: timestamp("insurance_expiration"),
  purchaseDate: timestamp("purchase_date"),
  warrantyExpiration: timestamp("warranty_expiration"),
  // For vehicles - mileage tracking
  currentMileage: integer("current_mileage"),
  serviceMileageInterval: integer("service_mileage_interval"), // e.g., 5000 for oil change
  // For equipment with hours - engine hours tracking
  currentHours: real("current_hours"),
  serviceHoursInterval: real("service_hours_interval"), // e.g., 250 for mower service
  // Mower-specific
  deckSize: text("deck_size"),
  // Trailer-specific
  axleCount: integer("axle_count"),
  loadRating: text("load_rating"),
  tireSize: text("tire_size"),
  // General
  fuelType: text("fuel_type"),
  notes: text("notes"),
  lastServiceDate: timestamp("last_service_date"),
  // Specialty equipment - custom key/value specifications
  customSpecs: jsonb("custom_specs").$type<Record<string, string>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEquipmentSchema = createInsertSchema(equipment).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  equipmentType: z.enum(["truck", "mower", "trailer", "skid_steer", "atv_utv", "specialty", "other_vehicle"]),
  status: z.enum(["active", "in_repair", "out_of_service", "retired"]).default("active"),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  currentMileage: z.number().int().min(0).optional().nullable(),
  serviceMileageInterval: z.number().int().min(0).optional().nullable(),
  currentHours: z.number().min(0).optional().nullable(),
  serviceHoursInterval: z.number().min(0).optional().nullable(),
  axleCount: z.number().int().min(1).optional().nullable(),
  registrationExpiration: z.coerce.date().optional().nullable(),
  insuranceExpiration: z.coerce.date().optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(),
  warrantyExpiration: z.coerce.date().optional().nullable(),
  lastServiceDate: z.coerce.date().optional().nullable(),
  customSpecs: z.record(z.string(), z.string()).optional().nullable(),
});

export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipment.$inferSelect;

// Equipment Files - attachments like photos, manuals, registrations
export const equipmentFiles = pgTable("equipment_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  equipmentId: varchar("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // pdf, image, etc.
  fileSize: integer("file_size"),
  storagePath: text("storage_path").notNull(), // Object storage path
  uploadedById: varchar("uploaded_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEquipmentFileSchema = createInsertSchema(equipmentFiles).omit({
  id: true,
  createdAt: true,
}).extend({
  fileSize: z.number().int().optional().nullable(),
});

export type InsertEquipmentFile = z.infer<typeof insertEquipmentFileSchema>;
export type EquipmentFile = typeof equipmentFiles.$inferSelect;

// Equipment Ticket Categories
export type EquipmentTicketCategory = "preventative_maintenance" | "repair" | "inspection" | "safety" | "breakdown";

// Equipment Ticket Status
export type EquipmentTicketStatus = "new" | "diagnosing" | "waiting_on_parts" | "in_repair" | "completed" | "closed";

// Equipment Tickets - maintenance/repair tickets linked to equipment
export const equipmentTickets = pgTable("equipment_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  equipmentId: varchar("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  category: text("category").notNull().$type<EquipmentTicketCategory>(),
  priority: text("priority").notNull().$type<"low" | "normal" | "high" | "urgent">().default("normal"),
  status: text("status").notNull().$type<EquipmentTicketStatus>().default("new"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  reportedById: varchar("reported_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedToId: varchar("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  // Photos - array of object storage paths
  photos: text("photos").array(),
  // Completion fields
  workPerformedNotes: text("work_performed_notes"),
  laborTime: real("labor_time"), // Hours
  partsUsed: text("parts_used"),
  vendorUsed: text("vendor_used"),
  totalCost: integer("total_cost"), // In cents
  completedAt: timestamp("completed_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEquipmentTicketSchema = createInsertSchema(equipmentTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: z.enum(["preventative_maintenance", "repair", "inspection", "safety", "breakdown"]),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  status: z.enum(["new", "diagnosing", "waiting_on_parts", "in_repair", "completed", "closed"]).default("new"),
  dueDate: z.coerce.date().optional().nullable(),
  photos: z.array(z.string()).optional().nullable(),
  laborTime: z.number().min(0).optional().nullable(),
  totalCost: z.number().int().min(0).optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
  closedAt: z.coerce.date().optional().nullable(),
});

export type InsertEquipmentTicket = z.infer<typeof insertEquipmentTicketSchema>;
export type EquipmentTicket = typeof equipmentTickets.$inferSelect;

// Equipment Ticket Status History - audit trail
export const equipmentTicketStatusHistory = pgTable("equipment_ticket_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => equipmentTickets.id, { onDelete: "cascade" }),
  fromStatus: text("from_status").$type<EquipmentTicketStatus>(),
  toStatus: text("to_status").notNull().$type<EquipmentTicketStatus>(),
  changedById: varchar("changed_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEquipmentTicketStatusHistorySchema = createInsertSchema(equipmentTicketStatusHistory).omit({
  id: true,
  createdAt: true,
}).extend({
  fromStatus: z.enum(["new", "diagnosing", "waiting_on_parts", "in_repair", "completed", "closed"]).optional().nullable(),
  toStatus: z.enum(["new", "diagnosing", "waiting_on_parts", "in_repair", "completed", "closed"]),
});

export type InsertEquipmentTicketStatusHistory = z.infer<typeof insertEquipmentTicketStatusHistorySchema>;
export type EquipmentTicketStatusHistory = typeof equipmentTicketStatusHistory.$inferSelect;

// Extended type for equipment with ticket count
export type EquipmentWithTicketCount = Equipment & {
  openTicketCount: number;
};
