import type PDFKit from "pdfkit";
import { promises as fs } from "node:fs";
import path from "node:path";

export const LM = 72;
export const RM = 72;
export const BRAND = "#1a4d1a";
type Document = InstanceType<typeof PDFKit>;
export interface BodyFontState { font: string; size: number; color: string }

export async function loadBrandLogo(options: { searchParents?: boolean } = {}): Promise<Buffer | null> {
  let directory = process.cwd();
  for (;;) {
    try { return await fs.readFile(path.join(directory, "attached_assets", "NEW - LOGO-03_1763582979034.png")); }
    catch {
      const parent = path.dirname(directory);
      // Proposal keeps its existing working-directory-only optional-logo behavior.
      // New estimate PDFs must also find the workspace asset when run from an artifact.
      if (!options.searchParents || parent === directory) return null;
      directory = parent;
    }
  }
}

export function drawWatermark(d: Document) {
  const W = d.page.width;
  const H = d.page.height;
  d.save();
  d.opacity(0.05);
  d.fillColor("#6aaa6a");
  d.moveTo(0, H * 0.55)
    .bezierCurveTo(W * 0.20, H * 0.35, W * 0.40, H * 0.42, W * 0.55, H * 0.38)
    .bezierCurveTo(W * 0.70, H * 0.34, W * 0.85, H * 0.44, W, H * 0.50)
    .lineTo(W, H).lineTo(0, H).closePath().fill();
  d.fillColor("#3d7a3d");
  d.moveTo(0, H * 0.65)
    .bezierCurveTo(W * 0.15, H * 0.50, W * 0.32, H * 0.57, W * 0.50, H * 0.52)
    .bezierCurveTo(W * 0.68, H * 0.47, W * 0.82, H * 0.55, W, H * 0.62)
    .lineTo(W, H).lineTo(0, H).closePath().fill();
  d.fillColor("#1a4d1a");
  d.moveTo(0, H * 0.76)
    .bezierCurveTo(W * 0.18, H * 0.64, W * 0.36, H * 0.70, W * 0.52, H * 0.66)
    .bezierCurveTo(W * 0.70, H * 0.62, W * 0.86, H * 0.68, W, H * 0.73)
    .lineTo(W, H).lineTo(0, H).closePath().fill();
  d.restore();
}

export function drawFooter(d: Document, pageNum: number, company: string) {
  const W = d.page.width;
  const H = d.page.height;
  const footerY = H - 50;
  d.save();
  const origBottom = d.page.margins.bottom;
  try {
    d.moveTo(LM, footerY - 10).lineTo(W - RM, footerY - 10).strokeColor("#cccccc").lineWidth(0.4).stroke();
    d.page.margins.bottom = 0;
    d.fillColor("#999999").fontSize(8).font("Helvetica")
      .text(company, LM, footerY, { width: W - LM - RM, align: "center" });
    d.fillColor("#bbbbbb").fontSize(7).font("Helvetica")
      .text(`Page ${pageNum}`, LM, footerY + 12, { width: W - LM - RM, align: "center" });
  } finally { d.page.margins.bottom = origBottom; d.restore(); }
}

/** PDFKit graphics save/restore does not restore its text font state.
 * Preserve both cursor axes and restore body state explicitly, including on overflow.
 */
export function wirePageDecorations(d: Document, company: string, options: {
  bodyFont?: () => BodyFontState;
  draft?: boolean;
  firstPageNumber?: number;
} = {}) {
  let page = options.firstPageNumber ?? 1;
  let active = false;
  const decorate = () => {
    if (active) return;
    active = true;
    const x = d.x, y = d.y;
    // Also handles independently rendered proposal exhibits without requiring their callers
    // to track fonts: snapshot the exact current PDFKit font object.
    const internals = d as unknown as { _font: { name: string }; _fontSize: number; _fillColor?: [string, number] };
    const currentFont = internals._font;
    const currentSize = internals._fontSize;
    const currentColor = internals._fillColor;
    try {
      drawWatermark(d);
      if (options.draft) {
        d.save().opacity(0.09).rotate(-35, { origin: [d.page.width / 2, d.page.height / 2] });
        d.font("Helvetica-Bold").fontSize(90).fillColor(BRAND)
          .text("DRAFT", LM, d.page.height / 2 - 45, { width: d.page.width - LM - RM, align: "center", lineBreak: false });
        d.restore();
      }
      drawFooter(d, page, company);
    } finally {
      const body = options.bodyFont?.();
      if (body) d.font(body.font).fontSize(body.size).fillColor(body.color);
      else {
        // Reuse the loaded font object, not its display name (embedded fonts may not be registered).
        (d as unknown as { _font: unknown })._font = currentFont;
        d.fontSize(currentSize);
        if (currentColor) (d as unknown as { _fillColor: unknown })._fillColor = currentColor;
      }
      d.x = x; d.y = y; active = false;
    }
  };
  decorate();
  d.on("pageAdded", () => { if (!active) { page++; decorate(); } });
}
