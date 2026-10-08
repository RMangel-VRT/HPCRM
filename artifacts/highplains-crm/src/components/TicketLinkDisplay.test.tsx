import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceLinkChip, InvoiceParentLine } from "./TicketLinkDisplay";
import type { TicketLinkSummary } from "@shared/ticketLinks";

const linked: TicketLinkSummary = {
  invoices: [{ id: "bill", title: "Invoice", statusKey: "pending_invoice", statusName: "Renamed", isFinal: false }],
  parent: { id: "job", title: "A very long parent job title", typeKey: "task", typeName: "Renamed type" },
};

describe("display-only invoice relationship elements", () => {
  it("renders the chip as a non-interactive status-colored span", () => {
    const html = renderToStaticMarkup(<InvoiceLinkChip summary={linked} />);
    expect(html).toContain("Invoice · Pending");
    expect(html).toContain("var(--ts-open)");
    expect(html).not.toMatch(/<(a|button)\b|href=|onclick=/i);
  });
  it("truncates the parent line and uses its stable type hue", () => {
    const html = renderToStaticMarkup(<InvoiceParentLine summary={linked} typeKey="invoice" />);
    expect(html).toContain("For: A very long parent job title");
    expect(html).toContain("truncate");
    expect(html).toContain("var(--tt-extra)");
    expect(html).not.toMatch(/<(a|button)\b|href=|onclick=/i);
  });
  it("does not change standalone invoices or unrelated ticket types", () => {
    expect(renderToStaticMarkup(<InvoiceParentLine summary={{ invoices: [], parent: null }} typeKey="invoice" />)).toBe("");
    expect(renderToStaticMarkup(<InvoiceParentLine summary={linked} typeKey="task" />)).toBe("");
    expect(renderToStaticMarkup(<InvoiceLinkChip summary={{ invoices: [], parent: null }} />)).toBe("");
  });
});
