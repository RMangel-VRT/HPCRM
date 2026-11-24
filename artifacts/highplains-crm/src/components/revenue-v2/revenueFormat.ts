import type { RevenueIncomeMonth, RevenueIncomeStreams } from "@workspace/api-client-react";

import { REVENUE_STREAMS, type RevenueStream } from "../../../../../lib/db/src/revenueStreams";

export { REVENUE_STREAMS };
export type StreamKey = RevenueStream | "other";

/** Tracked streams plus Other only when the server included it. */
export function streamKeys(streams: RevenueIncomeStreams | Partial<Record<StreamKey, unknown>>): StreamKey[] {
  return "other" in streams && streams.other ? [...REVENUE_STREAMS, "other"] : [...REVENUE_STREAMS];
}

export const monthTotal = (m: RevenueIncomeMonth) => (m.earnedCents ?? 0) + m.signedCents + m.estimatedCents;

export function money(cents: number, opts: { compact?: boolean; signed?: boolean } = {}) {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  let body: string;
  if (opts.compact && abs >= 1000) {
    body = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M` : `$${Math.round(abs / 1000)}k`;
  } else {
    body = `$${Math.round(abs).toLocaleString("en-US")}`;
  }
  const sign = dollars < 0 ? "\u2212" : opts.signed && dollars > 0 ? "+" : "";
  return sign + body;
}

export function pct(value: number | null, opts: { signed?: boolean; digits?: number } = {}) {
  if (value === null || !Number.isFinite(value)) return null;
  const d = opts.digits ?? 0;
  const txt = Math.abs(value).toFixed(d);
  const sign = value < 0 ? "\u2212" : opts.signed && value > 0 ? "+" : "";
  return `${sign}${txt}%`;
}

export const ratioPct = (part: number, whole: number) => (whole === 0 ? null : (part / whole) * 100);
export const changePct = (now: number, before: number) => (before === 0 ? null : ((now - before) / Math.abs(before)) * 100);

export function monthLabels(lang: string, style: "short" | "long" = "short") {
  const fmt = new Intl.DateTimeFormat(lang, { month: style, timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => {
    const s = fmt.format(new Date(Date.UTC(2020, i, 1)));
    return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
  });
}

/** 0-based index of closedThrough month, or -1 when no month has closed (January). */
export const closedIndex = (closedThrough: string | null) => (closedThrough ? Number(closedThrough.slice(5, 7)) - 1 : -1);

export type MonthKind = "earned" | "signed" | "estimated" | "mixed" | "partial" | "unavailable" | "empty";

/** Classifies a month from the supplied components; never recomputes the forecast. */
export function monthKind(m: RevenueIncomeMonth, closed: boolean, qboMissing: boolean): MonthKind {
  if (m.earnedCents !== null) return "earned";
  // Closed month without a QuickBooks pull: earned is unknown, so any signed billing is only a fallback.
  if (closed && qboMissing) return m.signedCents !== 0 ? "partial" : "unavailable";
  if (m.signedCents !== 0 && m.estimatedCents !== 0) return "mixed";
  if (m.signedCents !== 0) return "signed";
  if (m.estimatedCents !== 0) return "estimated";
  return closed && qboMissing ? "unavailable" : "empty";
}

export const streamVar = (key: StreamKey | "all") => `var(--rv-${key})`;

/** Prior-year comparison: distinguishes an unloaded prior year from a real zero denominator. */
export type PriorChange = { state: "unloaded" } | { state: "fromZero"; now: number } | { state: "pct"; value: number };
export function priorChange(now: number, before: number, loaded: boolean): PriorChange {
  if (!loaded) return { state: "unloaded" };
  if (before === 0) return { state: "fromZero", now };
  return { state: "pct", value: ((now - before) / Math.abs(before)) * 100 };
}
