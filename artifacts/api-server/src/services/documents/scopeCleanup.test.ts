import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { estimateFixture, invoiceFixture } from "./fixtures";
import { estimateDocumentHtml, estimateAcceptanceFragment } from "./estimate";
import { invoiceDocumentHtml } from "./invoice";
import { renderDocumentPdf } from "./render";
import { closeDocumentBrowser } from "./browser";
import { buildProposalDocumentModel, proposalDocumentHtml } from "./proposal";

const output = new URL("../../../../../generated-artifacts/eb45/", import.meta.url).pathname;
afterAll(closeDocumentBrowser);
describe("scope and shared legal fragments", () => {
  it("places escaped multiline scope after title and ticket, before pricing, and omits absent scope", () => {
    const m = estimateFixture(12);
    m.scopeOfWork = 'Protect <existing> & "new"\nInstall trees';
    m.linkedTicketTitle = "Ticket location";
    const html = estimateDocumentHtml(m);
    expect(html).toContain('Protect &lt;existing&gt; &amp; &quot;new&quot;<br>Install trees');
    expect(html.indexOf(m.projectTitle)).toBeLessThan(html.indexOf(m.linkedTicketTitle));
    expect(html.indexOf(m.linkedTicketTitle)).toBeLessThan(html.indexOf('<div class="scope">'));
    expect(html.indexOf('<div class="scope">')).toBeLessThan(html.indexOf("<table data-pricing>"));
    expect(html).toContain(".scope{margin-bottom:14px}");
    expect(html).toContain(".scope-body{font-size:10.5pt;line-height:1.45");
    m.scopeOfWork = null;
    expect(estimateDocumentHtml(m)).not.toContain('<div class="scope">');
  });
  it("retains totals markers and category data but never prints the category box", () => {
    const m = estimateFixture(12), html = estimateDocumentHtml(m);
    expect(m.categorySummary.length).toBeGreaterThan(0);
    expect(html).not.toContain("By category");
    expect(html).toContain('<div class="summary keep" data-totals><div></div><div class="pair total">');
    expect(html).toContain('<div class="final terms-page">');
    expect(html).toContain('<div class="acceptance-group keep">');
    expect(html).toContain(".boilerplate.estimate-legal{font-size:8.5pt;line-height:1.45;color:#5c665f}");
    expect(html).toContain(".legal-heading{font-size:10pt;margin:14px 0 5px");
    const luminance = [0x5c, 0x66, 0x5f].map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    const contrast = 1.05 / (.2126 * luminance[0] + .7152 * luminance[1] + .0722 * luminance[2] + .05);
    expect(contrast).toBeGreaterThan(4.5);
  });
  it("gates warranty but not configured terms, including in linked proposals without replacing their scope", () => {
    const estimate = estimateFixture(12);
    const input = { estimate, title: "Proposal", number: "P-1", documentDate: "2026-11-02",
      customerName: "Customer", customerAddress: "", workLocation: "", scopeOfWork: "Proposal-owned scope",
      coverSource: "none", hero: null, visualScope: [], palette: { introText: "", groups: [] }, schedule: [], photos: [], photoLayout: "grid" };
    estimate.scopeOfWork = "Estimate-only scope";
    expect(estimateAcceptanceFragment(estimate)).toContain("Plant warranty");
    expect(proposalDocumentHtml(buildProposalDocumentModel(input))).toContain("Plant warranty");
    estimate.hasPlants = false;
    const html = proposalDocumentHtml(buildProposalDocumentModel(input));
    expect(html).not.toContain("Plant warranty");
    expect(html).toContain("Proposal-owned scope"); expect(html).not.toContain("Estimate-only scope");
    expect(html).toContain(">Terms<"); expect(html).not.toContain("By category");
    // Proposal narrative and invoice boilerplate intentionally keep their old styles.
    expect(html).toContain('<div class="boilerplate">Proposal-owned scope');
    expect(invoiceDocumentHtml(invoiceFixture())).not.toContain('class="boilerplate estimate-legal"');
  });
});

it.each(["plants-scope", "services-only", "long-legal"])("renders and records %s evidence with unsplit acceptance and clear mountains", async scenario => {
  const model = estimateFixture(12, scenario === "services-only" ? { servicesOnly: true } : {
    scopeOfWork: "Prepare the entrance beds and install the specified plants.\nProtect existing landscape and clean the work area.",
  });
  expect(model.hasPlants).toBe(scenario !== "services-only");
  if (scenario === "long-legal") {
    model.companyDocument.estimateTerms = "Terms: Coordinate work with the property manager. ".repeat(60).slice(0, 2500);
    model.companyDocument.warrantyText = "Warranty: Water and maintain plants as instructed. ".repeat(60).slice(0, 2500);
    expect(model.companyDocument.estimateTerms.length).toBe(2500);
    expect(model.companyDocument.warrantyText.length).toBe(2500);
  }
  const bytes = await renderDocumentPdf({ html: estimateDocumentHtml(model), footerLabel: "Estimate evidence", shortHeaderNumber: model.estimateNumber });
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}${scenario}.pdf`, bytes);
  const text = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString();
  const pages = text.split("\f").filter(p => p.trim());
  if (scenario === "long-legal") {
    const compact = text.replace(/\s/g, "");
    expect(compact).toContain(model.companyDocument.estimateTerms.replace(/\s/g, ""));
    expect(compact).toContain(model.companyDocument.warrantyText.replace(/\s/g, ""));
  }
  expect(text).not.toContain("BY CATEGORY");
  expect(text.includes("Plant warranty")).toBe(scenario !== "services-only");
  expect(pages.filter(p => p.includes("Acceptance"))).toHaveLength(1);
  const acceptance = pages.find(p => p.includes("Acceptance"))!;
  for (const label of ["Signature", "Printed name", "Title or board position"]) expect(acceptance).toContain(label);
  expect(pages.at(-1)).toBe(acceptance);
  if (scenario === "long-legal") expect(pages.length).toBeGreaterThan(2);
  const bbox = execFileSync("pdftotext", ["-bbox", "-", "-"], { input: bytes }).toString();
  const last = bbox.split(/<page\b/).at(-1)!;
  const words = [...last.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)"[^>]*>(.*?)<\/word>/g)];
  const bottom = Math.max(...words.filter(w => Number(w[2]) < 745).map(w => Number(w[4])));
  expect(bottom).toBeLessThanOrEqual(681.75);
  for (const [i, page] of pages.entries()) {
    expect(page).toContain(`Page ${i + 1} of ${pages.length}`);
    if (i) expect(page).toContain(model.estimateNumber);
  }
  writeFileSync(`${output}${scenario}.txt`, text);
  writeFileSync(`${output}${scenario}.bbox.html`, bbox);
  writeFileSync(`${output}${scenario}.checks.json`, JSON.stringify({ pages: pages.length, lastBodyBottomPt: bottom, mountainTopPt: 693.75 }));
  execFileSync("pdftoppm", ["-r", "96", "-png", `${output}${scenario}.pdf`, `${output}${scenario}`]);
}, 30000);

it("still rejects oversized acceptance groups and invoice final blocks", async () => {
  const estimate = estimateDocumentHtml(estimateFixture(12)).replace('class="acceptance-group keep"', 'class="acceptance-group keep" style="height:900px"');
  const invoice = invoiceDocumentHtml(invoiceFixture()).replace('class="final keep"', 'class="final keep" style="height:900px"');
  await expect(renderDocumentPdf({ html: estimate, footerLabel: "", shortHeaderNumber: "" })).rejects.toThrow("DOCUMENT_FINAL_BLOCK_TOO_LARGE");
  // Invoice totals preflight may reject first; both safeguards must remain active.
  await expect(renderDocumentPdf({ html: invoice, footerLabel: "", shortHeaderNumber: "" })).rejects.toThrow(/DOCUMENT_(FINAL_BLOCK|TOTALS_GROUP)_TOO_LARGE/);
}, 30000);
