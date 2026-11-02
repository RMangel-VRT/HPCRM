import { and, eq } from "drizzle-orm";
import { customers, invoices, settings, qboCustomerCache } from "@workspace/db";
import type { InvoiceDetailDto } from "@workspace/db/invoice-contracts";
import { documentSettingsModel, type DocumentSettings } from "@workspace/db/document-contracts";
import { db } from "../db";
import { requireInvoice, InvoiceError } from "./invoiceErrors";
import { invoicePayload } from "./invoiceReads";
import { readDocumentSettings } from "./documentSettings";
import { coloradoDate } from "./estimatePdf";
import { categoryLabel } from "./documents/categories";
import { invoiceDocumentHtml } from "./documents/invoice";
import { renderDocumentPdf } from "./documents/render";
import { isCalendarDate } from "@workspace/db/estimate-contracts";

interface InvoiceDisplay {
  companyName: string; customerName: string; customerAddress: string;
  workLocation?: string | null; companyDocument?: Partial<DocumentSettings>;
}
export interface InvoiceDocumentModel {
  companyName: string; companyDocument: DocumentSettings; customerName: string; customerAddress: string; workLocation: string | null;
  number: string; revision: number; draft: boolean; documentDate: string; dueDate: string | null; termsLabel: string | null;
  poNumber: string | null; title: string; memo: string | null; subtotalCents: number;
  taxCents: number | null; totalCents: number | null; balanceCents: number | null;
  groups: { label: string; lines: { description: string; quantity: string | null; unit: string; rateCents: number | null; amountCents: number | null }[] }[];
}
function snapshot(value: unknown): { name: string; address: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const text = (key: string) => typeof v[key] === "string" ? v[key] as string : "";
  const name = text("name");
  const address = text("address") || [text("addressLine1") || text("street"), text("addressLine2"), [text("city"), text("state"), text("postalCode") || text("zip")].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  return name || address ? { name, address } : null;
}
/** Customer-facing allowlist. Captured invoice amounts are never recomputed or written. */
export function buildInvoiceDocumentModel(detail: InvoiceDetailDto, display: InvoiceDisplay, today: string): InvoiceDocumentModel {
  const draft = detail.status === "draft";
  if (!isCalendarDate(today)) throw new Error("INVALID_DOCUMENT_DATE");
  const bill = !draft ? snapshot(detail.billToSnapshot) : null;
  const work = !draft ? snapshot(detail.workLocationSnapshot) : null;
  const groups: InvoiceDocumentModel["groups"] = [];
  for (const line of detail.lines) {
    const label = categoryLabel(line.category);
    let group = groups.find(g => g.label === label);
    if (!group) { group = { label, lines: [] }; groups.push(group); }
    group.lines.push({ description: line.description, quantity: line.quantity, unit: line.unit, rateCents: line.rateCents, amountCents: line.amountCents });
  }
  return {
    companyName: display.companyName, companyDocument: documentSettingsModel(display.companyDocument),
    customerName: bill?.name ?? display.customerName, customerAddress: bill?.address ?? display.customerAddress,
    workLocation: work ? [work.name, work.address].filter(Boolean).join("\n") : display.workLocation ?? null,
    number: detail.number, revision: detail.revision, draft, documentDate: detail.txnDate ?? today,
    dueDate: detail.dueDate, termsLabel: detail.termsLabel, poNumber: detail.poNumber, title: detail.title, memo: detail.memo,
    subtotalCents: detail.subtotalCents, taxCents: draft ? null : detail.taxCents,
    totalCents: draft ? null : detail.totalCents, balanceCents: draft ? null : detail.balanceCents, groups,
  };
}
export async function renderInvoicePdf(companyId: string, invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
  const model = await db.transaction(async tx => {
    const invoice = requireInvoice((await tx.select().from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.id, invoiceId))))[0]);
    // This endpoint is a draft preview, not an issued-document regeneration mechanism.
    if (invoice.status !== "draft") throw new InvoiceError(409, "INVOICE_NOT_DRAFT");
    const detail = await invoicePayload(tx, companyId, invoice);
    const customer = requireInvoice((await tx.select({ name: customers.name, street: customers.street, city: customers.city, state: customers.state, zip: customers.zip,
      billingStreet: qboCustomerCache.billAddrLine1, billingCity: qboCustomerCache.billAddrCity,
      billingState: qboCustomerCache.billAddrCountrySubDivisionCode, billingZip: qboCustomerCache.billAddrPostalCode })
      .from(customers).leftJoin(qboCustomerCache, and(eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, customers.qboCustomerId)))
      .where(and(eq(customers.companyId, companyId), eq(customers.id, invoice.customerId))))[0]);
    const [company] = await tx.select({ name: settings.companyName }).from(settings).where(eq(settings.companyId, companyId));
    return buildInvoiceDocumentModel(detail, { companyName: company?.name || "High Plains Property Maintenance",
      customerName: customer.name, customerAddress: customer.billingStreet
        ? [customer.billingStreet, [customer.billingCity, customer.billingState, customer.billingZip].filter(Boolean).join(" ")].filter(Boolean).join("\n")
        : [customer.street, [customer.city, customer.state, customer.zip].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
      companyDocument: await readDocumentSettings(companyId, tx) }, coloradoDate(new Date()));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  const number = `${model.number}${model.revision > 0 ? ` · Rev ${model.revision}` : ""}`;
  return { buffer: await renderDocumentPdf({ html: invoiceDocumentHtml(model), shortHeaderNumber: number, draft: model.draft,
    footerLabel: `Invoice ${model.number} · ${model.customerName} · ${model.companyDocument.invoiceFooterNote || "Thank you for your business"}` }),
    filename: `${model.number}${model.revision > 0 ? `-rev${model.revision}` : ""}.pdf` };
}
