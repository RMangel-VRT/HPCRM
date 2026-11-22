import { pgTable, varchar, text, timestamp, foreignKey } from "drizzle-orm/pg-core";
import { companies, users } from "./schema";

/** Sole owner of document-specific contacts and boilerplate; company name stays in settings. */
export const companyDocumentSettings = pgTable("company_document_settings", {
  companyId: varchar("company_id").primaryKey(),
  addressLine1: text("address_line1").notNull().default(""),
  addressLine2: text("address_line2").notNull().default(""),
  city: text("city").notNull().default(""), state: text("state").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""), phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""), website: text("website").notNull().default(""),
  remitTo: text("remit_to").notNull().default(""),
  paymentInstructions: text("payment_instructions").notNull().default("Please remit by check payable to {company name}. Reference the invoice number."),
  estimateTerms: text("estimate_terms").notNull().default(""),
  warrantyText: text("warranty_text").notNull().default(""),
  invoiceFooterNote: text("invoice_footer_note").notNull().default(""),
  updatedById: varchar("updated_by_id"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: "company_document_settings_company_id_fkey", columns: [table.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "company_document_settings_updated_by_id_fkey", columns: [table.updatedById], foreignColumns: [users.id] }).onDelete("set null"),
]);
