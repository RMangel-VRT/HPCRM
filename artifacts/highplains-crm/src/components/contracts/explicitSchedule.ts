import { MAX_CENTS, centsToInput, parseDollarsToCents } from "./rateCardUtils";
import type { PaymentLine } from "./paymentDraft";

/** CC2-18 exact-dates schedule draft. Cells hold raw typed text; blank means "no row", "0.00" is a real zero row. */
export interface ExplicitComponent { id: string; name: string; fee: boolean }
export interface ExplicitDraft {
  components: ExplicitComponent[];
  /** `${componentId}|YYYY-MM-01` -> typed dollars. */
  cells: Record<string, string>;
  /** Months shown before the start month (0-2). */
  preStart: number;
  /** User consent that the signed contract bills before the start date. Never assumed from stored rows. */
  allowPreStart: boolean;
}
export interface ExplicitRow { component: string; month: string; amountCents: number; fee: boolean }
export interface ExplicitPayload { schedule: "explicit"; rows: ExplicitRow[]; allowPreStart?: boolean }

let n = 0;
export const newComponentId = () => `col-${Date.now().toString(36)}-${n++}`;
export const cellKey = (id: string, month: string) => `${id}|${month}`;
export const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;
const startKey = (date: string) => `${date.slice(0, 7)}-01`;
export const addMonths = (month: string, k: number) => {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + k;
  return monthKey(y + Math.floor(m / 12), (((m % 12) + 12) % 12) + 1);
};
export const monthDiff = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Calendar months covered by the term (start month through end month), plus any pre-start months. */
export function termMonths(startDate: string, endDate: string, preStart = 0): string[] {
  const first = addMonths(startKey(startDate), -preStart);
  const count = Math.max(0, monthDiff(first, startKey(endDate))) + 1;
  return Array.from({ length: Math.min(count, 120) }, (_, i) => addMonths(first, i));
}
export const durationMonths = (startDate: string, endDate: string) => monthDiff(startKey(startDate), startKey(endDate)) + 1;

/** Grid rows: the term window plus any typed cells outside it (so values are never hidden). */
export function gridMonths(d: ExplicitDraft, startDate: string, endDate: string): string[] {
  const set = new Set(termMonths(startDate, endDate, d.preStart));
  for (const [k, v] of Object.entries(d.cells)) if (v.trim() !== "") set.add(k.split("|")[1]);
  return [...set].sort();
}
export type MonthPlace = "pre" | "in" | "outside";
export function monthPlace(month: string, startDate: string, endDate: string): MonthPlace {
  const s = startKey(startDate), e = startKey(endDate);
  if (month >= s && month <= e) return "in";
  const before = monthDiff(month, s);
  return before >= 1 && before <= 2 ? "pre" : "outside";
}

export function explicitFromBilling(rows: { component: string; month: string; amountCents: number; isFee?: boolean }[], startDate: string): ExplicitDraft {
  const components: ExplicitComponent[] = [];
  const byName = new Map<string, ExplicitComponent>();
  const cells: Record<string, string> = {};
  let preStart = 0;
  for (const r of [...rows].sort((a, b) => a.month.localeCompare(b.month))) {
    let c = byName.get(r.component);
    if (!c) { c = { id: newComponentId(), name: r.component, fee: !!r.isFee }; byName.set(r.component, c); components.push(c); }
    const month = r.month.slice(0, 10);
    cells[cellKey(c.id, month)] = centsToInput(r.amountCents) || "0.00";
    const before = monthDiff(month, startKey(startDate));
    if (before > 0) preStart = Math.max(preStart, Math.min(before, 2));
  }
  return { components, cells, preStart, allowPreStart: false };
}

/** Spread a monthly pattern over the term so switching to exact dates starts from what is billed today. */
export function explicitFromLines(lines: PaymentLine[], startDate: string, endDate: string): ExplicitDraft {
  const months = termMonths(startDate, endDate);
  const components: ExplicitComponent[] = [];
  const cells: Record<string, string> = {};
  for (const l of lines) {
    const c = { id: newComponentId(), name: l.name, fee: !!l.fee };
    components.push(c);
    for (const m of months) {
      const cents = l.months[Number(m.slice(5, 7)) - 1];
      if (cents > 0) cells[cellKey(c.id, m)] = centsToInput(cents);
    }
  }
  return { components, cells, preStart: 0, allowPreStart: false };
}

const cents = (raw: string | undefined) => (raw === undefined || raw.trim() === "" ? null : parseDollarsToCents(raw.trim()));
export const cellInvalid = (raw: string | undefined) => raw !== undefined && raw.trim() !== "" && (cents(raw) === null || (cents(raw) ?? 0) > MAX_CENTS);

export function explicitRows(d: ExplicitDraft): ExplicitRow[] {
  const out: ExplicitRow[] = [];
  for (const c of d.components) {
    for (const [k, v] of Object.entries(d.cells)) {
      const [id, month] = k.split("|");
      if (id !== c.id) continue;
      const amount = cents(v);
      if (amount !== null) out.push({ component: c.name.trim(), month, amountCents: amount, fee: c.fee });
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month) || a.component.localeCompare(b.component));
}
export const hasPreStartRows = (d: ExplicitDraft, startDate: string) => explicitRows(d).some(r => r.month < startKey(startDate));

export function explicitPayload(d: ExplicitDraft, startDate: string): ExplicitPayload {
  return { schedule: "explicit", rows: explicitRows(d), ...(d.allowPreStart && hasPreStartRows(d, startDate) ? { allowPreStart: true } : {}) };
}
export const explicitFingerprint = (d: ExplicitDraft) => JSON.stringify([
  d.components.map(c => [c.name.trim(), c.fee]),
  d.components.map(c => Object.entries(d.cells).filter(([k, v]) => k.startsWith(`${c.id}|`) && v.trim() !== "").map(([k, v]) => [k.split("|")[1], v.trim()]).sort()),
]);

type T = (key: string, opts?: Record<string, unknown>) => string;
export function explicitProblems(d: ExplicitDraft, startDate: string, endDate: string, t: T, label: (month: string) => string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  d.components.forEach((c, i) => {
    const name = c.name.trim();
    if (!name) out.push(t("contractFees.pNeedsName", { n: i + 1 }));
    else if (seen.has(name.toLowerCase())) out.push(t("contractFees.pDuplicate", { n: i + 1, name }));
    seen.add(name.toLowerCase());
    for (const [k, v] of Object.entries(d.cells)) {
      const [id, month] = k.split("|");
      if (id !== c.id || v.trim() === "") continue;
      if (cellInvalid(v)) out.push(t("contractFees.pAmount", { name: name || `#${i + 1}`, month: label(month) }));
      else if (monthPlace(month, startDate, endDate) === "outside") out.push(t("contractFees.pOutside", { name: name || `#${i + 1}`, month: label(month) }));
    }
  });
  if (hasPreStartRows(d, startDate) && !d.allowPreStart) out.push(t("contractFees.pPreStart"));
  return out;
}

/** Totals for display: contract (non-fee) year 1 from the start month, all-months contract total, and fees. */
export function explicitTotals(d: ExplicitDraft, startDate: string) {
  const s = startKey(startDate), yearEnd = addMonths(s, 11);
  let year1 = 0, contract = 0, fees = 0, feesYear1 = 0;
  for (const r of explicitRows(d)) {
    const inYear1 = r.month >= s && r.month <= yearEnd;
    if (r.fee) { fees += r.amountCents; if (inYear1) feesYear1 += r.amountCents; }
    else { contract += r.amountCents; if (inYear1) year1 += r.amountCents; }
  }
  return { year1, contract, fees, feesYear1 };
}
