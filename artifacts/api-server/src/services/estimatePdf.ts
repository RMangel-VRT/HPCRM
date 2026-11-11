import { and, eq } from "drizzle-orm";
import { estimates, estimateVersions } from "@workspace/db";
import type { EstimateDetailDto } from "@workspace/db/estimate-contracts";
import { db } from "../db";
import { estimatePayload } from "./estimateReads";
import { requireEstimate } from "./estimateErrors";
import { calculateExtendedCents } from "./estimateMath";
import { documentSettingsModel, type DocumentSettings } from "@workspace/db/document-contracts";
import { readDocumentSettings } from "./documentSettings";
import { renderDocumentPdf } from "./documents/render";
import { estimateDocumentHtml } from "./documents/estimate";
import { categoryLabel } from "./documents/categories";

type DateValue = Date | string;
type Display = NonNullable<EstimateDetailDto["display"]>;
interface DocumentInput {
  estimateNumber: string; title: string;
  version: {
    versionNumber: number; status: string; sentAt: DateValue | null;
    acceptedOn: string | null; poNumber: string | null;
    frozenSubtotalCents: number | null; scopeOfWork?: string | null;
    totals: { subtotalCents: number; bySection: Record<string, number> };
    sections: {
      id: string; name: string; sortOrder: number;
      lines: { name: string; detail: string | null; quantity: string; unit: string; unitPriceCents: number; sortOrder: number; lineType?: string; umbrellaKey?: string }[];
    }[];
  };
}
export interface EstimateDocumentModel {
  scopeOfWork: string | null; hasPlants: boolean;
  companyName: string; estimateNumber: string; versionNumber: number; documentDate: string;
  status: string; statusLine: string; draft: boolean;
  customerName: string; customerAddress: string; projectTitle: string; linkedTicketTitle: string | null;
  sections: { name: string; lines: { name: string; detail: string | null; quantity: string; unit: string; unitPriceCents: number; lineTotalCents: number }[]; subtotalCents: number }[];
  totalCents: number;
  terms: null; // Reserved for future approved terms, not invented legal text.
  categorySummary: { label: string; cents: number }[];
  companyDocument: DocumentSettings;
  workLocation: string | null;
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
export function buildEstimateDocumentModel(payload: DocumentInput, display: Display & { workLocation?: string | null }, coloradoDocumentDate: string, companyDocument?: Partial<DocumentSettings>): EstimateDocumentModel {
  const v = payload.version;
  const draft = v.status === "draft";
  const date = draft || !v.sentAt ? documentDate(coloradoDocumentDate) : coloradoDate(new Date(v.sentAt));
  const statusLine = draft ? "DRAFT — not sent"
    : v.status === "accepted" ? `Accepted ${prettyDate(requireEstimate(v.acceptedOn))}${v.poNumber ? ` · PO ${v.poNumber}` : ""}`
    : v.status.charAt(0).toUpperCase() + v.status.slice(1);
  const total = draft ? v.totals.subtotalCents : requireEstimate(v.frozenSubtotalCents);
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

/** Estimates have exactly one design. Renderer unavailability is handled by the route. */
export async function renderEstimateDocument(model: EstimateDocumentModel): Promise<Buffer> {
  return renderDocumentPdf({
    html: estimateDocumentHtml(model),
    footerLabel: `Estimate ${model.estimateNumber}, version ${model.versionNumber} · ${model.customerName}`,
    shortHeaderNumber: `${model.estimateNumber} · Version ${model.versionNumber}`, draft: model.draft,
  });
}

/** Scoped, reusable Phase 4 entry point. No HTTP dependency or catalog re-resolution. */
export async function loadEstimateDocumentModel(companyId: string, estimateId: string, versionId: string): Promise<EstimateDocumentModel> {
  const model = await db.transaction(async tx => {
    const estimate = requireEstimate((await tx.select().from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.id, estimateId))))[0]);
    const version = requireEstimate((await tx.select().from(estimateVersions).where(and(
      eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimate.id), eq(estimateVersions.id, versionId),
    )))[0]);
    const payload = await estimatePayload(tx, companyId, estimate, version.versionNumber);
    const companyDocument = await readDocumentSettings(companyId, tx);
    return buildEstimateDocumentModel(payload, payload.display, coloradoDate(new Date()), companyDocument);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  return model;
}
export async function renderEstimatePdf(companyId: string, estimateId: string, versionId: string): Promise<Buffer> {
  return renderEstimateDocument(await loadEstimateDocumentModel(companyId, estimateId, versionId));
}
