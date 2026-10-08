import { describe, expect, it } from "vitest";
import { invoiceChip, type TicketLinkSummary } from "./ticketLinks";

const invoice = (id: string, statusKey: string | null, isFinal: boolean) => ({
  id, title: id, statusKey, isFinal, statusName: "An editable display name",
});
const summary = (...invoices: TicketLinkSummary["invoices"]): TicketLinkSummary => ({ invoices, parent: null });

describe("invoice relationship chip", () => {
  it("shows nothing for standalone/unlinked tickets", () => {
    expect(invoiceChip()).toBeNull();
    expect(invoiceChip(summary())).toBeNull();
  });
  it("shows a pending invoice with the universal open color", () => {
    expect(invoiceChip(summary(invoice("one", "pending_invoice", false)))).toEqual({
      label: "Invoice · Pending", state: "open",
    });
  });
  it("shows an invoiced ticket with the universal done color", () => {
    expect(invoiceChip(summary(invoice("one", "invoiced", true)))).toEqual({
      label: "Invoice · Invoiced", state: "done",
    });
  });
  it("counts multiple invoices and uses the least-finished state regardless of order", () => {
    const pending = invoice("pending", "pending_invoice", false);
    const done = invoice("done", "invoiced", true);
    for (const invoices of [[done, pending], [pending, done]]) {
      expect(invoiceChip(summary(...invoices))).toEqual({ label: "2 invoices · 1 pending", state: "open" });
    }
  });
  it("counts all final invoices and preserves the universal fallback for custom statuses", () => {
    expect(invoiceChip(summary(invoice("one", "invoiced", true), invoice("two", null, true)))).toEqual({
      label: "2 invoices · 0 pending", state: "done",
    });
    expect(invoiceChip(summary(invoice("custom", null, false)))).toEqual({
      label: "Invoice · Pending", state: "active",
    });
  });
});
