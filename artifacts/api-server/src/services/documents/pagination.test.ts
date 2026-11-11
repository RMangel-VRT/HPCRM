import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { estimateFixture, invoiceFixture } from "./fixtures";
import { estimateDocumentHtml } from "./estimate";
import { invoiceDocumentHtml } from "./invoice";
import { chromiumExecutable, closeDocumentBrowser } from "./browser";
import { renderDocumentPdf } from "./render";
import { displayDate, quantity, MOUNTAIN_RESERVE } from "./layout";

const output = new URL("../../../../../generated-artifacts/ic4-2/", import.meta.url).pathname;
let unavailable = false;
try { await chromiumExecutable(); } catch { unavailable = true; }
afterAll(closeDocumentBrowser);
function pageText(bytes: Buffer) {
  return execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString().split("\f").filter(p => p.trim());
}
async function render(name: string, html: string, invoice = false, draft = false) {
  const bytes = await renderDocumentPdf({ html, footerLabel: invoice ? "Invoice MA-1001 · Example Ranch HOA" : "Estimate EST-2026-0042 · Example Ranch HOA",
    shortHeaderNumber: invoice ? "MA-1001 · Rev 1" : "EST-2026-0042 · Version 2", draft });
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}${name}.pdf`, bytes);
  const pages = pageText(bytes);
  writeFileSync(`${output}${name}.txt`, pages.join("\n--- PAGE ---\n"));
  const bbox = execFileSync("pdftotext", ["-bbox", "-", "-"], { input: bytes }).toString();
  writeFileSync(`${output}${name}.bbox.html`, bbox);
  // PDF coordinates are points, mountain top=(1056-47-84)*.75=693.75.
  // Body must finish by 681.75. Footer and intentional diagonal draft stamp excluded.
  const last = bbox.split(/<page\b/).at(-1)!;
  const words = Array.from(last.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)"[^>]*>(.*?)<\/word>/g));
  const body = words.filter(w => Number(w[2]) < 745 && w[5] !== "DRAFT");
  const max = Math.max(...body.map(w => Number(w[4])));
  writeFileSync(`${output}${name}.checks.json`, JSON.stringify({ pages: pages.length, lastBodyBottomPt: max, mountainTopPt: 693.75, requiredClearancePt: 12 }, null, 2));
  expect(max).toBeLessThanOrEqual(681.75);
  // A previous render may have had more pages; never include stale PNGs in evidence.
  for (const file of readdirSync(output)) if (new RegExp(`^${name}-\\d+\\.png$`).test(file)) unlinkSync(`${output}${file}`);
  execFileSync("pdftoppm", ["-r", "96", "-png", `${output}${name}.pdf`, `${output}${name}`]);
  for (const page of pages) expect((page.match(/DESCRIPTION/g) ?? []).length).toBeLessThanOrEqual(1);
  return pages;
}
function checkOrphan(pages: string[], count: number, invoice: boolean) {
  const totalPage = pages.findIndex(p => p.includes(invoice ? "How to pay" : "Estimate total"));
  expect(totalPage).toBeGreaterThanOrEqual(0);
  const text = pages[totalPage];
  const rowCount = (text.match(/Blue Spruce \d+|Landscape installation \d+/g) ?? []).length;
  expect(rowCount).toBeGreaterThanOrEqual(Math.min(3, count));
  expect(text).toContain("DESCRIPTION");
  if (invoice && count > 6) expect(text).toContain("Landscape labor");
  if (!invoice && count > 0) expect(text).toContain("Entrance & common areas");
  const allRows = pages.flatMap(p => p.match(/Blue Spruce \d+|Landscape installation \d+/g) ?? []);
  expect(allRows).toHaveLength(count);
  expect(new Set(allRows).size).toBe(count);
  return totalPage;
}
describe.skipIf(unavailable)("IC4.1 actual printed pagination and clearance", () => {
  it.each([12, 60])("estimate %i keeps pricing with rows, legal separate and mountains clear", async count => {
    const pages = await render(`estimate-${count}`, estimateDocumentHtml(estimateFixture(count)));
    const pricePage = checkOrphan(pages, count, false);
    const sectionSubtotal = (count * 250).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(".", "\\.");
    const subtotalHeading = new RegExp(`Entrance & common areas\\s+${sectionSubtotal}`, "g");
    expect(pages.join("\n").match(subtotalHeading)).toHaveLength(1);
    for (const page of pages.slice(1).filter(p => /Blue Spruce \d+/.test(p))) {
      expect(page).toContain("Entrance & common areas (continued)");
      expect(page).not.toMatch(subtotalHeading);
    }
    expect(pages.at(-1)).toContain("Acceptance");
    expect(pricePage).toBeLessThan(pages.length - 1);
    expect(pages[pricePage]).not.toContain("Signature");
  }, 30_000);
  it.each([false, true])("13-line invoice issued=%s fits correctly and retains tax/draft semantics", async issued => {
    const model = invoiceFixture(13, issued);
    const pages = await render(`invoice-13-${issued ? "issued" : "draft"}`, invoiceDocumentHtml(model), true, !issued);
    checkOrphan(pages, 13, true);
    if (issued) {
      expect(pages).toHaveLength(1);
      expect(pages[0]).toContain("$3,510.00");
      expect(pages[0]).toContain("$260.00");
      expect(pages[0]).not.toContain("DRAFT");
      expect(pages[0]).not.toMatch(/\s—\s+(?:ea|125\.00|250\.00)/);
    } else {
      expect(pages.join("")).toContain("DRAFT — not yet issued");
      expect(pages.join("")).toContain("Calculated by QuickBooks");
      expect(pages.join("")).not.toContain("Amount due");
    }
  }, 30_000);
  it.each([0, 1, 2, 3])("short and empty tables (%i rows) keep all available rows", async count => {
    for (const invoice of [false, true]) {
      const html = invoice ? invoiceDocumentHtml(invoiceFixture(count)) : estimateDocumentHtml(estimateFixture(count));
      const pages = await render(`${invoice ? "invoice" : "estimate"}-short-${count}`, html, invoice, invoice);
      checkOrphan(pages, count, invoice);
    }
  }, 30_000);
  it.each([false, true])("boundary before/after one CSS pixel invoice=%s", async invoice => {
    // Sweep a subpixel-exact spacer after measuring the same real-font HTML.
    // Binary search finds the last fitting position, then checks the next pixel.
    const base = invoice ? invoiceDocumentHtml(invoiceFixture(7, true)) : estimateDocumentHtml(estimateFixture(6));
    const spaced = (px: number) => base.replace("<table data-pricing>", `<div style="height:${px}px"></div><table data-pricing>`);
    let lo = 0, hi = 650;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const bytes = await renderDocumentPdf({ html: spaced(mid), footerLabel: "Boundary", shortHeaderNumber: "Boundary" });
      const pages = pageText(bytes);
      const totalPage = pages.findIndex(p => p.includes(invoice ? "How to pay" : "Estimate total"));
      if (totalPage === 0) lo = mid; else hi = mid;
    }
    const stem = `${invoice ? "invoice" : "estimate"}-boundary`;
    const before = await render(`${stem}-fits`, spaced(lo), invoice);
    const after = await render(stem, spaced(hi), invoice);
    expect(checkOrphan(before, invoice ? 7 : 6, invoice)).toBe(0);
    expect(checkOrphan(after, invoice ? 7 : 6, invoice)).toBe(1);
    writeFileSync(`${output}${stem}.boundary.json`, JSON.stringify({ fitsSpacerPx: lo, movesSpacerPx: hi }, null, 2));
  }, 60_000);
  it("carries final three rows across estimate sections and invoice categories, including wrapped descriptions", async () => {
    const estimate = estimateFixture(18);
    const original = estimate.sections[0];
    estimate.sections = [{ ...original, subtotalCents: original.lines.slice(0, 17).reduce((sum, l) => sum + l.lineTotalCents, 0), lines: original.lines.slice(0, 17) },
      { ...original, name: "Second section", subtotalCents: original.lines[17].lineTotalCents, lines: original.lines.slice(17) }];
    original.lines.forEach(l => { l.detail = "Wrapped detail for planting and establishment.\nKeep this full line intact."; });
    const pages = await render("estimate-group-crossing", estimateDocumentHtml(estimate));
    const index = checkOrphan(pages, 18, false);
    expect(pages[index]).toContain("Second section");
    const invoice = invoiceFixture(8);
    const lines = invoice.groups.flatMap(g => g.lines);
    invoice.groups = [{ label: "Plants", lines: lines.slice(0, 7) }, { label: "Landscape labor", lines: lines.slice(7) }];
    lines.forEach(l => { l.description += "\nWrapped installation detail.\nFull row must remain together."; });
    const ip = await render("invoice-group-crossing", invoiceDocumentHtml(invoice), true, true);
    const ti = checkOrphan(ip, 8, true);
    expect(ip[ti]).toContain("Plants");
    for (const page of ip) {
      expect((page.match(/Full row must remain together/g) ?? []).length).toBe((page.match(/Blue Spruce \d+|Landscape installation \d+/g) ?? []).length);
    }
  }, 30_000);
  it("explicitly rejects an impossible tail instead of splitting totals or rows", async () => {
    const invoice = invoiceFixture(3);
    invoice.groups[0].lines[2].description = "Oversized wrapped row.\n".repeat(80);
    await expect(renderDocumentPdf({ html: invoiceDocumentHtml(invoice), footerLabel: "", shortHeaderNumber: "" })).rejects.toThrow("DOCUMENT_TOTALS_GROUP_TOO_LARGE");
  }, 30_000);
  it("rejects a remit-to line that cannot fit without overlapping or clipping", async () => {
    const invoice = invoiceFixture(1);
    invoice.companyDocument.remitTo = "An unusually long mailing address ".repeat(30);
    await expect(renderDocumentPdf({ html: invoiceDocumentHtml(invoice), footerLabel: "", shortHeaderNumber: "" })).rejects.toThrow("DOCUMENT_REMIT_TOO_WIDE");
  }, 30_000);
});

describe("IC4.1 display-only HTML", () => {
  it("formats Colorado instants and unshifted calendar dates with suffixes intact", () => {
    expect(displayDate("2026-11-02")).toBe("Nov 2, 2026");
    expect(displayDate("2026-11-03T01:30:00Z")).toBe("Nov 2, 2026");
    expect(displayDate("2026-03-09T01:30:00Z")).toBe("Mar 8, 2026");
    expect(estimateDocumentHtml(estimateFixture(1))).toContain("Nov 2, 2026 · Sent");
    expect(invoiceDocumentHtml(invoiceFixture(1, true))).toContain("Nov 2, 2026 · Net 30");
    expect(invoiceDocumentHtml(invoiceFixture(1, true))).toContain("Due Dec 2, 2026");
    const accepted = estimateFixture(1);
    accepted.statusLine = "Accepted Nov 2, 2026 · PO HOA-42";
    expect(estimateDocumentHtml(accepted)).toContain("Nov 2, 2026 · Accepted Nov 2, 2026 · PO HOA-42");
  });
  it("trims fractional zeros and groups quantities without numeric precision loss", () => {
    expect(["2.00", "2.50", "0.35", "1400.00", "999999999999999999.10"].map(quantity)).toEqual(["2", "2.5", "0.35", "1,400", "999,999,999,999,999,999.1"]);
    const m = estimateFixture(1);
    expect(estimateDocumentHtml(m)).toContain('class="num">2</td>');
    expect(m.sections[0].lines[0].quantity).toBe("2.00");
  });
  it("places escaped contact only in band, flattens remit for display and keeps settings unchanged", () => {
    const m = invoiceFixture();
    m.companyDocument.phone = "<script>";
    const remit = m.companyDocument.remitTo;
    const html = invoiceDocumentHtml(m);
    expect(html.slice(0, html.indexOf("</header>"))).toContain("&lt;script&gt;");
    expect(html.slice(html.indexOf("<main"))).not.toContain('class="contact"');
    expect(html).toContain("Mail to: High Plains Property Maintenance, 100 Example Road, Denver, CO 80000");
    expect(html.indexOf("Please remit")).toBeLessThan(html.indexOf("Mail to:"));
    expect(m.companyDocument.remitTo).toBe(remit);
    Object.keys(m.companyDocument).forEach(key => { if (["addressLine1", "addressLine2", "city", "state", "postalCode", "phone", "email", "website"].includes(key)) (m.companyDocument as unknown as Record<string, string>)[key] = ""; });
    expect(invoiceDocumentHtml(m)).not.toContain('class="contact"');
  });
  it("builds the single bordered acceptance title bar and geometric reserve", () => {
    const html = estimateDocumentHtml(estimateFixture(1));
    expect(html).toContain("border:1.5px solid #37443D;border-radius:8px");
    expect(html).toContain("<strong>Acceptance</strong><span>Total $250.00 plus applicable tax</span>");
    expect(html).not.toContain("<h2>Acceptance</h2>");
    expect(html).toContain("font-size:12.5pt;font-weight:700");
    expect(MOUNTAIN_RESERVE).toBe(71);
    expect(html).toContain(".mountain-space{height:71px}");
    expect(html).toContain("letter-spacing:normal;font-variant-numeric:normal");
  });
});
