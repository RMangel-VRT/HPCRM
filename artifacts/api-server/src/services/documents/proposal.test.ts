import { afterAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import { documentAsset } from "./assets";
import sharp from "sharp";
import { estimateFixture } from "./fixtures";
import { buildProposalDocumentModel, proposalDocumentHtml } from "./proposal";
import { estimateDocumentHtml, estimatePricingFragment, estimatePricingTable, estimatePricingSummary, estimateAcceptanceFragment, estimateCustomerFragment } from "./estimate";
import { documentHtml, firstHeader, displayDate } from "./layout";
import { renderProposalDocument, proposalImageUri } from "../proposalDocument";
import { closeDocumentBrowser } from "./browser";
import { stampDocument } from "./stamp";
import { proposalCoverPatch, coverSelectionError } from "../proposalCover";

const output = new URL("../../../../../generated-artifacts/ic4-2/proposals/", import.meta.url).pathname;
mkdirSync(output, { recursive: true });
afterAll(closeDocumentBrowser);
const image = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=`;
export function proposalFixture(count = 0, layout = "large") {
  return buildProposalDocumentModel({
    title: "Entrance landscape improvements", number: "PROP-2026-0042", documentDate: "2026-11-03",
    customerName: "Example Ranch HOA", customerAddress: "250 Example Lane", workLocation: "North entrance",
    scopeOfWork: "Improve the entrance.\n<script>never execute</script>", estimate: estimateFixture(12),
    coverSource: "none", hero: null, visualScope: [],
    palette: { introText: "", groups: [] }, schedule: [],
    photos: Array.from({ length: count }, (_, i) => ({ dataUri: image, caption: `Site photo ${i + 1}`, order: i })),
    photoLayout: layout,
  });
}
describe("proposal pure allowlist and shared fragments", () => {
  it("uses exact estimate pricing once, one acceptance, escaped settings and no estimate band", () => {
    const m = proposalFixture();
    m.estimate.companyDocument.estimateTerms = "<b>literal terms</b>";
    const html = proposalDocumentHtml(m);
    expect(html).toContain(estimatePricingFragment(m.estimate));
    expect(html).not.toContain("By category");
    expect(html.match(/<strong>Acceptance<\/strong>/g)).toHaveLength(1);
    expect(html).not.toContain("<h1>Estimate</h1>");
    expect(html).toContain("&lt;script&gt;never execute&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;literal terms&lt;/b&gt;");
    expect(html).not.toContain("Plant palette");
    expect(html).not.toContain("Attachment A");
  });
  it.each([12, 60])("recomposes the existing standalone structure for %i lines", count => {
    const m = estimateFixture(count);
    const expected = documentHtml(`${firstHeader({ title: "Estimate", number: `${m.estimateNumber} · Version ${m.versionNumber}`, dateLine: `${displayDate(m.documentDate)} · ${m.statusLine}`, draft: m.draft, settings: m.companyDocument })}<main class="content">${estimateCustomerFragment(m)}<h2>${m.projectTitle}</h2>${estimatePricingTable(m)}${estimatePricingSummary(m)}<div class="final terms-page">${estimateAcceptanceFragment(m)}</div></main>`);
    expect(estimateDocumentHtml(m)).toBe(expected);
    // Intended scope styling, category-box removal and flowing legal fragment.
    expect(createHash("sha256").update(estimateDocumentHtml(m)).digest("hex")).toBe(count === 12
      ? "24df212676fbba9d2309933ed5154b679fe68e14606ea4eeaf1fde7e5ba33a89"
      : "ff8c41be9d110c8d46dcc0dffca93556fc586f902003f2c27f853ff423eeb684");
  });
  it("drops internal fields even when added to nested models and orders valid captioned photos", () => {
    const input = proposalFixture(2);
    Object.assign(input, { provenance: "SECRET" });
    Object.assign(input.estimate.sections[0].lines[0], { costCents: 123, umbrellaKey: "SECRET" });
    input.photos.reverse();
    input.photos.push({ caption: "bad", dataUri: "https://example.test/track", order: -1 });
    input.coverSource = "photo"; input.hero = { caption: "", dataUri: "javascript:bad" };
    const model = buildProposalDocumentModel(input);
    expect(JSON.stringify(model)).not.toMatch(/SECRET|costCents|umbrellaKey|provenance/);
    expect(model.photos.map(p => p.caption)).toEqual(["Site photo 1", "Site photo 2"]);
    expect(model.hero).toBeNull();
    expect(model.estimate.totalCents).toBe(input.estimate.totalCents);
  });
  it("preserves omitted cover state and rejects invalid effective selection", () => {
    const p = { id: "p", companyId: "c", coverSource: "photo", coverPhotoFileId: "f", visualScopeSheetId: null };
    const photos = [{ id: "f", proposalId: "p", companyId: "c", fileType: "image", mimeType: "image/jpeg" }];
    expect(proposalCoverPatch.parse({ title: "unrelated" })).toEqual({});
    expect(coverSelectionError({}, p, null, [])).toBeNull();
    expect(coverSelectionError({ coverSource: "photo" }, p, null, photos)).toBeNull();
    expect(coverSelectionError({ coverPhotoFileId: null }, p, null, photos)).toBe("INVALID_COVER_PHOTO");
    expect(coverSelectionError({ coverSource: "photo" }, p, null, [{ ...photos[0], companyId: "foreign" }])).toBe("INVALID_COVER_PHOTO");
    expect(coverSelectionError({ coverSource: "visual_scope" }, p, null, photos)).toBe("COVER_VISUAL_SCOPE_REQUIRED");
  });
});
describe("real Chromium proposal pagination", () => {
  it.each([[0, "large"], [1, "large"], [10, "large"], [0, "grid"], [1, "grid"], [10, "grid"]] as const)("places acceptance before %i %s photos and numbers after the cover", async (count, layout) => {
    const model = proposalFixture(count, layout);
    const bytes = await renderProposalDocument(model);
    const pdf = await PDFDocument.load(bytes);
    const pages = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString().split("\f").filter(t => t.trim());
    const name = `proposal-${count}-${layout}`;
    writeFileSync(`${output}${name}.pdf`, bytes);
    writeFileSync(`${output}${name}.txt`, pages.join("\n--- PAGE ---\n"));
    execFileSync("pdftoppm", ["-scale-to", "900", "-png", `${output}${name}.pdf`, `${output}${name}`]);
    // Scope/cover/exhibits retain their fingerprints. Only shared pricing
    // (removed category box) and legal typography/warranty intentionally change.
    if (layout === "large" && (count === 0 || count === 1)) {
      const expected = count === 0 ? [
        "7d57f88c9d6ae498f27b96c85612721742960b2039ff8ccb06cfa1f2d24275cf",
        "f55fcdaa672cd62ccda1f66501843ec35184011eef126cc08caa706e1c5f99fc",
        "87ac452ec5df381350ef5e9f0bbdbe28cf9f3f9c5fa59b15b9598ab065f62671",
        "ea6c667c14891a3f5fdad1c3df1eca3b55d68273c69e7907ef7a3ea362a36a85",
      ] : [
        "7d57f88c9d6ae498f27b96c85612721742960b2039ff8ccb06cfa1f2d24275cf",
        "ea8e61c220d5caf66d69a50a98546712e0fdf75a903d442bab59ac9aa6f0dc41",
        "6a15d723673580904d80e36d7bacc9a985e71025d715ba7d0c688fa6256d6da4",
        "96b98d9d4d06b102e79b8afd050f2a1f825325a90fbdce1e7893b67cca295f23",
        "edf530b0d3b78b3c69d72adb435b1fdc6dde0b54d744e1c657122bc3d81e2a3b",
      ];
      expect(pdf.getPageCount()).toBe(expected.length);
      for (const [index, hash] of expected.entries())
        expect(createHash("sha256").update(readFileSync(`${output}${name}-${index + 1}.png`)).digest("hex")).toBe(hash);
    }
    expect(pages[0].replace(/\s+/g, " ")).toContain(model.title); expect(pages[0]).not.toContain("Page "); expect(pages[0]).not.toContain("DRAFT");
    expect(pages[1]).toContain("Scope of work");
    expect(pages[2]).toContain("Pricing");
    expect(pages.join("").match(/Signing below accepts/g)).toHaveLength(1);
    const acceptance = pages.findIndex(t => t.includes("Signing below accepts"));
    const firstPhoto = pages.findIndex(t => t.includes("Attachment A"));
    const bbox = execFileSync("pdftotext", ["-bbox", "-", "-"], { input: bytes }).toString();
    writeFileSync(`${output}${name}.bbox.html`, bbox);
    const acceptancePage = bbox.split(/<page\b/)[acceptance + 1];
    const bodyWords = [...acceptancePage.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)"[^>]*>(.*?)<\/word>/g)]
      .filter(w => Number(w[2]) < 745);
    expect(Math.max(...bodyWords.map(w => Number(w[4])))).toBeLessThanOrEqual(681.75);
    expect(acceptance).toBeGreaterThan(2);
    expect(pdf.getPageCount() - acceptance - 1).toBe(Math.ceil(count / (layout === "grid" ? 4 : 1)));
    if (count) expect(firstPhoto).toBe(acceptance + 1);
    for (let i = 1; i < pages.length; i++) expect(pages[i]).toContain(`Page ${i} of ${pages.length - 1}`);
    // Cover has only its logo; acceptance invokes logo + mountains.
    const xobjects = pdf.getPages().map(p => p.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0);
    expect(xobjects[0]).toBe(1);
    expect(xobjects[acceptance]).toBe(2);
    // Identical fixture photos share one Chromium XObject even in the grid.
    if (count) expect(xobjects.at(-1)).toBe(2);
    const dimensions = await sharp(documentAsset("mountains.png")).metadata();
    for (const [i, page] of pdf.getPages().entries()) {
      const objects = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
      const mountains = objects?.keys().filter(key => {
        const object = pdf.context.lookup(objects.get(key));
        return object instanceof PDFRawStream && object.dict.get(PDFName.of("Width"))?.toString() === String(dimensions.width) &&
          object.dict.get(PDFName.of("Height"))?.toString() === String(dimensions.height);
      }) ?? [];
      expect(mountains.length).toBe(i === acceptance ? 1 : 0);
    }
  }, 60_000);
  it("handles overflowing scope/settings and keeps signature clearance before attachments", async () => {
    const m = proposalFixture(1);
    m.scopeOfWork = "Scope line\n".repeat(95);
    m.estimate.companyDocument.estimateTerms = "Settings terms line.\n".repeat(65);
    m.estimate.draft = true;
    const bytes = await renderProposalDocument(m);
    writeFileSync(`${output}proposal-overflow.pdf`, bytes);
    const pages = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes }).toString().split("\f").filter(t => t.trim());
    expect(pages[0]).not.toContain("DRAFT");
    const acceptance = pages.findIndex(p => p.includes("Signing below accepts"));
    expect(pages[acceptance]).toContain("Title or board position");
    expect(pages[acceptance + 1]).toContain("Attachment A");
    execFileSync("pdftoppm", ["-scale-to", "900", "-png", `${output}proposal-overflow.pdf`, `${output}proposal-overflow`]);
    // Diagonally stamped text can be extracted with spaces between glyphs.
    const raw = execFileSync("pdftotext", ["-raw", "-", "-"], { input: bytes }).toString().split("\f").filter(t => t.trim());
    for (const page of raw.slice(1)) expect(page.replace(/\s+/g, "")).toContain("DRAFT");
  }, 60_000);
  it("bounds and compresses a representative 20-photo proposal", async () => {
    // Deterministic high-detail synthetic camera input, not 20 copies of a
    // single flat color (which would unrealistically deduplicate in Chromium).
    const pixels = Buffer.alloc(3200 * 2400 * 3);
    let seed = 42;
    for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; pixels[i] = seed >>> 24; }
    const raw = await sharp(pixels, { raw: { width: 3200, height: 2400, channels: 3 } }).png().toBuffer();
    const dataUri = await proposalImageUri(raw);
    const metadata = await sharp(Buffer.from(dataUri.split(",")[1], "base64")).metadata();
    expect(metadata.width).toBe(1600); expect(metadata.height).toBe(1200);
    const m = proposalFixture(20, "grid");
    for (let i = 0; i < m.photos.length; i++) {
      const varied = await sharp(raw).modulate({ brightness: 1 + i / 40 }).png().toBuffer();
      m.photos[i].dataUri = await proposalImageUri(varied);
    }
    const bytes = await renderProposalDocument(m);
    writeFileSync(`${output}proposal-20-grid.pdf`, bytes);
    writeFileSync(`${output}image-size.json`, JSON.stringify({ photos: 20, width: metadata.width, height: metadata.height, pdfBytes: bytes.length }, null, 2));
    expect(bytes.length).toBeLessThan(25 * 1024 * 1024);
  }, 60_000);
  it("renders selected Visual Scope, palette and schedule before the single acceptance", async () => {
    const m = proposalFixture(1, "grid");
    m.hero = { caption: "Cover", dataUri: image }; m.coverSource = "photo";
    m.visualScope = [{ caption: "Selected rendering", dataUri: image }];
    m.palette = { introText: "Approved intro", groups: [{ label: "Trees", cards: [{ name: "Pine", typeLabel: "Evergreen Tree", dataUri: image }] }] };
    m.schedule = [{ quantity: "2.00", name: "Pine", botanicalName: "Pinus", size: "5 gal" }];
    const bytes = await renderProposalDocument(m);
    writeFileSync(`${output}proposal-populated.pdf`, bytes);
    execFileSync("pdftoppm", ["-scale-to", "900", "-png", `${output}proposal-populated.pdf`, `${output}proposal-populated`]);
    const text = execFileSync("pdftotext", ["-raw", "-", "-"], { input: bytes }).toString();
    const labels = ["Scope of work", "Selected rendering", "Pricing", "Plant palette", "Plant schedule", "Acceptance", "Attachment A: Photos"];
    const positions = labels.map(label => text.indexOf(label));
    expect(positions.every(i => i >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  }, 60_000);
  it("default and explicit zero-cover/last-page stamping agree byte-for-byte on fixed PDF input", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
    const pdf = await PDFDocument.create();
    pdf.setCreationDate(new Date("2026-11-03T00:00:00Z")); pdf.setModificationDate(new Date("2026-11-03T00:00:00Z"));
    pdf.addPage(); pdf.addPage();
    const bytes = Buffer.from(await pdf.save());
    const input = { footerLabel: "Estimate fixture", shortHeaderNumber: "EST-42", draft: true };
    try {
      const result = await stampDocument(bytes, input);
      expect(result).toEqual(await stampDocument(bytes, { ...input, coverPages: 0, endOfDocumentPage: 1 }));
      // Pre-extension renderer, fixed metadata/time and the same two-page fixture.
      expect(createHash("sha256").update(result).digest("hex")).toBe("fd3d9d204536864b2e6b70f1d6527bb4302741b7f495f81bcc863494cd6a7577");
    } finally { vi.useRealTimers(); }
  });
});
