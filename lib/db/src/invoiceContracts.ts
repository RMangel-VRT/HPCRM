/** Driver-free IC1 contracts. No database/Drizzle imports. */
import { z } from "zod/v4";
import { estimateQuantitySchema } from "./estimateContracts";
import { isCalendarDate } from "./schema/calendarDate";

export const INVOICE_PREFIXES = ["MA", "SN"] as const;
export const INVOICE_KINDS = ["standalone", "monthly"] as const;
export const INVOICE_STATUSES = ["draft", "issued", "void", "superseded", "cancelled"] as const;
export const INVOICE_CATEGORIES = ["plants", "landscape_materials", "irrigation_materials", "landscape_labor", "irrigation_labor", "fees_surcharges", "grounds_contract", "chemical_contract", "snow_contract", "snow_services"] as const;
export const INVOICE_SOURCE_TYPES = ["estimate_line", "term_billing_month", "ticket", "campaign_item", "snow_impact", "manual"] as const;
export const SNOW_CATEGORIES = ["snow_contract", "snow_services"] as const;
export type InvoicePrefix = typeof INVOICE_PREFIXES[number];
export type InvoiceStatus = typeof INVOICE_STATUSES[number];
export type InvoiceCategory = typeof INVOICE_CATEGORIES[number];
export const prefixForCategory = (category: InvoiceCategory): InvoicePrefix =>
  category === "snow_contract" || category === "snow_services" ? "SN" : "MA";
export const formatInvoiceNumber = (prefix: InvoicePrefix, seq: number): string => `${prefix}-${seq}`;
export const invoiceIdSchema = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(500);
const nullableText = z.string().max(10000).nullable();
const calendar = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate);
const cents = z.number().int().min(0).max(2147483647);
const nonempty = (v: Record<string, unknown>) => Object.values(v).some(value => value !== undefined);
export const createInvoiceSchema = z.object({
  customerId: invoiceIdSchema, prefix: z.enum(INVOICE_PREFIXES).default("MA"),
  kind: z.literal("standalone"), title: name, memo: nullableText.optional(),
  poNumber: nullableText.optional(), txnDate: calendar.nullable().optional(),
}).strict();
export const patchInvoiceSchema = z.object({
  title: name.optional(), memo: nullableText.optional(), poNumber: nullableText.optional(),
  txnDate: calendar.nullable().optional(), customerId: invoiceIdSchema.optional(),
}).strict().refine(nonempty, "Empty PATCH");
export const createInvoiceLineSchema = z.object({
  category: z.enum(INVOICE_CATEGORIES), description: name, unit: name,
  quantity: estimateQuantitySchema.nullable().optional(), rateCents: cents.nullable().optional(),
}).strict();
export const patchInvoiceLineSchema = z.object({
  category: z.enum(INVOICE_CATEGORIES).optional(), description: name.optional(), unit: name.optional(),
  quantity: estimateQuantitySchema.nullable().optional(), rateCents: cents.nullable().optional(),
}).strict().refine(nonempty, "Empty PATCH");
export const reorderInvoiceLinesSchema = z.object({ lineIds: z.array(invoiceIdSchema) }).strict();
export const cancelInvoiceSchema = z.object({ reason: z.string().trim().min(1).max(10000) }).strict();
export const invoiceListQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(), customerId: invoiceIdSchema.optional(),
  prefix: z.enum(INVOICE_PREFIXES).optional(), search: z.string().max(500).optional(),
}).strict();
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type PatchInvoiceInput = z.infer<typeof patchInvoiceSchema>;
export type CreateInvoiceLineInput = z.infer<typeof createInvoiceLineSchema>;
export type PatchInvoiceLineInput = z.infer<typeof patchInvoiceLineSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export interface InvoiceDto {
  id: string; companyId: string; customerId: string; invoicePrefix: InvoicePrefix; invoiceSeq: number;
  revision: number; kind: typeof INVOICE_KINDS[number]; periodMonth: string | null; title: string;
  status: InvoiceStatus; qboState: "not_pushed" | "pushed" | "reconciled" | "mismatch" | "drift" | "error";
  deliveryState: "not_sent" | "sent" | "failed"; paymentState: "unpaid" | "partial" | "paid" | "voided_in_qbo";
  txnDate: string | null; dueDate: string | null; termsLabel: string | null; poNumber: string | null; memo: string | null;
  billToSnapshot: unknown; workLocationSnapshot: unknown; subtotalCents: number;
  taxCents: number | null; totalCents: number | null; balanceCents: number | null;
  qboInvoiceId: string | null; qboSyncToken: string | null; qboDocNumber: string | null; qboLastSyncedAt: string | null;
  supersedesInvoiceId: string | null; pdfObjectKey: string | null; sourceSummary: string;
  createdById: string | null; issuedById: string | null; issuedAt: string | null;
  cancelledAt: string | null; cancelReason: string | null; createdAt: string; updatedAt: string;
}
export interface InvoiceLineDto {
  id: string; companyId: string; invoiceId: string; displayOrder: number; category: InvoiceCategory;
  description: string; quantity: string | null; unit: string; rateCents: number | null; amountCents: number | null;
  sourceType: typeof INVOICE_SOURCE_TYPES[number]; sourceId: string | null; sourceLabel: string | null;
  live: boolean; addedById: string | null; createdAt: string; updatedAt: string;
}
export type InvoiceReadinessProblem =
  | { code: "NO_LINES" | "CUSTOMER_NOT_LINKED" | "ZERO_TOTAL" }
  | { code: "UNPRICED_LINE"; lineIds: string[] };
export interface InvoicePushReadiness { ready: boolean; problems: InvoiceReadinessProblem[] }
export interface InvoiceListItemDto extends InvoiceDto { number: string; customerName: string }
export interface InvoiceDetailDto extends InvoiceListItemDto { lines: InvoiceLineDto[]; pushReadiness: InvoicePushReadiness }
export interface InvoiceEventDto {
  id: string; companyId: string; invoiceId: string; revision: number; kind: string;
  detail: unknown; actorId: string | null; createdAt: string;
}
