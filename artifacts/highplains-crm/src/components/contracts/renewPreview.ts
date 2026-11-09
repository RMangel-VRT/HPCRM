import type { PaymentWire } from "./paymentDraft";
import i18n from "i18next";
import type { AgreementForm, AgreementLine } from "./contractTypes";
import type { RatesWire } from "./RatesEditor";

export type RoundTo = "dollar" | "twelve";
export interface RenewRateChange {
  rateKey: string; label: string;
  old: { priceCents: number | null; priceText: string | null };
  new: { priceCents: number | null; priceText: string | null };
  reason: string;
}
export interface RenewPreview {
  seasonLabel: string; startDate: string; endDate: string; annualPriceCents?: number | null;
  payments: { component: string; before: PaymentWire["months"]; after: PaymentWire["months"]; fee?: boolean }[];
  snowFlatPrice: { before: number | null; after: number | null };
  rateChanges: RenewRateChange[];
  line?: AgreementLine; form?: AgreementForm;
  years?: RenewYear[];
  scopeChanges?: { added: string[]; removed: string[] };
  changes?: { line?: [AgreementLine, AgreementLine]; form?: [AgreementForm, AgreementForm] };
  source?: { line: AgreementLine; form: AgreementForm };
}
export interface RenewYear {
  seasonLabel: string; startDate: string; endDate: string; line?: AgreementLine; form?: AgreementForm;
  annualPriceCents: number | null;
  payments?: { component: string; before: PaymentWire["months"]; after: PaymentWire["months"] }[];
}
export type PriceMode = "pct" | "target";
export interface RenewChoices {
  mode: PriceMode; pct: number | null; targetCents: number | null; roundTo: RoundTo;
  laterPcts: (number | null)[]; line: AgreementLine | null; form: AgreementForm | null;
  /** null or "carry" carries the source rows; an array (even []) replaces them exactly. */
  rates: "carry" | RatesWire | null; scope: "carry" | "standard";
}
/** Request body for the renew API, or null while any input is invalid. Unchanged defaults are omitted so plain renewals send what they always did. */
export function renewBody(c: RenewChoices): Record<string, unknown> | null {
  const price = c.mode === "pct" ? c.pct : c.targetCents;
  if (price === null || c.laterPcts.some(p => p === null)) return null;
  return {
    ...(c.mode === "pct" ? { increasePct: c.pct } : { targetAnnualCents: c.targetCents }), roundTo: c.roundTo,
    ...(c.laterPcts.length ? { laterYearPcts: c.laterPcts } : {}),
    ...(c.line ? { line: c.line } : {}), ...(c.form ? { form: c.form } : {}),
    ...(Array.isArray(c.rates) || c.rates === "carry" ? { rates: c.rates } : {}), ...(c.scope === "standard" ? { scope: "standard" } : {}),
  };
}
export const LINE_NAME: Record<AgreementLine, string> = { landscape: "Landscape", snow: "Snow", both: "Landscape + Snow" };
export const FORM_NAME: Record<AgreementForm, string> = { ours: "Our form", theirs: "Their form" };
const has = (l: AgreementLine, x: "landscape" | "snow") => l === "both" || l === x;
/** Short explanation of what a coverage or form change does to the draft. */
export function changeNotes(from: { line: AgreementLine; form: AgreementForm }, to: { line: AgreementLine; form: AgreementForm }): string[] {
  const out: string[] = [];
  if (!has(from.line, "snow") && has(to.line, "snow")) out.push(i18n.t("contractRates.snowAdded"));
  if (has(from.line, "snow") && !has(to.line, "snow")) out.push(i18n.t("contractRates.snowDropped"));
  if (!has(from.line, "landscape") && has(to.line, "landscape")) out.push(i18n.t("contractRates.landscapeAdded"));
  if (has(from.line, "landscape") && !has(to.line, "landscape")) out.push(i18n.t("contractRates.landscapeDropped"));
  if (from.form !== to.form) out.push(i18n.t(to.form === "ours" ? "contractRates.formOurs" : "contractRates.formTheirs"));
  return out;
}
/** "2026–27" for one year, "2026–29" across several. */
export function spanLabel(first: string, last: string) {
  const a = first.split(/[\u2013-]/)[0], b = last.split(/[\u2013-]/).at(-1) ?? last;
  return `${a}\u2013${b}`;
}

/** Increase % as the server accepts it (-50 to 100); null while the input is not a valid number. */
export function parsePct(raw: string): number | null {
  const t = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= -50 && n <= 100 ? n : null;
}

export const previewKey = (body: Record<string, unknown>) => JSON.stringify(body);

/** Only the newest request may deliver its result. */
export function createSequencer() {
  let n = 0;
  return { next: () => ++n, isCurrent: (id: number) => id === n, cancel: () => { n++; } };
}

export const sumMonths = (months: { amountCents: number }[]) => months.reduce((s, m) => s + m.amountCents, 0);

/** Change report grouped by the server's reasons: carried, added, removed, changed. */
export function visibleRateChanges(changes: RenewRateChange[]) {
  return {
    carried: changes.filter(c => c.reason === "carried"),
    added: changes.filter(c => c.reason === "added"),
    removed: changes.filter(c => c.reason === "removed"),
    changed: changes.filter(c => c.reason === "changed"),
  };
}
