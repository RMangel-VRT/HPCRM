import { describe, expect, it } from "vitest";
import PDFDocumentKit from "pdfkit";
import * as PDFLib from "pdf-lib";
import { transform } from "esbuild";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { BRAND, LM, RM, wirePageDecorations } from "./pdfBrand";

const logoPath = new URL("../../../../attached_assets/NEW - LOGO-03_1763582979034.png", import.meta.url);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=", "base64");

/** Executes the actual proposal helper in isolation, not a rewritten fixture renderer.
 * Storage / optional native image rendering are supplied deterministic bytes.
 */
async function proposalHarness(source: string) {
  const start = source.indexOf("  async function generateProposalPdf(");
  const end = source.indexOf('  app.get("/api/proposals/:id/pdf"', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const code = source.slice(start, end).replaceAll("await import('pdfkit')", "({ default: InjectedPDFKit })")
    .replaceAll("await import('pdf-lib')", "PDFLib");
  const { code: js } = await transform(code, { loader: "ts", target: "es2022" });
  const estimate = await PDFLib.PDFDocument.create();
  estimate.addPage().drawText("Uploaded QuickBooks estimate");
  const estimateBytes = Buffer.from(await estimate.save());
  const logo = await readFile(logoPath);
  class ObjectStorageService {
    async getObjectEntityFile(path: string) { return { download: async () => [path === "estimate" ? estimateBytes : png] }; }
    async downloadByPath() { return png; }
  }
  const deps = {
    InjectedPDFKit: PDFDocumentKit, PDFLib, BRAND, LM, RM, wirePageDecorations, ObjectStorageService,
    loadBrandLogo: async () => logo, fs: { readFile: async () => logo }, path: { join: () => "logo" },
    storage: { getProposalEstimatePdfs: async () => [{ storageObjectPath: "estimate" }], getSettings: async () => ({ companyName: "High Plains Property Maintenance" }) },
    compressImageForPdf: async (b: Buffer) => b, renderVisualScope: async () => png,
  };
  return new Function(...Object.keys(deps), `${js}\nreturn generateProposalPdf;`)(...Object.values(deps));
}
async function fingerprints(buffer: Buffer) {
  const doc = await PDFLib.PDFDocument.load(buffer);
  return doc.getPages().map((_page, i) => {
    const image = execFileSync("pdftoppm", ["-r", "72", "-singlefile", "-f", String(i + 1), "-png"], { input: buffer, maxBuffer: 5 * 1024 * 1024 });
    return createHash("sha256").update(image).digest("hex");
  });
}
const fixture = (scopeOfWork: string) => ({
  id: "fixture", title: "Landscape improvements", customerName: "Fixture Customer", proposalDate: "2026-10-30",
  estimateNumber: "EST-2026-0001", scopeOfWork, photoLayout: "grid",
  files: [{ fileType: "image", storageObjectPath: "photo", filename: "Site photo", displayOrder: 1, caption: "Site conditions" }],
  plantItems: [{ displayOrder: 0, quantity: 3, nameSnapshot: "Blue Spruce", botanicalSnapshot: "Picea pungens", sizeSnapshot: "5 gallon" }],
  plantPalette: { introText: "Selected plants", items: [{ id: "plant", displayOrder: 0, category: "tree", nameSnapshot: "Blue Spruce", typeLabel: "Evergreen" }] },
  visualScopeSheetId: "scope", visualScopeSheet: { title: "Site scope", scopeDate: "2026-10-30", baseImagePath: "base" },
});
describe("mechanical proposal branding extraction", () => {
  it.each(["Short scope.", "Scope paragraph.\n".repeat(90)])("retains real proposal page geometry and rendering including exhibits", async scope => {
    const current = await readFile(new URL("../routes/routes.ts", import.meta.url), "utf8");
    const after = await (await proposalHarness(current))(fixture(scope), "company");
    // Captured from the actual pre-extraction generator, rasterized at 72dpi.
    // Covers cover overflow, visual scope (independent pages), uploaded estimate,
    // plant schedule, palette, and photo appendix: 7 / 9 pages respectively.
    const expected = [
      ...(scope.length === 12 ? ["78f0ab660e8f908a3d8c251d3f8b3b09606b696ae943204474623214e27c70c9"] : [
        "4c64c345dd3b6d68ef1e4397135f4fc8a2c5a98f8dab25cdc9ac8e31a447e8c9",
        "e058f4d456c58c89b1fe59f42aacec5bd4a765f154382e79a6b5e5853ad5c5b1",
        "e7d10368b162d29633965fc70a2028c7c5b58c23f33740b34c0c65adbb97bdd7",
      ]),
      "40771c84c94c9bad38ae2aa610051e63bb11d51364232aefb0c8fc1d33e110ea",
      "c27b9870f33eb1e15217163fbd1025bbc31dedb430e81fcaa7dce9ea76e3fc00",
      "cbe7e61887010716bc37803923b4f720c9985b39bff470f54941755a44a84153",
      "a3acbea871c522364cf1c50d21e20f50f4c506378ca4f2c92bc4477d2a3b4d2a",
      "9fc77816b119621b2331731d6d8d19ec4775d791af7314e84891e7691434a93b",
      "30babeeb33efcdd9f0792fe940b2fe6b53a00c703913dd1e23f46ac962c74a51",
    ];
    expect(await fingerprints(after)).toEqual(expected);
  });
  it("restores PDFKit font and cursor across decorations and protects against recursive page creation", () => {
    const doc = new PDFDocumentKit({ size: "LETTER", margins: { top: LM, bottom: LM, left: LM, right: RM } });
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#222222");
    const internals = doc as unknown as { _font: unknown; _fontSize: number };
    const originalFont = internals._font, originalX = doc.x, originalY = doc.y;
    let added = 0; doc.on("pageAdded", () => added++);
    wirePageDecorations(doc, "High Plains");
    expect(internals._font).toBe(originalFont); expect(internals._fontSize).toBe(13);
    expect(doc.x).toBe(originalX); expect(doc.y).toBe(originalY);
    expect(added).toBe(0);
    doc.addPage();
    expect(added).toBe(1); expect(internals._font).toBe(originalFont); expect(internals._fontSize).toBe(13);
    doc.end();
  });
});
