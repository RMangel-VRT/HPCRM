import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, unique, integer } from "drizzle-orm/pg-core";
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
  role: text("role").notNull().$type<"admin" | "office" | "ops" | "viewer">(),
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
  role: z.enum(["admin", "office", "ops", "viewer"]),
  status: z.enum(["active", "invited", "suspended"]).default("active"),
});

export type InsertCompanyUser = z.infer<typeof insertCompanyUserSchema>;
export type CompanyUser = typeof companyUsers.$inferSelect;

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  street: text("street").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  status: text("status").notNull().$type<"active" | "prospect" | "inactive">().default("active"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  acres: text("acres"),
  complexityScore: text("complexity_score").$type<"1" | "2" | "3" | "4" | "5">(),
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
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
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
