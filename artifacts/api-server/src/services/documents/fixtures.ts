import { buildEstimateDocumentModel } from "../estimatePdf";
import { buildInvoiceDocumentModel } from "../invoicePdf";
import type { InvoiceDetailDto } from "@workspace/db/invoice-contracts";
import { emptyDocumentSettings } from "@workspace/db/document-contracts";

const companyDocument = { ...emptyDocumentSettings(), addressLine1: "100 Example Road", city: "Denver", state: "CO", postalCode: "80000",
  phone: "303-555-0100", email: "office@example.test", website: "highplains.example",
  remitTo: "High Plains Property Maintenance\n100 Example Road\nDenver, CO 80000",
  estimateTerms: "Work will be scheduled by mutual agreement.", warrantyText: "Plant warranty details supplied by the company." };
export function estimateFixture(count: number) {
  const lines = Array.from({ length: count }, (_, i) => ({ name: `Blue Spruce ${i + 1}`, detail: "5 gallon container", quantity: "2.00", unit: "ea",
    unitPriceCents: 12500, sortOrder: i, umbrellaKey: i % 3 === 0 ? "landscape_labor" : "plants" }));
  return buildEstimateDocumentModel({ estimateNumber: "EST-2026-0042", title: "Entrance landscape improvements",
    version: { versionNumber: 2, status: "sent", sentAt: "2026-11-02T18:00:00Z", acceptedOn: null, poNumber: null,
      frozenSubtotalCents: count * 25000, totals: { subtotalCents: count * 25000, bySection: { a: count * 25000 } },
      sections: [{ id: "a", name: "Entrance & common areas", sortOrder: 0, lines }] } },
    { companyName: "High Plains Property Maintenance", customerName: "Example Ranch HOA", customerAddress: "250 Example Lane\nBroomfield, CO 80020",
      createdByName: null, ticket: null, workLocation: "North entrance\n250 Example Lane" }, "2026-11-02", companyDocument);
}
export function invoiceFixture(count = 13, issued = false) {
  // Only allowlisted model inputs are needed by this synthetic render fixture.
  const subtotal = (count - (issued || count === 0 ? 0 : 1)) * 25000;
  const detail = { number: "MA-1001", revision: 1, status: issued ? "issued" : "draft", txnDate: null, dueDate: issued ? "2026-12-02" : null, termsLabel: "Net 30", poNumber: "PO-2026-42",
    title: "Entrance & mailbox landscape improvements", memo: "Thank you for choosing High Plains.", subtotalCents: subtotal,
    taxCents: issued ? Math.round(subtotal * .08) : null, totalCents: issued ? subtotal + Math.round(subtotal * .08) : null, balanceCents: issued ? subtotal + Math.round(subtotal * .08) : null,
    lines: Array.from({ length: count }, (_, i) => ({ category: i < 6 ? "plants" : "landscape_labor",
      description: i < 6 ? `Blue Spruce ${i + 1} — 5 gallon` : `Landscape installation ${i - 5}`, quantity: "2.00", unit: "ea",
      rateCents: !issued && i === count - 1 ? null : 12500, amountCents: !issued && i === count - 1 ? null : 25000 })) } as InvoiceDetailDto;
  return buildInvoiceDocumentModel(detail, { companyName: "High Plains Property Maintenance", customerName: "Example Ranch HOA",
    customerAddress: "250 Example Lane\nBroomfield, CO 80020", workLocation: "North entrance", companyDocument }, "2026-11-02");
}
