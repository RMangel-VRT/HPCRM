import { z } from "zod";
import { sql, pgTable, text, varchar, timestamp, unique, integer, jsonb, real, boolean, date, index, uniqueIndex, numeric, AnyPgColumn, createInsertSchema } from "./drizzle-stub";

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  subscriptionPlan: text("subscription_plan").$type<"free" | "basic" | "pro" | "enterprise">().default("free"),
  subscriptionStatus: text("subscription_status").$type<"active" | "canceled" | "past_due" | "trialing">().default("active"),
  billingEmail: text("billing_email"),
  phone: text("phone"),
  pesticideLicenseNumber: text("pesticide_license_number"),
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
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  isSuperAdmin: text("is_super_admin").notNull().default("false").$type<"true" | "false">(),
  defaultCompanyId: varchar("default_company_id").references(() => companies.id, { onDelete: "set null" }),
  language: text("language").notNull().default("en").$type<"en" | "es">(),
  applicatorLicenseNumber: text("applicator_license_number"),
  applicatorLicenseState: text("applicator_license_state"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  isSuperAdmin: z.enum(["true", "false"]).default("false"),
  defaultCompanyId: z.string().optional(),
  language: z.enum(["en", "es"]).default("en"),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  applicatorLicenseNumber: z.string().nullable().optional(),
  applicatorLicenseState: z.string().nullable().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const companyUsers = pgTable("company_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor">(),
  status: text("status").notNull().$type<"active" | "invited" | "suspended">().default("active"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  invitedAt: timestamp("invited_at"),
  joinedAt: timestamp("joined_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userCompanyUnique: unique().on(table.userId, table.companyId),
  companyUsersUserIdIdx: index("company_users_user_id_idx").on(table.userId),
  companyUsersCompanyIdIdx: index("company_users_company_id_idx").on(table.companyId),
}));

export const insertCompanyUserSchema = createInsertSchema(companyUsers).omit({
  id: true,
  createdAt: true,
}).extend({
  role: z.enum(["admin", "office", "field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"]),
  status: z.enum(["active", "invited", "suspended"]).default("active"),
  tags: z.array(z.string()).default([]),
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
  parentCustomerId: varchar("parent_customer_id"),
  isParent: text("is_parent").notNull().default("false").$type<"true" | "false">(),
  active: text("active").notNull().default("true").$type<"true" | "false">(),
  customerType: text("customer_type").$type<"commercial" | "hoa">().notNull().default("commercial"),
  snowEnabled: boolean("snow_enabled").notNull().default(false),
  includeInRoute: boolean("include_in_route").notNull().default(false),
  locationLat: real("location_lat"),
  locationLng: real("location_lng"),
  ranking: text("ranking").$type<"standard" | "preferred" | "key_account">().notNull().default("standard"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  customersCompanyIdIdx: index("customers_company_id_idx").on(table.companyId),
  // Trigram index for fast customer-name substring search (requires pg_trgm extension)
  customersNameTrgmIdx: index("customers_name_trgm_idx").using("gin", sql`lower(name) gin_trgm_ops`),
}));

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["active", "prospect", "inactive"]).default("active"),
  tags: z.array(z.string()).default([]),
  // Forms submit "" for an unselected optional Select; coerce empty/null to undefined
  // so the optional enum validates instead of returning a 400.
  complexityScore: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.enum(["1", "2", "3", "4", "5"]).optional(),
  ),
  parentCustomerId: z.string().nullable().optional(),
  isParent: z.enum(["true", "false"]).default("false"),
  active: z.enum(["true", "false"]).default("true"),
  snowEnabled: z.boolean().default(false),
  locationLat: z.number().nullable().optional(),
  locationLng: z.number().nullable().optional(),
  ranking: z.enum(["standard", "preferred", "key_account"]).default("standard"),
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
}, (table) => ({
  contactsCompanyIdIdx: index("contacts_company_id_idx").on(table.companyId),
  contactsCustomerIdIdx: index("contacts_customer_id_idx").on(table.customerId),
}));

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
}, (table) => ({
  notesCompanyIdIdx: index("notes_company_id_idx").on(table.companyId),
  notesCustomerIdIdx: index("notes_customer_id_idx").on(table.customerId),
}));

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
  autoPopulateServicePlans: boolean("auto_populate_service_plans").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  contractsCompanyIdIdx: index("contracts_company_id_idx").on(table.companyId),
  contractsCustomerIdIdx: index("contracts_customer_id_idx").on(table.customerId),
}));

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
  autoPopulateServicePlans: z.boolean().default(true),
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
}, (table) => ({
  contractStatusHistoryContractIdIdx: index("contract_status_history_contract_id_idx").on(table.contractId),
}));

export const insertContractStatusHistorySchema = createInsertSchema(contractStatusHistory).omit({
  id: true,
  createdAt: true,
}).extend({
  oldStatus: z.enum(["active", "paused", "ended"]).optional(),
  newStatus: z.enum(["active", "paused", "ended"]),
});

export type InsertContractStatusHistory = z.infer<typeof insertContractStatusHistorySchema>;
export type ContractStatusHistory = typeof contractStatusHistory.$inferSelect;

export type RoleName = "admin" | "office" | "field_manager" | "chemical_manager" | "field" | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor";

export type MailboxVisibilityConfig = {
  shared: RoleName[];
  perRole?: Partial<Record<RoleName, "own" | "all" | "shared_only">>;
};

export const DEFAULT_MAILBOX_VISIBILITY: MailboxVisibilityConfig = {
  shared: ["admin", "office"],
  perRole: { field: "own" },
};

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  companyName: text("company_name").notNull(),
  mowingSeasonMonths: text("mowing_season_months").array().notNull().default(sql`ARRAY[]::text[]`),
  cleanupSeasonMonths: text("cleanup_season_months").array().notNull().default(sql`ARRAY[]::text[]`),
  hourlyRateBenchmarks: text("hourly_rate_benchmarks").notNull().default('{}'),
  featureFlags: text("feature_flags").notNull().default('{}'),
  defaultMailboxVisibility: jsonb("default_mailbox_visibility").$type<MailboxVisibilityConfig>().default(sql`'{"shared":["admin","office"],"perRole":{"field":"own"}}'::jsonb`),
  defaultSyncIntervalMinutes: integer("default_sync_interval_minutes").default(2),
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
  defaultMailboxVisibility: z.object({
    shared: z.array(z.string()).default([]),
    perRole: z.record(z.enum(["own", "all", "shared_only"])).optional(),
  }).optional(),
  defaultSyncIntervalMinutes: z.number().int().min(1).max(60).optional(),
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
  actionType: text("action_type").notNull().default("needs_action").$type<"needs_action" | "waiting">(),
  waitingCategory: text("waiting_category").$type<"customer" | "vendor" | "internal" | "other">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  ticketTypeStatusesTypeIdIdx: index("ticket_type_statuses_ticket_type_id_idx").on(table.ticketTypeId),
}));

export const insertTicketTypeStatusSchema = createInsertSchema(ticketTypeStatuses).omit({
  id: true,
  createdAt: true,
}).extend({
  displayOrder: z.number().int().min(0),
  isFinal: z.enum(["true", "false"]).default("false"),
  actionType: z.enum(["needs_action", "waiting"]).default("needs_action"),
  waitingCategory: z.enum(["customer", "vendor", "internal", "other"]).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.actionType === "waiting" && !data.waitingCategory) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "waitingCategory is required when actionType is 'waiting'",
      path: ["waitingCategory"],
    });
  }
  if (data.actionType === "needs_action" && data.waitingCategory) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "waitingCategory must be null when actionType is 'needs_action'",
      path: ["waitingCategory"],
    });
  }
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
}, (table) => ({
  ticketTypeFieldsStatusIdIdx: index("ticket_type_fields_status_id_idx").on(table.statusId),
}));

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
export type WorkType = "contract" | "extra_work" | "admin" | "estimate_request" | "shop_todo" | "rfp_request" | "invoice";

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
  // Documents - array of object storage paths for PDF attachments (Estimate Request only)
  documents: text("documents").array(),
  documentNames: text("document_names").array(),
  assignedToId: varchar("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  delegatedById: varchar("delegated_by_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  // Invoice/External reference fields
  invoiceNumber: text("invoice_number"), // QuickBooks invoice number
  estimateNumber: text("estimate_number"), // QuickBooks estimate number
  workCompletedDate: timestamp("work_completed_date"), // Date work was completed (for billing reference)
  invoiceCategory: text("invoice_category").$type<"general_maintenance" | "snow">(), // Category for invoice tickets to determine which rates to display
  equipmentId: varchar("equipment_id"), // Optional link to equipment for Shop to-do tickets (FK added via migration)
  // Work completion fields (added via migration)
  completedByUserId: varchar("completed_by_id").references(() => users.id, { onDelete: "set null" }),
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  leadTechUserId: varchar("lead_tech_user_id").references(() => users.id, { onDelete: "set null" }),
  crewMemberUserIds: text("crew_member_user_ids").array().default(sql`ARRAY[]::text[]`),
  workSummaryForCustomer: text("work_summary_for_customer"),
  materialsUsed: text("materials_used"),
  areasWorked: text("areas_worked"),
  recommendations: text("recommendations"),
  internalCompletionNotes: text("internal_completion_notes"),
  completionPhotoStorageKeys: text("completion_photo_storage_keys").array().default(sql`ARRAY[]::text[]`),
  completionEmailSentAt: timestamp("completion_email_sent_at"),
  followUpTicketId: varchar("follow_up_ticket_id").references((): AnyPgColumn => tickets.id, { onDelete: "set null" }),
  // Mobile / crew routing fields
  crewId: varchar("crew_id"),
  routeOrder: integer("route_order"),
  startedAt: timestamp("started_at"),
  mobileStatus: text("mobile_status").$type<"not_started" | "in_progress" | "complete" | "skipped" | "flagged">().default("not_started"),
  createdById: varchar("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  ticketsCompanyIdIdx: index("tickets_company_id_idx").on(table.companyId),
  ticketsCustomerIdIdx: index("tickets_customer_id_idx").on(table.customerId),
  ticketsAssignedToIdIdx: index("tickets_assigned_to_id_idx").on(table.assignedToId),
  ticketsContractIdIdx: index("tickets_contract_id_idx").on(table.contractId),
  ticketsCompanyCreatedAtIdx: index("tickets_company_created_at_idx").on(table.companyId, table.createdAt),
  ticketsEquipmentIdIdx: index("tickets_equipment_id_idx").on(table.equipmentId),
}));

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  customerId: z.string().nullable().optional(), // Optional for shop_todo tickets
  contractId: z.string().nullable().optional(),
  serviceType: z.enum(["mowing", "pet_station", "chemical", "shrub_trimming", "ornamental_grass", "aeration", "cleanups", "tree_pruning"]).nullable().optional(),
  workType: z.enum(["contract", "extra_work", "admin", "estimate_request", "shop_todo"]).default("contract"),
  billingBehavior: z.enum(["no_invoice", "invoice_required", "internal"]).default("no_invoice"),
  locationLat: z.number().nullable().optional(),
  locationLng: z.number().nullable().optional(),
  locationLabel: z.string().nullable().optional(),
  locationDescription: z.string().nullable().optional(),
  photos: z.array(z.string()).nullable().optional(),
  documents: z.array(z.string()).nullable().optional(),
  documentNames: z.array(z.string()).nullable().optional(),
  assignedToId: z.string().nullable().optional(), // Optional - Invoice tickets can be unassigned
  delegatedById: z.string().nullable().optional(), // Tracks who delegated the ticket for return-on-completion
  dueDate: z.coerce.date().nullable().optional(), // Coerce ISO string to Date
  completedAt: z.coerce.date().nullable().optional(), // Coerce ISO string to Date
  invoiceNumber: z.string().nullable().optional(), // QuickBooks invoice number
  estimateNumber: z.string().nullable().optional(), // QuickBooks estimate number
  workCompletedDate: z.coerce.date().nullable().optional(), // Date work was completed (for billing reference)
  invoiceCategory: z.enum(["general_maintenance", "snow"]).nullable().optional(), // Category for invoice tickets
  equipmentId: z.string().nullable().optional(), // Optional link to equipment for Shop to-do tickets
  // Work completion fields
  completedByUserId: z.string().nullable().optional(),
  actualStartTime: z.coerce.date().nullable().optional(),
  actualEndTime: z.coerce.date().nullable().optional(),
  leadTechUserId: z.string().nullable().optional(),
  crewMemberUserIds: z.array(z.string()).nullable().optional(),
  workSummaryForCustomer: z.string().nullable().optional(),
  materialsUsed: z.string().nullable().optional(),
  areasWorked: z.string().nullable().optional(),
  recommendations: z.string().nullable().optional(),
  internalCompletionNotes: z.string().nullable().optional(),
  completionPhotoStorageKeys: z.array(z.string()).nullable().optional(),
  completionEmailSentAt: z.coerce.date().nullable().optional(),
  followUpTicketId: z.string().nullable().optional(),
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
  ticketFieldValuesTicketIdIdx: index("ticket_field_values_ticket_id_idx").on(table.ticketId),
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
}, (table) => ({
  ticketStatusHistoryTicketIdIdx: index("ticket_status_history_ticket_id_idx").on(table.ticketId),
}));

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
}, (table) => ({
  ticketCommentsTicketIdIdx: index("ticket_comments_ticket_id_idx").on(table.ticketId),
}));

export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({
  id: true,
  createdAt: true,
}).extend({
  body: z.string().min(1).max(5000),
  parentCommentId: z.string().nullable().optional(),
});

export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type TicketComment = typeof ticketComments.$inferSelect;
export type TicketCommentWithAuthor = TicketComment & { authorName: string };

// Ticket Comment Mentions - tracks @mentions in comments
export const ticketCommentMentions = pgTable("ticket_comment_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull().references(() => ticketComments.id, { onDelete: "cascade" }),
  mentionedUserId: varchar("mentioned_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  ticketCommentMentionsCommentIdIdx: index("ticket_comment_mentions_comment_id_idx").on(table.commentId),
}));

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
  ticketLinksSourceIdIdx: index("ticket_links_source_ticket_id_idx").on(table.sourceTicketId),
  ticketLinksTargetIdIdx: index("ticket_links_target_ticket_id_idx").on(table.targetTicketId),
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
}, (table) => ({
  ticketNotificationsRecipientCompanyIdx: index("ticket_notifications_recipient_company_idx").on(table.recipientId, table.companyId),
}));

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
  // Profile photo
  profilePhotoPath: text("profile_photo_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  equipmentCompanyIdIdx: index("equipment_company_id_idx").on(table.companyId),
}));

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
}, (table) => ({
  equipmentTicketsCompanyIdIdx: index("equipment_tickets_company_id_idx").on(table.companyId),
  equipmentTicketsEquipmentIdIdx: index("equipment_tickets_equipment_id_idx").on(table.equipmentId),
}));

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

// ── Snow Storm Tracking ──────────────────────────────────────────────

export const SNOW_RANGES = ["1-2\"", "2-4\"", "5-6\"", "6-8\"", "8-10\"", "10+\""] as const;
export type SnowRange = typeof SNOW_RANGES[number];

export const SNOW_SERVICE_TYPES = ["Plow", "ATV", "Hand Shovel", "Ice Melt", "Slicer / De-icer", "Haul Off / Storage"] as const;
export type SnowServiceType = typeof SNOW_SERVICE_TYPES[number];

export const snowEvents = pgTable("snow_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  eventName: text("event_name"),
  eventStartDateTime: timestamp("event_start_date_time").notNull(),
  eventEndDateTime: timestamp("event_end_date_time"),
  snowRange: text("snow_range").notNull().$type<SnowRange>(),
  reportedTotalInches: text("reported_total_inches"),
  measurementNotes: text("measurement_notes"),
  eventNotes: text("event_notes"),
  status: text("status").notNull().$type<"draft" | "ready" | "locked">().default("draft"),
  createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSnowEventSchema = createInsertSchema(snowEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  snowRange: z.enum(SNOW_RANGES),
  status: z.enum(["draft", "ready", "locked"]).default("draft"),
});

export type InsertSnowEvent = z.infer<typeof insertSnowEventSchema>;
export type SnowEvent = typeof snowEvents.$inferSelect;

export const snowEventAttachments = pgTable("snow_event_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  snowEventId: varchar("snow_event_id").notNull().references(() => snowEvents.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  uploadedByUserId: varchar("uploaded_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSnowEventAttachmentSchema = createInsertSchema(snowEventAttachments).omit({
  id: true,
  createdAt: true,
});

export type InsertSnowEventAttachment = z.infer<typeof insertSnowEventAttachmentSchema>;
export type SnowEventAttachment = typeof snowEventAttachments.$inferSelect;

export const snowEventPropertyImpacts = pgTable("snow_event_property_impacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  snowEventId: varchar("snow_event_id").notNull().references(() => snowEvents.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  serviceTypes: text("service_types").array().notNull().default(sql`ARRAY[]::text[]`),
  siteNotes: text("site_notes"),
  laborHours: text("labor_hours"),
  materialUsed: text("material_used"),
  billingStatus: text("billing_status").notNull().$type<"not_created" | "ticket_created" | "invoiced" | "paid">().default("not_created"),
  ticketId: varchar("ticket_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSnowEventPropertyImpactSchema = createInsertSchema(snowEventPropertyImpacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  serviceTypes: z.array(z.enum(SNOW_SERVICE_TYPES)).default([]),
  billingStatus: z.enum(["not_created", "ticket_created", "invoiced", "paid"]).default("not_created"),
});

export type InsertSnowEventPropertyImpact = z.infer<typeof insertSnowEventPropertyImpactSchema>;
export type SnowEventPropertyImpact = typeof snowEventPropertyImpacts.$inferSelect;

export type SnowEventWithDetails = SnowEvent & {
  propertyCount: number;
  ticketCount: number;
  createdByName: string;
};

export type SnowEventPropertyImpactWithCustomer = SnowEventPropertyImpact & {
  customerName: string;
};

export const EMAIL_TEMPLATE_CATEGORIES = ["transactional", "marketing", "system"] as const;
export const EMAIL_LOG_STATUSES = ["pending", "sent", "delivered", "bounced", "failed", "dropped"] as const;

export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body"),
  category: text("category").notNull().$type<"transactional" | "marketing" | "system">().default("transactional"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

export const emailRules = pgTable("email_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(),
  templateId: varchar("template_id").notNull().references(() => emailTemplates.id, { onDelete: "cascade" }),
  conditionsJson: jsonb("conditions_json"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmailRuleSchema = createInsertSchema(emailRules).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailRule = z.infer<typeof insertEmailRuleSchema>;
export type EmailRule = typeof emailRules.$inferSelect;

export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  ticketId: varchar("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
  templateId: varchar("template_id").references(() => emailTemplates.id, { onDelete: "set null" }),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body"),
  status: text("status").notNull().$type<"pending" | "sent" | "delivered" | "bounced" | "failed" | "dropped">().default("pending"),
  providerMessageId: text("provider_message_id"),
  errorJson: jsonb("error_json"),
  sentById: varchar("sent_by_id").references(() => users.id, { onDelete: "set null" }),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  emailLogsCompanyIdIdx: index("email_logs_company_id_idx").on(table.companyId),
  emailLogsCustomerIdIdx: index("email_logs_customer_id_idx").on(table.customerId),
  emailLogsTicketIdIdx: index("email_logs_ticket_id_idx").on(table.ticketId),
  emailLogsCompanyCreatedAtIdx: index("email_logs_company_created_at_idx").on(table.companyId, table.createdAt),
}));

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

export type EmailLogWithDetails = Omit<EmailLog, "htmlBody"> & {
  htmlBody?: string | null;
  customerName?: string;
  ticketTitle?: string;
  templateName?: string;
};

// ==================== PROPOSAL MAKER ====================

export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
  ticketId: varchar("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
  title: varchar("title").notNull().default("Proposal"),
  proposalDate: varchar("proposal_date").notNull(),
  estimateNumber: varchar("estimate_number"),
  proposalNumber: varchar("proposal_number").notNull().unique(),
  scopeOfWork: text("scope_of_work").notNull().default(""),
  status: varchar("status").notNull().default("draft"),
  visualScopeSheetId: varchar("visual_scope_sheet_id").references(() => visualScopeSheets.id, { onDelete: "set null" }),
  vsIncludeBase: boolean("vs_include_base").notNull().default(false),
  vsIncludeOverlay: boolean("vs_include_overlay").notNull().default(false),
  photoLayout: varchar("photo_layout").notNull().default("large"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  proposalsCompanyIdIdx: index("proposals_company_id_idx").on(table.companyId),
  proposalsCustomerIdIdx: index("proposals_customer_id_idx").on(table.customerId),
}));

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  createdAt: true,
}).extend({
  proposalNumber: z.string().optional(),
});

export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;

export const proposalFiles = pgTable("proposal_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  fileType: varchar("file_type").notNull(),
  storageObjectPath: varchar("storage_object_path").notNull(),
  filename: varchar("filename").notNull(),
  mimeType: varchar("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  caption: text("caption"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProposalFileSchema = createInsertSchema(proposalFiles).omit({
  id: true,
  createdAt: true,
});

export type InsertProposalFile = z.infer<typeof insertProposalFileSchema>;
export type ProposalFile = typeof proposalFiles.$inferSelect;

export const proposalVersions = pgTable("proposal_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  title: varchar("title").notNull(),
  proposalDate: varchar("proposal_date").notNull(),
  estimateNumber: varchar("estimate_number"),
  finalizedById: varchar("finalized_by_id").references(() => users.id, { onDelete: "set null" }),
  finalizedAt: timestamp("finalized_at").notNull().defaultNow(),
  pdfStoragePath: varchar("pdf_storage_path").notNull(),
  visualScopeSheetId: varchar("visual_scope_sheet_id"),
  visualScopeTitle: varchar("visual_scope_title"),
  visualScopeDate: varchar("visual_scope_date"),
  vsExportWidth: integer("vs_export_width"),
  vsIncludedBase: boolean("vs_included_base").notNull().default(false),
  vsIncludedOverlay: boolean("vs_included_overlay").notNull().default(false),
  vsFrozenAt: timestamp("vs_frozen_at"),
  vsCombinedPath: varchar("vs_combined_path"),
  vsBasePath: varchar("vs_base_path"),
  vsOverlayPath: varchar("vs_overlay_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueProposalVersion: unique().on(table.proposalId, table.versionNumber),
}));

export const insertProposalVersionSchema = createInsertSchema(proposalVersions).omit({
  id: true,
  createdAt: true,
  finalizedAt: true,
});

export type InsertProposalVersion = z.infer<typeof insertProposalVersionSchema>;
export type ProposalVersion = typeof proposalVersions.$inferSelect;

export type ProposalVersionWithUser = ProposalVersion & {
  finalizedByName: string | null;
};

export type ProposalPlantItem = {
  id: string;
  proposalId: string;
  companyId: string;
  plantCatalogItemId: string | null;
  nameSnapshot: string;
  botanicalSnapshot: string | null;
  sizeSnapshot: string | null;
  imageUrlSnapshot: string | null;
  imageStoragePathSnapshot: string | null;
  quantity: number;
  wholesaleCostSnapshot: string | null;
  notes: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProposalWithDetails = Proposal & {
  customerName: string;
  files: ProposalFile[];
  versions: ProposalVersionWithUser[];
  visualScopeSheet?: VisualScopeSheetWithCustomer | null;
  plantItems: ProposalPlantItem[];
};

// ==================== CREW WORKSHEETS ====================

export interface EquipmentItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface MaterialItem {
  id: string;
  label: string;
  quantity: string;
  checked: boolean;
}

export const crewWorksheets = pgTable("crew_worksheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
  ticketId: varchar("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
  sourceProposalId: varchar("source_proposal_id").references(() => proposals.id, { onDelete: "set null" }),
  sourceProposalNumberSnapshot: varchar("source_proposal_number_snapshot"),
  sourceProposalTitleSnapshot: varchar("source_proposal_title_snapshot"),
  worksheetNumber: varchar("worksheet_number").notNull(),
  title: varchar("title").notNull().default("Crew Worksheet"),
  worksheetDate: varchar("worksheet_date").notNull(),
  scopeOfWork: text("scope_of_work").notNull().default(""),
  status: varchar("status").notNull().default("draft"),
  visualScopeSheetId: varchar("visual_scope_sheet_id").references(() => visualScopeSheets.id, { onDelete: "set null" }),
  assignedCrewLeadId: varchar("assigned_crew_lead_id").references(() => users.id, { onDelete: "set null" }),
  crewLabel: varchar("crew_label"),
  scheduledDate: varchar("scheduled_date"),
  scheduledStartTime: varchar("scheduled_start_time"),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 2 }),
  equipmentChecklist: jsonb("equipment_checklist").$type<EquipmentItem[]>().notNull().default(sql`'[]'::jsonb`),
  materialsChecklist: jsonb("materials_checklist").$type<MaterialItem[]>().notNull().default(sql`'[]'::jsonb`),
  crewNotes: text("crew_notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  crewWorksheetsCompanyIdIdx: index("crew_worksheets_company_id_idx").on(table.companyId),
  crewWorksheetsCustomerIdIdx: index("crew_worksheets_customer_id_idx").on(table.customerId),
  crewWorksheetsTicketIdIdx: index("crew_worksheets_ticket_id_idx").on(table.ticketId),
  crewWorksheetsSourceProposalIdIdx: index("crew_worksheets_source_proposal_id_idx").on(table.sourceProposalId),
  crewWorksheetsCompanyNumberKey: uniqueIndex("crew_worksheets_company_id_worksheet_number_key").on(table.companyId, table.worksheetNumber),
}));

export const insertCrewWorksheetSchema = createInsertSchema(crewWorksheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  worksheetNumber: z.string().optional(),
});

export type InsertCrewWorksheet = z.infer<typeof insertCrewWorksheetSchema>;
export type CrewWorksheet = typeof crewWorksheets.$inferSelect;

export const crewWorksheetPhotos = pgTable("crew_worksheet_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crewWorksheetId: varchar("crew_worksheet_id").notNull().references(() => crewWorksheets.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  storageObjectPath: varchar("storage_object_path").notNull(),
  filename: varchar("filename").notNull(),
  mimeType: varchar("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  caption: text("caption"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  crewWorksheetPhotosWorksheetIdx: index("crew_worksheet_photos_worksheet_id_idx").on(table.crewWorksheetId),
}));

export const insertCrewWorksheetPhotoSchema = createInsertSchema(crewWorksheetPhotos).omit({
  id: true,
  createdAt: true,
});

export type InsertCrewWorksheetPhoto = z.infer<typeof insertCrewWorksheetPhotoSchema>;
export type CrewWorksheetPhoto = typeof crewWorksheetPhotos.$inferSelect;

export const crewWorksheetVersions = pgTable("crew_worksheet_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crewWorksheetId: varchar("crew_worksheet_id").notNull().references(() => crewWorksheets.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  title: varchar("title").notNull(),
  worksheetDate: varchar("worksheet_date").notNull(),
  finalizedById: varchar("finalized_by_id").references(() => users.id, { onDelete: "set null" }),
  finalizedAt: timestamp("finalized_at").notNull().defaultNow(),
  pdfStoragePath: varchar("pdf_storage_path").notNull(),
  visualScopeSheetId: varchar("visual_scope_sheet_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueCrewWorksheetVersion: unique().on(table.crewWorksheetId, table.versionNumber),
}));

export const insertCrewWorksheetVersionSchema = createInsertSchema(crewWorksheetVersions).omit({
  id: true,
  createdAt: true,
  finalizedAt: true,
});

export type InsertCrewWorksheetVersion = z.infer<typeof insertCrewWorksheetVersionSchema>;
export type CrewWorksheetVersion = typeof crewWorksheetVersions.$inferSelect;

export type CrewWorksheetVersionWithUser = CrewWorksheetVersion & {
  finalizedByName: string | null;
};

export type CrewWorksheetWithDetails = CrewWorksheet & {
  customerName: string;
  customerStreet?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  photos: CrewWorksheetPhoto[];
  versions: CrewWorksheetVersionWithUser[];
  visualScopeSheet?: VisualScopeSheetWithCustomer | null;
  assignedCrewLeadName?: string | null;
  sourceProposalNumber?: string | null;
  sourceProposalTitle?: string | null;
  sourceProposalDeleted?: boolean;
};

export const crewWorksheetNumberCounters = pgTable("crew_worksheet_number_counters", {
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  lastNumber: integer("last_number").notNull().default(0),
}, (table) => ({
  crewWorksheetCountersPk: unique("crew_worksheet_counters_pk").on(table.companyId, table.year),
}));

// Visual Scope Sheets
export const visualScopeSheets = pgTable("visual_scope_sheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
  title: varchar("title").notNull().default("Visual Scope"),
  scopeDate: varchar("scope_date").notNull(),
  status: varchar("status").notNull().default("draft"),
  baseImagePath: varchar("base_image_path"),
  baseImageFilename: varchar("base_image_filename"),
  baseImageMimeType: varchar("base_image_mime_type"),
  baseImageSize: integer("base_image_size"),
  markupData: jsonb("markup_data").$type<MarkupObject[]>().default(sql`'[]'::jsonb`),
  layerDefs: jsonb("layer_defs").$type<LayerDefinition[]>(),
  captureParams: jsonb("capture_params").$type<CaptureParams>(),
  isScaled: boolean("is_scaled").notNull().default(false),
  scaleSource: varchar("scale_source").$type<"mapbox" | "manual">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVisualScopeSheetSchema = createInsertSchema(visualScopeSheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVisualScopeSheet = z.infer<typeof insertVisualScopeSheetSchema>;
export type VisualScopeSheet = typeof visualScopeSheets.$inferSelect;
export type VisualScopeSheetWithCustomer = VisualScopeSheet & {
  customerName: string;
  customerStreet?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
};

export interface CaptureParams {
  centerLat: number;
  centerLng: number;
  zoom: number;
  bearing: number;
  pitch: number;
  widthUsed: number;
  capturedAt: string;
}

export const seasons = pgTable("seasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSeasonSchema = createInsertSchema(seasons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Season = typeof seasons.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Chemical Products Catalog
// ─────────────────────────────────────────────────────────────────────────────

export const chemicalProducts = pgTable("chemical_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  epaRegistrationNumber: text("epa_registration_number"),
  activeIngredient: text("active_ingredient"),
  targetPest: text("target_pest"),
  applicationRate: text("application_rate"),
  reEntryInterval: text("re_entry_interval"),
  mowingRestriction: text("mowing_restriction"),
  labelPdfStorageKey: text("label_pdf_storage_key"),
  signalWord: text("signal_word").$type<"caution" | "warning" | "danger" | "none">(),
  isOrganic: boolean("is_organic").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  defaultPostApplicationExpectation: text("default_post_application_expectation"),
  defaultPostApplicationWatering: text("default_post_application_watering"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  chemicalProductsCompanyIdIdx: index("chemical_products_company_id_idx").on(table.companyId),
  chemicalProductsCompanyNameUniq: uniqueIndex("chemical_products_company_name_uniq").on(table.companyId, table.name),
}));

export const insertChemicalProductSchema = createInsertSchema(chemicalProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  signalWord: z.enum(["caution", "warning", "danger", "none"]).optional().nullable(),
  isOrganic: z.boolean().default(false),
  isActive: z.boolean().default(true),
  defaultPostApplicationExpectation: z.string().optional().nullable(),
  defaultPostApplicationWatering: z.string().optional().nullable(),
});

export type InsertChemicalProduct = z.infer<typeof insertChemicalProductSchema>;
export type ChemicalProduct = typeof chemicalProducts.$inferSelect;

export const chemicalNotificationTemplates = pgTable("chemical_notification_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  preVisitSubject: text("pre_visit_subject").notNull(),
  preVisitHtml: text("pre_visit_html").notNull(),
  postVisitSubject: text("post_visit_subject").notNull(),
  postVisitHtml: text("post_visit_html").notNull(),
  defaultLabelPdfStorageKey: text("default_label_pdf_storage_key"),
  defaultLabelPdfFilename: text("default_label_pdf_filename"),
  productName: text("product_name"),
  activeIngredient: text("active_ingredient"),
  epaRegNumber: text("epa_reg_number"),
  purposeText: text("purpose_text"),
  reentryInterval: text("reentry_interval"),
  wateringInstructions: text("watering_instructions"),
  mowingInstructions: text("mowing_instructions"),
  postApplicationExpectation: text("post_application_expectation"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  chemNotifTemplatesCompanyIdx: index("chem_notif_templates_company_id_idx").on(table.companyId),
  chemNotifTemplatesNameCompanyUnique: unique("chem_notif_templates_name_company_unique").on(table.name, table.companyId),
}));

export const insertChemicalNotificationTemplateSchema = createInsertSchema(chemicalNotificationTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1).max(200),
  serviceType: z.string().min(1).max(100),
  preVisitSubject: z.string().min(1),
  preVisitHtml: z.string().min(1),
  postVisitSubject: z.string().min(1),
  postVisitHtml: z.string().min(1),
  isDefault: z.boolean().default(false),
  createdBy: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
  activeIngredient: z.string().nullable().optional(),
  epaRegNumber: z.string().nullable().optional(),
  purposeText: z.string().nullable().optional(),
  reentryInterval: z.string().nullable().optional(),
  wateringInstructions: z.string().nullable().optional(),
  mowingInstructions: z.string().nullable().optional(),
  postApplicationExpectation: z.string().nullable().optional(),
});

export type InsertChemicalNotificationTemplate = z.infer<typeof insertChemicalNotificationTemplateSchema>;
export type ChemicalNotificationTemplate = typeof chemicalNotificationTemplates.$inferSelect;

export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  assignedToId: varchar("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  assignedToId2: varchar("assigned_to_id2").references(() => users.id, { onDelete: "set null" }),
  windowStart: date("window_start").notNull(),
  windowEnd: date("window_end").notNull(),
  category: text("category").$type<"general" | "chemical" | "irrigation" | "extra_billable">().notNull().default("general"),
  subtype: text("subtype").$type<"spring_turn_on" | "winterization" | "custom">(),
  status: text("status").$type<"active" | "completed" | "archived">().notNull().default("active"),
  seasonId: varchar("season_id").references(() => seasons.id, { onDelete: "set null" }),
  notificationTemplateId: varchar("notification_template_id").references(() => chemicalNotificationTemplates.id, { onDelete: "set null" }),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignsCompanyIdIdx: index("campaigns_company_id_idx").on(table.companyId),
}));

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  seasonId: z.string().nullable().optional(),
  notificationTemplateId: z.string().nullable().optional(),
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

export const campaignItems = pgTable("campaign_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  propertyId: varchar("property_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  customerCity: text("customer_city").default(""),
  status: text("status").$type<"pending" | "completed" | "skipped">().notNull().default("pending"),
  notes: text("notes"),
  skipReason: text("skip_reason"),
  photos: text("photos").array().default(sql`'{}'::text[]`),
  completedById: varchar("completed_by_id").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at"),
  workflowStep: text("chem_workflow_step").$type<"pre_communication" | "work_in_progress" | "work_completed" | "post_communication">(),
  preCommSentAt: timestamp("chem_pre_sent_at"),
  preCommSentById: varchar("chem_pre_sent_by_id").references(() => users.id, { onDelete: "set null" }),
  workCompletedAt: timestamp("chem_work_completed_at"),
  workCompletedById: varchar("chem_work_completed_by_id").references(() => users.id, { onDelete: "set null" }),
  postCommSentAt: timestamp("chem_post_sent_at"),
  postCommSentById: varchar("chem_post_sent_by_id").references(() => users.id, { onDelete: "set null" }),
  preCommEmailLogId: varchar("chem_pre_email_log_id").references(() => emailLogs.id, { onDelete: "set null" }),
  postCommEmailLogId: varchar("chem_post_email_log_id").references(() => emailLogs.id, { onDelete: "set null" }),
  weatherTemp: real("weather_temp"),
  weatherWindSpeed: real("weather_wind_speed"),
  weatherWindDirection: text("weather_wind_direction"),
  weatherHumidity: real("weather_humidity"),
  weatherConditions: text("weather_conditions"),
  weatherRecordedAt: timestamp("weather_recorded_at"),
  finishedWithoutComms: text("finished_without_comms").$type<"true" | "false">().default("false"),
  exceptionType: text("exception_type").$type<"weather_delayed" | "customer_declined" | "inaccessible_area" | "moved_to_next_visit" | "partial_completion" | "waiting_on_approval">(),
  servicePlanCategory: text("service_plan_category"),
  // Chemical visit scheduling fields
  targetDate: date("target_date"),
  backupDate: date("backup_date"),
  timeWindowStart: text("time_window_start"),
  timeWindowEnd: text("time_window_end"),
  // Chemical product assignment
  chemicalProductId: varchar("chemical_product_id"),
  applicatorUserId: varchar("applicator_user_id").references(() => users.id, { onDelete: "set null" }),
  wasBumpedToBackup: boolean("was_bumped_to_backup").default(false),
  // Completion fields
  labelBatchNumber: text("label_batch_number"),
  labelMixRatio: text("label_mix_ratio"),
  labelPdfOverrideKey: text("label_pdf_override_key"),
  actualAreasTreated: text("actual_areas_treated"),
  actualConditions: text("actual_conditions"),
  completionPhotoStorageKeys: text("completion_photo_storage_keys").array().default(sql`'{}'::text[]`),
  completionNotes: text("completion_notes"),
  postApplicationExpectationOverride: text("post_application_expectation_override"),
  postApplicationWateringOverride: text("post_application_watering_override"),
  reEntryIntervalOverride: text("re_entry_interval_override"),
  mowingRestrictionOverride: text("mowing_restriction_override"),
  completionEmailSentAt: timestamp("completion_email_sent_at"),
  customTemplateVars: jsonb("custom_template_vars").$type<Record<string, string>>(),
  // Extra Billable campaign columns (Slice 1)
  assignedCampaignCrewId: varchar("assigned_campaign_crew_id"),
  billingStatus: text("billing_status").$type<"not_created" | "ticket_created" | "invoiced" | "paid">().notNull().default("not_created"),
  ticketId: varchar("ticket_id"),
  estimatedAmount: numeric("estimated_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignItemsCampaignIdIdx: index("campaign_items_campaign_id_idx").on(table.campaignId),
  campaignItemsCompanyIdIdx: index("campaign_items_company_id_idx").on(table.companyId),
  campaignItemsCustomerIdIdx: index("campaign_items_customer_id_idx").on(table.customerId),
  campaignItemsPropertyIdIdx: index("campaign_items_property_id_idx").on(table.propertyId),
}));

export const insertCampaignItemSchema = createInsertSchema(campaignItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["pending", "completed", "skipped"]).optional(),
  workflowStep: z.enum(["pre_communication", "work_in_progress", "work_completed", "post_communication"]).nullable().optional(),
  finishedWithoutComms: z.enum(["true", "false"]).nullable().optional(),
  weatherTemp: z.number().nullable().optional(),
  weatherWindSpeed: z.number().nullable().optional(),
  weatherWindDirection: z.number().nullable().optional(),
  weatherHumidity: z.number().nullable().optional(),
  weatherConditions: z.string().nullable().optional(),
  weatherRecordedAt: z.coerce.date().nullable().optional(),
  exceptionType: z.enum(["weather_delayed", "customer_declined", "inaccessible_area", "moved_to_next_visit", "partial_completion", "waiting_on_approval"]).nullable().optional(),
  targetDate: z.string().nullable().optional(),
  backupDate: z.string().nullable().optional(),
  timeWindowStart: z.string().nullable().optional(),
  timeWindowEnd: z.string().nullable().optional(),
  wasBumpedToBackup: z.boolean().default(false),
  chemicalProductId: z.string().nullable().optional(),
  applicatorUserId: z.string().nullable().optional(),
  labelPdfOverrideKey: z.string().nullable().optional(),
  labelOverrideFilename: z.string().nullable().optional(),
  purposeOverride: z.string().nullable().optional(),
  reentryIntervalOverride: z.number().nullable().optional(),
  wateringInstructionsOverride: z.string().nullable().optional(),
  mowingInstructionsOverride: z.string().nullable().optional(),
});

export type InsertCampaignItem = z.infer<typeof insertCampaignItemSchema>;
export type CampaignItem = typeof campaignItems.$inferSelect;

export const campaignChecklistTasks = pgTable("campaign_checklist_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  label: text("label").notNull(),
});

export const insertCampaignChecklistTaskSchema = createInsertSchema(campaignChecklistTasks).omit({
  id: true,
});

export type InsertCampaignChecklistTask = z.infer<typeof insertCampaignChecklistTaskSchema>;
export type CampaignChecklistTask = typeof campaignChecklistTasks.$inferSelect;

export const campaignItemTaskCompletions = pgTable("campaign_item_task_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignItemId: varchar("campaign_item_id").notNull().references(() => campaignItems.id, { onDelete: "cascade" }),
  campaignChecklistTaskId: varchar("campaign_checklist_task_id").notNull().references(() => campaignChecklistTasks.id, { onDelete: "cascade" }),
  completedById: varchar("completed_by_id").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});

export const insertCampaignItemTaskCompletionSchema = createInsertSchema(campaignItemTaskCompletions).omit({
  id: true,
});

export type InsertCampaignItemTaskCompletion = z.infer<typeof insertCampaignItemTaskCompletionSchema>;
export type CampaignItemTaskCompletion = typeof campaignItemTaskCompletions.$inferSelect;

export const campaignChecklistAuditLog = pgTable("campaign_checklist_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignItemId: varchar("campaign_item_id").notNull().references(() => campaignItems.id, { onDelete: "cascade" }),
  campaignChecklistTaskId: varchar("campaign_checklist_task_id").notNull().references(() => campaignChecklistTasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull().$type<"completed" | "uncompleted">(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertCampaignChecklistAuditLogSchema = createInsertSchema(campaignChecklistAuditLog).omit({
  id: true,
  timestamp: true,
}).extend({
  action: z.enum(["completed", "uncompleted"]),
});

export type InsertCampaignChecklistAuditLog = z.infer<typeof insertCampaignChecklistAuditLogSchema>;
export type CampaignChecklistAuditLog = typeof campaignChecklistAuditLog.$inferSelect;

export type CampaignChecklistAuditLogWithUser = CampaignChecklistAuditLog & {
  userName?: string;
  taskLabel?: string;
};

// Extra Billable Campaign Crews (Slice 1)
export const campaignCrews = pgTable("campaign_crews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#2563eb"),
  displayOrder: integer("display_order").notNull().default(0),
  leaderUserId: varchar("leader_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  campaignCrewsCampaignIdx: index("campaign_crews_campaign_id_idx").on(table.campaignId),
  campaignCrewsCompanyIdx: index("campaign_crews_company_id_idx").on(table.companyId),
  campaignCrewsCampaignNameUnique: uniqueIndex("campaign_crews_campaign_name_unique").on(table.campaignId, table.name),
}));

export const insertCampaignCrewSchema = createInsertSchema(campaignCrews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Crew name is required"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code").default("#2563eb"),
  leaderUserId: z.string().min(1, "Leader is required"),
});

export type InsertCampaignCrew = z.infer<typeof insertCampaignCrewSchema>;
export type CampaignCrew = typeof campaignCrews.$inferSelect;

export const campaignCrewMembers = pgTable("campaign_crew_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignCrewId: varchar("campaign_crew_id").notNull().references(() => campaignCrews.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  campaignCrewMembersUnique: uniqueIndex("campaign_crew_members_crew_user_unique").on(table.campaignCrewId, table.userId),
  campaignCrewMembersCrewIdx: index("campaign_crew_members_crew_id_idx").on(table.campaignCrewId),
  campaignCrewMembersUserIdx: index("campaign_crew_members_user_id_idx").on(table.userId),
}));

export const insertCampaignCrewMemberSchema = createInsertSchema(campaignCrewMembers).omit({
  id: true,
  createdAt: true,
});

export type InsertCampaignCrewMember = z.infer<typeof insertCampaignCrewMemberSchema>;
export type CampaignCrewMember = typeof campaignCrewMembers.$inferSelect;

export type CampaignCrewWithMembers = CampaignCrew & {
  leaderName?: string;
  members: { userId: string; userName: string }[];
  itemCount: number;
  completedCount: number;
  photoCount: number;
};

export type CampaignWithProgress = Campaign & {
  totalItems: number;
  completedItems: number;
  skippedItems: number;
  assignedToName?: string;
  assignedToName2?: string;
  createdByName?: string;
  seasonName?: string;
};

// Communication Center Tables

export type CommunicationTemplateCategory =
  | "proposal_follow_up"
  | "irrigation_approval_request"
  | "service_update"
  | "chemical_notice"
  | "snow_event_notice"
  | "winter_watering"
  | "billing_reminder"
  | "general_outreach";

export const COMMUNICATION_TEMPLATE_CATEGORIES: CommunicationTemplateCategory[] = [
  "proposal_follow_up",
  "irrigation_approval_request",
  "service_update",
  "chemical_notice",
  "snow_event_notice",
  "winter_watering",
  "billing_reminder",
  "general_outreach",
];

export const COMMUNICATION_TEMPLATE_CATEGORY_LABELS: Record<CommunicationTemplateCategory, string> = {
  proposal_follow_up: "Proposal Follow-Up",
  irrigation_approval_request: "Irrigation Approval Request",
  service_update: "Service Update",
  chemical_notice: "Chemical Notice",
  snow_event_notice: "Snow Event Notice",
  winter_watering: "Winter Watering",
  billing_reminder: "Billing Reminder",
  general_outreach: "General Outreach",
};

export const communicationTemplates = pgTable("communication_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull().$type<CommunicationTemplateCategory>().default("general_outreach"),
  type: text("type").notNull().$type<"email" | "sms" | "note" | "letter">(),
  subject: text("subject"),
  body: text("body").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  isArchived: boolean("is_archived").notNull().default(false),
  defaultCommunicationType: text("default_communication_type").$type<"email" | "sms" | "note" | "letter">(),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCommunicationTemplateSchema = createInsertSchema(communicationTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: z.enum([
    "proposal_follow_up",
    "irrigation_approval_request",
    "service_update",
    "chemical_notice",
    "snow_event_notice",
    "winter_watering",
    "billing_reminder",
    "general_outreach",
  ]).default("general_outreach"),
  type: z.enum(["email", "sms", "note", "letter"]),
  isActive: z.boolean().default(true),
  isArchived: z.boolean().default(false),
  description: z.string().nullable().optional(),
  defaultCommunicationType: z.enum(["email", "sms", "note", "letter"]).nullable().optional(),
  createdById: z.string().nullable().optional(),
});

export type InsertCommunicationTemplate = z.infer<typeof insertCommunicationTemplateSchema>;
export type CommunicationTemplate = typeof communicationTemplates.$inferSelect;

// Communication Audit Log
export const communicationAuditLog = pgTable("communication_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  communicationId: varchar("communication_id").references(() => communications.id, { onDelete: "set null" }),
  templateId: varchar("template_id").references(() => communicationTemplates.id, { onDelete: "set null" }),
  actionType: text("action_type").notNull().$type<"template_created" | "template_edited" | "template_archived" | "communication_sent" | "communication_deleted" | "communication_seed_cleared" | "scheduled_send_cancelled" | "automation_edited" | "automation_toggled">(),
  actionByUserId: varchar("action_by_user_id").references(() => users.id, { onDelete: "set null" }),
  actionDetails: jsonb("action_details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommunicationAuditLogSchema = createInsertSchema(communicationAuditLog).omit({
  id: true,
  createdAt: true,
}).extend({
  actionType: z.enum(["template_created", "template_edited", "template_archived", "communication_sent", "communication_deleted", "communication_seed_cleared", "scheduled_send_cancelled", "automation_edited", "automation_toggled"]),
});

export type InsertCommunicationAuditLog = z.infer<typeof insertCommunicationAuditLogSchema>;
export type CommunicationAuditLog = typeof communicationAuditLog.$inferSelect;

export type CommunicationAuditLogWithUser = CommunicationAuditLog & {
  actionByUserName?: string | null;
};

// Communication Automation Rules
export const communicationAutomationRules = pgTable("communication_automation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull().$type<"time_after_event" | "time_before_event" | "recurring">(),
  eventKey: text("event_key").$type<"proposal_created" | "work_order_closed" | "invoice_due_date" | "service_date">(),
  delayDays: integer("delay_days"),
  recurringIntervalDays: integer("recurring_interval_days"),
  templateId: varchar("template_id").references(() => communicationTemplates.id, { onDelete: "set null" }),
  recipientScope: text("recipient_scope").notNull().$type<"primary_contact" | "all_contacts">().default("primary_contact"),
  autoSend: boolean("auto_send").notNull().default(false),
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommunicationAutomationRuleSchema = createInsertSchema(communicationAutomationRules).omit({
  id: true,
  createdAt: true,
}).extend({
  triggerType: z.enum(["time_after_event", "time_before_event", "recurring"]),
  eventKey: z.enum(["proposal_created", "work_order_closed", "invoice_due_date", "service_date"]).nullable().optional(),
  delayDays: z.number().int().min(0).nullable().optional(),
  recurringIntervalDays: z.number().int().min(1).nullable().optional(),
  recipientScope: z.enum(["primary_contact", "all_contacts"]).default("primary_contact"),
  autoSend: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
  lastRunAt: z.coerce.date().nullable().optional(),
});

export type InsertCommunicationAutomationRule = z.infer<typeof insertCommunicationAutomationRuleSchema>;
export type CommunicationAutomationRule = typeof communicationAutomationRules.$inferSelect;
export type MarkupPoint = [number, number];
export type SymbolType = "tree" | "plant" | "boulder";
export type MarkupObjectType = "polygon" | "polyline" | "symbol" | "text" | "callout";
export type FillType = "solid" | "texture";
export type TextureScale = "small" | "medium" | "large";
export type StylePresetType = "area" | "line" | "symbol";

export interface StylePresetConfig {
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  dashStyle?: "solid" | "dashed" | "dotted";
  fillType?: FillType;
  textureId?: string;
  textureScale?: TextureScale;
  textureOpacity?: number;
  materialLabel?: string;
  symbolTypeId?: string;
  scale?: number;
  opacity?: number;
}

export const stylePresets = pgTable("style_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<StylePresetType>(),
  name: text("name").notNull(),
  category: text("category").notNull().default("general"),
  styleConfig: jsonb("style_config").notNull().$type<StylePresetConfig>(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStylePresetSchema = createInsertSchema(stylePresets).omit({
  id: true,
  createdAt: true,
}).extend({
  type: z.enum(["area", "line", "symbol"]),
  name: z.string().min(1).max(100),
  category: z.string().default("general"),
  styleConfig: z.record(z.any()),
  isDefault: z.boolean().default(false),
  companyId: z.string().nullable().optional(),
});

export type InsertStylePreset = z.infer<typeof insertStylePresetSchema>;
export type StylePreset = typeof stylePresets.$inferSelect;

export const sheetTemplates = pgTable("sheet_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  layerVisibility: jsonb("layer_visibility").$type<Record<string, boolean>>().default(sql`'{}'::jsonb`),
  legendConfig: jsonb("legend_config").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  titleBlockFormat: jsonb("title_block_format").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  notesLayout: jsonb("notes_layout").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  defaultPresetIds: text("default_preset_ids").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSheetTemplateSchema = createInsertSchema(sheetTemplates).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1).max(100),
  layerVisibility: z.record(z.boolean()).optional(),
  legendConfig: z.record(z.any()).optional(),
  titleBlockFormat: z.record(z.any()).optional(),
  notesLayout: z.record(z.any()).optional(),
  defaultPresetIds: z.array(z.string()).default([]),
});

export type InsertSheetTemplate = z.infer<typeof insertSheetTemplateSchema>;
export type SheetTemplate = typeof sheetTemplates.$inferSelect;

export interface MarkupObject {
  id: string;
  type: MarkupObjectType;
  points: MarkupPoint[];
  symbolType?: SymbolType;
  symbolTypeId?: string;
  scale?: number;
  rotation?: number;
  label?: string;
  showLabel?: boolean;
  note?: string;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity?: number;
  fillOpacity?: number;
  dashStyle?: "solid" | "dashed" | "dotted";
  closed?: boolean;
  fontSize?: number;
  symbolSize?: number;
  createdAt: string;
  zIndex?: number;
  locked?: boolean;
  fillType?: FillType;
  textureId?: string;
  textureScale?: TextureScale;
  textureOpacity?: number;
  materialLabel?: string;
  legendWorthy?: boolean;
  legendStyleId?: string;
  legendStyleLabel?: string;
  layerId?: string;
  name?: string;
  calloutNumber?: number;
  textAlign?: "left" | "center" | "right";
  areaSqFt?: number;
  lengthFt?: number;
  showMeasurementLabel?: boolean;
  presetId?: string;
  groupId?: string;
}

export interface SheetMetadata {
  sheetTitle?: string;
  propertyName?: string;
  sheetDate?: string;
  projectName?: string;
  companyName?: string;
  notesContent?: string;
  notesVisible?: boolean;
  layoutType?: "proposal_exhibit" | "scope_plan" | "internal_planning";
  titleBlockPosition?: MarkupPoint;
  titleBlockVisible?: boolean;
  notesBlockPosition?: MarkupPoint;
  notesBlockVisible?: boolean;
}

export interface MarkupLayer {
  id: string;
  name: string;
  locked: boolean;
  visible: boolean;
  objects: MarkupObject[];
}

export interface MarkupDocument {
  version: 2;
  layers: MarkupLayer[];
  sheetMeta?: SheetMetadata;
}

export type MarkupData = MarkupObject[] | MarkupDocument;

function normalizeMarkupObject(obj: unknown): MarkupObject {
  const o = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
  const fillType: FillType = o.fillType === "texture" ? "texture" : "solid";
  return {
    id: typeof o.id === "string" && o.id.length > 0 ? o.id : Math.random().toString(36).slice(2, 10),
    type: (o.type as MarkupObject["type"]) ?? "polygon",
    points: Array.isArray(o.points) ? (o.points as MarkupPoint[]) : [],
    strokeColor: typeof o.strokeColor === "string" ? o.strokeColor : "#1a4d1a",
    fillColor: typeof o.fillColor === "string" ? o.fillColor : "none",
    strokeWidth: typeof o.strokeWidth === "number" ? o.strokeWidth : 2,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
    rotation: typeof o.rotation === "number" ? o.rotation : 0,
    zIndex: typeof o.zIndex === "number" ? o.zIndex : 0,
    locked: typeof o.locked === "boolean" ? o.locked : false,
    label: typeof o.label === "string" ? o.label : undefined,
    symbolType: typeof o.symbolType === "string" ? (o.symbolType as MarkupObject["symbolType"]) : undefined,
    fillType,
    textureId: typeof o.textureId === "string" ? o.textureId : undefined,
    textureScale: (o.textureScale === "small" || o.textureScale === "medium" || o.textureScale === "large")
      ? (o.textureScale as TextureScale)
      : "medium",
    textureOpacity: typeof o.textureOpacity === "number" ? o.textureOpacity : 0.85,
    materialLabel: typeof o.materialLabel === "string" ? o.materialLabel : undefined,
    layerId: typeof o.layerId === "string" ? o.layerId : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
    calloutNumber: typeof o.calloutNumber === "number" ? o.calloutNumber : undefined,
    textAlign: (o.textAlign === "left" || o.textAlign === "center" || o.textAlign === "right") ? o.textAlign : undefined,
    fontSize: typeof o.fontSize === "number" ? o.fontSize : undefined,
    areaSqFt: typeof o.areaSqFt === "number" ? o.areaSqFt : undefined,
    lengthFt: typeof o.lengthFt === "number" ? o.lengthFt : undefined,
    showMeasurementLabel: typeof o.showMeasurementLabel === "boolean" ? o.showMeasurementLabel : undefined,
    groupId: typeof o.groupId === "string" ? o.groupId : undefined,
  };
}

function normalizeSheetMeta(meta: unknown): SheetMetadata {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  return {
    sheetTitle: typeof m.sheetTitle === "string" ? m.sheetTitle : undefined,
    propertyName: typeof m.propertyName === "string" ? m.propertyName : undefined,
    sheetDate: typeof m.sheetDate === "string" ? m.sheetDate : undefined,
    projectName: typeof m.projectName === "string" ? m.projectName : undefined,
    companyName: typeof m.companyName === "string" ? m.companyName : undefined,
    notesContent: typeof m.notesContent === "string" ? m.notesContent : undefined,
    notesVisible: typeof m.notesVisible === "boolean" ? m.notesVisible : true,
    layoutType: (m.layoutType === "proposal_exhibit" || m.layoutType === "scope_plan" || m.layoutType === "internal_planning") ? m.layoutType : undefined,
    titleBlockPosition: Array.isArray(m.titleBlockPosition) ? m.titleBlockPosition as MarkupPoint : undefined,
    titleBlockVisible: typeof m.titleBlockVisible === "boolean" ? m.titleBlockVisible : true,
    notesBlockPosition: Array.isArray(m.notesBlockPosition) ? m.notesBlockPosition as MarkupPoint : undefined,
    notesBlockVisible: typeof m.notesBlockVisible === "boolean" ? m.notesBlockVisible : true,
  };
}

function normalizeMarkupLayer(layer: unknown, fallbackId: string): MarkupLayer {
  const l = (layer && typeof layer === "object" ? layer : {}) as Record<string, unknown>
  const rawObjs = Array.isArray(l.objects) ? l.objects : []
  return {
    id: typeof l.id === "string" ? l.id : fallbackId,
    name: typeof l.name === "string" ? l.name : "Annotations",
    locked: typeof l.locked === "boolean" ? l.locked : false,
    visible: typeof l.visible === "boolean" ? l.visible : true,
    objects: rawObjs.map(normalizeMarkupObject),
  };
}

export function parseMarkupData(data: unknown): MarkupDocument {
  const defaultLayer: MarkupLayer = { id: "annotations", name: "Annotations", locked: false, visible: true, objects: [] };
  if (!data) {
    return { version: 2, layers: [defaultLayer] };
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (d.version !== 2 && !Array.isArray(d.layers)) {
      return { version: 2, layers: [defaultLayer] };
    }
    const rawLayers = Array.isArray(d.layers) ? d.layers : [defaultLayer];
    return {
      version: 2,
      layers: rawLayers.length > 0
        ? rawLayers.map((l, i) => normalizeMarkupLayer(l, i === 0 ? "annotations" : `layer-${i}`))
        : [defaultLayer],
      sheetMeta: d.sheetMeta ? normalizeSheetMeta(d.sheetMeta) : undefined,
    };
  }
  if (Array.isArray(data)) {
    return {
      version: 2,
      layers: [{ ...defaultLayer, objects: (data as unknown[]).map(normalizeMarkupObject) }],
    };
  }
  return { version: 2, layers: [defaultLayer] };
}

export function flattenMarkupObjects(data: unknown): MarkupObject[] {
  const doc = parseMarkupData(data);
  return doc.layers
    .filter(l => l.visible)
    .flatMap(l => l.objects)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}

// Legend System (Slice 6)
export type LegendEntryKind = "material" | "symbol" | "line";
export type LegendPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type LegendMode = "compact" | "expanded";

export interface LegendEntry {
  id: string; // e.g. "material:bark_mulch", "symbol:tree", "line:style1"
  kind: LegendEntryKind;
  label: string;
  color?: string;
  textureId?: string;
  symbolType?: SymbolType;
  lineStyleId?: string;
  count?: number;
}

export interface LegendState {
  enabled: boolean;
  position: LegendPosition;
  mode: LegendMode;
  title: string;
  showMaterialsGroup: boolean;
  showSymbolsGroup: boolean;
  showLinesGroup: boolean;
  showSymbolCounts: boolean;
  hiddenEntryIds: string[];
  customLabels: Record<string, string>;
  entryOrder: string[];
}

export interface LayerDefinition {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

export const SYSTEM_LAYERS: LayerDefinition[] = [
  { id: "base-image", name: "Base Image", visible: true, locked: true, order: 0 },
  { id: "areas", name: "Areas", visible: true, locked: false, order: 1 },
  { id: "lines", name: "Lines", visible: true, locked: false, order: 2 },
  { id: "symbols", name: "Symbols", visible: true, locked: false, order: 3 },
  { id: "text-callouts", name: "Text / Callouts", visible: true, locked: false, order: 4 },
  { id: "legend", name: "Legend", visible: true, locked: false, order: 5 },
  { id: "notes", name: "Notes", visible: true, locked: false, order: 6 },
];

export function getDefaultLayerForType(type: MarkupObjectType): string {
  switch (type) {
    case "polygon": return "areas";
    case "polyline": return "lines";
    case "symbol": return "symbols";
    case "text": return "text-callouts";
    default: return "areas";
  }
}
// ─────────────────────────────────────────────────────────────────────────────
// Email Tracking Tables (Slice 1)
// ─────────────────────────────────────────────────────────────────────────────

export const mailboxAccounts = pgTable("mailbox_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  emailAddress: text("email_address").notNull(),
  displayName: text("display_name").notNull(),
  accountType: text("account_type").notNull().$type<"personal" | "shared">().default("personal"),
  ownerUserId: varchar("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  syncStatus: text("sync_status").notNull().$type<"not_connected" | "connected" | "error">().default("not_connected"),
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  lastSyncedAt: timestamp("last_synced_at"),
  oauthProvider: text("oauth_provider"),
  oauthTokenJson: jsonb("oauth_token_json"),
  gmailHistoryId: text("gmail_history_id"),
  gmailSentHistoryId: text("gmail_sent_history_id"),
  syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(2),
  syncErrorCount: integer("sync_error_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  mailboxAccountsCompanyEmailUnique: unique().on(table.companyId, table.emailAddress),
}));

export const insertMailboxAccountSchema = createInsertSchema(mailboxAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  accountType: z.enum(["personal", "shared"]).default("personal"),
  syncStatus: z.enum(["not_connected", "connected", "error"]).default("not_connected"),
  ownerUserId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  syncEnabled: z.boolean().default(false),
  lastSyncedAt: z.coerce.date().nullable().optional(),
  oauthProvider: z.string().nullable().optional(),
  oauthTokenJson: z.any().optional(),
  gmailHistoryId: z.string().nullable().optional(),
  gmailSentHistoryId: z.string().nullable().optional(),
  syncIntervalMinutes: z.number().int().min(1).default(2),
  syncErrorCount: z.number().int().min(0).default(0),
});

export type InsertMailboxAccount = z.infer<typeof insertMailboxAccountSchema>;
export type MailboxAccount = typeof mailboxAccounts.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Mailbox Sync Runs (Slice 3)
// ─────────────────────────────────────────────────────────────────────────────

export const mailboxSyncRuns = pgTable("mailbox_sync_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  mailboxAccountId: varchar("mailbox_account_id").notNull().references(() => mailboxAccounts.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: text("status").notNull().$type<"running" | "success" | "partial" | "error">().default("running"),
  messagesFetched: integer("messages_fetched").notNull().default(0),
  messagesRouted: integer("messages_routed").notNull().default(0),
  messagesUnsorted: integer("messages_unsorted").notNull().default(0),
  messagesDiscarded: integer("messages_discarded").notNull().default(0),
  messagesDeduped: integer("messages_deduped").notNull().default(0),
  sentMessagesFetched: integer("sent_messages_fetched").notNull().default(0),
  sentMessagesRouted: integer("sent_messages_routed").notNull().default(0),
  sentMessagesDeduped: integer("sent_messages_deduped").notNull().default(0),
  sentMessagesUnsorted: integer("sent_messages_unsorted").notNull().default(0),
  sentMessagesDiscarded: integer("sent_messages_discarded").notNull().default(0),
  errorMessage: text("error_message"),
  syncMethod: text("sync_method").$type<"history" | "timestamp">(),
  historyIdBefore: text("history_id_before"),
  historyIdAfter: text("history_id_after"),
}, (table) => ({
  mailboxSyncRunsMailboxStartedIdx: index("mailbox_sync_runs_mailbox_started_idx").on(table.mailboxAccountId, table.startedAt),
}));

export const insertMailboxSyncRunSchema = createInsertSchema(mailboxSyncRuns).omit({
  id: true,
  startedAt: true,
}).extend({
  status: z.enum(["running", "success", "partial", "error"]).default("running"),
  syncMethod: z.enum(["history", "timestamp"]).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  historyIdBefore: z.string().nullable().optional(),
  historyIdAfter: z.string().nullable().optional(),
});

export type InsertMailboxSyncRun = z.infer<typeof insertMailboxSyncRunSchema>;
export type MailboxSyncRun = typeof mailboxSyncRuns.$inferSelect;

export const unsortedEmails = pgTable("unsorted_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  mailboxAccountId: varchar("mailbox_account_id").references(() => mailboxAccounts.id, { onDelete: "set null" }),
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  toAddresses: text("to_addresses").array().default(sql`ARRAY[]::text[]`),
  subject: text("subject").notNull(),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  receivedAt: timestamp("received_at").notNull(),
  providerMessageId: text("provider_message_id"),
  providerThreadId: text("provider_thread_id"),
  direction: text("direction").notNull().$type<"inbound" | "outbound">().default("inbound"),
  status: text("status").notNull().$type<"pending" | "routed" | "archived" | "spam">().default("pending"),
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
  resolvedToCommunicationId: varchar("resolved_to_communication_id"),
  resolvedByUserId: varchar("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  candidateCustomerIds: text("candidate_customer_ids").array().default(sql`ARRAY[]::text[]`),
  routingNotes: text("routing_notes"),
  attachmentsJson: jsonb("attachments_json").default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  unsortedEmailsCompanyIdIdx: index("unsorted_emails_company_id_idx").on(table.companyId),
}));

export const insertUnsortedEmailSchema = createInsertSchema(unsortedEmails).omit({
  id: true,
  createdAt: true,
}).extend({
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
  status: z.enum(["pending", "routed", "archived", "spam"]).default("pending"),
  toAddresses: z.array(z.string()).default([]),
  candidateCustomerIds: z.array(z.string()).default([]),
  mailboxAccountId: z.string().nullable().optional(),
  fromName: z.string().nullable().optional(),
  bodyText: z.string().nullable().optional(),
  bodyHtml: z.string().nullable().optional(),
  providerMessageId: z.string().nullable().optional(),
  providerThreadId: z.string().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  resolvedToCommunicationId: z.string().nullable().optional(),
  resolvedByUserId: z.string().nullable().optional(),
  resolvedAt: z.coerce.date().nullable().optional(),
  routingNotes: z.string().nullable().optional(),
});

export type InsertUnsortedEmail = z.infer<typeof insertUnsortedEmailSchema>;
export type UnsortedEmail = typeof unsortedEmails.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Communication Center Tables
// ─────────────────────────────────────────────────────────────────────────────

export const communicationThreads = pgTable("communication_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  subjectRoot: text("subject_root").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCommunicationThreadSchema = createInsertSchema(communicationThreads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCommunicationThread = z.infer<typeof insertCommunicationThreadSchema>;
export type CommunicationThread = typeof communicationThreads.$inferSelect;


export const communications = pgTable("communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: "set null" }),
  contactId: varchar("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  sentById: varchar("sent_by_id").references(() => users.id, { onDelete: "set null" }),
  templateId: varchar("template_id").references(() => communicationTemplates.id, { onDelete: "set null" }),
  threadId: varchar("thread_id").references(() => communicationThreads.id, { onDelete: "set null" }),
  inReplyTo: varchar("in_reply_to"),
  type: text("type").notNull().$type<"email" | "sms" | "note" | "letter">().default("email"),
  direction: text("direction").notNull().$type<"outbound" | "inbound">().default("outbound"),
  status: text("status").notNull().$type<"draft" | "sent" | "scheduled" | "failed">().default("draft"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  internalNotes: text("internal_notes"),
  scheduledFor: timestamp("scheduled_for"),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  followUpDueAt: timestamp("follow_up_due_at"),
  followUpStatus: text("follow_up_status").$type<"none" | "open" | "done" | "snoozed">().default("none"),
  deliveryProvider: text("delivery_provider"),
  providerMessageId: text("provider_message_id"),
  deliveryStatus: text("delivery_status").$type<"pending" | "sent" | "failed">(),
  failureReason: text("failure_reason"),
  recipientEmail: text("recipient_email"),
  parentCommunicationId: varchar("parent_communication_id").references((): AnyPgColumn => communications.id, { onDelete: "set null" }),
  mailboxAccountId: varchar("mailbox_account_id").references(() => mailboxAccounts.id, { onDelete: "set null" }),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  fromAddress: text("from_address"),
  fromName: text("from_name"),
  toAddresses: text("to_addresses").array().default(sql`ARRAY[]::text[]`),
  ccAddresses: text("cc_addresses").array().default(sql`ARRAY[]::text[]`),
  bccAddresses: text("bcc_addresses").array().default(sql`ARRAY[]::text[]`),
  receivedAt: timestamp("received_at"),
  providerThreadId: text("provider_thread_id"),
  routingMethod: text("routing_method").$type<"manual" | "email_match" | "thread_match" | "content_match" | "llm">(),
  routingConfidence: real("routing_confidence"),
  attachmentsJson: jsonb("attachments_json").default(sql`'[]'::jsonb`),
  automationRuleId: varchar("automation_rule_id"),
  automationRuleName: text("automation_rule_name"),
  automationSourceRecordType: text("automation_source_record_type"),
  automationSourceRecordId: varchar("automation_source_record_id"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  communicationsCompanyIdIdx: index("communications_company_id_idx").on(table.companyId),
  communicationsCustomerIdIdx: index("communications_customer_id_idx").on(table.customerId),
  communicationsStatusIdx: index("communications_status_idx").on(table.status),
  communicationsSentByIdIdx: index("communications_sent_by_id_idx").on(table.sentById),
  communicationsFollowUpStatusIdx: index("communications_follow_up_status_idx").on(table.followUpStatus),
  communicationsCompanyCreatedAtIdx: index("communications_company_created_at_idx").on(table.companyId, table.createdAt),
  communicationsDeletedAtIdx: index("communications_deleted_at_idx").on(table.deletedAt),
}));

export const insertCommunicationSchema = createInsertSchema(communications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  type: z.enum(["email", "sms", "note", "letter"]).default("email"),
  direction: z.enum(["outbound", "inbound"]).default("outbound"),
  status: z.enum(["draft", "sent", "scheduled", "failed"]).default("draft"),
  subject: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  inReplyTo: z.string().nullable().optional(),
  parentCommunicationId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  sentById: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  scheduledFor: z.coerce.date().nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  sentAt: z.coerce.date().nullable().optional(),
  followUpDueAt: z.coerce.date().nullable().optional(),
  followUpStatus: z.enum(["none", "open", "done", "snoozed"]).default("none"),
  deliveryProvider: z.string().nullable().optional(),
  providerMessageId: z.string().nullable().optional(),
  deliveryStatus: z.enum(["pending", "sent", "failed"]).nullable().optional(),
  failureReason: z.string().nullable().optional(),
  recipientEmail: z.string().nullable().optional(),
  mailboxAccountId: z.string().nullable().optional(),
  bodyText: z.string().nullable().optional(),
  bodyHtml: z.string().nullable().optional(),
  fromAddress: z.string().nullable().optional(),
  fromName: z.string().nullable().optional(),
  toAddresses: z.array(z.string()).default([]),
  ccAddresses: z.array(z.string()).default([]),
  bccAddresses: z.array(z.string()).default([]),
  receivedAt: z.coerce.date().nullable().optional(),
  providerThreadId: z.string().nullable().optional(),
  routingMethod: z.enum(["manual", "email_match", "thread_match", "content_match", "llm"]).nullable().optional(),
  routingConfidence: z.number().min(0).max(1).nullable().optional(),
  attachmentsJson: z.any().optional(),
});

export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;
export type Communication = typeof communications.$inferSelect;

export const communicationLinks = pgTable("communication_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  communicationId: varchar("communication_id").notNull().references(() => communications.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  linkedType: text("linked_type").notNull().$type<"ticket" | "contract" | "proposal" | "equipment_ticket" | "snow_event">(),
  linkedId: varchar("linked_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommunicationLinkSchema = createInsertSchema(communicationLinks).omit({
  id: true,
  createdAt: true,
}).extend({
  linkedType: z.enum(["ticket", "contract", "proposal", "equipment_ticket", "snow_event"]),
});

export type InsertCommunicationLink = z.infer<typeof insertCommunicationLinkSchema>;
export type CommunicationLink = typeof communicationLinks.$inferSelect;

export type CommunicationWithDetails = Communication & {
  customerName?: string | null;
  contactName?: string | null;
  sentByName?: string | null;
  createdByName?: string | null;
  templateName?: string | null;
  isOverdue?: boolean;
  replyCount?: number;
  threadSubjectRoot?: string;
  scheduledFor?: Date | string | null;
  followUpDueAt?: Date | string | null;
  followUpStatus?: string | null;
  wasManuallySorted?: boolean;
  manuallySortedByName?: string | null;
};

export interface CommunicationAnalytics {
  totalSentPeriod: number;
  totalSentThisWeek: number;
  totalSentThisMonth: number;
  draftsCount: number;
  overdueFollowUpsCount: number;
  sentByType: { type: string; count: number }[];
  sentByStaff: { userId: string; userName: string; count: number }[];
  topCustomers: { customerId: string; customerName: string; count: number }[];
  topTemplates: { templateId: string; templateName: string; count: number }[];
}

export type CommunicationThreadWithMessages = CommunicationThread & {
  messages: CommunicationWithDetails[];
  latestActivity?: Date;
  messageCount: number;
};

// Service Plan Layer Tables

export const SERVICE_PLAN_CATEGORIES = [
  "mowing",
  "pet_station",
  "chemical",
  "shrub_trimming",
  "ornamental_grass",
  "aeration",
  "cleanups",
  "tree_pruning",
  "irrigation_open",
  "irrigation_close",
  "irrigation_winterization",
  "snow_removal",
  "other",
] as const;
export type ServicePlanCategory = typeof SERVICE_PLAN_CATEGORIES[number];

export const SERVICE_PLAN_CATEGORY_LABELS: Record<ServicePlanCategory, string> = {
  mowing: "Mowing",
  pet_station: "Pet Station",
  chemical: "Chemical",
  shrub_trimming: "Shrub Trimming",
  ornamental_grass: "Ornamental Grass",
  aeration: "Aeration",
  cleanups: "Cleanups",
  tree_pruning: "Tree Pruning",
  irrigation_open: "Irrigation Open",
  irrigation_close: "Irrigation Close",
  irrigation_winterization: "Irrigation Winterization",
  snow_removal: "Snow Removal",
  other: "Other",
};

export const servicePlanTemplates = pgTable("service_plan_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: text("active").notNull().default("true").$type<"true" | "false">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertServicePlanTemplateSchema = createInsertSchema(servicePlanTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1).max(200),
  active: z.enum(["true", "false"]).default("true"),
});

export type InsertServicePlanTemplate = z.infer<typeof insertServicePlanTemplateSchema>;
export type ServicePlanTemplate = typeof servicePlanTemplates.$inferSelect;

export const servicePlanTemplateItems = pgTable("service_plan_template_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => servicePlanTemplates.id, { onDelete: "cascade" }),
  serviceCategory: text("service_category").notNull().$type<ServicePlanCategory>(),
  defaultAnnualQuantity: integer("default_annual_quantity").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertServicePlanTemplateItemSchema = createInsertSchema(servicePlanTemplateItems).omit({
  id: true,
  createdAt: true,
}).extend({
  serviceCategory: z.enum(SERVICE_PLAN_CATEGORIES),
  defaultAnnualQuantity: z.number().int().min(0),
});

export type InsertServicePlanTemplateItem = z.infer<typeof insertServicePlanTemplateItemSchema>;
export type ServicePlanTemplateItem = typeof servicePlanTemplateItems.$inferSelect;

export const customerServicePlans = pgTable("customer_service_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  serviceCategory: text("service_category").notNull().$type<ServicePlanCategory>(),
  expectedQuantity: integer("expected_quantity").notNull().default(1),
  notes: text("notes"),
  sourceContractRef: varchar("source_contract_ref").references(() => contracts.id, { onDelete: "set null" }),
  sourceTemplateId: varchar("source_template_id").references(() => servicePlanTemplates.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  customerServicePlansCustomerIdx: index("customer_service_plans_customer_idx").on(table.customerId),
  customerServicePlansCompanyIdx: index("customer_service_plans_company_idx").on(table.companyId),
}));

export const insertCustomerServicePlanSchema = createInsertSchema(customerServicePlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  serviceCategory: z.enum(SERVICE_PLAN_CATEGORIES),
  year: z.number().int().min(2000).max(2100),
  expectedQuantity: z.number().int().min(0),
  notes: z.string().nullable().optional(),
  sourceContractRef: z.string().nullable().optional(),
  sourceTemplateId: z.string().nullable().optional(),
});

export type InsertCustomerServicePlan = z.infer<typeof insertCustomerServicePlanSchema>;
export type CustomerServicePlan = typeof customerServicePlans.$inferSelect;

export type ServiceFulfillmentRow = {
  serviceCategory: ServicePlanCategory;
  expectedQuantity: number;
  scheduledCount: number;
  completedCount: number;
  notes: string | null;
  planId: string;
};

export type ServicePlanTemplateWithItems = ServicePlanTemplate & {
  items: ServicePlanTemplateItem[];
  customerCount: number;
};

export type { AuditFlag, AuditStatus, ContractAuditRow, ContractAuditResponse } from "./auditTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Mailbox Backfill Runs (Slice 2.5)
// ─────────────────────────────────────────────────────────────────────────────

export const mailboxBackfillRuns = pgTable("mailbox_backfill_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  mailboxAccountId: varchar("mailbox_account_id").notNull().references(() => mailboxAccounts.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  rangeStart: timestamp("range_start").notNull(),
  rangeEnd: timestamp("range_end").notNull(),
  includeInbox: boolean("include_inbox").notNull().default(true),
  includeSent: boolean("include_sent").notNull().default(true),
  status: text("status").notNull().$type<"queued" | "running" | "success" | "partial" | "error" | "cancelled">().default("queued"),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  estimatedTotal: integer("estimated_total"),
  currentMonth: text("current_month"),
  inboxFetched: integer("inbox_fetched").notNull().default(0),
  inboxRouted: integer("inbox_routed").notNull().default(0),
  inboxUnsorted: integer("inbox_unsorted").notNull().default(0),
  inboxDeduped: integer("inbox_deduped").notNull().default(0),
  sentFetched: integer("sent_fetched").notNull().default(0),
  sentRouted: integer("sent_routed").notNull().default(0),
  sentUnsorted: integer("sent_unsorted").notNull().default(0),
  sentDeduped: integer("sent_deduped").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  mailboxBackfillRunsMailboxStartedIdx: index("mailbox_backfill_runs_mailbox_started_idx").on(table.mailboxAccountId, table.startedAt),
}));

export const insertMailboxBackfillRunSchema = createInsertSchema(mailboxBackfillRuns).omit({
  id: true,
  startedAt: true,
  createdAt: true,
}).extend({
  status: z.enum(["queued", "running", "success", "partial", "error", "cancelled"]).default("queued"),
  cancelRequested: z.boolean().default(false),
  estimatedTotal: z.number().int().nullable().optional(),
  currentMonth: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  finishedAt: z.coerce.date().nullable().optional(),
});

export type InsertMailboxBackfillRun = z.infer<typeof insertMailboxBackfillRunSchema>;
export type MailboxBackfillRun = typeof mailboxBackfillRuns.$inferSelect;

// Mobile v1 Slice 4 — flag tag taxonomy (mirrors lib/db/src/flag-tags.ts).
export const FLAG_TAGS = [
  { value: "irrigation_issue",     label: "Irrigation issue",     color: "#2563eb" },
  { value: "property_damage",      label: "Property damage",      color: "#dc2626" },
  { value: "access_problem",       label: "Access problem",       color: "#d97706" },
  { value: "customer_interaction", label: "Customer interaction", color: "#7c3aed" },
  { value: "material_needed",      label: "Material needed",      color: "#0d9488" },
  { value: "safety_concern",       label: "Safety concern",       color: "#b91c1c" },
  { value: "question",             label: "Question",             color: "#475569" },
  { value: "other",                label: "Other",                color: "#6b7280" },
] as const;
export type FlagTag = (typeof FLAG_TAGS)[number]["value"];
export const FLAG_STATUSES = ["new", "acknowledged", "in_progress", "resolved", "dismissed"] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];
export const FLAG_NOTE_MAX_LENGTH = 280;

// ─── Plant Library ─────────────────────────────────────────────────────────────

export type PlantCategory =
  | "deciduous_trees"
  | "evergreen_trees"
  | "ornamental_trees"
  | "shrubs"
  | "perennials"
  | "grasses";

export const PLANT_CATEGORY_LABELS: Record<PlantCategory, string> = {
  deciduous_trees: "Deciduous Trees",
  evergreen_trees: "Evergreen Trees",
  ornamental_trees: "Ornamental Trees",
  shrubs: "Shrubs",
  perennials: "Perennials",
  grasses: "Grasses",
};

export interface PlantCatalogItem {
  id: string;
  companyId: string;
  productCode: string;
  category: PlantCategory;
  varietyKey: string;
  rawDescription: string;
  commonName: string;
  botanicalName: string | null;
  sizeCode: string | null;
  sizeLabel: string;
  onHand: number;
  retailPrice: string | null;
  salePrice: string | null;
  wholesaleCost: string | null;
  wsCode: string | null;
  location: string | null;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlantSyncRun {
  id: string;
  companyId: string;
  status: "running" | "success" | "error";
  startedAt: string;
  finishedAt: string | null;
  itemsUpserted: number;
  itemsDeactivated: number;
  errorMessage: string | null;
}

export interface PlantVarietyGroup {
  varietyKey: string;
  commonName: string;
  botanicalName: string | null;
  category: PlantCategory;
  location: string | null;
  enrichment?: PlantEnrichmentData | null;
  sizes: Array<{
    productCode: string;
    sizeCode: string | null;
    sizeLabel: string;
    onHand: number;
    salePrice: string | null;
    wholesaleCost: string | null;
  }>;
}

export type PlantMatchStatus = "unmatched" | "auto" | "confirmed" | "rejected";
export type PlantAttributeSource = "auto" | "confirmed";

export interface PlantEnrichmentData {
  id: string;
  companyId: string;
  varietyKey: string;
  displayName: string | null;
  treefarmUrl: string | null;
  treefarmSlug: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  imageAttribution: string | null;
  descriptionText: string | null;
  factsJson: Record<string, string> | null;
  matchStatus: PlantMatchStatus;
  matchConfidence: number | null;
  attributeSource: PlantAttributeSource | null;
  light: string | null;
  waterUse: string | null;
  isXeriscape: boolean | null;
  bloomTime: string | null;
  bloomColor: string | null;
  fallColor: string | null;
  foliageType: string | null;
  isNative: boolean | null;
  isPollinatorFriendly: boolean | null;
  deerResistant: boolean | null;
  saltTolerant: boolean | null;
  growthRate: string | null;
  lastEnrichedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlantMatchQueueItem {
  varietyKey: string;
  commonName: string;
  botanicalName: string | null;
  category: PlantCategory;
  enrichment: PlantEnrichmentData;
}

export interface PlantCandidateProduct {
  slug: string;
  title: string;
  imageUrl: string | null;
  pageUrl: string;
}
