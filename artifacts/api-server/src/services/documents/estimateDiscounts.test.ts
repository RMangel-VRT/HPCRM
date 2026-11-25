import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { discountedEstimateFixture, estimateFixture } from "./fixtures";
import { estimateDocumentHtml, estimatePricingSummary } from "./estimate";
import { buildProposalDocumentModel, proposalDocumentHtml } from "./proposal";
import { compactSampleFixture } from "./proposalP4.fixture";
import { chromiumExecutable, closeDocumentBrowser } from "./browser";
import { buildEstimateDocumentModel, renderEstimateDocument } from "../estimatePdf";

const sha = (html: string) => createHash("sha256").update(html).digest("hex");
let unavailable = false;
try { await chromiumExecutable(); } catch { unavailable = true; }
afterAll(closeDocumentBrowser);

describe("estimate discount document rows", () => {
  it("leaves undiscounted documents byte-identical to their pre-discount HTML", async () => {
    // Captured from the renderer before discounts existed. The PDF is a deterministic render of this HTML.
    expect(sha(estimateDocumentHtml(estimateFixture(0)))).toBe("6c484dd55308ed939434a01e9bd40b45d0ac09fe95678340a4f3d75f9fc1541d");
    expect(sha(estimateDocumentHtml(estimateFixture(12)))).toBe("7b5e5070f3b1f7ec346b0a6f8e456befda4fc7f7c5702a5888bc808ca8c58019");
    expect(sha(estimateDocumentHtml(estimateFixture(60)))).toBe("2e7cea9f2b22519a912b8f34f20d6980744620010a8a8edb91c67a0825038a83");
    expect(sha(estimateDocumentHtml(estimateFixture(12, { servicesOnly: true, scopeOfWork: "Scope line" }))))
      .toBe("3db5c0a21a4f563329f306889b91d875a7e947a0da4aa7cf2c60e7c247572ead");
    expect(sha(proposalDocumentHtml(await compactSampleFixture(false)))).toBe("df5446c6f50623693b82a9d07d7f9e48b78badde529b63f86d591e7b211981aa");
    expect(estimateFixture(12).discounts).toEqual([]);
  });

  it("carries only customer-safe discount metadata and the frozen discounted total", () => {
    const m = discountedEstimateFixture();
    // 4 labor lines × $250 = $1,000 labor; 8 plant lines × $250 = $2,000.
    expect(m.subtotalCents).toBe(300000);
    expect(m.discounts).toEqual([
      { label: "Winter labor discount", kind: "percent", displayValue: "15%", cents: 15000 },
      { label: "Discount", kind: "amount", displayValue: null, cents: 50000 },
    ]);
    expect(m.totalCents).toBe(235000);
    for (const d of m.discounts) expect(Object.keys(d).sort()).toEqual(["cents", "displayValue", "kind", "label"]);
    // Category summary stays gross: it describes the work.
    expect(m.categorySummary.reduce((s, c) => s + c.cents, 0)).toBe(300000);
    expect(m.sections[0].subtotalCents).toBe(300000);
  });

  it("renders Subtotal, named discounts without dollar signs, and the discounted key figure and acceptance total", () => {
    const html = estimateDocumentHtml(discountedEstimateFixture());
    const summary = estimatePricingSummary(discountedEstimateFixture());
    expect(summary).toContain('<span>Subtotal</span><span>3,000.00</span>');
    expect(summary).toContain('<span>Winter labor discount (15%)</span><span>−150.00</span>');
    expect(summary).toContain('<span>Discount</span><span>−500.00</span>');
    expect(summary).toContain('<span>Estimate total</span><span>$2,350.00</span>');
    expect(summary.indexOf("Subtotal")).toBeLessThan(summary.indexOf("Winter labor"));
    expect(summary.indexOf("Winter labor")).toBeLessThan(summary.indexOf(">Discount<"));
    expect(summary).not.toMatch(/−\$/);
    expect(html).toContain("Total $2,350.00 plus applicable tax");
    expect(html).not.toContain("$3,000.00");
    expect(html.match(/2,350\.00/g)!.length).toBeGreaterThanOrEqual(3); // key figure, summary, acceptance
  });

  it("uses default labels, escapes custom labels and omits zero-amount discounts", () => {
    const defaults = discountedEstimateFixture({ laborLabel: null });
    expect(defaults.discounts[0].label).toBe("Labor discount");
    const hostile = discountedEstimateFixture({ laborLabel: "<b>Winter</b>" });
    expect(estimatePricingSummary(hostile)).toContain("&lt;b&gt;Winter&lt;/b&gt;");
    // A labor discount on a version with no labor lines applies 0 and prints no row.
    const lines = [{ name: "Plant", detail: null, quantity: "1.00", unit: "ea", unitPriceCents: 1000, sortOrder: 0, lineType: "plant", umbrellaKey: "plants" }];
    const m = buildEstimateDocumentModel({ estimateNumber: "EST-2026-0001", title: "No labor",
      version: { versionNumber: 1, status: "draft", sentAt: null, acceptedOn: null, poNumber: null, frozenSubtotalCents: null,
        laborDiscountKind: "percent", laborDiscountValue: 1500,
        totals: { subtotalCents: 1000, bySection: { a: 1000 }, laborDiscountCents: 0, totalDiscountCents: 0, totalCents: 1000 },
        sections: [{ id: "a", name: "A", sortOrder: 0, lines }] } },
      { companyName: "High Plains", customerName: "C", customerAddress: "A", createdByName: null, ticket: null }, "2026-11-02");
    expect(m.discounts).toEqual([]);
    expect(estimatePricingSummary(m)).not.toContain("Subtotal");
  });

  it("legacy frozen versions without frozen discount columns print their frozen subtotal as the total", () => {
    const m = estimateFixture(12);
    expect(m.totalCents).toBe(300000);
    expect(m.subtotalCents).toBe(300000);
  });

  it("proposal reprojection keeps discount rows and drops anything else", () => {
    const estimate = discountedEstimateFixture();
    (estimate.discounts[0] as unknown as Record<string, unknown>).allocation = { secret: 1 };
    const p = buildProposalDocumentModel({ title: "Winter planting", number: "PROP-2026-0043", documentDate: "2026-11-03",
      customerName: "Example Ranch HOA", customerAddress: "250 Example Lane", workLocation: "North entrance", scopeOfWork: "",
      estimate, coverSource: "none", hero: null, visualScope: [], palette: { introText: "", groups: [] }, schedule: [], photos: [], photoLayout: "large" });
    expect(p.estimate.discounts).toEqual([
      { label: "Winter labor discount", kind: "percent", displayValue: "15%", cents: 15000 },
      { label: "Discount", kind: "amount", displayValue: null, cents: 50000 },
    ]);
    expect(p.estimate.subtotalCents).toBe(300000);
    const html = proposalDocumentHtml(p);
    expect(html).toContain("Winter labor discount (15%)");
    expect(html).not.toContain("secret");
    expect(html).toContain("Total $2,350.00 plus applicable tax");
    expect(html).toMatch(/Proposal total[\s\S]*?\$2,350\.00/);
  });

  it.skipIf(unavailable)("prints the discount rows in the rendered PDF", async () => {
    const bytes = await renderEstimateDocument(discountedEstimateFixture());
    const text = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString();
    expect(text).toMatch(/Subtotal\s+3,000\.00/);
    expect(text).toMatch(/Winter labor discount \(15%\)\s+−150\.00/);
    expect(text).toMatch(/Discount\s+−500\.00/);
    expect(text).toMatch(/Estimate total\s+\$2,350\.00/);
    expect(text).toContain("Total $2,350.00 plus applicable tax");
  }, 60000);
});
