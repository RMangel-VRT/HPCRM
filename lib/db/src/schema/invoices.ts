import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, numeric, boolean, timestamp, date, jsonb, unique, uniqueIndex, index, check, type AnyPgColumn, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { companies, customers, users, emailLogs } from "./schema";
import { type InvoicePrefix, type InvoiceStatus, type InvoiceCategory, type INVOICE_KINDS, type INVOICE_SOURCE_TYPES } from "../invoiceContracts";
export * from "../invoiceContracts";

const id = () => varchar("id").notNull().default(sql`gen_random_uuid()`);
const company = () => varchar("company_id").notNull();
const user = (column: string) => varchar(column);
const created = () => timestamp("created_at").notNull().defaultNow();
const times = () => ({ createdAt: created(), updatedAt: timestamp("updated_at").notNull().defaultNow() });
export const invoices = pgTable("invoices", {
  id: id(), companyId: company(),
  customerId: varchar("customer_id").notNull(),
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
  supersedesInvoiceId: varchar("supersedes_invoice_id"),
  pdfObjectKey: text("pdf_object_key"), sourceSummary: text("source_summary").notNull().default("Manual"),
  createdById: user("created_by_id"), issuedById: user("issued_by_id"), issuedAt: timestamp("issued_at"),
  cancelledAt: timestamp("cancelled_at"), cancelReason: text("cancel_reason"), ...times(),
}, (t) => [
  uniqueIndex("invoices_live_number_idx").on(t.companyId, t.invoicePrefix, t.invoiceSeq).where(sql`${t.status} <> 'superseded'`),
  index("invoices_company_customer_idx").on(t.companyId, t.customerId),
  index("invoices_company_status_idx").on(t.companyId, t.status),
  index("invoices_company_period_idx").on(t.companyId, t.periodMonth),
  check("invoices_invoice_prefix_check", sql`${t.invoicePrefix} IN ('MA','SN')`),
  check("invoices_invoice_seq_check", sql`${t.invoiceSeq} > 0`),
  check("invoices_revision_check", sql`${t.revision} >= 0`),
  check("invoices_kind_check", sql`${t.kind} IN ('standalone','monthly')`),
  check("invoices_check", sql`(${t.kind} <> 'monthly' OR ${t.periodMonth} IS NOT NULL) AND (${t.periodMonth} IS NULL OR EXTRACT(DAY FROM ${t.periodMonth}) = 1)`),
  check("invoices_status_check", sql`${t.status} IN ('draft','issued','void','superseded','cancelled')`),
  check("invoices_qbo_state_check", sql`${t.qboState} IN ('not_pushed','pushed','reconciled','mismatch','drift','error')`),
  check("invoices_delivery_state_check", sql`${t.deliveryState} IN ('not_sent','sent','failed')`),
  check("invoices_payment_state_check", sql`${t.paymentState} IN ('unpaid','partial','paid','voided_in_qbo')`),
  unique("invoices_company_id_invoice_prefix_invoice_seq_revision_key").on(t.companyId, t.invoicePrefix, t.invoiceSeq, t.revision),
  primaryKey({ name: "invoices_pkey", columns: [t.id] }),
  foreignKey({ name: "invoices_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "invoices_created_by_id_fkey", columns: [t.createdById], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "invoices_customer_id_fkey", columns: [t.customerId], foreignColumns: [customers.id] }).onDelete("restrict"),
  foreignKey({ name: "invoices_issued_by_id_fkey", columns: [t.issuedById], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "invoices_supersedes_invoice_id_fkey", columns: [t.supersedesInvoiceId], foreignColumns: [t.id] }).onDelete("set null"),
]);
const invoiceRef = () => varchar("invoice_id").notNull();
export const invoiceLines = pgTable("invoice_lines", {
  id: id(), companyId: company(), invoiceId: invoiceRef(), displayOrder: integer("display_order").notNull().default(0),
  category: text("category").notNull().$type<InvoiceCategory>(), description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }), unit: text("unit").notNull(), rateCents: integer("rate_cents"),
  // Captured billed value; calculateExtendedCents is the sole calculated writer.
  amountCents: integer("amount_cents"),
  sourceType: text("source_type").notNull().default("manual").$type<typeof INVOICE_SOURCE_TYPES[number]>(),
  sourceId: varchar("source_id"), sourceLabel: text("source_label"), live: boolean("live").notNull().default(true),
  addedById: user("added_by_id"), ...times(),
}, (t) => [
  uniqueIndex("invoice_lines_live_source_idx").on(t.companyId, t.sourceType, t.sourceId).where(sql`${t.live} AND ${t.sourceId} IS NOT NULL`),
  index("invoice_lines_invoice_order_idx").on(t.invoiceId, t.displayOrder),
  check("invoice_lines_category_check", sql`${t.category} IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges','grounds_contract','chemical_contract','snow_contract','snow_services')`),
  check("invoice_lines_quantity_check", sql`${t.quantity} IS NULL OR ${t.quantity} > 0`),
  check("invoice_lines_rate_cents_check", sql`${t.rateCents} IS NULL OR ${t.rateCents} >= 0`),
  check("invoice_lines_check", sql`(${t.amountCents} IS NULL) = (${t.quantity} IS NULL OR ${t.rateCents} IS NULL)`),
  check("invoice_lines_source_type_check", sql`${t.sourceType} IN ('estimate_line','term_billing_month','ticket','campaign_item','snow_impact','manual')`),
  check("invoice_lines_check1", sql`(${t.sourceId} IS NULL) = (${t.sourceType} = 'manual')`),
  primaryKey({ name: "invoice_lines_pkey", columns: [t.id] }),
  foreignKey({ name: "invoice_lines_added_by_id_fkey", columns: [t.addedById], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "invoice_lines_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "invoice_lines_invoice_id_fkey", columns: [t.invoiceId], foreignColumns: [invoices.id] }).onDelete("cascade"),
]);
export const invoiceNumberSequences = pgTable("invoice_number_sequences", {
  companyId: company(), prefix: text("prefix").notNull().$type<InvoicePrefix>(), nextValue: integer("next_value").notNull().default(1001),
}, (t) => [
  uniqueIndex("invoice_number_sequences_company_prefix_idx").on(t.companyId, t.prefix),
  check("invoice_number_sequences_prefix_check", sql`${t.prefix} IN ('MA','SN')`),
  foreignKey({ name: "invoice_number_sequences_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
]);
// Reserved for IC3; IC1 never writes push attempts.
export const invoiceQboPushes = pgTable("invoice_qbo_pushes", {
  id: id(), companyId: company(), invoiceId: invoiceRef(), revision: integer("revision").notNull(),
  operation: text("operation").notNull(), idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull(), errorCode: text("error_code"), errorMessage: text("error_message"), ...times(),
}, (t) => [
  check("invoice_qbo_pushes_operation_check", sql`${t.operation} IN ('create','update','void')`),
  check("invoice_qbo_pushes_status_check", sql`${t.status} IN ('pending','succeeded','failed')`),
  unique("invoice_qbo_pushes_idempotency_key_key").on(t.idempotencyKey),
  primaryKey({ name: "invoice_qbo_pushes_pkey", columns: [t.id] }),
  foreignKey({ name: "invoice_qbo_pushes_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "invoice_qbo_pushes_invoice_id_fkey", columns: [t.invoiceId], foreignColumns: [invoices.id] }).onDelete("cascade"),
]);
// Reserved for IC5; IC1 never sends mail.
export const invoiceSends = pgTable("invoice_sends", {
  id: id(), companyId: company(), invoiceId: invoiceRef(), revision: integer("revision").notNull(),
  toAddresses: text("to_addresses").array().notNull(), subject: text("subject"),
  emailLogId: varchar("email_log_id"),
  pdfObjectKey: text("pdf_object_key"), status: text("status").notNull(),
  sentById: user("sent_by_id"), sentAt: timestamp("sent_at"), createdAt: created(),
}, (t) => [
  check("invoice_sends_status_check", sql`${t.status} IN ('sent','failed')`),
  primaryKey({ name: "invoice_sends_pkey", columns: [t.id] }),
  foreignKey({ name: "invoice_sends_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "invoice_sends_email_log_id_fkey", columns: [t.emailLogId], foreignColumns: [emailLogs.id] }).onDelete("set null"),
  foreignKey({ name: "invoice_sends_invoice_id_fkey", columns: [t.invoiceId], foreignColumns: [invoices.id] }).onDelete("cascade"),
  foreignKey({ name: "invoice_sends_sent_by_id_fkey", columns: [t.sentById], foreignColumns: [users.id] }).onDelete("set null"),
]);
export const invoiceEvents = pgTable("invoice_events", {
  id: id(), companyId: company(), invoiceId: invoiceRef(), revision: integer("revision").notNull(),
  kind: text("kind").notNull(), detail: jsonb("detail"), actorId: user("actor_id"), createdAt: created(),
}, (t) => [
  index("invoice_events_invoice_created_idx").on(t.invoiceId, t.createdAt),
  primaryKey({ name: "invoice_events_pkey", columns: [t.id] }),
  foreignKey({ name: "invoice_events_actor_id_fkey", columns: [t.actorId], foreignColumns: [users.id] }).onDelete("set null"),
  foreignKey({ name: "invoice_events_company_id_fkey", columns: [t.companyId], foreignColumns: [companies.id] }).onDelete("cascade"),
  foreignKey({ name: "invoice_events_invoice_id_fkey", columns: [t.invoiceId], foreignColumns: [invoices.id] }).onDelete("cascade"),
]);
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
