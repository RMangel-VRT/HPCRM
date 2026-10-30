import { describe, expect, it } from "vitest";
import { createInvoiceSchema, patchInvoiceSchema, createInvoiceLineSchema, patchInvoiceLineSchema,
  invoiceListQuerySchema, reorderInvoiceLinesSchema, cancelInvoiceSchema, prefixForCategory, formatInvoiceNumber,
  INVOICE_CATEGORIES } from "@workspace/db/invoice-contracts";
import { invoiceLineAmount, computeInvoiceSubtotal, pushReadiness } from "./invoiceMath";
import { normalizeQuantity } from "./estimateMath";

describe("driver-free invoice contracts and exact math", () => {
  it("formats growing numbers with independent category prefixes", () => {
    expect([1001, 1002, 1003].map(n => formatInvoiceNumber("MA", n))).toEqual(["MA-1001", "MA-1002", "MA-1003"]);
    expect([1001, 1002, 1003].map(n => formatInvoiceNumber("SN", n))).toEqual(["SN-1001", "SN-1002", "SN-1003"]);
    expect(formatInvoiceNumber("MA", 10000)).toBe("MA-10000");
    for (const c of INVOICE_CATEGORIES) expect(prefixForCategory(c)).toBe(c.startsWith("snow_") ? "SN" : "MA");
  });
  it.each(["0", "-1", "1.001", "1e2", " 1", "10000000000", "NaN", ""])("rejects unsupported quantity %s without rounding", quantity => {
    expect(createInvoiceLineSchema.safeParse({ category: "plants", description: "P", unit: "ea", quantity }).success).toBe(false);
  });
  it.each(["0.01", "2.5", "9999999999.99", 1.25])("accepts exact quantity %s", quantity => {
    const line = createInvoiceLineSchema.parse({ category: "plants", description: "P", unit: "ea", quantity });
    expect(normalizeQuantity(line.quantity!)).toMatch(/^\d+\.\d{2}$/);
  });
  it("handles null, zero, half-up and overflow amounts", () => {
    expect(invoiceLineAmount("2.5", 33)).toBe(83);
    expect(invoiceLineAmount(null, 33)).toBeNull();
    expect(invoiceLineAmount("2", null)).toBeNull();
    expect(invoiceLineAmount(null, null)).toBeNull();
    expect(invoiceLineAmount("2", 0)).toBe(0);
    expect(() => invoiceLineAmount("2", 2147483647)).toThrow(RangeError);
    expect(computeInvoiceSubtotal([{ amountCents: null }, { amountCents: 83 }])).toBe(83);
    expect(computeInvoiceSubtotal([{ amountCents: 2147483647 }])).toBe(2147483647);
    expect(() => computeInvoiceSubtotal([{ amountCents: 2147483647 }, { amountCents: 1 }])).toThrow(RangeError);
  });
  it.each([-1, 0.1, 2147483648, "33"])("rejects invalid cents %s", rateCents => {
    expect(createInvoiceLineSchema.safeParse({ category: "plants", description: "P", unit: "ea", rateCents }).success).toBe(false);
  });
  it("rejects unknown or server-written fields and empty PATCHes", () => {
    for (const schema of [patchInvoiceSchema, patchInvoiceLineSchema]) {
      expect(schema.safeParse({}).success).toBe(false);
      for (const field of ["status", "live", "sourceId", "sourceType", "amountCents", "subtotalCents", "invoiceSeq", "qboState", "paymentState"])
        expect(schema.safeParse({ [field]: "x" }).success).toBe(false);
    }
    expect(patchInvoiceSchema.parse({ memo: null })).toEqual({ memo: null });
    expect(patchInvoiceLineSchema.parse({ quantity: null, rateCents: null })).toEqual({ quantity: null, rateCents: null });
    expect(patchInvoiceLineSchema.parse({ description: "New" })).toEqual({ description: "New" });
    expect(patchInvoiceSchema.safeParse({ title: undefined }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ customerId: "c", title: "T", kind: "monthly" }).success).toBe(false);
    expect(createInvoiceSchema.parse({ customerId: "c", title: "T", kind: "standalone" }).prefix).toBe("MA");
    expect(createInvoiceSchema.safeParse({ customerId: "c", title: "T", kind: "standalone", sourceId: "x" }).success).toBe(false);
    expect(invoiceListQuerySchema.safeParse({ unknown: "x" }).success).toBe(false);
    expect(reorderInvoiceLinesSchema.safeParse({ lineIds: ["a"], displayOrder: 5 }).success).toBe(false);
    expect(cancelInvoiceSchema.safeParse({ reason: " " }).success).toBe(false);
  });
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "2026-01-01T00:00:00Z"])("rejects invalid calendar date %s", txnDate => {
    expect(patchInvoiceSchema.safeParse({ txnDate }).success).toBe(false);
  });
  it("preserves calendar dates as strings", () => {
    expect(patchInvoiceSchema.parse({ txnDate: "2028-02-29" })).toEqual({ txnDate: "2028-02-29" });
  });
  it("provides informational blockers with unpriced line IDs", () => {
    expect(pushReadiness({ lines: [], subtotalCents: 0, qboCustomerId: null })).toEqual({ ready: false,
      problems: [{ code: "NO_LINES" }, { code: "CUSTOMER_NOT_LINKED" }, { code: "ZERO_TOTAL" }] });
    expect(pushReadiness({ lines: [{ id: "q", quantity: null, rateCents: 2 }, { id: "r", quantity: "1", rateCents: null }],
      subtotalCents: 3, qboCustomerId: "qbo" }).problems).toEqual([{ code: "UNPRICED_LINE", lineIds: ["q", "r"] }]);
    expect(pushReadiness({ lines: [{ id: "l", quantity: "1", rateCents: 1 }], subtotalCents: 1, qboCustomerId: "qbo" })).toEqual({ ready: true, problems: [] });
  });
});
