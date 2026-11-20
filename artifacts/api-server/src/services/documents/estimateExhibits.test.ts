import { execFileSync } from "node:child_process";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { afterAll, expect, it } from "vitest";
import { closeDocumentBrowser } from "./browser";
import { estimateFixture } from "./fixtures";
import { estimateDocumentHtml } from "./estimate";
import { renderEstimateDocument } from "../estimatePdf";

afterAll(closeDocumentBrowser);
function hasMountains(pdf: PDFDocument, objects: PDFDict | undefined): boolean {
  return objects?.keys().some(key => {
    const object = pdf.context.lookup(objects.get(key));
    if (!(object instanceof PDFRawStream)) return false;
    if (object.dict.get(PDFName.of("Width"))?.toString() === "2000" && object.dict.get(PDFName.of("Height"))?.toString() === "363") return true;
    return hasMountains(pdf, object.dict.lookupMaybe(PDFName.of("Resources"), PDFDict)?.lookupMaybe(PDFName.of("XObject"), PDFDict));
  }) ?? false;
}
it.each([{ lineCount: 3, photoCount: 3 }, { lineCount: 108, photoCount: 6 }])(
  "prints $lineCount pricing lines and $photoCount photos with acceptance-page mountains", async ({ lineCount, photoCount }) => {
    const model = estimateFixture(lineCount, { scopeOfWork: "Scope for estimate exhibit test." });
    const photos = await Promise.all(Array.from({ length: photoCount }, async (_, index) => {
      const bytes = await sharp({ create: { width: index % 2 ? 70 : 110, height: index % 2 ? 110 : 70, channels: 3,
        background: { r: 20 * (index + 1), g: 120, b: 80 } } }).jpeg().toBuffer();
      return { caption: `Caption for test photo ${index + 1}`, dataUri: `data:image/jpeg;base64,${bytes.toString("base64")}` };
    }));
    model.exhibits = { plants: [{ name: "Display plant", botanicalName: "Botanical name", size: "5 gallon", quantity: "7.00",
      dataUri: photoCount === 6 ? photos[0].dataUri : null }], photos };
    const plantHtml = estimateDocumentHtml(model, false).split('<section class="estimate-plants">')[1].split("</section>")[0];
    expect(plantHtml.match(/<th\b/g)).toHaveLength(photoCount === 6 ? 4 : 3);
    expect(plantHtml).toContain('class="secondary botanical"');
    const pdfBytes = await renderEstimateDocument(model);
    const pages = execFileSync("pdftotext", ["-layout", "-", "-"], { input: pdfBytes }).toString().split("\f").filter(page => page.trim());
    const acceptance = pages.findIndex(page => page.includes("Signing below accepts"));
    expect(acceptance).toBeGreaterThan(0);
    expect(pages[acceptance]).toContain("Printed name");
    const plants = pages.findIndex(page => page.includes("Display plant"));
    const lastPrice = pages.findIndex(page => page.includes(`Blue Spruce ${lineCount} `));
    expect(plants).toBeGreaterThanOrEqual(lastPrice);
    expect(plants).toBeLessThan(acceptance);
    expect(pages[lastPrice]).toContain("Estimate total");
    expect(pages.filter(page => page.includes("Estimate total"))).toHaveLength(1);
    expect(pages).toHaveLength(acceptance + 1 + Math.ceil(photoCount / 2));
    for (const [index, page] of pages.slice(acceptance + 1).entries()) {
      expect(page).toContain(index ? "Photos (continued)" : "Photos");
      expect([...page.matchAll(/Caption for test photo (\d+)/g)].map(match => Number(match[1])))
        .toEqual([index * 2 + 1, index * 2 + 2].filter(photo => photo <= photoCount));
    }
    if (lineCount > 100) {
      const pricing = pages.filter(page => /Blue Spruce \d/.test(page));
      expect(pricing.length).toBeGreaterThanOrEqual(3);
      for (const page of pricing) for (const header of ["DESCRIPTION", "QTY", "AMOUNT"]) expect(page).toContain(header);
      expect([...pages.join("").matchAll(/Blue Spruce (\d+)/g)].map(match => Number(match[1])))
        .toEqual(Array.from({ length: lineCount }, (_, index) => index + 1));
    }
    const pdf = await PDFDocument.load(pdfBytes);
    for (const [index, page] of pdf.getPages().entries()) {
      expect(hasMountains(pdf, page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict))).toBe(index === acceptance);
    }
  },
  45_000,
);
