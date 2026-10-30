import { and, eq, desc, asc, or, ilike, sql } from "drizzle-orm";
import { invoices, invoiceLines, invoiceEvents, customers, type Invoice } from "@workspace/db";
import { formatInvoiceNumber, type InvoiceListQuery, type InvoiceDetailDto, type InvoiceListItemDto, type InvoiceEventDto } from "@workspace/db/invoice-contracts";
import { db, type AppTransaction } from "../db";
import { requireInvoice } from "./invoiceErrors";
import { pushReadiness } from "./invoiceMath";

type Reader = AppTransaction | typeof db;
/** One consistent JSON boundary for direct service callers and HTTP responses. */
function json<T>(value: unknown): T { return JSON.parse(JSON.stringify(value)) as T; }
export async function invoicePayload(tx: Reader, companyId: string, invoice: Invoice): Promise<InvoiceDetailDto> {
  const customer = requireInvoice((await tx.select({ name: customers.name, qboCustomerId: customers.qboCustomerId })
    .from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, invoice.customerId))))[0]);
  const lines = await tx.select().from(invoiceLines)
    .where(and(eq(invoiceLines.companyId, companyId), eq(invoiceLines.invoiceId, invoice.id)))
    .orderBy(asc(invoiceLines.displayOrder), asc(invoiceLines.createdAt), asc(invoiceLines.id));
  return json<InvoiceDetailDto>({ ...invoice, number: formatInvoiceNumber(invoice.invoicePrefix, invoice.invoiceSeq),
    customerName: customer.name, lines,
    pushReadiness: pushReadiness({ lines, subtotalCents: invoice.subtotalCents, qboCustomerId: customer.qboCustomerId }),
  });
}
export async function readInvoice(companyId: string, id: string): Promise<InvoiceDetailDto> {
  // A consistent snapshot prevents a concurrent edit from mixing header and lines.
  return db.transaction(async tx => {
    const invoice = requireInvoice((await tx.select().from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id))))[0]);
    return invoicePayload(tx, companyId, invoice);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function listInvoices(companyId: string, input: InvoiceListQuery): Promise<InvoiceListItemDto[]> {
  const filters = [eq(invoices.companyId, companyId)];
  if (input.status) filters.push(eq(invoices.status, input.status));
  if (input.customerId) filters.push(eq(invoices.customerId, input.customerId));
  if (input.prefix) filters.push(eq(invoices.invoicePrefix, input.prefix));
  if (input.search) {
    const search = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(or(ilike(invoices.title, search), ilike(customers.name, search),
      ilike(sql`${invoices.invoicePrefix} || '-' || ${invoices.invoiceSeq}::text`, search))!);
  }
  const rows = await db.select({ invoice: invoices, customerName: customers.name }).from(invoices)
    .innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.companyId, companyId)))
    .where(and(...filters)).orderBy(desc(invoices.updatedAt), asc(invoices.id));
  return rows.map(({ invoice, customerName }) => json<InvoiceListItemDto>({
    ...invoice, customerName, number: formatInvoiceNumber(invoice.invoicePrefix, invoice.invoiceSeq),
  }));
}
export async function readInvoiceEvents(companyId: string, id: string): Promise<InvoiceEventDto[]> {
  requireInvoice((await db.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id))))[0]);
  return json<InvoiceEventDto[]>(await db.select().from(invoiceEvents)
    .where(and(eq(invoiceEvents.companyId, companyId), eq(invoiceEvents.invoiceId, id)))
    .orderBy(desc(invoiceEvents.createdAt), desc(invoiceEvents.id)));
}
