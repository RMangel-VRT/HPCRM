import { and, eq } from "drizzle-orm";
import { formatEstimateUnit } from "../../../../lib/db/src/estimateUnits";
import { estimates, estimateVersions } from "@workspace/db";
import { estimateHasMultipleVersions, estimatePdfFilename, DEFAULT_LABOR_DISCOUNT_LABEL, DEFAULT_TOTAL_DISCOUNT_LABEL,
  type EstimateDetailDto, type EstimateDiscountKind } from "@workspace/db/estimate-contracts";
import { db } from "../db";
import { estimatePayload, readEstimatePhotoRows, type EstimateConnection } from "./estimateReads";
import { issuedEstimatePdfs } from "./estimateIssuedPdf";
import { requireEstimate } from "./estimateErrors";
import { basisPointsToPercentString, calculateExtendedCents } from "./estimateMath";
import { documentSettingsModel, type DocumentSettings } from "@workspace/db/document-contracts";
import { readDocumentSettings } from "./documentSettings";
import { renderDocumentPdf } from "./documents/render";
import { chromiumPdf } from "./documents/browser";
import { stampDocument } from "./documents/stamp";
import { PDFDocument } from "pdf-lib";
import { ObjectStorageService } from "../objectStorage";
import { loadPlantLinesForVersion } from "./proposalExhibits";
import { proposalPlantRows } from "./proposalPlants";
import { exhibitImageUri } from "./documents/exhibitImage";
import type { EstimateDocumentExhibits } from "./documents/estimateExhibits";
import { estimateDocumentHtml, estimateDocumentNumber } from "./documents/estimate";
import { categoryLabel } from "./documents/categories";

type DateValue = Date | string;
type Display = NonNullable<EstimateDetailDto["display"]>;
interface DocumentInput {
  estimateNumber: string; title: string;
  version: {
    versionNumber: number; status: string; sentAt: DateValue | null;
    acceptedOn: string | null; poNumber: string | null;
    frozenSubtotalCents: number | null; scopeOfWork?: string | null;
    /** Frozen discount amounts; NULL on versions frozen before discounts existed. */
    frozenLaborDiscountCents?: number | null; frozenTotalDiscountCents?: number | null; frozenTotalCents?: number | null;
    laborDiscountKind?: EstimateDiscountKind | null; laborDiscountValue?: number | null; laborDiscountLabel?: string | null;
    totalDiscountKind?: EstimateDiscountKind | null; totalDiscountValue?: number | null; totalDiscountLabel?: string | null;
    totals: { subtotalCents: number; bySection: Record<string, number>; laborDiscountCents?: number; totalDiscountCents?: number; totalCents?: number };
    sections: {
      id: string; name: string; sortOrder: number;
      lines: { name: string; detail: string | null; quantity: string; unit: string; unitPriceCents: number; sortOrder: number; lineType?: string; umbrellaKey?: string }[];
    }[];
  };
}
export interface EstimateDocumentDiscount {
  label: string; kind: EstimateDiscountKind;
  /** "15%" for percent discounts; null for amount discounts. */
  displayValue: string | null; cents: number;
}
/** Live amounts for a draft; frozen amounts otherwise. Zero-amount discounts are omitted. */
function documentDiscounts(v: DocumentInput["version"], draft: boolean): EstimateDocumentDiscount[] {
  const rows = [
    { kind: v.laborDiscountKind, value: v.laborDiscountValue, label: v.laborDiscountLabel || DEFAULT_LABOR_DISCOUNT_LABEL,
      cents: draft ? v.totals.laborDiscountCents ?? 0 : v.frozenLaborDiscountCents ?? 0 },
    { kind: v.totalDiscountKind, value: v.totalDiscountValue, label: v.totalDiscountLabel || DEFAULT_TOTAL_DISCOUNT_LABEL,
      cents: draft ? v.totals.totalDiscountCents ?? 0 : v.frozenTotalDiscountCents ?? 0 },
  ];
  return rows.flatMap(r => r.kind && r.cents > 0 ? [{ label: r.label, kind: r.kind, cents: r.cents,
    displayValue: r.kind === "percent" && r.value != null ? `${basisPointsToPercentString(r.value)}%` : null }] : []);
}
export interface EstimateDocumentModel {
  scopeOfWork: string | null; hasPlants: boolean;
  companyName: string; estimateNumber: string; versionNumber: number; documentDate: string;
  showVersion: boolean;
  status: string; statusLine: string; draft: boolean;
  customerName: string; customerAddress: string; projectTitle: string; linkedTicketTitle: string | null;
  sections: { name: string; lines: { name: string; detail: string | null; quantity: string; unit: string; unitPriceCents: number; lineTotalCents: number }[]; subtotalCents: number }[];
  /** Gross line subtotal; shown only when a discount applies. */
  subtotalCents: number;
  /** Customer-safe applied discounts (cents > 0), labor first. Never costs or allocations. */
  discounts: EstimateDocumentDiscount[];
  /** Customer-facing total after discounts. */
  totalCents: number;
  terms: null; // Reserved for future approved terms, not invented legal text.
  categorySummary: { label: string; cents: number }[];
  companyDocument: DocumentSettings;
  workLocation: string | null;
  exhibits?: EstimateDocumentExhibits;
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
export function buildEstimateDocumentModel(payload: DocumentInput, display: Display & { workLocation?: string | null }, coloradoDocumentDate: string, companyDocument?: Partial<DocumentSettings>, versionCount = 1): EstimateDocumentModel {
  const v = payload.version;
  const draft = v.status === "draft";
  const date = draft || !v.sentAt ? documentDate(coloradoDocumentDate) : coloradoDate(new Date(v.sentAt));
  const statusLine = draft ? ""
    : v.status === "accepted" ? `Accepted ${prettyDate(requireEstimate(v.acceptedOn))}${v.poNumber ? ` · PO ${v.poNumber}` : ""}`
    : v.status.charAt(0).toUpperCase() + v.status.slice(1);
  const subtotal = draft ? v.totals.subtotalCents : requireEstimate(v.frozenSubtotalCents);
  // Legacy frozen versions have no frozen total: their gross subtotal was the price.
  const total = draft ? v.totals.totalCents ?? subtotal : v.frozenTotalCents ?? subtotal;
  const categories = new Map<string, number>();
  for (const section of v.sections) for (const line of section.lines) {
    if (line.umbrellaKey) {
      const label = categoryLabel(line.umbrellaKey);
      categories.set(label, (categories.get(label) ?? 0) + calculateExtendedCents(line.quantity, line.unitPriceCents));
    }
  }
  return {
    scopeOfWork: v.scopeOfWork ?? null,
    hasPlants: v.sections.some(section => section.lines.some(line => line.umbrellaKey === "plants")),
    categorySummary: [...categories].map(([label, cents]) => ({ label, cents })),
    companyDocument: documentSettingsModel(companyDocument), workLocation: display.workLocation ?? null,
    companyName: display.companyName, estimateNumber: payload.estimateNumber, versionNumber: v.versionNumber,
    documentDate: date, status: v.status, statusLine, draft, showVersion: estimateHasMultipleVersions(versionCount),
    customerName: display.customerName, customerAddress: display.customerAddress, projectTitle: payload.title,
    linkedTicketTitle: display.ticket?.title && display.ticket.title !== payload.title ? display.ticket.title : null,
    sections: [...v.sections].sort((a, b) => a.sortOrder - b.sortOrder).map(section => ({
      name: section.name,
      lines: [...section.lines].sort((a, b) => a.sortOrder - b.sortOrder).map(line => ({
        name: line.name, detail: customerSafeDetail(line.detail, line.lineType), quantity: line.quantity, unit: formatEstimateUnit(line.unit),
        unitPriceCents: line.unitPriceCents, lineTotalCents: calculateExtendedCents(line.quantity, line.unitPriceCents),
      })),
      subtotalCents: requireEstimate(v.totals.bySection[section.id]),
    })),
    subtotalCents: subtotal, discounts: documentDiscounts(v, draft), totalCents: total, terms: null,
  };
}

/** Estimates have exactly one design. Renderer unavailability is handled by the route. */
export async function renderEstimateDocument(model: EstimateDocumentModel): Promise<Buffer> {
  const stamp = {
    footerLabel: `Estimate ${model.estimateNumber}${model.showVersion ? `, version ${model.versionNumber}` : ""} · ${model.customerName}`,
    shortHeaderNumber: estimateDocumentNumber(model),
  };
  if (!model.exhibits?.photos.length) return renderDocumentPdf({ ...stamp, html: estimateDocumentHtml(model) });
  const prefix = await chromiumPdf(estimateDocumentHtml(model, false));
  const endOfDocumentPage = (await PDFDocument.load(prefix)).getPageCount() - 1;
  return chromiumPdf(estimateDocumentHtml(model), bytes => stampDocument(bytes, { ...stamp, endOfDocumentPage }));
}

/** Pricing is snapshot-based. Only standalone estimates request the exhibit projection. */
export async function loadEstimateDocumentModel(companyId: string, estimateId: string, versionId: string, withExhibits = false, connection?: EstimateConnection): Promise<EstimateDocumentModel> {
  const load = async (tx: EstimateConnection) => {
    const estimate = requireEstimate((await tx.select().from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.id, estimateId))))[0]);
    const version = requireEstimate((await tx.select().from(estimateVersions).where(and(
      eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimate.id), eq(estimateVersions.id, versionId),
    )))[0]);
    const payload = await estimatePayload(tx, companyId, estimate, version.versionNumber);
    const companyDocument = await readDocumentSettings(companyId, tx);
    return {
      model: buildEstimateDocumentModel(payload, payload.display, coloradoDate(new Date()), companyDocument, payload.versions.length),
      plants: withExhibits && version.includePlantTable
        ? proposalPlantRows((await loadPlantLinesForVersion(companyId, version.id, tx)).filter(line => line.includeInPalette)) : [],
      photos: withExhibits && payload.version.photos.length ? await readEstimatePhotoRows(tx, companyId, version.id) : [],
    };
  };
  const { model, plants, photos } = await (connection ? load(connection) : db.transaction(load, { isolationLevel: "repeatable read", accessMode: "read only" }));
  if (plants.length || photos.length) {
    const store = new ObjectStorageService();
    const thumbnails = new Map<string, string | null>();
    const table: EstimateDocumentExhibits["plants"] = [];
    for (const { imagePath, quantity, name, botanicalName, size } of plants) {
      if (imagePath?.startsWith("/") && !imagePath.startsWith("//") && !thumbnails.has(imagePath)) {
        try {
          const bytes = imagePath.startsWith("/objects/")
            ? (await (await store.getObjectEntityFile(imagePath)).download())[0]
            : await store.downloadByPath(imagePath);
          thumbnails.set(imagePath, await exhibitImageUri(bytes));
        } catch { thumbnails.set(imagePath, null); } // Thumbnails are optional, the plant row is not.
      }
      table.push({ quantity, name, botanicalName, size, dataUri: imagePath ? thumbnails.get(imagePath) ?? null : null });
    }
    const images: EstimateDocumentExhibits["photos"] = [];
    for (const { storageObjectPath, caption } of photos) {
      const file = await store.getObjectEntityFile(storageObjectPath, { allowEstimatePhoto: true });
      const [bytes] = await file.download();
      images.push({ dataUri: `data:image/jpeg;base64,${bytes.toString("base64")}`, caption });
    }
    model.exhibits = { plants: table, photos: images };
  }
  return model;
}
/** Linked proposal attachments preserve the pre-E4 estimate-only rendering. */
export async function renderEstimatePdf(companyId: string, estimateId: string, versionId: string): Promise<Buffer> {
  return renderEstimateDocument(await loadEstimateDocumentModel(companyId, estimateId, versionId));
}
export async function renderEstimatePdfFile(companyId: string, estimateId: string, versionId: string, connection?: EstimateConnection) {
  const [version] = await (connection ?? db).select({ issue: estimateVersions.emailIssue }).from(estimateVersions)
    .where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimateId), eq(estimateVersions.id, versionId)));
  const issue = requireEstimate(version).issue;
  if (issue && issue.firstCommunicationId !== issue.pendingCommunicationId)
    return { pdf: await issuedEstimatePdfs.read(issue.objectId), filename: issue.filename };
  const model = await loadEstimateDocumentModel(companyId, estimateId, versionId, true, connection);
  return {
    pdf: await renderEstimateDocument(model),
    filename: estimatePdfFilename(model.estimateNumber, model.versionNumber, model.showVersion),
  };
}
