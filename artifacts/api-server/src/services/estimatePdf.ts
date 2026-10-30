import PDFDocument from "pdfkit";
import { and, eq } from "drizzle-orm";
import { estimates, estimateVersions } from "@workspace/db";
import type { EstimateDetailDto } from "@workspace/db/estimate-contracts";
import { db } from "../db";
import { BRAND, LM, RM, loadBrandLogo, wirePageDecorations } from "../lib/pdfBrand";
import { estimatePayload } from "./estimateReads";
import { requireEstimate } from "./estimateErrors";
import { calculateExtendedCents } from "./estimateMath";

type DateValue = Date | string;
type Display = NonNullable<EstimateDetailDto["display"]>;
interface DocumentInput {
  estimateNumber: string; title: string;
  version: {
    versionNumber: number; status: string; sentAt: DateValue | null;
    acceptedOn: string | null; poNumber: string | null;
    frozenSubtotalCents: number | null;
    totals: { subtotalCents: number; bySection: Record<string, number> };
    sections: {
      id: string; name: string; sortOrder: number;
      lines: { name: string; detail: string | null; quantity: string; unit: string; unitPriceCents: number; sortOrder: number; lineType?: string }[];
    }[];
  };
}
export interface EstimateDocumentModel {
  companyName: string; estimateNumber: string; versionNumber: number; documentDate: string;
  status: string; statusLine: string; draft: boolean;
  customerName: string; customerAddress: string; projectTitle: string; linkedTicketTitle: string | null;
  sections: { name: string; lines: { name: string; detail: string | null; quantity: string; unit: string; unitPriceCents: number; lineTotalCents: number }[]; subtotalCents: number }[];
  totalCents: number;
  terms: null; // Reserved for future approved terms, not invented legal text.
}

/** Calendar date in Colorado; clock is supplied by the orchestration layer, never the model. */
export function coloradoDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function documentDate(value: string): string {
  const d = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new Error("INVALID_DOCUMENT_DATE");
  }
  return value;
}
function prettyDate(value: string) {
  return new Date(`${documentDate(value)}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
}

/** Material snapshots own a known "category · SKU" detail format. Remove that
 * SKU segment, not product names in the name field. Other line types only lose
 * explicitly labeled SKU segments: ambiguous codes may be real model names/sizes.
 */
export function customerSafeDetail(detail: string | null, lineType?: string): string | null {
  if (!detail) return null;
  let parts = detail.split(/\s+·\s+/);
  if ((lineType === "hardscape" || lineType === "irrigation") && parts.length === 2) parts = parts.slice(0, 1);
  return parts.filter(part => !/^SKU\s*[:#]\s*\S+$/i.test(part)).join(" · ").trim() || null;
}

/** Explicit allowlist: no spreads from internal records, no I/O, no implicit clock.
 * Resolved metadata and today's Colorado calendar components are required inputs.
 */
export function buildEstimateDocumentModel(payload: DocumentInput, display: Display, coloradoDocumentDate: string): EstimateDocumentModel {
  const v = payload.version;
  const draft = v.status === "draft";
  const date = draft || !v.sentAt ? documentDate(coloradoDocumentDate) : coloradoDate(new Date(v.sentAt));
  const statusLine = draft ? "DRAFT — not sent"
    : v.status === "accepted" ? `Accepted ${prettyDate(requireEstimate(v.acceptedOn))}${v.poNumber ? ` · PO ${v.poNumber}` : ""}`
    : v.status.charAt(0).toUpperCase() + v.status.slice(1);
  const total = draft ? v.totals.subtotalCents : requireEstimate(v.frozenSubtotalCents);
  return {
    companyName: display.companyName, estimateNumber: payload.estimateNumber, versionNumber: v.versionNumber,
    documentDate: date, status: v.status, statusLine, draft,
    customerName: display.customerName, customerAddress: display.customerAddress, projectTitle: payload.title,
    linkedTicketTitle: display.ticket?.title && display.ticket.title !== payload.title ? display.ticket.title : null,
    sections: [...v.sections].sort((a, b) => a.sortOrder - b.sortOrder).map(section => ({
      name: section.name,
      lines: [...section.lines].sort((a, b) => a.sortOrder - b.sortOrder).map(line => ({
        name: line.name, detail: customerSafeDetail(line.detail, line.lineType), quantity: line.quantity, unit: line.unit,
        unitPriceCents: line.unitPriceCents, lineTotalCents: calculateExtendedCents(line.quantity, line.unitPriceCents),
      })),
      subtotalCents: requireEstimate(v.totals.bySection[section.id]),
    })),
    totalCents: total, terms: null,
  };
}

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Render-only entry point for deterministic fixtures and future attachments. */
export async function renderEstimateDocument(model: EstimateDocumentModel): Promise<Buffer> {
  const logo = await loadBrandLogo({ searchParents: true });
  if (!logo) throw new Error("ESTIMATE_LOGO_UNAVAILABLE");
  const doc = new PDFDocument({ size: "LETTER", margins: { top: LM, bottom: LM, left: LM, right: RM } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  try {
    wirePageDecorations(doc, model.companyName, { draft: model.draft });
    const width = doc.page.width - LM - RM;
    const bottom = doc.page.height - LM - 12;
    if (logo) { doc.image(logo, LM, LM, { fit: [150, 75] }); doc.y = LM + 88; }
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(24).text("ESTIMATE", LM, doc.y);
    doc.font("Helvetica").fontSize(10).fillColor("#333333")
      .text(`${model.estimateNumber}  ·  v${model.versionNumber}  ·  ${prettyDate(model.documentDate)}`, LM, doc.y + 7, { width })
      .text(model.statusLine, LM, doc.y + 5, { width });
    doc.moveDown();
    doc.font("Helvetica-Bold").text(model.customerName, LM, doc.y, { width });
    if (model.customerAddress) doc.font("Helvetica").text(model.customerAddress, LM, doc.y + 3, { width });
    doc.font("Helvetica-Bold").text(model.projectTitle, LM, doc.y + 12, { width });
    if (model.linkedTicketTitle) doc.font("Helvetica").text(model.linkedTicketTitle, LM, doc.y + 4, { width });
    doc.y += 18;
    const starts = [LM, LM + 250, LM + 315, LM + 385];
    const widths = [242, 57, 62, width - 385];
    const tableHeader = (sectionName: string, continued = false) => {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND).text(sectionName + (continued ? " (continued)" : ""), LM, doc.y, { width });
      const y = doc.y + 8;
      doc.save().rect(LM, y - 4, width, 22).fill("#edf3ed").restore();
      doc.fontSize(9).fillColor("#333333");
      ["Description", "Qty / unit", "Unit price", "Amount"].forEach((text, i) => doc.text(text, starts[i], y, { width: widths[i], align: i ? "right" : "left", lineBreak: false }));
      doc.y = y + 26;
    };
    const newTablePage = (name: string) => { doc.addPage(); tableHeader(name, true); };
    // Explicit wrapping permits even a single unusually long description to span pages safely.
    const wrap = (text: string, w: number): string[] => {
      const lines: string[] = [];
      for (const paragraph of text.split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
          if (doc.widthOfString(line ? `${line} ${word}` : word) <= w) line = line ? `${line} ${word}` : word;
          else {
            if (line) lines.push(line);
            line = "";
            for (const char of word) {
              if (doc.widthOfString(line + char) > w) { lines.push(line); line = ""; }
              line += char;
            }
          }
        }
        lines.push(line);
      }
      return lines;
    };
    for (const section of model.sections) {
      if (doc.y + 85 > bottom) doc.addPage();
      tableHeader(section.name);
      for (const line of section.lines) {
        doc.font("Helvetica").fontSize(9).fillColor("#222222");
        const cells = [
          `${line.name}${line.detail ? `\n${line.detail}` : ""}`,
          `${line.quantity} ${line.unit}`, money(line.unitPriceCents), money(line.lineTotalCents),
        ].map((text, i) => wrap(text, widths[i]));
        let offset = 0;
        const count = Math.max(...cells.map(c => c.length));
        while (offset < count) {
          if (doc.y + 26 > bottom) newTablePage(section.name);
          doc.font("Helvetica").fontSize(9).fillColor("#222222");
          const available = Math.max(1, Math.floor((bottom - doc.y - 10) / 12));
          const take = Math.min(count - offset, available);
          const y = doc.y;
          cells.forEach((cell, i) => cell.slice(offset, offset + take).forEach((text, n) => {
            doc.text(text, starts[i], y + n * 12, { width: widths[i], align: i ? "right" : "left", lineBreak: false });
          }));
          doc.y = y + take * 12 + 10;
          offset += take;
        }
        doc.moveTo(LM, doc.y - 4).lineTo(LM + width, doc.y - 4).lineWidth(0.3).strokeColor("#dddddd").stroke();
      }
      if (doc.y + 30 > bottom) newTablePage(section.name);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333")
        .text(`Subtotal  ${money(section.subtotalCents)}`, LM, doc.y + 4, { width, align: "right" });
      doc.y += 22;
    }
    if (doc.y + 45 > bottom) doc.addPage();
    doc.moveTo(LM, doc.y).lineTo(LM + width, doc.y).lineWidth(1).strokeColor(BRAND).stroke();
    doc.font("Helvetica-Bold").fontSize(16).fillColor(BRAND).text(`TOTAL  ${money(model.totalCents)}`, LM, doc.y + 12, { width, align: "right" });
    doc.end();
  } catch (error) { doc.destroy(); throw error; }
  return done;
}

/** Scoped, reusable Phase 4 entry point. No HTTP dependency or catalog re-resolution. */
export async function renderEstimatePdf(companyId: string, estimateId: string, versionId: string): Promise<Buffer> {
  const model = await db.transaction(async tx => {
    const estimate = requireEstimate((await tx.select().from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.id, estimateId))))[0]);
    const version = requireEstimate((await tx.select().from(estimateVersions).where(and(
      eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimate.id), eq(estimateVersions.id, versionId),
    )))[0]);
    const payload = await estimatePayload(tx, companyId, estimate, version.versionNumber);
    return buildEstimateDocumentModel(payload, payload.display, coloradoDate(new Date()));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  return renderEstimateDocument(model);
}
