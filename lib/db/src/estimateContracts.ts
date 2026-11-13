/** Driver-free Estimate Builder request contracts, shared by CRM and API. */
import { z } from "zod/v4";
import { ESTIMATE_UNITS } from "./estimateUnits";
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
export const acceptEstimateSchema = z.object({
  method: z.enum(ESTIMATE_ACCEPTANCE_METHODS), poNumber: z.string().trim().max(500).optional(),
  acceptedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate).optional(),
}).strict();
export const estimateReasonSchema = z.object({ reason: z.string().trim().min(1).max(10000) }).strict();
export const emptyEstimateActionSchema = z.object({}).strict();
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
export const patchEstimateVersionSchema = z.object({ scopeOfWork: z.string().max(10000).nullable() }).strict();
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
  subtotalCents: number; costKnownCents: number; costUnknownLines: number;
  materialMarginPct: number | null; byUmbrella: Record<EstimateUmbrella, number>; bySection: Record<string, number>;
}
export interface EstimateVersionSummaryDto extends EstimateTimestampsDto {
  id: string; versionNumber: number; status: typeof ESTIMATE_STATUSES[number];
  createdFromVersionId?: string | null;
  sentAt?: string | null; sentById?: string | null; sentMethod?: typeof ESTIMATE_SENT_METHODS[number] | null;
  acceptedAt?: string | null; acceptedOn?: string | null; acceptedById?: string | null;
  acceptanceMethod?: typeof ESTIMATE_ACCEPTANCE_METHODS[number] | null; poNumber?: string | null;
  declinedAt?: string | null; declinedById?: string | null; declineReason?: string | null;
  supersededAt?: string | null;
  frozenSubtotalCents?: number | null; frozenCostKnownCents?: number | null; frozenCostUnknownLines?: number | null;
}
export interface EstimateVersionDto extends EstimateVersionSummaryDto {
  scopeOfWork: string | null;
  /** Live display-only catalog defaults, never part of captured commercial line values. */
  plantPaletteDefaults?: Record<string, string>;
  companyId: string; estimateId: string; createdFromVersionId: string | null;
  sentAt: string | null; sentById: string | null; sentMethod: typeof ESTIMATE_SENT_METHODS[number] | null;
  acceptedAt: string | null; acceptedById: string | null; acceptanceMethod: typeof ESTIMATE_ACCEPTANCE_METHODS[number] | null;
  acceptedOn: string | null;
  poNumber: string | null; declinedAt: string | null; declinedById: string | null; declineReason: string | null;
  supersededAt: string | null; frozenSubtotalCents: number | null; frozenCostKnownCents: number | null;
  frozenCostUnknownLines: number | null; createdById: string | null;
  sections: EstimateSectionDto[]; totals: EstimateTotalsDto;
}
/** Every mutation and detail read uses this envelope; version is affected/current. */
export interface EstimateDetailDto extends EstimateContainerDto {
  versions: EstimateVersionSummaryDto[]; version: EstimateVersionDto;
  display?: {
    companyName: string; customerName: string; customerAddress: string; createdByName: string | null;
    workLocation?: string | null;
    ticket: { id: string; title: string; shortId: string; status: {
      name: string; statusKey: string | null; actionType: "needs_action" | "waiting"; isFinal: "true" | "false";
    } | null } | null;
  };
}
export interface EstimateListItemDto extends EstimateContainerDto {
  customerName: string; currentVersionNumber: number | null;
  currentVersionStatus: typeof ESTIMATE_STATUSES[number] | null; subtotalCents: number | null;
  versions?: EstimateVersionSummaryDto[];
}
/** Lightweight ticket reference, with history for state-derived ticket recovery. */
export interface EstimateTicketSummaryDto extends EstimateContainerDto {
  versions: EstimateVersionSummaryDto[];
  version: Pick<EstimateVersionDto, "id" | "versionNumber" | "status">;
  subtotalCents: number | null;
}
export interface EstimateBoardSummaryDto {
  id: string; number: string; versionNumber: number;
  status: typeof ESTIMATE_STATUSES[number]; subtotalCents: number | null;
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
