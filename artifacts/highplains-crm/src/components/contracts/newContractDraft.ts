import { DEFAULT_SNOW_TRIGGERS, buildScopeRows, scopePayload, scopeProblems } from "./ScopeEditor";
import type { ScopeRow } from "./ScopeEditor";
import { isChangedRate, isCustomRate, rateProblems, ratesPayload, toRateRows } from "./RatesEditor";
import type { RateRow } from "./RatesEditor";
import { addDays, addMonths } from "./contractFormat";
import type { AgreementLine, TermRateRow } from "./contractTypes";
import { GROUNDS_LINE, SNOW_LINE, applyPreset, blankLine, equalMonthly, annualCents, lineProblems, lineSum, paymentsPayload, startMonthOf } from "./paymentDraft";
import type { PaymentLine } from "./paymentDraft";
import { parseDollarsToCents } from "./rateCardUtils";
import type { RateCardItem } from "./rateCardUtils";
import { initialScope as standardScope, standardScopeIncludes } from "@workspace/api-zod/contractScope";
import { SCOPE_CATALOG } from "@/shared/contractCatalog";

export type SnowPricing = "time_and_materials" | "flat_rate";
export interface NewContractDraft {
  step: number;
  customerId: string; customerName: string; line: AgreementLine | ""; form: "ours" | "theirs" | "";
  snowPricing: SnowPricing; flatPrice: string;
  managingAgentName: string; propertyManagementCompanyId: string | null;
  seasonLabel: string; seasonEdited: boolean; startDate: string; endDate: string; datesEdited: boolean;
  legalName: string; projectContact: string; contactPhone: string; contactEmail: string; projectAddress: string; po: string; notes: string;
  snowTriggers: string;
  scope: ScopeRow[] | null; rates: RateRow[] | null; payments: PaymentLine[] | null;
  /** Set once the server accepted the create, so a failed upload never creates a second contract. */
  created: { agreementId: string; termId: string } | null;
}

export const hasSnow = (line: string) => line === "snow" || line === "both";
export const hasLandscape = (line: string) => line === "landscape" || line === "both";

export function seasonLabelFor(start: string, end: string): string {
  const sy = Number(start.slice(0, 4)), ey = Number(end.slice(0, 4));
  if (!sy || !ey) return "";
  return sy === ey ? String(sy) : `${sy}\u2013${String(ey % 100).padStart(2, "0")}`;
}
export const firstOfNextMonth = (today: string) => addMonths(`${today.slice(0, 7)}-01`, 1);
/** Oct 1 to Apr 30 of the coming season (the season after November has begun is next year's). */
export function snowSeason(today: string) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const sy = m >= 11 ? y + 1 : y;
  return { startDate: `${sy}-10-01`, endDate: `${sy + 1}-04-30` };
}
export function defaultDates(line: string, today: string) {
  if (line === "snow") return snowSeason(today);
  const startDate = firstOfNextMonth(today);
  return { startDate, endDate: addDays(addMonths(startDate, 12), -1) };
}

export function newDraft(today: string): NewContractDraft {
  const d = defaultDates("landscape", today);
  return {
    step: 1, customerId: "", customerName: "", line: "", form: "", snowPricing: "time_and_materials", flatPrice: "",
    managingAgentName: "", propertyManagementCompanyId: null, ...d, seasonLabel: seasonLabelFor(d.startDate, d.endDate),
    seasonEdited: false, datesEdited: false, legalName: "", projectContact: "", contactPhone: "", contactEmail: "", projectAddress: "",
    po: "", notes: "", snowTriggers: DEFAULT_SNOW_TRIGGERS, scope: null, rates: null, payments: null, created: null,
  };
}

/** Type change: reset the pieces that depend on it. */
export function setLine(d: NewContractDraft, line: AgreementLine, today: string): NewContractDraft {
  const next: NewContractDraft = { ...d, line, scope: null, rates: null, payments: null };
  if (!d.datesEdited) {
    const dates = defaultDates(line, today);
    Object.assign(next, dates);
    if (!d.seasonEdited) next.seasonLabel = seasonLabelFor(dates.startDate, dates.endDate);
  }
  return next;
}
export function setDates(d: NewContractDraft, p: { startDate?: string; endDate?: string }): NewContractDraft {
  const next = { ...d, ...p, datesEdited: true };
  if (!d.seasonEdited) next.seasonLabel = seasonLabelFor(next.startDate, next.endDate);
  return next;
}

export type ScopePreset = "hoa" | "snow" | "clear";
const realDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && addDays(v, 0) === v;
export const monthSpan = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1;
export function applyScopePreset(rows: ScopeRow[], preset: ScopePreset): ScopeRow[] {
  return rows.map(r => {
    if (preset === "clear") return { ...r, included: false };
    if (preset === "hoa" && r.line !== "snow") return { ...r, included: standardScopeIncludes(r.serviceKey, r.line) };
    if (preset === "snow" && r.line === "snow") return { ...r, included: standardScopeIncludes(r.serviceKey, r.line) };
    return r;
  });
}

/** Catalog defaults for the type: HOA landscape and/or standard snow switched on. */
export function initialScope(line: AgreementLine): ScopeRow[] {
  return standardScope(line, SCOPE_CATALOG);
}

/** Active card rows relevant to the contract type, as editable rate rows. */
export function initialRates(card: RateCardItem[], line: AgreementLine): RateRow[] {
  const lines = line === "snow" ? ["snow", "general"] : line === "landscape" ? ["landscape", "irrigation", "general"] : null;
  const rows: TermRateRow[] = card.filter(r => r.active && (!lines || lines.includes(r.line))).map(r => ({
    rateKey: r.rateKey, line: r.line, category: r.category, label: r.label, priceCents: r.priceCents, priceText: r.priceText,
    unit: r.unit, minimum: r.minimum, cardPriceCents: r.priceCents, cardPriceText: r.priceText,
  }));
  return toRateRows(rows);
}
/** Labor-style rows with no standard that the user left blank. */
export const blankPerContractRates = (rows: RateRow[]) =>
  rows.filter(r => !isCustomRate(r) && r.cardPriceCents == null && !r.cardPriceText && r.input.trim() === "" && !r.priceText);

export const flatCents = (d: NewContractDraft) => (d.flatPrice.trim() === "" ? null : parseDollarsToCents(d.flatPrice));
export const monthOf = (d: NewContractDraft) => startMonthOf(d.startDate);
export const needsPayments = (d: NewContractDraft) => !(d.line === "snow" && d.snowPricing !== "flat_rate");

/** Lines the payment step starts from; keeps existing user edits. */
export function ensurePayments(d: NewContractDraft): PaymentLine[] {
  if (!needsPayments(d) && !d.payments) return [];
  let lines = d.payments;
  if (!lines) {
    lines = hasLandscape(d.line) ? [blankLine(GROUNDS_LINE, { pickerOpen: true })] : [];
  }
  const flat = d.snowPricing === "flat_rate" && hasSnow(d.line);
  const hasSnowLine = lines.some(l => l.name.trim() === SNOW_LINE);
  if (flat && !hasSnowLine) {
    const total = flatCents(d);
    lines = [...lines, applyPreset(blankLine(SNOW_LINE, { total: total ? (total / 100).toFixed(total % 100 ? 2 : 0) : "", preset: "flatSnow" }), "flatSnow", monthOf(d))];
  }
  if (!flat) lines = lines.filter(l => !(l.name.trim() === SNOW_LINE && l.preset === "flatSnow"));
  return lines;
}

export function stepProblems(d: NewContractDraft, step: number): string[] {
  const out: string[] = [];
  if (step === 1) {
    if (!d.customerId) out.push("Choose a customer");
    if (!d.line) out.push("Choose Landscape, Snow or Both");
    if (!d.form) out.push("Choose Our form or Their form");
    if (hasSnow(d.line) && d.snowPricing === "flat_rate" && !((flatCents(d) ?? 0) > 0)) out.push("Enter a flat snow price above $0");
  }
  if (step === 2) {
    let ok = true;
    if (!realDate(d.startDate)) { out.push("Enter a valid start date"); ok = false; }
    else if (Number(d.startDate.slice(0, 4)) < 2000) { out.push("The start date must be in 2000 or later"); ok = false; }
    if (!realDate(d.endDate)) { out.push("Enter a valid end date"); ok = false; }
    if (ok && d.endDate < d.startDate) out.push("The end date must be on or after the start date");
    else if (ok && monthSpan(d.startDate, d.endDate) > 60) out.push("A contract can span at most 60 months");
    if (!d.seasonLabel.trim()) out.push("Enter a season label");
    else if (d.seasonLabel.trim().length > 100) out.push("The season label can be at most 100 characters");
  }
  if (step === 3 && d.scope) out.push(...scopeProblems(d.scope));
  if (step === 4 && d.rates) out.push(...rateProblems(d.rates));
  if (step === 5) {
    out.push(...lineProblems(d.payments ?? []));
    if (d.snowPricing === "flat_rate" && hasSnow(d.line)) {
      const s = (d.payments ?? []).find(l => l.name.trim() === SNOW_LINE);
      if (!s || lineSum(s) <= 0) out.push("The Snow line needs payments that add up to the flat snow price");
    }
  }
  return out;
}

const text = (v: string) => (v.trim() === "" ? undefined : v.trim());
export function createBody(d: NewContractDraft) {
  const payments = needsPayments(d) ? d.payments ?? [] : [];
  const flat = hasSnow(d.line) && d.snowPricing === "flat_rate";
  const snowLine = payments.find(l => l.name.trim() === SNOW_LINE);
  return {
    customerId: d.customerId, line: d.line, form: d.form,
    ...(d.propertyManagementCompanyId ? { propertyManagementCompanyId: d.propertyManagementCompanyId } : {}),
    term: {
      seasonLabel: d.seasonLabel.trim(), startDate: d.startDate, endDate: d.endDate,
      legalName: text(d.legalName), managingAgentName: text(d.managingAgentName), projectContact: text(d.projectContact),
      contactPhone: text(d.contactPhone), contactEmail: text(d.contactEmail), projectAddress: text(d.projectAddress),
      po: text(d.po), notes: text(d.notes),
      ...(hasSnow(d.line) ? { snowTriggers: text(d.snowTriggers), snowPricing: d.snowPricing,
        snowFlatPriceCents: flat ? (snowLine ? lineSum(snowLine) : flatCents(d)) : null } : {}),
    },
    scope: scopePayload(d.scope ?? initialScope(d.line as AgreementLine)),
    rates: ratesPayload(d.rates ?? []),
    payments: paymentsPayload(payments),
  };
}

export function reviewRows(d: NewContractDraft) {
  const lines = needsPayments(d) ? d.payments ?? [] : [];
  const monthly = equalMonthly(lines);
  // Editors retain the original priceCents and keep the current amount in input.
  // Review must compare the same effective value that ratesPayload sends.
  const changed = (d.rates ?? []).filter(r => isChangedRate({
    ...r, priceCents: r.input.trim() === "" ? null : parseDollarsToCents(r.input),
    priceText: r.input.trim() === "" ? r.priceText : null,
  }) || isCustomRate(r));
  return {
    annual: needsPayments(d) ? annualCents(lines) : null, monthly,
    services: (d.scope ?? []).filter(r => r.included).map(r => r.label),
    changedRates: changed.map(r => ({ key: r.rateKey, label: r.label, custom: isCustomRate(r), input: r.input })),
  };
}

export const SESSION_PREFIX = "contract-center:new-contract";
export const sessionKey = (companyId: string | null | undefined, userId: string | null | undefined) =>
  `${SESSION_PREFIX}:${companyId ?? "none"}:${userId ?? "none"}`;
export function loadDraft(key: string): NewContractDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? { ...newDraft("2000-01-01"), ...JSON.parse(raw) } : null;
  } catch { return null; }
}
export function saveDraft(key: string, d: NewContractDraft) {
  try { window.sessionStorage.setItem(key, JSON.stringify(d)); } catch { /* storage unavailable */ }
}
export function clearDraft(key: string) {
  try { window.sessionStorage.removeItem(key); } catch { /* storage unavailable */ }
}
