import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { estimateCatalogReferenceSchema, estimateLineNeedsPrice, estimateOrderSchema, matchesEstimateCatalogReference,
  patchEstimateVersionSchema, type EstimateDiscountInput, type EstimateOrderInput, type PatchEstimateLineInput } from "../../../../lib/db/src/estimateContracts";
import { calculateExtendedCents, computeVersionTotals, moneyStringToCents, normalizeQuantity, percentStringToBasisPoints,
  versionDiscounts } from "../../../../lib/db/src/estimateMath";
import { type EstimateDetailDto, type EstimateLineDto, type EstimateSectionDto } from "./estimateBuilder";
import { executeEstimateEdit } from "./estimatePhotoUpload";
import type { EstimateEdit } from "./estimateRevision";
import type { PickerLinePreview } from "./pickerSources";

export type BuilderEdit = EstimateEdit & { temporaryId?: string; preview?: PickerLinePreview };
export const newTemporaryLineId = () => `pending:${crypto.randomUUID()}`;
export const isTemporaryLine = (id: string) => id.startsWith("pending:");
export const lineFrom = (detail: EstimateDetailDto, id: string) => detail.version.sections.flatMap(s => s.lines).find(l => l.id === id);
const linePath = /\/lines\/([^/]+)(?:\/(duplicate|replace))?$/;
export const pathLineId = (url: string) => {
  const match = linePath.exec(url);
  return match ? decodeURIComponent(match[1]) : undefined;
};
export const orderOf = (sections: EstimateSectionDto[]): EstimateOrderInput => ({
  sections: sections.map(s => ({ id: s.id, lineIds: s.lines.map(l => l.id) })),
});

export function editResult(detail: EstimateDetailDto, edit: EstimateEdit, failedPhotos = 0) {
  const affectedLineId = detail.affectedLineId ?? pathLineId(edit.url);
  return { ok: true as const, affectedLineId, line: affectedLineId ? lineFrom(detail, affectedLineId) : undefined, failedPhotos };
}

const emptyRefs = { plantCatalogItemId: null, hardscapeCatalogItemId: null, irrigationCatalogItemId: null, quickItemId: null, rateKey: null, termId: null };
function referenceFields(raw: Record<string, unknown>) {
  const result = estimateCatalogReferenceSchema.safeParse(Object.fromEntries(
    Object.entries(raw).filter(([key]) => key === "lineType" || Object.hasOwn(emptyRefs, key)),
  ));
  return result.success ? result.data : null;
}
function withAmounts(line: EstimateLineDto) {
  return { ...line, needsPrice: estimateLineNeedsPrice(line), extendedCents: calculateExtendedCents(line.quantity, line.unitPriceCents) };
}

/** A projection is never written to the server. It is reapplied against the
 * newest confirmed detail each time any earlier edit succeeds or fails. */
function project(data: EstimateDetailDto, edit: BuilderEdit): EstimateDetailDto {
  const body = (edit.body ?? {}) as Record<string, unknown>;
  const version = data.version;
  const sections = version.sections;
  if (edit.method === "PUT" && edit.url.endsWith("/photos/order")) {
    const photos = version.photos ?? [];
    const byId = new Map(photos.map(photo => [photo.id, photo]));
    const ids = body.photoIds as string[];
    if (ids.length !== photos.length || !ids.every(id => byId.has(id))) return data;
    return { ...data, version: { ...version, photos: ids.map((id, displayOrder) => ({ ...byId.get(id)!, displayOrder })) } };
  }
  if (edit.method === "PATCH" && /\/versions\/[^/]+$/.test(edit.url) && ("laborDiscount" in body || "totalDiscount" in body)) {
    const parsed = patchEstimateVersionSchema.safeParse(body);
    if (!parsed.success) return data;
    const fields = (input: EstimateDiscountInput | null | undefined) => input === undefined ? undefined : input === null
      ? { kind: null, value: null, label: null }
      : { kind: input.kind, value: input.kind === "percent" ? percentStringToBasisPoints(input.value) : moneyStringToCents(input.value), label: input.label?.trim() || null };
    const labor = fields(parsed.data.laborDiscount), total = fields(parsed.data.totalDiscount);
    return withSections(sections, { ...version,
      ...(labor && { laborDiscountKind: labor.kind, laborDiscountValue: labor.value, laborDiscountLabel: labor.label }),
      ...(total && { totalDiscountKind: total.kind, totalDiscountValue: total.value, totalDiscountLabel: total.label }) });
  }
  if (edit.method === "PATCH" && typeof body.includePlantTable === "boolean" && /\/versions\/[^/]+$/.test(edit.url)) {
    return { ...data, version: { ...version, includePlantTable: body.includePlantTable } };
  }
  if (edit.method === "PUT" && edit.url.endsWith("/order")) {
    const order = estimateOrderSchema.parse(body);
    const bySection = new Map(sections.map(s => [s.id, s]));
    const byLine = new Map(sections.flatMap(s => s.lines).map(l => [l.id, l]));
    const projected: EstimateSectionDto[] = [];
    for (const [sortOrder, { id, lineIds }] of order.sections.entries()) {
      const section = bySection.get(id);
      if (!section) return data;
      bySection.delete(id);
      const lines: EstimateLineDto[] = [];
      for (const [lineOrder, lineId] of lineIds.entries()) {
        const line = byLine.get(lineId);
        if (!line) return data;
        byLine.delete(lineId);
        lines.push({ ...line, sectionId: id, sortOrder: lineOrder });
      }
      projected.push({ ...section, sortOrder, lines });
    }
    return bySection.size || byLine.size ? data : withSections(projected);
  }
  const sectionMatch = /\/sections\/([^/]+)$/.exec(edit.url);
  if (sectionMatch) {
    const id = decodeURIComponent(sectionMatch[1]);
    if (edit.method === "DELETE") return withSections(sections.filter(s => s.id !== id));
    if (edit.method === "PATCH" && typeof body.name === "string") {
      const name = body.name;
      return { ...data, version: { ...version, sections: sections.map(s => s.id === id ? { ...s, name } : s) } };
    }
  }
  const match = linePath.exec(edit.url);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const action = match[2];
    const update = (line: EstimateLineDto) => {
      if (line.id !== id) return [line];
      if (edit.method === "DELETE") return [];
      if (action === "duplicate" && edit.temporaryId) return [line, { ...line, id: edit.temporaryId }];
      if (action === "replace" && edit.preview) {
        const reference = referenceFields(body);
        const sameReference = reference && matchesEstimateCatalogReference(line, reference);
        if (body.priceOnly && !sameReference) return [line];
        if (body.keepPrice === false && sameReference) return [withAmounts({
          ...line, unitPriceCents: edit.preview.unitPriceCents, priceSource: edit.preview.priceSource, termId: edit.preview.termId ?? null,
        })];
        const manual = body.keepPrice === true && line.priceSource === "manual";
        const plant = body.lineType === "plant";
        return [withAmounts({ ...line, ...emptyRefs, ...reference, ...edit.preview, includeInPalette: plant,
          paletteTypeLabel: plant && line.plantCatalogItemId === body.plantCatalogItemId ? line.paletteTypeLabel : null,
          unitPriceCents: manual ? line.unitPriceCents : edit.preview.unitPriceCents, priceSource: manual ? "manual" : edit.preview.priceSource })];
      }
      if (edit.method !== "PATCH") return [line];
      const patch = body as PatchEstimateLineInput;
      const unitPriceCents = patch.unitPriceCents ?? line.unitPriceCents;
      return [withAmounts({ ...line, ...patch, quantity: normalizeQuantity(patch.quantity ?? line.quantity), unitPriceCents,
        priceSource: unitPriceCents === line.unitPriceCents ? line.priceSource : "manual" })];
    };
    return withSections(sections.map(s => s.lines.some(l => l.id === id)
      ? { ...s, lines: s.lines.flatMap(update).map((l, i) => action === "duplicate" ? { ...l, sortOrder: i } : l) } : s));
  }
  if (edit.method === "POST" && edit.url.endsWith("/lines") && edit.temporaryId && typeof body.quantity === "string") {
    const preview = edit.preview ?? freeEntryPreview(body);
    if (!preview) return data; // Do not invent a price or snapshot when the picker has no preview.
    const quantity = normalizeQuantity(body.quantity);
    return withSections(sections.map(s => {
      if (s.id !== body.sectionId) return s;
      const line = withAmounts({
        id: edit.temporaryId!, companyId: data.companyId, versionId: version.id, sectionId: s.id,
        lineType: body.lineType as EstimateLineDto["lineType"], ...emptyRefs, ...referenceFields(body), ...preview, quantity,
        extendedCents: 0, needsPrice: false, includeInPalette: body.lineType === "plant", paletteTypeLabel: null,
        sortOrder: s.lines.reduce((max, l) => Math.max(max, l.sortOrder), -1) + 1, createdAt: data.updatedAt, updatedAt: data.updatedAt,
      });
      return { ...s, lines: [...s.lines, line] };
    }));
  }
  return data;

  function withSections(next: EstimateSectionDto[], nextVersion = version) {
    const totals = computeVersionTotals(next.flatMap(s => s.lines), versionDiscounts(nextVersion));
    for (const section of next) { totals.bySection[section.id] ??= 0; totals.bySectionNet[section.id] ??= 0; }
    return { ...data, version: { ...nextVersion, sections: next, totals } };
  }
}

function freeEntryPreview(body: Record<string, unknown>): PickerLinePreview | undefined {
  if (typeof body.name !== "string" || typeof body.unit !== "string" || typeof body.unitPriceCents !== "number") return;
  return { name: body.name, detail: typeof body.detail === "string" ? body.detail : null, unit: body.unit,
    unitPriceCents: body.unitPriceCents, unitCostCents: null, priceSource: "manual", umbrellaKey: body.umbrellaKey as EstimateLineDto["umbrellaKey"] };
}

type Job = { edit: BuilderEdit; active: () => boolean };
// Include every view of the same estimate in the network turnstile; the HTTP
// company guard still checks the initiating company if a session switches.
const tails = new Map<string, Promise<unknown>>();
export const hasEstimateEdits = (scope: string) => tails.has(scope);
const stamp = (detail: EstimateDetailDto) => Math.max(Date.parse(detail.updatedAt) || 0, Date.parse(detail.version.updatedAt) || 0);
export async function waitForEstimateEdits(scope: string) {
  while (tails.has(scope)) await tails.get(scope);
}

export class EstimateEditQueue {
  private base?: EstimateDetailDto;
  private jobs: Job[] = [];
  private ids = new Map<string, string>();
  constructor(private qc: QueryClient, private key: QueryKey, private company: string, private scope: string) {}
  get pending() { return this.jobs.length > 0; }

  enqueue(fallback: EstimateDetailDto, edit: BuilderEdit, active: () => boolean) {
    if (!this.pending) {
      this.base = this.qc.getQueryData<EstimateDetailDto>(this.key) ?? fallback;
      this.ids.clear();
    }
    // Don't revert the cache to the value captured before a focus refetch.
    void this.qc.cancelQueries({ queryKey: this.key, exact: true }, { revert: false, silent: true });
    const job = { edit, active };
    this.jobs.push(job);
    this.publish();
    const result = (tails.get(this.scope) ?? Promise.resolve()).then(async () => {
      try {
        if (!job.active()) return null;
        const request = this.resolve(edit, true);
        const { detail: response, failedPhotos } = await executeEstimateEdit(request, this.company, undefined, job.active);
        const { affectedLineId, ...confirmed } = response;
        if (!this.base || stamp(confirmed) >= stamp(this.base)) this.base = confirmed;
        if (edit.temporaryId && affectedLineId) this.ids.set(edit.temporaryId, affectedLineId);
        return editResult(response, request, failedPhotos);
      } finally {
        this.jobs.shift();
        this.publish();
      }
    });
    const tail = result.then(() => undefined, () => undefined);
    tails.set(this.scope, tail);
    void tail.then(() => {
      if (tails.get(this.scope) !== tail) return;
      tails.delete(this.scope);
      // Navigation between current and pinned views can overlap a write. Do
      // not let a cached detail in the other view remain marked fresh.
      void this.qc.invalidateQueries({ queryKey: this.key.slice(0, -1),
        predicate: q => q.queryKey.at(-1) !== this.key.at(-1) });
    });
    return result;
  }

  private resolve(edit: BuilderEdit, sending = false): BuilderEdit {
    const id = (value: string) => {
      const real = this.ids.get(value);
      if (!real && sending && isTemporaryLine(value)) throw new Error('400: {"error":"INVALID_ESTIMATE_ORDER"}');
      return real ?? value;
    };
    const match = linePath.exec(edit.url);
    const url = match ? edit.url.slice(0, match.index) + `/lines/${encodeURIComponent(id(decodeURIComponent(match[1])))}` +
      (match[2] ? `/${match[2]}` : "") : edit.url;
    const order = edit.method === "PUT" && edit.url.endsWith("/order") && !edit.url.endsWith("/photos/order") ? estimateOrderSchema.parse(edit.body) : null;
    return { ...edit, url, body: order ? { sections: order.sections.map(s => ({ ...s, lineIds: s.lineIds.map(id) })) } : edit.body };
  }

  private publish() {
    if (!this.base) return;
    const next = this.jobs.reduce((data, job) => {
      try { return project(data, this.resolve(job.edit)); }
      catch (err) {
        if (!(err instanceof RangeError)) throw err;
        return data; // The authoritative range check returns the translated 422.
      }
    }, this.base);
    this.qc.setQueryData<EstimateDetailDto>(this.key, cached => {
      return cached && stamp(cached) > stamp(next) && !this.pending ? cached : next;
    });
  }
}
