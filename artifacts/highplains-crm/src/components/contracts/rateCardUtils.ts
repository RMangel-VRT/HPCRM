import { RATE_CARD_DEFAULTS } from "@/shared/contractCatalog";

export type RateLine = "landscape" | "irrigation" | "snow" | "general";

export interface RateCardItem {
  id: string;
  companyId?: string;
  rateKey: string;
  line: RateLine;
  category: string;
  label: string;
  priceCents: number | null;
  priceText: string | null;
  unit: string;
  minimum: string | null;
  sortOrder: number;
  active: boolean;
}

export const MAX_CENTS = 2147483647;
export const RATE_KEY_RE = /^[a-z][a-z0-9_]{1,62}$/;
export const LINE_ORDER: RateLine[] = ["landscape", "irrigation", "snow", "general"];
export const LINE_LABELS: Record<RateLine, string> = {
  landscape: "Landscape", irrigation: "Irrigation", snow: "Snow", general: "General",
};

export const rateCardQueryKey = (companyId: string | undefined) =>
  ["/api/contract-center/rate-card", companyId ?? "none"] as const;

export function formatDollars(cents: number): string {
  return `$${centsToInput(cents)}`;
}

/** Input value: dollars with two decimals, no symbol. */
export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Returns cents, or null when the text is not a valid non-negative dollar amount. */
export function parseDollarsToCents(raw: string): number | null {
  const s = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

export function groupRates(rows: RateCardItem[]) {
  const out: { line: RateLine; categories: { category: string; rows: RateCardItem[] }[] }[] = [];
  for (const line of LINE_ORDER) {
    const inLine = rows.filter((r) => r.line === line);
    if (!inLine.length) continue;
    const cats: { category: string; rows: RateCardItem[] }[] = [];
    for (const r of inLine) {
      let c = cats.find((x) => x.category === r.category);
      if (!c) cats.push((c = { category: r.category, rows: [] }));
      c.rows.push(r);
    }
    out.push({ line, categories: cats });
  }
  return out;
}

export function missingDefaultCount(rows: RateCardItem[]): number {
  const have = new Set(rows.map((r) => r.rateKey));
  return RATE_CARD_DEFAULTS.filter((d) => !have.has(d.key)).length;
}
