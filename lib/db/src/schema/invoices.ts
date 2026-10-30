import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, numeric, boolean, timestamp, date, jsonb, unique, uniqueIndex, index, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { companies, customers, users, emailLogs } from "./schema";
import { type InvoicePrefix, type InvoiceStatus, type InvoiceCategory, type INVOICE_KINDS, type INVOICE_SOURCE_TYPES } from "../invoiceContracts";
export * from "../invoiceContracts";

const id = () => varchar("id").primaryKey().default(sql`gen_random_uuid()`);
const company = () => varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" });
const user = (column: string) => varchar(column).references(() => users.id, { onDelete: "set null" });
const created = () => timestamp("created_at").notNull().defaultNow();
const times = () => ({ createdAt: created(), updatedAt: timestamp("updated_at").notNull().defaultNow() });
export const invoices = pgTable("invoices", {
  id: id(), companyId: company(),
  customerId: varchar("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
  invoicePrefix: text("invoice_prefix").notNull().$type<InvoicePrefix>(),
  invoiceSeq: integer("invoice_seq").notNull(), revision: integer("revision").notNull().default(0),
  kind: text("kind").notNull().$type<typeof INVOICE_KINDS[number]>(), periodMonth: date("period_month", { mode: "string" }),
  title: text("title").notNull(), status: text("status").notNull().default("draft").$type<InvoiceStatus>(),
  qboState: text("qbo_state").notNull().default("not_pushed").$type<"not_pushed" | "pushed" | "reconciled" | "mismatch" | "drift" | "error">(),
  deliveryState: text("delivery_state").notNull().default("not_sent").$type<"not_sent" | "sent" | "failed">(),
  // QBO mirror, written only by pushInvoice/pullPayments
  paymentState: text("payment_state").notNull().default("unpaid").$type<"unpaid" | "partial" | "paid" | "voided_in_qbo">(),
  txnDate: date("txn_date", { mode: "string" }),
  // QBO mirror, written only by pushInvoice/pullPayments
  dueDate: date("due_date", { mode: "string" }), termsLabel: text("terms_label"),
  poNumber: text("po_number"), memo: text("memo"),
  // Frozen snapshot, written at issue by IC3
  billToSnapshot: jsonb("bill_to_snapshot"), workLocationSnapshot: jsonb("work_location_snapshot"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  // QBO mirror, written only by pushInvoice/pullPayments
  taxCents: integer("tax_cents"), totalCents: integer("total_cents"), balanceCents: integer("balance_cents"),
  // QBO mirror, written only by pushInvoice/pullPayments
  qboInvoiceId: text("qbo_invoice_id"), qboSyncToken: text("qbo_sync_token"),
  qboDocNumber: text("qbo_doc_number"), qboLastSyncedAt: timestamp("qbo_last_synced_at"),
  supersedesInvoiceId: varchar("supersedes_invoice_id").references((): AnyPgColumn => invoices.id, { onDelete: "set null" }),
  pdfObjectKey: text("pdf_object_key"), sourceSummary: text("source_summary").notNull().default("Manual"),
  createdById: user("created_by_id"), issuedById: user("issued_by_id"), issuedAt: timestamp("issued_at"),
  cancelledAt: timestamp("cancelled_at"), cancelReason: text("cancel_reason"), ...times(),
}, t => ({
  number: unique("invoices_company_id_invoice_prefix_invoice_seq_revision_key").on(t.companyId, t.invoicePrefix, t.invoiceSeq, t.revision),
  liveNumber: uniqueIndex("invoices_live_number_idx").on(t.companyId, t.invoicePrefix, t.invoiceSeq).where(sql`${t.status} <> 'superseded'`),
  customer: index("invoices_company_customer_idx").on(t.companyId, t.customerId),
  statusIndex: index("invoices_company_status_idx").on(t.companyId, t.status),
  period: index("invoices_company_period_idx").on(t.companyId, t.periodMonth),
  prefix: check("invoices_invoice_prefix_check", sql`${t.invoicePrefix} IN ('MA','SN')`),
  seq: check("invoices_invoice_seq_check", sql`${t.invoiceSeq} > 0`),
  revision: check("invoices_revision_check", sql`${t.revision} >= 0`),
  kind: check("invoices_kind_check", sql`${t.kind} IN ('standalone','monthly')`),
  month: check("invoices_period_month_check", sql`(${t.kind} <> 'monthly' OR ${t.periodMonth} IS NOT NULL) AND (${t.periodMonth} IS NULL OR EXTRACT(DAY FROM ${t.periodMonth}) = 1)`),
  status: check("invoices_status_check", sql`${t.status} IN ('draft','issued','void','superseded','cancelled')`),
  qbo: check("invoices_qbo_state_check", sql`${t.qboState} IN ('not_pushed','pushed','reconciled','mismatch','drift','error')`),
  delivery: check("invoices_delivery_state_check", sql`${t.deliveryState} IN ('not_sent','sent','failed')`),
  payment: check("invoices_payment_state_check", sql`${t.paymentState} IN ('unpaid','partial','paid','voided_in_qbo')`),
}));
const invoiceRef = () => varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" });
export const invoiceLines = pgTable("invoice_lines", {
  id: id(), companyId: company(), invoiceId: invoiceRef(), displayOrder: integer("display_order").notNull().default(0),
  category: text("category").notNull().$type<InvoiceCategory>(), description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }), unit: text("unit").notNull(), rateCents: integer("rate_cents"),
  // Captured billed value; calculateExtendedCents is the sole calculated writer.
  amountCents: integer("amount_cents"),
  sourceType: text("source_type").notNull().default("manual").$type<typeof INVOICE_SOURCE_TYPES[number]>(),
  sourceId: varchar("source_id"), sourceLabel: text("source_label"), live: boolean("live").notNull().default(true),
  addedById: user("added_by_id"), ...times(),
}, t => ({
  liveSource: uniqueIndex("invoice_lines_live_source_idx").on(t.companyId, t.sourceType, t.sourceId).where(sql`${t.live} AND ${t.sourceId} IS NOT NULL`),
  order: index("invoice_lines_invoice_order_idx").on(t.invoiceId, t.displayOrder),
  category: check("invoice_lines_category_check", sql`${t.category} IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges','grounds_contract','chemical_contract','snow_contract','snow_services')`),
  quantity: check("invoice_lines_quantity_check", sql`${t.quantity} IS NULL OR ${t.quantity} > 0`),
  rate: check("invoice_lines_rate_cents_check", sql`${t.rateCents} IS NULL OR ${t.rateCents} >= 0`),
  amount: check("invoice_lines_amount_cents_check", sql`(${t.amountCents} IS NULL) = (${t.quantity} IS NULL OR ${t.rateCents} IS NULL)`),
  sourceType: check("invoice_lines_source_type_check", sql`${t.sourceType} IN ('estimate_line','term_billing_month','ticket','campaign_item','snow_impact','manual')`),
  sourceId: check("invoice_lines_source_id_check", sql`(${t.sourceId} IS NULL) = (${t.sourceType} = 'manual')`),
}));
export const invoiceNumberSequences = pgTable("invoice_number_sequences", {
  companyId: company(), prefix: text("prefix").notNull().$type<InvoicePrefix>(), nextValue: integer("next_value").notNull().default(1001),
}, t => ({
  key: uniqueIndex("invoice_number_sequences_company_prefix_idx").on(t.companyId, t.prefix),
  prefix: check("invoice_number_sequences_prefix_check", sql`${t.prefix} IN ('MA','SN')`),
}));
// Reserved for IC3; IC1 never writes push attempts.
export const invoiceQboPushes = pgTable("invoice_qbo_pushes", {
  id: id(), companyId: company(), invoiceId: invoiceRef(), revision: integer("revision").notNull(),
  operation: text("operation").notNull(), idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status").notNull(), errorCode: text("error_code"), errorMessage: text("error_message"), ...times(),
}, t => ({
  operation: check("invoice_qbo_pushes_operation_check", sql`${t.operation} IN ('create','update','void')`),
  status: check("invoice_qbo_pushes_status_check", sql`${t.status} IN ('pending','succeeded','failed')`),
}));
// Reserved for IC5; IC1 never sends mail.
export const invoiceSends = pgTable("invoice_sends", {
  id: id(), companyId: company(), invoiceId: invoiceRef(), revision: integer("revision").notNull(),
  toAddresses: text("to_addresses").array().notNull(), subject: text("subject"),
  emailLogId: varchar("email_log_id").references(() => emailLogs.id, { onDelete: "set null" }),
  pdfObjectKey: text("pdf_object_key"), status: text("status").notNull(),
  sentById: user("sent_by_id"), sentAt: timestamp("sent_at"), createdAt: created(),
}, t => ({ status: check("invoice_sends_status_check", sql`${t.status} IN ('sent','failed')`) }));
export const invoiceEvents = pgTable("invoice_events", {
  id: id(), companyId: company(), invoiceId: invoiceRef(), revision: integer("revision").notNull(),
  kind: text("kind").notNull(), detail: jsonb("detail"), actorId: user("actor_id"), createdAt: created(),
}, t => ({ history: index("invoice_events_invoice_created_idx").on(t.invoiceId, t.createdAt) }));
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
