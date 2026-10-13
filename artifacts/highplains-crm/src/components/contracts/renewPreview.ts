import type { PaymentWire } from "./paymentDraft";

export type RoundTo = "dollar" | "twelve";
export interface RenewRateChange {
  rateKey: string; label: string;
  old: { priceCents: number | null; priceText: string | null };
  new: { priceCents: number | null; priceText: string | null };
  reason: string;
}
export interface RenewPreview {
  seasonLabel: string; startDate: string; endDate: string; annualPriceCents?: number | null;
  payments: { component: string; before: PaymentWire["months"]; after: PaymentWire["months"] }[];
  snowFlatPrice: { before: number | null; after: number | null };
  rateChanges: RenewRateChange[];
}

/** Increase % as the server accepts it (-50 to 100); null while the input is not a valid number. */
export function parsePct(raw: string): number | null {
  const t = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= -50 && n <= 100 ? n : null;
}

export const previewKey = (pct: number, roundTo: RoundTo) => `${pct}|${roundTo}`;

/** Only the newest request may deliver its result. */
export function createSequencer() {
  let n = 0;
  return { next: () => ++n, isCurrent: (id: number) => id === n, cancel: () => { n++; } };
}

export const sumMonths = (months: { amountCents: number }[]) => months.reduce((s, m) => s + m.amountCents, 0);

/** Only rates that actually move, plus every kept override. */
export function visibleRateChanges(changes: RenewRateChange[]) {
  const moved = (c: RenewRateChange) => c.old.priceCents !== c.new.priceCents || (c.old.priceText ?? null) !== (c.new.priceText ?? null);
  return {
    card: changes.filter(c => c.reason === "card changed" && moved(c)),
    kept: changes.filter(c => c.reason === "kept override"),
  };
}
