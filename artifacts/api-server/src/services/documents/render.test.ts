import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { estimateFixture, invoiceFixture } from "./fixtures";
import { estimateDocumentHtml } from "./estimate";
import { invoiceDocumentHtml } from "./invoice";
import { renderDocumentPdf } from "./render";
import { chromiumExecutable, closeDocumentBrowser, chromiumPdf } from "./browser";
import { escapeHtml } from "./layout";

const output = new URL("../../../../../generated-artifacts/ic4/png/", import.meta.url).pathname;
let unavailable = false;
try { await chromiumExecutable(); } catch { unavailable = true; }
afterAll(closeDocumentBrowser);
describe.skipIf(unavailable)("real offline Chromium and two-pass pagination (requires Nix Chromium)", () => {
  it.each([12, 60, 13])("renders %i-line fixture with repeat headings, counted footers and last-page mountains", async count => {
    const invoice = count === 13;
    const m = invoice ? invoiceFixture() : estimateFixture(count);
    const bytes = await renderDocumentPdf({ html: invoice ? invoiceDocumentHtml(invoiceFixture()) : estimateDocumentHtml(estimateFixture(count)),
      footerLabel: invoice ? `Invoice MA-1001 · Example Ranch HOA · ${invoiceFixture().companyDocument.invoiceFooterNote || "Thank you for your business"}`
        : "Estimate EST-2026-0042, version 2 · Example Ranch HOA",
      shortHeaderNumber: invoice ? "MA-1001 · Rev 1" : "EST-2026-0042 · Version 2", draft: invoice });
    const pdf = await PDFDocument.load(bytes);
    mkdirSync(output, { recursive: true });
    const name = invoice ? "invoice-13" : `estimate-${count}`;
    writeFileSync(`${output}${name}.pdf`, bytes);
    execFileSync("pdftoppm", ["-r", "96", "-png", `${output}${name}.pdf`, `${output}${name}`]);
    const texts = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString().split("\f").filter(v => v.trim());
    expect(texts.length).toBe(pdf.getPageCount());
    if (count === 12) expect(texts.length).toBeGreaterThanOrEqual(2);
    if (count === 60) expect(texts.length).toBeGreaterThan(2);
    for (const [i, text] of texts.entries()) {
      expect(text).toContain(`Page ${i + 1} of ${texts.length}`);
      if (/Blue Spruce \d|Landscape installation/.test(text)) expect(text).toContain("DESCRIPTION");
      if (i > 0) expect(text).toContain(invoice ? "MA-1001 · Rev 1" : "EST-2026-0042 · Version 2");
    }
    const final = texts.at(-1)!;
    if (invoice) {
      expect(final).toContain("How to pay"); expect(final).toContain("Calculated by QuickBooks"); expect(final).toContain("Subtotal before tax");
      expect(texts.join("")).not.toContain("Amount due"); expect(texts.join("")).toContain("DRAFT — not yet issued");
    } else {
      for (const label of ["Terms", "Plant warranty", "Acceptance", "Signature", "Printed name", "Title or board position"]) expect(final).toContain(label);
      for (const page of texts.slice(0, -1)) expect(page).not.toContain("Signature");
    }
    // pdf-lib embeds one shared mountains XObject, but only the last page invokes it.
    const imageCounts = pdf.getPages().map(page => {
      const resources = page.node.Resources()!;
      const objects = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
      return objects?.keys().length ?? 0;
    });
    if (imageCounts.length > 1) expect(imageCounts.at(-1)).toBeGreaterThan(imageCounts[0]);
    writeFileSync(`${output}${name}.pdf`, bytes);
    writeFileSync(`${output}${name}.txt`, texts.join("\n--- PAGE ---\n"));
    execFileSync("pdftoppm", ["-r", "96", "-png", `${output}${name}.pdf`, `${output}${name}`]);
    expect(m).toBeTruthy();
  }, 30_000);
  it("blocks outbound resources rather than fetching them", async () => {
    const { createServer } = await import("node:http");
    let hits = 0;
    const server = createServer((_req, res) => { hits++; res.end("forbidden"); }).listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.on("listening", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const bytes = await chromiumPdf(`<html><img src="http://127.0.0.1:${port}/private"><p>offline document</p></html>`);
      expect(bytes.subarray(0, 4).toString()).toBe("%PDF"); expect(hits).toBe(0);
    } finally { server.close(); }
  }, 30_000);
  it("fails explicitly rather than splitting a final block taller than one printable page", async () => {
    const model = estimateFixture(12);
    model.companyDocument.estimateTerms = "Lengthy terms supplied by the company. ".repeat(200);
    await expect(renderDocumentPdf({ html: estimateDocumentHtml(model), footerLabel: "Estimate", shortHeaderNumber: model.estimateNumber }))
      .rejects.toThrow("DOCUMENT_FINAL_BLOCK_TOO_LARGE");
  }, 30_000);
});
describe("HTML safety and document grouping", () => {
  it("escapes all HTML metacharacters", () => { expect(escapeHtml(`<script a="x">&'</script>`)).toBe("&lt;script a=&quot;x&quot;&gt;&amp;&#39;&lt;/script&gt;"); });
  it("preserves section grouping, units and customer category totals", () => {
    const m = estimateFixture(12);
    expect(m.categorySummary.reduce((sum, c) => sum + c.cents, 0)).toBe(m.totalCents);
    expect(m.categorySummary).toEqual([{ label: "Landscape labor", cents: 100000 }, { label: "Plants", cents: 200000 }]);
    m.customerName = "<script>customer</script>"; m.companyDocument.estimateTerms = ""; m.companyDocument.warrantyText = "";
    const html = estimateDocumentHtml(m);
    expect(html).toContain("&lt;script&gt;customer&lt;/script&gt;"); expect(html).not.toContain("<h2>Terms</h2>"); expect(html).not.toContain("<h2>Plant warranty</h2>");
    expect(html).toContain("Acceptance"); expect(html).toContain(">ea<"); expect(html).not.toContain("umbrellaKey");
  });
  it("renders revision/draft, category grouping, safe substitution and unpriced dashes", () => {
    const m = invoiceFixture(); m.companyName = '<script>"&';
    m.memo = "<script>memo</script>";
    const html = invoiceDocumentHtml(m);
    expect(m.groups.map(g => g.label)).toEqual(["Plants", "Landscape labor"]);
    expect(html).toContain("Rev 1"); expect(html).toContain("DRAFT — not yet issued"); expect(html).toContain(">—</td>");
    expect(html).toContain("&lt;script&gt;&quot;&amp;"); expect(html).toContain("&lt;script&gt;memo&lt;/script&gt;");
    expect(html).not.toContain("{company name}"); expect(html).not.toContain("Amount due"); expect(html).not.toContain("sourceId");
  });
});
