/** Driver-free Estimate Builder request contracts, shared by CRM and API. */
import { z } from "zod/v4";
import { ESTIMATE_UNITS } from "./estimateUnits";
import { companyDocumentEmailInput } from "./companyDocumentContracts";

/** Copy provenance, keyed by IDs from the immediate source version. */
export interface EstimateRevisionIdMap {
  sections: Record<string, string>;
  lines: Record<string, string>;
  photos?: Record<string, string>;
}

export const ESTIMATE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const ESTIMATE_PHOTO_CAPTION_MAX = 500;
/** Operational worksheet snapshot deliberately excludes rates and prices. */
export interface EstimateWorksheetSection {
  name: string;
  lines: { name: string; detail: string | null; quantity: string; unit: string }[];
}

export function estimateHasMultipleVersions(versionCount: number): boolean {
  return versionCount > 1;
}

export function estimatePdfFilename(estimateNumber: string, versionNumber: number, showVersion: boolean): string {
  const number = /^EST-\d{4}-\d+$/.test(estimateNumber) ? estimateNumber : "EST";
  return `${number}${showVersion ? `-v${versionNumber}` : ""}.pdf`;
}

/** Metadata-only estimate for previews. Issued PDFs always use their measured page count. */
export function estimateApproximatePages(version: {
  issuedAttachment?: IssuedEstimateAttachment | null;
  scopeOfWork?: string | null;
  includePlantTable?: boolean;
  photos?: readonly unknown[];
  sections: readonly { lines: readonly { name: string; detail?: string | null; lineType: string; includeInPalette?: boolean }[] }[];
}) {
  if (version.issuedAttachment) return version.issuedAttachment.pageCount;
  const lines = version.sections.flatMap(section => section.lines);
  const scope = version.scopeOfWork?.trim() ?? "";
  const included = lines.filter(line => line.lineType === "plant" && line.includeInPalette).length;
  const wrappedRows = (text: string, chars: number) =>
    text.split(/\r?\n/).reduce((n, row) => n + Math.max(1, Math.ceil(row.length / chars)), 0);
  const bodyRows = 9 + version.sections.length + (scope ? 2 + wrappedRows(scope, 90) : 0)
    + lines.reduce((n, line) => n + wrappedRows(line.name, 38) + (line.detail ? wrappedRows(line.detail, 50) : 0), 0);
  const plantRows = version.includePlantTable !== false && included ? 2 + included * 3 : 0;
  return Math.max(1, Math.ceil((bodyRows + plantRows) / 34)) + 1 + Math.ceil((version.photos?.length ?? 0) / 2);
}
export type { ProposalEstimateSummary } from "./proposalContracts";
import { isCalendarDate } from "./schema/calendarDate";
export { isCalendarDate } from "./schema/calendarDate";

export const ESTIMATE_STATUSES = ["draft", "sent", "accepted", "declined", "superseded", "void"] as const;
/** PDF price-validity promise; no company-level validity setting exists. */
export const ESTIMATE_VALIDITY_DAYS = 30;
/** The send gate and action-list price count must always use the same predicate. */
export function estimateLineNeedsPrice(line: { unitPriceCents: number; priceSource: string }): boolean {
  return line.unitPriceCents === 0 && line.priceSource !== "manual";
}
export const ESTIMATE_LINE_TYPES = ["plant", "hardscape", "irrigation", "labor", "service", "equipment", "fee", "custom"] as const;
export const ESTIMATE_PRICE_SOURCES = ["catalog", "contract", "rate_card", "quick_list", "manual"] as const;
export const ESTIMATE_SENT_METHODS = ["email", "hard_copy", "portal", "other"] as const;
export const ESTIMATE_ACCEPTANCE_METHODS = ["email_approval", "signed_pdf", "phone", "portal", "other"] as const;
export const sendEstimateSchema = z.object({
  method: z.enum(ESTIMATE_SENT_METHODS), confirmZeroPriced: z.boolean().optional(),
}).strict();
const estimateEmailNote = z.string().trim().max(2000).optional();
export const estimateEmailPreviewInput = z.object({
  subject: companyDocumentEmailInput.shape.subject.optional(),
  note: estimateEmailNote,
  mailboxAccountId: companyDocumentEmailInput.shape.mailboxAccountId.optional(),
}).strict();
export const estimateEmailInput = z.object({
  mailboxAccountId: companyDocumentEmailInput.shape.mailboxAccountId,
  to: companyDocumentEmailInput.shape.to,
  cc: companyDocumentEmailInput.shape.cc,
  subject: companyDocumentEmailInput.shape.subject,
  note: estimateEmailNote,
  confirmZeroPriced: z.boolean().optional(),
  originalThread: z.boolean().optional(),
}).strict().refine(input => {
  const recipients = [...input.to, ...(input.cc ?? [])];
  return recipients.length <= 10 && new Set(recipients.map(email => email.toLowerCase())).size === recipients.length;
});
export type EstimateEmailInput = z.infer<typeof estimateEmailInput>;
export interface IssuedEstimateAttachment { filename: string; pageCount: number }
export interface EstimateEmailOptionsDto {
  mailboxes: { id: string; displayName: string; emailAddress: string; accountType: "shared" | "personal" }[];
  defaultMailboxId: string | null;
  recipients: { email: string; name: string }[];
  defaultTo: string | null;
  companyName: string;
  phone: string | null;
}
export type EstimateEmailResult = EstimateDetailDto & { emailed: true };
export const acceptEstimateSchema = z.object({
  method: z.enum(ESTIMATE_ACCEPTANCE_METHODS), poNumber: z.string().trim().max(500).optional(),
  acceptedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate).optional(),
}).strict();
export const estimateReasonSchema = z.object({ reason: z.string().trim().min(1).max(10000) }).strict();
export const emptyEstimateActionSchema = z.object({}).strict();
export const reviseEstimateSchema = z.object({ firstEdit: z.literal(true).optional() }).strict();
export const ESTIMATE_LIST_STATUSES = ["open", "sent", "accepted", "declined", "void"] as const;
export const ESTIMATE_UMBRELLAS = ["plants", "landscape_materials", "irrigation_materials", "landscape_labor", "irrigation_labor", "fees_surcharges"] as const;
export type EstimateUmbrella = typeof ESTIMATE_UMBRELLAS[number];
export const estimateIdSchema = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(500);
const detail = z.string().max(10000).nullable();
const cents = z.number().int().min(0).max(2147483647);
const order = z.number().int().min(-2147483648).max(2147483647);
// Strings are canonical decimal quantities; numeric JSON is accepted only when
// its shortest decimal representation has supported precision. Never round input.
export const estimateQuantitySchema = z.union([z.string(), z.number().finite()])
  .transform(String).refine(v => /^\d{1,10}(?:\.\d{1,2})?$/.test(v) && /[1-9]/.test(v), "Quantity must be positive, numeric(12,2)");
export const createEstimateSchema = z.object({ customerId: estimateIdSchema, title: name, ticketId: estimateIdSchema.optional() }).strict();
export const patchEstimateSchema = z.object({ title: name }).strict();
export interface EstimateWorkLocationInput { label: string | null; details: string | null }
export interface ResolvedWorkLocation {
  text: string | null;
  source: "ticket" | "estimate" | "property";
}
export const ESTIMATE_DISCOUNT_KINDS = ["percent", "amount"] as const;
export type EstimateDiscountKind = typeof ESTIMATE_DISCOUNT_KINDS[number];
export const ESTIMATE_DISCOUNT_LABEL_MAX = 80;
/** Exact hundredths of a canonical decimal string; the regex already bounds digits. */
const hundredthsOf = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
/** Wire format: decimal strings, converted exactly server-side (percent → basis
 * points, dollars → cents). Label omitted/blank means the default label. */
export const estimateDiscountInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("percent"), value: z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/)
    .refine(v => hundredthsOf(v) >= 1n && hundredthsOf(v) <= 10000n, "Percent must be 0.01–100"),
  label: z.string().max(ESTIMATE_DISCOUNT_LABEL_MAX).nullable().optional() }).strict(),
  z.object({ kind: z.literal("amount"), value: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)
    .refine(v => hundredthsOf(v) >= 1n && hundredthsOf(v) <= 2147483647n, "Amount must be positive"),
  label: z.string().max(ESTIMATE_DISCOUNT_LABEL_MAX).nullable().optional() }).strict(),
]);
export type EstimateDiscountInput = z.input<typeof estimateDiscountInputSchema>;
/** No defaults: an omitted key leaves the stored value untouched; null clears it. */
export const patchEstimateVersionSchema = z.object({
  scopeOfWork: z.string().max(10000).nullable().optional(), includePlantTable: z.boolean().optional(),
  laborDiscount: estimateDiscountInputSchema.nullable().optional(),
  totalDiscount: estimateDiscountInputSchema.nullable().optional(),
}).strict();
export type PatchEstimateVersionInput = z.infer<typeof patchEstimateVersionSchema>;
export const estimatePhotoUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255), mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i).max(100),
  fileSize: z.number().int().positive().max(ESTIMATE_PHOTO_MAX_BYTES),
}).strict();
export const registerEstimatePhotoSchema = z.object({ uploadToken: z.string().min(1).max(4096) }).strict();
export const estimatePhotoCaptionSchema = z.object({ caption: z.string().max(ESTIMATE_PHOTO_CAPTION_MAX).nullable() }).strict();
export const estimatePhotoOrderSchema = z.object({ photoIds: z.array(estimateIdSchema).min(1) }).strict();
export const createEstimateSectionSchema = z.object({ name }).strict();
export const patchEstimateSectionSchema = z.object({ name: name.optional(), sortOrder: order.optional() }).strict();
const base = { sectionId: estimateIdSchema, quantity: estimateQuantitySchema };
const free = { name, detail: detail.optional(), unit: z.enum(ESTIMATE_UNITS), unitPriceCents: cents, umbrellaKey: z.enum(ESTIMATE_UMBRELLAS) };
export const saveToCatalogSchema = z.discriminatedUnion("catalog", [
  z.object({ catalog: z.literal("hardscape") }).strict(),
  z.object({ catalog: z.literal("equipment") }).strict(),
  z.object({ catalog: z.literal("fee") }).strict(),
  z.object({ catalog: z.literal("service"), serviceCategoryId: estimateIdSchema }).strict(),
]);
export const catalogMatchesQuerySchema = z.object({
  catalog: z.enum(["hardscape", "equipment", "fee", "service"]),
  name: z.string().trim().min(3).max(500),
  serviceCategoryId: estimateIdSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.catalog === "service") !== !!value.serviceCategoryId)
    ctx.addIssue({ code: "custom", path: ["serviceCategoryId"], message: "Only services require a category" });
});
export type CatalogMatchesQuery = z.infer<typeof catalogMatchesQuerySchema>;
export interface CatalogMatchDto {
  id: string; name: string; unit: string; priceCents: number | null; categoryName: string | null;
  umbrellaKey?: EstimateUmbrella; unitCostCents?: number | null; detail?: string | null;
}
// Equipment/fee use an exclusive reference-or-free-entry union inside each
// discriminator branch: a reference plus a client price must never be accepted.
const quickOrFree = z.union([
  z.object({ quickItemId: estimateIdSchema }).strict(),
  z.object(free).strict(),
]);
const quickBranch = (lineType: "equipment" | "fee" | "service") => z.object({
  ...base, lineType: z.literal(lineType), quickItemId: estimateIdSchema.optional(),
  name: name.optional(), detail: detail.optional(), unit: free.unit.optional(),
  unitPriceCents: cents.optional(), umbrellaKey: z.enum(ESTIMATE_UMBRELLAS).optional(),
}).strict().superRefine((v, ctx) => {
  const { sectionId: _s, quantity: _q, lineType: _t, ...entry } = v;
  if (!quickOrFree.safeParse(entry).success) ctx.addIssue({ code: "custom", message: "Provide quickItemId OR complete free-entry fields" });
});
export const createEstimateLineSchema = z.discriminatedUnion("lineType", [
  z.object({ ...base, lineType: z.literal("plant"), plantCatalogItemId: estimateIdSchema }).strict(),
  z.object({ ...base, lineType: z.literal("hardscape"), hardscapeCatalogItemId: estimateIdSchema }).strict(),
  z.object({ ...base, lineType: z.literal("irrigation"), irrigationCatalogItemId: estimateIdSchema }).strict(),
  z.object({ ...base, lineType: z.literal("labor"), rateKey: name }).strict(),
  quickBranch("service"), quickBranch("equipment"), quickBranch("fee"),
  z.object({ ...base, lineType: z.literal("custom"), ...free, saveToCatalog: saveToCatalogSchema.optional() }).strict(),
]);
const catalogReferences = {
  plant: z.object({ lineType: z.literal("plant"), plantCatalogItemId: estimateIdSchema }).strict(),
  hardscape: z.object({ lineType: z.literal("hardscape"), hardscapeCatalogItemId: estimateIdSchema }).strict(),
  irrigation: z.object({ lineType: z.literal("irrigation"), irrigationCatalogItemId: estimateIdSchema }).strict(),
  labor: z.object({ lineType: z.literal("labor"), rateKey: name }).strict(),
  service: z.object({ lineType: z.literal("service"), quickItemId: estimateIdSchema }).strict(),
  equipment: z.object({ lineType: z.literal("equipment"), quickItemId: estimateIdSchema }).strict(),
  fee: z.object({ lineType: z.literal("fee"), quickItemId: estimateIdSchema }).strict(),
};
export const estimateCatalogReferenceSchema = z.discriminatedUnion("lineType", [
  catalogReferences.plant, catalogReferences.hardscape, catalogReferences.irrigation, catalogReferences.labor,
  catalogReferences.service, catalogReferences.equipment, catalogReferences.fee,
]);
const keepPrice = { keepPrice: z.boolean().optional(), priceOnly: z.literal(true).optional() };
export const replaceEstimateLineSchema = z.discriminatedUnion("lineType", [
  catalogReferences.plant.extend(keepPrice),
  catalogReferences.hardscape.extend(keepPrice),
  catalogReferences.irrigation.extend(keepPrice),
  catalogReferences.labor.extend(keepPrice),
  catalogReferences.service.extend(keepPrice),
  catalogReferences.equipment.extend(keepPrice),
  catalogReferences.fee.extend(keepPrice),
]);
export const estimateOrderSchema = z.object({
  sections: z.array(z.object({ id: estimateIdSchema, lineIds: z.array(estimateIdSchema) }).strict()).min(1),
}).strict();
export type EstimateCatalogReference = z.infer<typeof estimateCatalogReferenceSchema>;
export type ReplaceEstimateLineInput = z.infer<typeof replaceEstimateLineSchema>;
export type EstimateOrderInput = z.infer<typeof estimateOrderSchema>;

/** Quick-list references are catalog lines; free-entry rows of the same types are not. */
export function estimateCatalogReference(line: {
  lineType: typeof ESTIMATE_LINE_TYPES[number]; plantCatalogItemId: string | null; hardscapeCatalogItemId: string | null;
  irrigationCatalogItemId: string | null; rateKey: string | null; quickItemId: string | null;
}): EstimateCatalogReference | null {
  const { lineType, plantCatalogItemId, hardscapeCatalogItemId, irrigationCatalogItemId, rateKey, quickItemId } = line;
  switch (lineType) {
    case "plant": return plantCatalogItemId ? { lineType, plantCatalogItemId } : null;
    case "hardscape": return hardscapeCatalogItemId ? { lineType, hardscapeCatalogItemId } : null;
    case "irrigation": return irrigationCatalogItemId ? { lineType, irrigationCatalogItemId } : null;
    case "labor": return rateKey ? { lineType, rateKey } : null;
    case "service": case "equipment": case "fee": return quickItemId ? { lineType, quickItemId } : null;
    default: return null;
  }
}
export function matchesEstimateCatalogReference(line: Parameters<typeof estimateCatalogReference>[0], reference: EstimateCatalogReference) {
  const current = estimateCatalogReference(line);
  return !!current && Object.entries(current).every(([field, value]) => (reference as Record<string, unknown>)[field] === value);
}
// Explicit PATCH fields have NO defaults. Null is a real clear operation.
export const patchEstimateLineSchema = z.object({
  quantity: estimateQuantitySchema.optional(), unitPriceCents: cents.optional(),
  name: name.optional(), detail: detail.optional(), unit: free.unit.optional(),
  umbrellaKey: z.enum(ESTIMATE_UMBRELLAS).optional(),
  includeInPalette: z.boolean().optional(), paletteTypeLabel: z.string().max(500).nullable().optional(),
  sectionId: estimateIdSchema.optional(), sortOrder: order.optional(),
}).strict();
export const estimateListQuerySchema = z.object({
  customerId: estimateIdSchema.optional(), ticketId: estimateIdSchema.optional(),
  search: z.string().max(500).optional(), includeVoid: z.enum(["true", "false"]).optional(),
  status: z.enum(ESTIMATE_LIST_STATUSES).optional(),
}).strict();
export const estimateDetailQuerySchema = z.object({
  version: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2147483647)).optional(),
}).strict();
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;
export type CreateEstimateLineInput = z.infer<typeof createEstimateLineSchema>;
export type PatchEstimateLineInput = z.infer<typeof patchEstimateLineSchema>;

// Explicit JSON response contracts: dates are ISO strings on the wire. These do
// not depend on Drizzle's frontend stub or import PostgreSQL/driver modules.
export interface EstimateTimestampsDto { createdAt: string; updatedAt: string }
export interface EstimateContainerDto extends EstimateTimestampsDto {
  id: string; companyId: string; customerId: string; ticketId: string | null;
  estimateNumber: string; title: string; currentVersionId: string | null;
  voidedAt: string | null; voidReason: string | null; createdById: string | null;
}
export interface EstimateLineDto extends EstimateTimestampsDto {
  id: string; companyId: string; versionId: string; sectionId: string;
  lineType: typeof ESTIMATE_LINE_TYPES[number]; priceSource: typeof ESTIMATE_PRICE_SOURCES[number];
  plantCatalogItemId: string | null; hardscapeCatalogItemId: string | null;
  irrigationCatalogItemId: string | null; quickItemId: string | null; rateKey: string | null; termId: string | null;
  name: string; detail: string | null; unit: string; quantity: string;
  unitPriceCents: number; unitCostCents: number | null; extendedCents: number;
  umbrellaKey: EstimateUmbrella; includeInPalette: boolean; paletteTypeLabel: string | null; sortOrder: number; needsPrice: boolean;
}
export interface EstimateSectionDto extends EstimateTimestampsDto {
  id: string; companyId: string; versionId: string; name: string; sortOrder: number; lines: EstimateLineDto[];
}
export interface EstimateTotalsDto {
  /** Gross line subtotal (before discounts). */
  subtotalCents: number; costKnownCents: number; costUnknownLines: number;
  /** Net known-cost margin, after discount allocation. */
  materialMarginPct: number | null; materialMarginGrossPct: number | null;
  byUmbrella: Record<EstimateUmbrella, number>; bySection: Record<string, number>;
  byUmbrellaNet: Record<EstimateUmbrella, number>; bySectionNet: Record<string, number>;
  laborBaseCents: number; laborDiscountCents: number; totalDiscountCents: number;
  /** Customer-facing total: frozen for non-drafts (legacy versions: frozen subtotal). */
  totalCents: number;
  laborDiscountCapped: boolean; totalDiscountCapped: boolean; laborDiscountNoLaborLines: boolean;
}
/** Version-owned discount settings, as stored (basis points or cents). */
export interface EstimateVersionDiscountFields {
  laborDiscountKind: EstimateDiscountKind | null; laborDiscountValue: number | null; laborDiscountLabel: string | null;
  totalDiscountKind: EstimateDiscountKind | null; totalDiscountValue: number | null; totalDiscountLabel: string | null;
}
export const DEFAULT_LABOR_DISCOUNT_LABEL = "Labor discount";
export const DEFAULT_TOTAL_DISCOUNT_LABEL = "Discount";
export interface EstimateVersionSummaryDto extends EstimateTimestampsDto {
  id: string; versionNumber: number; status: typeof ESTIMATE_STATUSES[number];
  createdFromVersionId?: string | null;
  sentAt?: string | null; sentById?: string | null; sentMethod?: typeof ESTIMATE_SENT_METHODS[number] | null;
  issuedAttachment?: IssuedEstimateAttachment;
  emailedTo?: string[];
  emailedFrom?: { name: string | null; address: string };
  emailDelivery?: "sending" | "delivered" | "uncertain";
  acceptedAt?: string | null; acceptedOn?: string | null; acceptedById?: string | null;
  acceptanceMethod?: typeof ESTIMATE_ACCEPTANCE_METHODS[number] | null; poNumber?: string | null;
  declinedAt?: string | null; declinedById?: string | null; declineReason?: string | null;
  supersededAt?: string | null;
  frozenSubtotalCents?: number | null; frozenCostKnownCents?: number | null; frozenCostUnknownLines?: number | null;
  frozenLaborDiscountCents?: number | null; frozenTotalDiscountCents?: number | null; frozenTotalCents?: number | null;
}
export interface EstimateVersionDto extends EstimateVersionSummaryDto, EstimateVersionDiscountFields {
  scopeOfWork: string | null;
  includePlantTable: boolean;
  photos: EstimatePhotoDto[];
  /** Live display-only catalog defaults, never part of captured commercial line values. */
  plantPaletteDefaults?: Record<string, string>;
  companyId: string; estimateId: string; createdFromVersionId: string | null;
  sentAt: string | null; sentById: string | null; sentMethod: typeof ESTIMATE_SENT_METHODS[number] | null;
  acceptedAt: string | null; acceptedById: string | null; acceptanceMethod: typeof ESTIMATE_ACCEPTANCE_METHODS[number] | null;
  acceptedOn: string | null;
  poNumber: string | null; declinedAt: string | null; declinedById: string | null; declineReason: string | null;
  supersededAt: string | null; frozenSubtotalCents: number | null; frozenCostKnownCents: number | null;
  frozenCostUnknownLines: number | null; createdById: string | null;
  frozenLaborDiscountCents: number | null; frozenTotalDiscountCents: number | null; frozenTotalCents: number | null;
  sections: EstimateSectionDto[]; totals: EstimateTotalsDto;
}
export interface EstimatePhotoDto {
  id: string; filename: string; mimeType: string; fileSize: number;
  caption: string | null; displayOrder: number; createdAt: string;
}
/** Every mutation and detail read uses this envelope; version is affected/current. */
export interface EstimateDetailDto extends EstimateContainerDto {
  versions: EstimateVersionSummaryDto[]; version: EstimateVersionDto;
  /** Present when a line mutation inserts a new row, for optimistic identity reconciliation. */
  affectedLineId?: string;
  display?: {
    companyName: string; customerName: string; customerAddress: string; createdByName: string | null;
    workLocation?: string | null;
    workLocationSource?: ResolvedWorkLocation["source"];
    workLocationInput?: EstimateWorkLocationInput;
    propertyAddressLines?: string;
    ticket: { id: string; title: string; shortId: string; status: {
      name: string; statusKey: string | null; actionType: "needs_action" | "waiting"; isFinal: "true" | "false";
    } | null } | null;
  };
}
export interface EstimateListItemDto extends EstimateContainerDto {
  customerName: string; currentVersionNumber: number | null;
  currentVersionStatus: typeof ESTIMATE_STATUSES[number] | null;
  /** Gross line subtotal. Display totalCents (after discounts) to customers and staff. */
  subtotalCents: number | null; totalCents: number | null;
  versions?: EstimateVersionSummaryDto[];
}
/** Lightweight ticket reference, with history for state-derived ticket recovery. */
export interface EstimateTicketSummaryDto extends EstimateContainerDto {
  versions: EstimateVersionSummaryDto[];
  version: Pick<EstimateVersionDto, "id" | "versionNumber" | "status">;
  /** Gross line subtotal; totalCents is the discounted customer-facing total. */
  subtotalCents: number | null; totalCents: number | null;
}
export interface EstimateBoardSummaryDto {
  id: string; number: string; versionNumber: number;
  status: typeof ESTIMATE_STATUSES[number]; subtotalCents: number | null; totalCents: number | null;
  versionId: string; sentAt: string | null; acceptedAt: string | null; validUntil: string | null;
  draftEditedAt: string | null; linesNeedingPrice: number; lineCount: number;
}
export type EstimateActionBucket = "follow_up" | "decide" | "send" | "finish" | "start" | "waiting" | "won";
export interface EstimateActionMessage { key: string; params?: Record<string, string | number> }
export interface EstimateNextAction {
  bucket: EstimateActionBucket; urgency: "red" | "amber" | null;
  reason: EstimateActionMessage; detail?: EstimateActionMessage | null;
}
export interface EstimateActionTicket {
  id: string; title: string; typeKey: string; statusKey: string; statusName: string;
  customer: { id: string; name: string } | null; assignee: { id: string; name: string } | null;
  owner: { sectionKey: "scheduling" | "invoicing"; label: string; href: string } | null;
  priority: string; estimateNumber: string | null; daysInStage: number;
  followUpDate: string | null; followUpNote: string | null;
  estimate: EstimateBoardSummaryDto | null; nextAction: EstimateNextAction;
}

/** Browser-safe population and ordering only; nextAction classification stays server-owned. */
export const ACTION_BUCKETS = ["follow_up", "decide", "send", "finish", "start"] as const;
export type ActionBucket = typeof ACTION_BUCKETS[number];
export const isAction = (bucket: EstimateActionBucket): bucket is ActionBucket =>
  (ACTION_BUCKETS as readonly string[]).includes(bucket);

type ActionRow = { id: string; daysInStage: number; nextAction: EstimateNextAction; estimate?: { acceptedAt: string | null } | null };
export function flattenActionBoard<T extends { id: string; nextAction?: EstimateNextAction }>(
  data: { stages: { tickets: T[] }[] } | undefined,
): (T & { nextAction: EstimateNextAction })[] {
  const seen = new Set<string>();
  const out: (T & { nextAction: EstimateNextAction })[] = [];
  for (const stage of data?.stages ?? []) for (const ticket of stage.tickets) {
    if (!ticket.nextAction || seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    out.push({ ...ticket, nextAction: ticket.nextAction });
  }
  return out;
}

const urgencyRank = (u: EstimateNextAction["urgency"]) => u === "red" ? 0 : u === "amber" ? 1 : 2;
const groupRank = (b: EstimateActionBucket) => isAction(b) ? 0 : b === "waiting" ? 1 : 2;
const bucketRank = (b: EstimateActionBucket) => isAction(b) ? ACTION_BUCKETS.indexOf(b) : 9;
const acceptedMs = (t: ActionRow) => { const v = t.estimate?.acceptedAt ? Date.parse(t.estimate.acceptedAt) : NaN; return Number.isNaN(v) ? 0 : v; };

/** Red, amber, none; bucket order; descending stage age; ID. Waiting then won follow. */
export function compareRows(a: ActionRow, b: ActionRow): number {
  const ga = groupRank(a.nextAction.bucket), gb = groupRank(b.nextAction.bucket);
  if (ga !== gb) return ga - gb;
  if (ga === 2) return acceptedMs(b) - acceptedMs(a) || a.id.localeCompare(b.id);
  return urgencyRank(a.nextAction.urgency) - urgencyRank(b.nextAction.urgency)
    || bucketRank(a.nextAction.bucket) - bucketRank(b.nextAction.bucket)
    || b.daysInStage - a.daysInStage || a.id.localeCompare(b.id);
}
