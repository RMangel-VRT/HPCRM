import { z } from "zod/v4";
import type { AgreementTerm, RateCardItem, TermRate, TermBillingMonth, AgreementLine } from "@workspace/db";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { addCalendarDays, companyToday } from "./companyDay";

export class ContractCenterError extends Error {
  constructor(public status: number, message: string, public allowed?: string[]) { super(message); }
}
export const cents = z.number().int().min(0).max(2147483647);
const optionalText = z.string().max(10000).nullable().optional();
const calendar = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  try { return addCalendarDays(v, 0) === v; } catch { return false; }
}, "Invalid calendar date");
export const termFieldsSchema = z.object({
  seasonLabel: z.string().trim().min(1).max(100), startDate: calendar, endDate: calendar,
  legalName: optionalText, managingAgentName: optionalText, projectContact: optionalText,
  contactPhone: optionalText, contactEmail: optionalText, projectAddress: optionalText,
  snowTriggers: optionalText, po: optionalText, notes: optionalText,
  snowPricing: z.preprocess(v => v === "" || v === null ? undefined : v,
    z.enum(["time_and_materials", "flat_rate"]).optional()),
  snowFlatPriceCents: cents.nullable().optional(),
  needsReview: z.boolean().optional(),
});
export const scopeSchema = z.array(z.object({
  serviceKey: z.string().min(1), included: z.boolean(),
  quantity: z.number().int().min(0).max(2147483647).nullable().optional(), unit: optionalText,
  monthSpread: z.array(z.number().int().min(0).max(2147483647)).length(12).nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(), priceCents: cents.nullable().optional(), notes: optionalText,
})).max(500);
export const ratesSchema = z.array(z.object({
  rateKey: z.string().min(1).max(100), priceCents: cents.nullable().optional(),
  priceText: optionalText, minimum: optionalText, label: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).optional(), category: z.string().trim().min(1).optional(),
  line: z.enum(["landscape", "irrigation", "snow", "general"]).optional(),
})).max(500);
export const paymentsSchema = z.array(z.object({
  component: z.string().trim().min(1).max(150),
  months: z.array(z.object({ month: z.number().int().min(1).max(12), amountCents: cents })).max(12),
})).max(100);
export type Payments = z.infer<typeof paymentsSchema>;
export const createContractSchema = z.object({
  bidTicketId: z.string().min(1).optional(),
  customerId: z.string().min(1), line: z.enum(["landscape", "snow", "both"]),
  form: z.enum(["ours", "theirs"]), propertyManagementCompanyId: z.string().min(1).nullable().optional(),
  term: termFieldsSchema, scope: scopeSchema, rates: ratesSchema, payments: paymentsSchema,
});
export const renewSchema = z.object({
  increasePct: z.number().min(-50).max(100).optional(),
  targetAnnualCents: cents.optional(),
  laterYearPcts: z.array(z.number().min(-50).max(100)).max(4).default([]),
  line: z.enum(["landscape", "snow", "both"]).optional(),
  form: z.enum(["ours", "theirs"]).optional(),
  rates: z.enum(["carry", "card"]).optional(),
  scope: z.enum(["carry", "standard"]).default("carry"),
  roundTo: z.enum(["dollar", "twelve"]), dryRun: z.boolean().default(false),
}).refine(b => (b.increasePct === undefined) !== (b.targetAnnualCents === undefined),
  { message: "Give either an increase or a new annual price" });
export function inclusiveMonths(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number), [ey, em] = end.split("-").map(Number);
  return (ey - sy) * 12 + em - sm + 1;
}
export function validateDates(start: string, end: string): void {
  calendar.parse(start); calendar.parse(end);
  if (start > end || Number(start.slice(0, 4)) < 2000 || inclusiveMonths(start, end) > 60)
    throw new ContractCenterError(400, "Contract dates must start in 2000 or later, end on or after the start, and span at most 60 calendar months");
}
function unique(values: string[], what: string) {
  if (new Set(values).size !== values.length) throw new ContractCenterError(400, `Duplicate ${what}`);
}
export function validatePayments(input: Payments): Payments {
  const payments = paymentsSchema.parse(input);
  unique(payments.map(p => p.component), "payment component");
  payments.forEach(p => unique(p.months.map(m => String(m.month)), "payment month"));
  return payments;
}
export function expandPayments(input: Payments, start: string, end: string) {
  validateDates(start, end);
  const payments = validatePayments(input);
  const [year, month] = start.split("-").map(Number);
  const rows: Array<{ component: string; month: string; amountCents: number }> = [];
  for (const p of payments) {
    const amounts = new Map(p.months.map(m => [m.month, m.amountCents]));
    for (let offset = 0; offset < Math.max(12, inclusiveMonths(start, end)); offset++) {
      const index = year * 12 + month - 1 + offset, m = index % 12 + 1;
      const amountCents = amounts.get(m);
      if (amountCents) rows.push({ component: p.component, month: `${Math.floor(index / 12)}-${String(m).padStart(2, "0")}-01`, amountCents });
    }
  }
  return rows;
}
export function recoverPayments(rows: Pick<TermBillingMonth, "component" | "month" | "amountCents">[]): Payments {
  const patterns = new Map<string, Map<number, number>>();
  for (const row of [...rows].sort((a, b) => a.month.localeCompare(b.month))) {
    const key = row.component ?? "Contract", month = Number(row.month.slice(5, 7));
    if (!patterns.has(key)) patterns.set(key, new Map());
    const pattern = patterns.get(key)!;
    if (!pattern.has(month)) pattern.set(month, row.amountCents);
  }
  return [...patterns].map(([component, amounts]) => ({ component,
    months: [...amounts].sort(([a], [b]) => a - b).map(([month, amountCents]) => ({ month, amountCents })) }));
}
export function paymentSummary(payments: Payments, line: AgreementLine, snowPricing?: string | null) {
  validatePayments(payments);
  const annualPriceCents = payments.length ? payments.reduce((sum, p) => sum + p.months.reduce((n, m) => n + m.amountCents, 0), 0) : null;
  if (annualPriceCents !== null) cents.parse(annualPriceCents);
  if (line === "snow" && snowPricing === "time_and_materials" && payments.some(p => p.months.some(m => m.amountCents)))
    throw new ContractCenterError(400, "Snow time-and-materials terms cannot have payments");
  const equal = payments.length === 1 && payments[0].months.length === 12 && new Set(payments[0].months.map(m => m.amountCents)).size === 1;
  return { annualPriceCents: line === "snow" && snowPricing === "time_and_materials" ? null : annualPriceCents,
    billingType: line === "snow" && snowPricing === "time_and_materials"
    ? "time_and_materials" as const : equal ? "equal_monthly" as const : "monthly_variable" as const };
}
export function validateSnow(line: AgreementLine, term: { snowPricing?: string | null; snowFlatPriceCents?: number | null }) {
  if (line === "landscape") {
    if (term.snowPricing != null || term.snowFlatPriceCents != null) throw new ContractCenterError(400, "Landscape terms cannot have snow pricing");
  } else {
    if (!["time_and_materials", "flat_rate"].includes(term.snowPricing ?? "")) throw new ContractCenterError(400, "Snow pricing is required");
    if (term.snowPricing === "flat_rate") cents.parse(term.snowFlatPriceCents);
    else if (term.snowFlatPriceCents != null) throw new ContractCenterError(400, "Flat snow price is only allowed for flat-rate snow");
  }
}
export function buildScope(input: z.infer<typeof scopeSchema>, line: AgreementLine) {
  const scope = scopeSchema.parse(input); unique(scope.map(s => s.serviceKey), "scope key");
  return scope.map((s, i) => {
    const index = SCOPE_CATALOG.findIndex(c => c.key === s.serviceKey), catalog = SCOPE_CATALOG[index];
    if (!catalog && (!s.serviceKey.startsWith("other:") || typeof s.details?.label !== "string" || !s.details.label.trim()))
      throw new ContractCenterError(400, "Unknown scope key or missing custom scope label");
    return { ...s, details: s.details ?? {}, line: catalog?.line ?? (line === "snow" ? "snow" as const : "landscape" as const),
      sortOrder: index < 0 ? SCOPE_CATALOG.length + i : index };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}
export function applies(line: AgreementLine, rateLine: string) {
  return line === "both" || rateLine === "general" || (line === "snow" ? rateLine === "snow" : ["landscape", "irrigation"].includes(rateLine));
}
export function snapshotRates(card: RateCardItem[], input: z.infer<typeof ratesSchema>, line: AgreementLine) {
  const rates = ratesSchema.parse(input); unique(rates.map(r => r.rateKey), "rate key");
  const active = card.filter(r => r.active && applies(line, r.line));
  const overrides = new Map(rates.map(r => [r.rateKey, r]));
  const rows = active.map(r => {
    const override = overrides.get(r.rateKey);
    return { rateKey: r.rateKey, line: r.line, category: r.category, label: r.label,
      unit: r.unit, minimum: r.minimum, priceCents: r.priceCents, priceText: r.priceText,
      ...override, cardPriceCents: r.priceCents, cardPriceText: r.priceText, sortOrder: r.sortOrder };
  });
  for (const r of rates.filter(r => !active.some(c => c.rateKey === r.rateKey))) {
    if (card.some(c => c.rateKey === r.rateKey)) throw new ContractCenterError(400, "Rate is inactive or does not apply to this contract");
    if (!r.label || !r.unit || !r.category || !r.line) throw new ContractCenterError(400, "Custom rates require label, unit, category and line");
    rows.push({ ...r, label: r.label, unit: r.unit, category: r.category, line: r.line,
      minimum: r.minimum ?? null, priceCents: r.priceCents ?? null, priceText: r.priceText ?? null,
      cardPriceCents: null, cardPriceText: null, sortOrder: card.length + rows.length });
  }
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}
type StatusTerm = Pick<AgreementTerm, "id" | "status" | "startDate" | "endDate" | "renewedFromTermId">;
export function displayStatus(term: StatusTerm, terms: StatusTerm[] = [], today = companyToday()) {
  const signedRenewal = terms.some(t => t.renewedFromTermId === term.id && ["signed", "active", "renewed"].includes(t.status));
  if (["signed", "active"].includes(term.status) && term.endDate < today && !signedRenewal) return "expired";
  if (["signed", "renewed"].includes(term.status) && term.startDate <= today && today <= term.endDate) return "active";
  if (term.status === "signed" && term.startDate <= today) return "active";
  return term.status;
}
export function selectRenewalSource<T extends StatusTerm>(terms: T[]): T | undefined {
  // Pending renewals are shown separately, never replacing their source on the board.
  return [...terms].filter(t => t.status !== "cancelled" && !(t.renewedFromTermId && ["draft", "sent", "lost"].includes(t.status)))
    .sort(compareTermPriority)[0];
}
export function compareTermPriority(a: Pick<AgreementTerm, "startDate" | "id">, b: Pick<AgreementTerm, "startDate" | "id">) {
  return b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id);
}
export function isTermInEffect(t: Pick<AgreementTerm, "status" | "startDate" | "endDate">, today = companyToday()) {
  return ["signed", "active", "renewed"].includes(t.status) && t.startDate <= today && today <= t.endDate;
}
/** Pricing must never use the display selector's historical/future fallback. */
export function selectInEffectTerm<T extends StatusTerm>(terms: T[], today = companyToday()): T | undefined {
  return terms.filter(t => isTermInEffect(t, today)).sort(compareTermPriority)[0];
}
/** Display the in-effect season, independently of the final season used by Renew. */
export function selectCurrent<T extends StatusTerm>(terms: T[], today = companyToday()): T | undefined {
  const inEffect = terms.filter(t => isTermInEffect(t, today));
  return selectRenewalSource(inEffect) ?? selectRenewalSource(terms);
}
export function renewalDue(term: StatusTerm, terms: StatusTerm[] = [], today = companyToday()) {
  if (terms.some(t => t.renewedFromTermId === term.id && ["signed", "active", "renewed"].includes(t.status))) return false;
  return displayStatus(term, terms, today) === "active" && addCalendarDays(term.endDate, -60) <= today;
}
export function allowedMoves(status: string, renewal: boolean, isBid = false) {
  const moves: Record<string, string[]> = { draft: ["sent", "cancelled"], sent: ["signed", "draft", "lost"], signed: ["lost", "cancelled"], active: ["lost", "cancelled"] };
  return [...new Set([...(moves[status] ?? []), ...((renewal || isBid) && ["draft", "sent"].includes(status) ? ["lost"] : [])])];
}
export function assertMove(term: Pick<AgreementTerm, "status" | "renewedFromTermId"> & { bidTicketId?: string | null }, to: string) {
  const allowed = allowedMoves(term.status, !!term.renewedFromTermId, !!term.bidTicketId);
  if (!allowed.includes(to)) throw new ContractCenterError(409, `Invalid status move; allowed: ${allowed.join(", ") || "none"}`, allowed);
}
export function assertEditable(status: string) {
  if (["renewed", "lost", "cancelled"].includes(status)) throw new ContractCenterError(409, "This term can no longer be edited");
}
export function increasedPayments(payments: Payments, pct: number, roundTo: "dollar" | "twelve"): Payments {
  return validatePayments(payments).map(p => {
    const months = p.months.filter(m => m.amountCents > 0).sort((a, b) => a.month - b.month);
    const total = months.reduce((sum, m) => sum + m.amountCents, 0), increased = total * (100 + pct) / 100;
    const twelveUnits = increased / 1200;
    const target = roundTo === "dollar" ? Math.round(increased / 100) * 100
      : Math.ceil(twelveUnits - Number.EPSILON * Math.abs(twelveUnits)) * 1200;
    cents.parse(target);
    let allocated = 0;
    return { component: p.component, months: months.map((m, i) => {
      const proposed = roundTo === "dollar" ? Math.round(m.amountCents * (100 + pct) / 10000) * 100 : Math.floor(target * m.amountCents / total);
      // Very small patterns can otherwise round earlier payments past the entire
      // annual total, making the reconciliation payment negative.
      const amountCents = i === months.length - 1 ? target - allocated : Math.min(proposed, target - allocated);
      allocated += amountCents; cents.parse(amountCents);
      return { month: m.month, amountCents };
    }) };
  });
}
export function renewalDates(term: Pick<AgreementTerm, "startDate" | "endDate">) {
  validateDates(term.startDate, term.endDate);
  const startDate = addCalendarDays(term.endDate, 1), date = new Date(`${startDate}T00:00:00Z`), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + inclusiveMonths(term.startDate, term.endDate));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  const endDate = addCalendarDays(date.toISOString().slice(0, 10), -1);
  validateDates(startDate, endDate);
  const sy = startDate.slice(0, 4), ey = endDate.slice(0, 4);
  return { startDate, endDate, seasonLabel: sy === ey ? sy : `${sy}–${ey.slice(-2)}` };
}
export function renewalRates(old: TermRate[], card: RateCardItem[], line: AgreementLine) {
  const removed = old.filter(r => !applies(line, r.line));
  old = old.filter(r => applies(line, r.line));
  const active = card.filter(r => r.active && applies(line, r.line));
  const overrides = old.filter(r => !active.some(c => c.rateKey === r.rateKey) ||
    r.priceCents !== r.cardPriceCents || r.priceText !== r.cardPriceText);
  // Keep custom/retired snapshots without treating them as active-card overrides.
  const fresh = snapshotRates(active, overrides.filter(r => active.some(c => c.rateKey === r.rateKey)), line);
  const retained = overrides.filter(r => !active.some(c => c.rateKey === r.rateKey)).map(r => ({
    rateKey: r.rateKey, line: r.line, category: r.category, label: r.label, unit: r.unit,
    minimum: r.minimum, priceCents: r.priceCents, priceText: r.priceText, cardPriceCents: r.cardPriceCents,
    cardPriceText: r.cardPriceText, sortOrder: r.sortOrder,
  }));
  const rates = [...fresh, ...retained];
  const changes = rates.map(r => {
    const before = old.find(o => o.rateKey === r.rateKey);
    const kept = overrides.some(o => o.rateKey === r.rateKey);
    return { rateKey: r.rateKey, label: r.label, old: { priceCents: before?.priceCents ?? null, priceText: before?.priceText ?? null },
      new: { priceCents: r.priceCents, priceText: r.priceText }, reason: !before ? "added" : kept ? "kept override" : "card changed" };
  });
  changes.push(...removed.map(r => ({ rateKey: r.rateKey, label: r.label,
    old: { priceCents: r.priceCents, priceText: r.priceText },
    new: { priceCents: null, priceText: null }, reason: "removed" })));
  return { rates, changes };
}

/** Exact annual target, retaining every line/month's share of the original total. */
export function scaledPayments(input: Payments, target: number, roundTo: "dollar" | "twelve"): Payments {
  cents.parse(target);
  const payments = validatePayments(input);
  const total = payments.reduce((n, p) => n + p.months.reduce((s, m) => s + m.amountCents, 0), 0);
  cents.parse(total);
  if (!total) {
    const share = Math.floor(target / 12);
    return [{ component: "Grounds maintenance", months: Array.from({ length: 12 }, (_, i) =>
      ({ month: i + 1, amountCents: i === 11 ? target - share * 11 : share })) }];
  }
  const paid = payments.flatMap((p, pi) => p.months.filter(m => m.amountCents > 0)
    .sort((a, b) => a.month - b.month).map(m => ({ pi, ...m })));
  let allocated = 0;
  const result = payments.map(p => ({ component: p.component, months: [] as Payments[number]["months"] }));
  paid.forEach((m, i) => {
    // Products of two supported cent amounts exceed JS's exact integer range.
    const numerator = BigInt(target) * BigInt(m.amountCents), denominator = BigInt(total);
    const rounded = roundTo === "dollar"
      ? Number((numerator + denominator * 50n) / (denominator * 100n)) * 100
      : Number(numerator / denominator);
    const amountCents = i === paid.length - 1 ? target - allocated : Math.min(rounded, target - allocated);
    cents.parse(amountCents); allocated += amountCents;
    result[m.pi].months.push({ month: m.month, amountCents });
  });
  return validatePayments(result);
}

/** Coverage changes run before repricing and are shared with explicit-source imports. */
export function renewalCoverage(source: Pick<AgreementTerm, "line" | "snowPricing" | "snowFlatPriceCents">,
  line: AgreementLine, input: Payments) {
  let payments = validatePayments(input);
  const addingSnow = source.line === "landscape" && line !== "landscape";
  const snowPricing = line === "landscape" ? null : addingSnow ? "time_and_materials" as const : source.snowPricing;
  const snowFlatPriceCents = line === "landscape" || addingSnow ? null : source.snowFlatPriceCents;
  if (line === "landscape") payments = payments.filter(p => p.component !== "Snow");
  if (line === "snow") payments = snowPricing === "time_and_materials" ? [] : payments.filter(p => p.component === "Snow");
  return { payments, snowPricing, snowFlatPriceCents };
}

type SetTerm = StatusTerm & { agreementId: string; companyId: string; createdAt: Date; createdAtExact?: string; renewalNote?: string | null };
/** Chain AND transaction timestamp AND positive creation-note evidence on every member.
 * Ordinary audit/Copy histories also share transaction timestamps, but are not renewal sets. */
export function renewalSet<T extends SetTerm>(terms: T[], member: T): T[] {
  const stamp = (t: T) => t.createdAtExact ?? t.createdAt.toISOString();
  const note = (t: T) => t.renewalNote?.match(/\(year ([1-5]) of (.+) renewal,/);
  const memberNote = note(member);
  if (!memberNote) return [member];
  const same = (t: T) => t.agreementId === member.agreementId && t.companyId === member.companyId && stamp(t) === stamp(member)
    && note(t)?.[2] === memberNote[2];
  let first = member;
  const visited = new Set<string>();
  while (first.renewedFromTermId && !visited.has(first.id)) {
    visited.add(first.id);
    const parent = terms.find(t => t.id === first.renewedFromTermId && same(t));
    if (!parent || Number(note(parent)![1]) + 1 !== Number(note(first)![1])) break;
    first = parent;
  }
  if (note(first)?.[1] !== "1") return [member];
  const result = [first];
  while (true) {
    const children = terms.filter(t => t.renewedFromTermId === result[result.length - 1].id && same(t) && !result.some(r => r.id === t.id));
    if (children.length !== 1 || Number(note(children[0])![1]) !== result.length + 1) break;
    result.push(children[0]);
  }
  return result.some(t => t.id === member.id) ? result : [member];
}
