import { describe, expect, it } from "vitest";
import type { InvoiceDetailDto } from "@workspace/db/invoice-contracts";
import { buildInvoiceDocumentModel } from "../invoicePdf";
import { invoiceDocumentHtml } from "./invoice";
const detail = {
  id: "secret-id", companyId: "secret-company", customerId: "secret-customer", number: "MA-1001", revision: 1, status: "draft",
  title: "<script>title</script>", memo: "<script>memo</script>", txnDate: null, dueDate: "2026-12-01", termsLabel: "Net 30",
  poNumber: "PO <script>", subtotalCents: 83, taxCents: 999, totalCents: 9999, balanceCents: 9999,
  qboInvoiceId: "secret-qbo", sourceSummary: "secret-source", billToSnapshot: { name: "Frozen Bill", address: "Frozen billing", privateId: "secret" },
  workLocationSnapshot: { name: "Frozen Work", address: "Frozen address", private: "secret" },
  lines: [{ id: "secret-line", category: "plants", description: "<script>line</script>", quantity: "2.50", unit: "5-GAL", rateCents: 33, amountCents: 83,
    sourceId: "secret-source", sourceType: "ticket", sourceLabel: "secret-label", live: true, addedById: "secret-actor" }],
} as unknown as InvoiceDetailDto;
const display = { companyName: "Company $& <script>", customerName: "Live name", customerAddress: "Live address" };
describe("allowlisted read-only invoice model", () => {
  it("uses captured cents, omits internal data and ignores QBO final mirrors for drafts", () => {
    const m = buildInvoiceDocumentModel(detail, display, "2026-11-02");
    expect(m.documentDate).toBe("2026-11-02"); expect(m.subtotalCents).toBe(83);
    expect(m.totalCents).toBeNull(); expect(m.taxCents).toBeNull(); expect(m.balanceCents).toBeNull();
    expect(m.customerName).toBe("Live name"); expect(m.groups[0].lines[0].amountCents).toBe(83); expect(m.groups[0].lines[0].unit).toBe("5-GAL");
    const json = JSON.stringify(m);
    for (const key of ["secret", '"id"', "companyId", "sourceId", "sourceLabel", "live", "qboInvoiceId", "category", "cost", "margin"]) expect(json).not.toContain(key);
    const html = invoiceDocumentHtml(m);
    for (const word of ["title", "memo", "line"]) expect(html).toContain(`&lt;script&gt;${word}&lt;/script&gt;`);
    expect(html).toContain("Company $&amp; &lt;script&gt;");
    expect(html).not.toContain("{company name}");
  });
  it("explicit frozen display allowlists win for non-drafts without leaking arbitrary snapshot properties", () => {
    const m = buildInvoiceDocumentModel({ ...detail, status: "issued", txnDate: "2026-10-01" }, display, "2026-11-02");
    expect(m.customerName).toBe("Frozen Bill"); expect(m.customerAddress).toBe("Frozen billing");
    expect(m.workLocation).toBe("Frozen Work\nFrozen address"); expect(m.documentDate).toBe("2026-10-01");
    expect(JSON.stringify(m)).not.toContain("secret");
  });
  it("rejects impossible calendar dates instead of silently projecting another day", () => {
    expect(() => buildInvoiceDocumentModel(detail, display, "2026-02-30")).toThrow("INVALID_DOCUMENT_DATE");
  });
});
