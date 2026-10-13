import { cycleOrder, equal12, equalOver, flatSnow, msi } from "./paymentPresets";
import { MAX_CENTS, centsToInput, parseDollarsToCents } from "./rateCardUtils";

export type PresetKey = "equal12" | "msi" | "equalOver" | "flatSnow" | "custom";
export const PRESET_LABEL: Record<PresetKey, string> = {
  equal12: "12 equal payments", msi: "MSI: 4 \u00d7 5% + 8 \u00d7 10%", equalOver: "Equal over chosen months",
  flatSnow: "Flat snow: 5 equal, Dec\u2013Apr", custom: "Custom",
};
export const SNOW_LINE = "Snow";
export const GROUNDS_LINE = "Grounds maintenance";
export const LINE_SUGGESTIONS = [GROUNDS_LINE, "Fertilization", "Irrigation", SNOW_LINE];

export interface PaymentLine {
  id: string;
  name: string;
  preset: PresetKey;
  /** Yearly total as typed, in dollars. */
  total: string;
  /** Twelve amounts in cents, indexed by calendar month (index 0 = January). */
  months: number[];
  /** Calendar months (1-12) used by "Equal over chosen months". */
  chosen: number[];
  pickerOpen: boolean;
  /** Raw text of month amounts that are not valid dollar amounts (calendar month -> text). */
  invalid: Record<number, string>;
}
export interface PaymentWire { component: string; months: { month: number; amountCents: number }[] }

let counter = 0;
export const newLineId = () => `line-${Date.now().toString(36)}-${counter++}`;
export const blankLine = (name = "", over: Partial<PaymentLine> = {}): PaymentLine => ({
  id: newLineId(), name, preset: "custom", total: "", months: Array(12).fill(0), chosen: [], pickerOpen: false, invalid: {}, ...over,
});

export const totalCents = (line: PaymentLine): number | null => {
  if (line.total.trim() === "") return null;
  return parseDollarsToCents(line.total);
};
export const lineSum = (line: PaymentLine) => line.months.reduce((a, b) => a + b, 0);
export const annualCents = (lines: PaymentLine[]) => lines.reduce((s, l) => s + lineSum(l), 0);
/** Months add up to a different number than the typed total. */
export const lineMismatch = (line: PaymentLine): { sum: number; total: number } | null => {
  const total = totalCents(line);
  if (total === null) return null;
  const sum = lineSum(line);
  return sum === total ? null : { sum, total };
};
export const monthPct = (line: PaymentLine, month: number): number => {
  const sum = lineSum(line);
  return sum > 0 ? (line.months[month - 1] / sum) * 100 : 0;
};
export const startMonthOf = (startDate: string) => Number(startDate.slice(5, 7)) || 1;
export const cycle = (startMonth: number): number[] => cycleOrder(startMonth);

/** Fill a line from its typed total. Odd cents are placed by the preset functions. */
export function applyPreset(line: PaymentLine, preset: PresetKey, startMonth: number): PaymentLine {
  if (preset === "custom") return { ...line, preset };
  const total = totalCents(line);
  const zero = Array(12).fill(0);
  if (total === null || total <= 0) return { ...line, preset, months: zero };
  const out = preset === "equal12" ? equal12(total, startMonth) : preset === "msi" ? msi(total, startMonth)
    : preset === "flatSnow" ? flatSnow(total, startMonth)
      : line.chosen.length ? equalOver(total, line.chosen, startMonth) : { amounts: zero };
  return { ...line, preset, months: [...out.amounts] };
}
/** Re-run the current preset (after a total, month choice or start month change). */
export const totalInvalid = (line: PaymentLine) => line.total.trim() !== "" && parseDollarsToCents(line.total) === null;
export const recompute = (line: PaymentLine, startMonth: number) =>
  line.preset === "custom" || totalInvalid(line) ? line : applyPreset(line, line.preset, startMonth);

export function setMonthCents(line: PaymentLine, month: number, cents: number): PaymentLine {
  const months = [...line.months]; months[month - 1] = cents;
  const invalid = { ...(line.invalid ?? {}) }; delete invalid[month];
  return { ...line, months, invalid, preset: "custom" };
}
/** Typed month text: valid text sets cents; anything else is kept as raw text and blocks saving. */
export function setMonthRaw(line: PaymentLine, month: number, raw: string): PaymentLine {
  const t = raw.trim();
  const c = t === "" ? 0 : parseDollarsToCents(t);
  if (c !== null) return setMonthCents(line, month, c);
  return { ...line, invalid: { ...(line.invalid ?? {}), [month]: raw }, preset: "custom" };
}

export const lineProblems = (lines: PaymentLine[], requireSnow = false): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  lines.forEach((l, i) => {
    const name = l.name.trim(), n = i + 1;
    if (!name) out.push(`Payment line ${n} needs a name`);
    else if (name.length > 150) out.push(`Payment line ${n}: the name can be at most 150 characters`);
    else if (seen.has(name.toLowerCase())) out.push(`Payment line ${n}: "${name}" is already used by another line`);
    seen.add(name.toLowerCase());
    if (Object.keys(l.invalid ?? {}).length) out.push(`Payment line ${n}: enter month amounts as dollars, like 1,250.00`);
    if (totalInvalid(l)) out.push(`Payment line ${n}: the yearly total is not a dollar amount`);
    if (l.months.some(m => !Number.isInteger(m) || m < 0 || m > MAX_CENTS)) out.push(`Payment line ${n}: a month amount is out of range`);
  });
  if (annualCents(lines) > MAX_CENTS) out.push("The annual price is too large");
  if (requireSnow && !lines.some(l => l.name.trim() === SNOW_LINE && lineSum(l) > 0)) {
    out.push('Flat-rate snow requires a payment line named "Snow" with a yearly amount above $0');
  }
  return out;
};

/** Body for PUT .../payments and POST contract. Empty lines are left out. */
export function paymentsPayload(lines: PaymentLine[]): PaymentWire[] {
  return lines.filter(l => lineSum(l) > 0).map(l => ({
    component: l.name.trim(),
    months: l.months.map((amountCents, i) => ({ month: i + 1, amountCents })).filter(m => m.amountCents > 0),
  }));
}
export const paymentsFingerprint = (lines: PaymentLine[]) =>
  // Raw invalid totals count as edits even when the last valid cents did not change.
  JSON.stringify(lines.map(l => [l.name.trim(), l.months, l.total, l.invalid ?? {}]));

/** Read-only or edit lines from stored payment patterns (calendar months). */
export function linesFromPayments(payments: PaymentWire[]): PaymentLine[] {
  return payments.map(p => {
    const months = Array(12).fill(0);
    for (const m of p.months) months[m.month - 1] = m.amountCents;
    return blankLine(p.component, { months, total: centsToInput(months.reduce((a, b) => a + b, 0)) });
  });
}
/** One year's pattern per component from stored billing rows (first occurrence of each calendar month wins). */
export function linesFromBilling(rows: { component: string; month: string; amountCents: number }[]): PaymentLine[] {
  const by = new Map<string, Map<number, number>>();
  for (const r of [...rows].sort((a, b) => a.month.localeCompare(b.month))) {
    if (!by.has(r.component)) by.set(r.component, new Map());
    const m = Number(r.month.slice(5, 7));
    if (!by.get(r.component)!.has(m)) by.get(r.component)!.set(m, r.amountCents);
  }
  return linesFromPayments([...by].map(([component, map]) => ({
    component, months: [...map].map(([month, amountCents]) => ({ month, amountCents })),
  })));
}
/** Monthly amount when every month of the cycle has the same combined total. */
export function equalMonthly(lines: PaymentLine[]): number | null {
  const totals = Array.from({ length: 12 }, (_, i) => lines.reduce((s, l) => s + l.months[i], 0));
  return totals[0] > 0 && totals.every(t => t === totals[0]) ? totals[0] : null;
}
