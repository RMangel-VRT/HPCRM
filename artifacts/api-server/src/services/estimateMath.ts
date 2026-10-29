import { ESTIMATE_UMBRELLAS, type EstimateUmbrella } from "@workspace/db/estimate-contracts";

const INT_MAX = 2147483647n;
function bounded(value: bigint, maximum = INT_MAX): number {
  if (value < 0n || value > maximum) throw new RangeError("Estimate amount exceeds supported range");
  return Number(value);
}
/** Exact, unsigned decimal conversion. No floating point multiplication or rounding. */
export function decimalHundredths(value: string, max = 999999999999n): bigint {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new RangeError("Unsupported decimal precision");
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result > max) throw new RangeError("Decimal exceeds supported range");
  return result;
}
export function moneyStringToCents(value: string): number {
  return bounded(decimalHundredths(value, INT_MAX));
}
export function quantityHundredths(value: string): bigint {
  const result = decimalHundredths(value);
  if (result === 0n) throw new RangeError("Quantity must be positive");
  return result;
}
export function normalizeQuantity(value: string): string {
  const n = quantityHundredths(value);
  return `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
function centsInteger(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0 || value > Number(INT_MAX)) throw new RangeError("Invalid cents");
  return BigInt(value);
}
/** The ONLY stored extended amount calculation, used on POST and every PATCH. */
export function calculateExtendedCents(quantity: string, cents: number): number {
  return bounded((quantityHundredths(quantity) * centsInteger(cents) + 50n) / 100n);
}
/** Known zero wholesale cost is known, not missing. */
export function PLANT_DEFAULT_PRICE(wholesaleCost: string | null, salePrice: string | null): number {
  return wholesaleCost !== null ? bounded(BigInt(moneyStringToCents(wholesaleCost)) * 2n)
    : salePrice !== null ? moneyStringToCents(salePrice) : 0;
}
export interface TotalsLine {
  quantity: string; unitPriceCents: number; unitCostCents: number | null;
  sectionId: string; umbrellaKey: EstimateUmbrella;
}
/** Integer/BigInt throughout money arithmetic. Totals fit int32 so future frozen
 * columns can persist them. Margin is a percentage, rounded half-up to 4 decimals.
 * A zero known-cost revenue denominator returns null (undefined margin), not NaN.
 */
export function computeVersionTotals(lines: readonly TotalsLine[]) {
  let subtotal = 0n, cost = 0n, knownRevenue = 0n, unknown = 0;
  const umbrellas = Object.fromEntries(ESTIMATE_UMBRELLAS.map(k => [k, 0n])) as Record<EstimateUmbrella, bigint>;
  const sections: Record<string, bigint> = Object.create(null);
  for (const line of lines) {
    const revenue = BigInt(calculateExtendedCents(line.quantity, line.unitPriceCents));
    subtotal += revenue;
    if (!(line.umbrellaKey in umbrellas)) throw new RangeError("Invalid umbrella");
    umbrellas[line.umbrellaKey] += revenue;
    sections[line.sectionId] = (sections[line.sectionId] ?? 0n) + revenue;
    if (line.unitCostCents === null) unknown++;
    else { cost += BigInt(calculateExtendedCents(line.quantity, line.unitCostCents)); knownRevenue += revenue; }
  }
  const diff = knownRevenue - cost;
  const scaledMargin = knownRevenue === 0n ? null
    : ((diff < 0n ? -diff : diff) * 1000000n + knownRevenue / 2n) / knownRevenue * (diff < 0n ? -1n : 1n);
  return {
    subtotalCents: bounded(subtotal), costKnownCents: bounded(cost), costUnknownLines: bounded(BigInt(unknown)),
    materialMarginPct: scaledMargin === null ? null : Number(scaledMargin) / 10000,
    byUmbrella: Object.fromEntries(ESTIMATE_UMBRELLAS.map(k => [k, bounded(umbrellas[k])])) as Record<EstimateUmbrella, number>,
    bySection: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, bounded(v)])),
  };
}
