import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import goldens from "./proposalP4.goldens.json";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import { compactSampleFixture } from "./proposalP4.fixture";
import { buildProposalDocumentModel, proposalDocumentHtml } from "./proposal";
import { estimateFixture } from "./fixtures";
import { closeDocumentBrowser } from "./browser";
import { renderProposalDocument } from "../proposalDocument";
import { estimatePricingFragment } from "./estimate";

const out = new URL("../../../../../generated-artifacts/proposals-p4/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
afterAll(closeDocumentBrowser);
const textPages = (bytes: Buffer) => execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString().split("\f").filter(p => p.trim());
const bboxPages = (bytes: Buffer) => execFileSync("pdftotext", ["-bbox", "-", "-"], { input: bytes }).toString().split(/<page\b/).slice(1);
function words(page: string) {
  return [...page.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)"[^>]*>(.*?)<\/word>/g)]
    .map(w => ({ x: +w[1], y: +w[2], right: +w[3], bottom: +w[4], text: w[5] }));
}
function hasMountains(pdf: PDFDocument, objects: PDFDict | undefined): boolean {
  return objects?.keys().some(key => {
    const object = pdf.context.lookup(objects.get(key));
    if (!(object instanceof PDFRawStream)) return false;
    if (object.dict.get(PDFName.of("Width"))?.toString() === "2000" && object.dict.get(PDFName.of("Height"))?.toString() === "363") return true;
    return hasMountains(pdf, object.dict.lookupMaybe(PDFName.of("Resources"), PDFDict)?.lookupMaybe(PDFName.of("XObject"), PDFDict));
  }) ?? false;
}
describe("P4 approved sample and flowing legal structure", () => {
  it.each([true, false])("reconstructs the visible approved sample in six pages, image=%s", async withImage => {
    const m = await compactSampleFixture(withImage);
    const bytes = await renderProposalDocument(m);
    const name = withImage ? "sample-white-cover" : "sample-type-cover";
    writeFileSync(`${out}${name}.pdf`, bytes);
    const pages = textPages(bytes);
    writeFileSync(`${out}${name}.txt`, pages.join("\n--- PAGE ---\n"));
    execFileSync("pdftoppm", ["-scale-to", "900", "-png", `${out}${name}.pdf`, `${out}${name}`]);
    expect(pages).toHaveLength(6);
    expect(pages[1]).toContain("Scope of work");
    expect(pages[1]).toContain("Pricing");
    expect(pages[2]).toContain("Plants");
    expect(pages[2]).toContain("Terms");
    expect(pages[3]).toContain("Signing below accepts");
    expect(pages[3]).toContain("Plant warranty");
    expect(pages[4]).toContain("Existing turf at the entry");
    expect(pages[5]).toContain("Zone 4 valve box");
    expect(pages.join("")).not.toContain("Plant schedule");
    expect(pages.join("")).not.toContain("Plant palette");
    // Reviewed P4-only 900px raster goldens, in addition to semantic structure.
    // Images stay in ignored generated output, not repository/deployment assets.
    expect(pages.map((_, i) => createHash("sha256").update(readFileSync(`${out}${name}-${i + 1}.png`)).digest("hex")))
      .toEqual(goldens[name]);
  }, 60_000);
  it("uses one Plants table for every toggle/intro choice, never guessing image/name associations", async () => {
    const sample = await compactSampleFixture(false);
    for (const schedule of [false, true]) for (const palette of [false, true]) for (const intro of ["", "Explicit intro"]) {
      const model = buildProposalDocumentModel({ ...sample, includePlantPalette: palette,
        plants: schedule || palette ? sample.plants : [], palette: { introText: intro, groups: [] } });
      const html = proposalDocumentHtml(model);
      expect(html.match(/<h2>Plants<\/h2>/g)?.length ?? 0).toBe(schedule || palette ? 1 : 0);
      expect(html.includes("Explicit intro")).toBe((schedule || palette) && palette && !!intro);
      expect(html.includes('class="secondary">Ornamental Grass')).toBe((schedule || palette) && palette);
      expect(html).toContain(estimatePricingFragment(model.estimate));
    }
    sample.plants![0].dataUri = "https://foreign-company.test/photo";
    const html = proposalDocumentHtml(buildProposalDocumentModel(sample));
    expect(html).not.toContain("foreign-company");
    expect(html).toContain("Autumn Blaze Maple");
  });
  it.each(["none", "photo", "visual_scope", "missing", "corrupt"])("renders safe %s cover", async source => {
    const sample = await compactSampleFixture(true);
    const model = buildProposalDocumentModel({ ...sample, photos: [], coverSource: source === "missing" || source === "corrupt" ? "photo" : source,
      hero: source === "missing" ? null : source === "corrupt" ? { caption: "", dataUri: "invalid" } : sample.hero });
    const html = proposalDocumentHtml(model);
    const bytes = await renderProposalDocument(model);
    const pages = textPages(bytes);
    expect(pages[0]).not.toContain("Page ");
    expect(pages[0]).toContain("14847 Madison St");
    expect(pages[0].includes("PROPOSAL TOTAL")).toBe(["none", "missing", "corrupt"].includes(source));
    expect(html).toContain('height:84px;overflow:hidden;opacity:.6');
    expect(html).toContain('height:520px;object-fit:cover');
  }, 60_000);
  it.each([false, true].flatMap(long => [false, true].flatMap(warranty => [false, true].map(photos => ({ long, warranty, photos })))))
  ("keeps acceptance and mountains together: %j", async ({ long, warranty, photos }) => {
    const sample = await compactSampleFixture(false);
    sample.estimate = estimateFixture(long ? 85 : 3);
    sample.estimate.companyDocument.estimateTerms = long ? "Long supplied terms must flow naturally across pages.\n".repeat(95) : "Short supplied terms.";
    sample.estimate.hasPlants = warranty;
    sample.estimate.companyDocument.warrantyText = warranty ? "Company supplied warranty coverage and exclusions.\n".repeat(long ? 20 : 1) : "";
    sample.photos = photos ? sample.photos : [];
    const bytes = await renderProposalDocument(sample);
    const pages = textPages(bytes), boxes = bboxPages(bytes);
    const pdf = await PDFDocument.load(bytes);
    const acceptance = pages.findIndex(p => p.includes("Signing below accepts"));
    expect(acceptance).toBeGreaterThan(0);
    expect(pages[acceptance]).toContain("Printed name");
    expect(pages[acceptance]).toContain("Title or board position");
    expect(pages[acceptance].includes("Attachment A")).toBe(false);
    expect(pdf.getPageCount()).toBe(acceptance + 1 + (photos ? 2 : 0));
    for (const [i, page] of pdf.getPages().entries()) {
      expect(hasMountains(pdf, page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict))).toBe(i === 0 || i === acceptance);
      const body = words(boxes[i]).filter(w => w.y > 70 && w.y < 745);
      if (i > 0 && body.length) expect(Math.max(...body.map(w => w.bottom))).toBeLessThan(i === acceptance ? 682 : 736);
    }
    if (long) {
      const pricingPages = pages.filter(p => /Blue Spruce \d/.test(p));
      expect(pricingPages.length).toBeGreaterThanOrEqual(3);
      for (const p of pricingPages) for (const label of ["DESCRIPTION", "QTY", "AMOUNT"]) expect(p).toContain(label);
      const totalPage = pages.find(p => p.includes("Estimate total"))!;
      for (const n of [83, 84, 85]) expect(totalPage).toContain(`Blue Spruce ${n}`);
      expect(totalPage).toContain("$21,250.00");
      // Every priced row appears exactly once, in order, without hidden/clipped words.
      const all = pages.join("\n");
      for (let n = 1; n <= 85; n++) expect([...all.matchAll(new RegExp(`Blue Spruce ${n}(?!\\d)`, "g"))]).toHaveLength(1);
    }
    if (long && warranty && photos) {
      writeFileSync(`${out}long-pricing-legal.pdf`, bytes);
      writeFileSync(`${out}long-pricing-legal.txt`, pages.join("\n--- PAGE ---\n"));
      execFileSync("pdftoppm", ["-scale-to", "900", "-png", `${out}long-pricing-legal.pdf`, `${out}long-pricing-legal`]);
    }
  }, 90_000);
});
