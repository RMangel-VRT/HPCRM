/** Driver-free Estimate Builder request contracts, shared by CRM and API. */
import { z } from "zod/v4";
import { isCalendarDate } from "./schema/calendarDate";
export { isCalendarDate } from "./schema/calendarDate";

export const ESTIMATE_STATUSES = ["draft", "sent", "accepted", "declined", "superseded", "void"] as const;
export const ESTIMATE_LINE_TYPES = ["plant", "hardscape", "irrigation", "labor", "equipment", "fee", "custom"] as const;
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
export const createEstimateSectionSchema = z.object({ name }).strict();
export const patchEstimateSectionSchema = z.object({ name: name.optional(), sortOrder: order.optional() }).strict();
const base = { sectionId: estimateIdSchema, quantity: estimateQuantitySchema };
const free = { name, detail: detail.optional(), unit: name, unitPriceCents: cents, umbrellaKey: z.enum(ESTIMATE_UMBRELLAS) };
// Equipment/fee use an exclusive reference-or-free-entry union inside each
// discriminator branch: a reference plus a client price must never be accepted.
const quickOrFree = z.union([
  z.object({ quickItemId: estimateIdSchema }).strict(),
  z.object(free).strict(),
]);
const quickBranch = (lineType: "equipment" | "fee") => z.object({
  ...base, lineType: z.literal(lineType), quickItemId: estimateIdSchema.optional(),
  name: name.optional(), detail: detail.optional(), unit: name.optional(),
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
  quickBranch("equipment"), quickBranch("fee"),
  z.object({ ...base, lineType: z.literal("custom"), ...free }).strict(),
]);
// Explicit PATCH fields have NO defaults. Null is a real clear operation.
export const patchEstimateLineSchema = z.object({
  quantity: estimateQuantitySchema.optional(), unitPriceCents: cents.optional(),
  name: name.optional(), detail: detail.optional(), unit: name.optional(),
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
}
export interface EstimateListItemDto extends EstimateContainerDto {
  customerName: string; currentVersionNumber: number | null;
  currentVersionStatus: typeof ESTIMATE_STATUSES[number] | null; subtotalCents: number | null;
  versions?: EstimateVersionSummaryDto[];
}
