import { ESTIMATE_UMBRELLAS, type EstimateDiscountKind, type EstimateUmbrella } from "./estimateContracts";

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
/** Exact percent string ("15", "12.5", "7.25") to basis points, 1–10000. No floats. */
export function percentStringToBasisPoints(value: string): number {
  const result = decimalHundredths(value, 10000n);
  if (result === 0n) throw new RangeError("Percent must be positive");
  return Number(result);
}
/** Basis points to the shortest exact percent text: 1500 → "15", 1250 → "12.5". */
export function basisPointsToPercentString(bp: number): string {
  const whole = Math.trunc(bp / 100), fraction = String(bp % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export interface TotalsLine {
  quantity: string; unitPriceCents: number; unitCostCents: number | null;
  sectionId: string; umbrellaKey: EstimateUmbrella; lineType: string;
  /** Allocation tie-breakers; input order is the final fallback. */
  sortOrder?: number; id?: string;
}
export interface DiscountSetting { kind: EstimateDiscountKind; value: number }
export interface VersionDiscounts { labor?: DiscountSetting | null; total?: DiscountSetting | null }

function discountValue(setting: DiscountSetting): bigint {
  if (!Number.isSafeInteger(setting.value) || setting.value < 1
    || (setting.kind === "percent" ? setting.value > 10000 : setting.value > Number(INT_MAX))
    || (setting.kind !== "percent" && setting.kind !== "amount")) throw new RangeError("Invalid discount");
  return BigInt(setting.value);
}
/** Returns the (possibly capped) discount and whether an amount exceeded its base. */
function applyDiscount(base: bigint, setting: DiscountSetting | null | undefined): { cents: bigint; capped: boolean } {
  if (!setting) return { cents: 0n, capped: false };
  const value = discountValue(setting);
  if (setting.kind === "percent") return { cents: (base * value + 5000n) / 10000n, capped: false };
  return value > base ? { cents: base, capped: true } : { cents: value, capped: false };
}
/** Integer largest-remainder split of `amount` across `weights` (amount ≤ Σ weights).
 * Remainder ties go to the lower sortOrder, then lower id, then earlier input. */
function allocate(amount: bigint, weights: readonly bigint[], lines: readonly TotalsLine[]): bigint[] {
  const total = weights.reduce((sum, w) => sum + w, 0n);
  if (amount === 0n || total === 0n) return weights.map(() => 0n);
  const shares = weights.map(w => (amount * w) / total);
  let left = amount - shares.reduce((sum, s) => sum + s, 0n);
  const order = weights.map((w, i) => ({ i, rem: (amount * w) % total }))
    .sort((a, b) => (a.rem === b.rem ? 0 : a.rem > b.rem ? -1 : 1)
      || (lines[a.i].sortOrder ?? 0) - (lines[b.i].sortOrder ?? 0)
      || (lines[a.i].id ?? "").localeCompare(lines[b.i].id ?? "") || a.i - b.i);
  for (const { i, rem } of order) {
    if (left === 0n || rem === 0n) break;
    shares[i]++; left--;
  }
  return shares;
}
function marginPct(revenue: bigint, cost: bigint): number | null {
  if (revenue === 0n) return null;
  const diff = revenue - cost;
  const scaled = ((diff < 0n ? -diff : diff) * 1000000n + revenue / 2n) / revenue * (diff < 0n ? -1n : 1n);
  return Number(scaled) / 10000;
}
const groupTotals = (values: Record<string, bigint>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, bounded(v)]));

/** Integer/BigInt throughout money arithmetic; every output fits int32 so frozen
 * columns can persist it. Margins are percentages rounded half-up to 4 decimals;
 * a zero known-cost revenue denominator returns null (undefined margin), not NaN.
 *
 * Discounts: the labor discount applies to `lineType === "labor"` lines only;
 * the total discount then applies to what remains. Amounts cap at their base.
 * Gross groupings (byUmbrella/bySection/subtotal) never change; net groupings
 * carry the deterministic per-line allocation. Without discounts net === gross.
 */
export function computeVersionTotals(lines: readonly TotalsLine[], discounts: VersionDiscounts = {}) {
  let subtotal = 0n, cost = 0n, knownRevenue = 0n, laborBase = 0n, unknown = 0, hasLabor = false;
  const revenues: bigint[] = [];
  for (const line of lines) {
    if (!(ESTIMATE_UMBRELLAS as readonly string[]).includes(line.umbrellaKey)) throw new RangeError("Invalid umbrella");
    const revenue = BigInt(calculateExtendedCents(line.quantity, line.unitPriceCents));
    revenues.push(revenue);
    subtotal += revenue;
    if (line.lineType === "labor") { laborBase += revenue; hasLabor = true; }
    if (line.unitCostCents === null) unknown++;
    else { cost += BigInt(calculateExtendedCents(line.quantity, line.unitCostCents)); knownRevenue += revenue; }
  }
  const labor = applyDiscount(laborBase, discounts.labor);
  const laborShares = allocate(labor.cents, lines.map((l, i) => l.lineType === "labor" ? revenues[i] : 0n), lines);
  const afterLabor = subtotal - labor.cents;
  const total = applyDiscount(afterLabor, discounts.total);
  const afterLaborLines = revenues.map((r, i) => r - laborShares[i]);
  const totalShares = allocate(total.cents, afterLaborLines, lines);

  const zero = () => Object.fromEntries(ESTIMATE_UMBRELLAS.map(k => [k, 0n])) as Record<EstimateUmbrella, bigint>;
  const umbrellas = zero(), umbrellasNet = zero();
  const sections: Record<string, bigint> = Object.create(null), sectionsNet: Record<string, bigint> = Object.create(null);
  let knownNet = 0n;
  lines.forEach((line, i) => {
    const net = afterLaborLines[i] - totalShares[i];
    umbrellas[line.umbrellaKey] += revenues[i];
    umbrellasNet[line.umbrellaKey] += net;
    sections[line.sectionId] = (sections[line.sectionId] ?? 0n) + revenues[i];
    sectionsNet[line.sectionId] = (sectionsNet[line.sectionId] ?? 0n) + net;
    if (line.unitCostCents !== null) knownNet += net;
  });
  return {
    subtotalCents: bounded(subtotal), costKnownCents: bounded(cost), costUnknownLines: bounded(BigInt(unknown)),
    /** Net (after discounts) known-cost margin. Equals the gross figure when undiscounted. */
    materialMarginPct: marginPct(knownNet, cost),
    materialMarginGrossPct: marginPct(knownRevenue, cost),
    byUmbrella: groupTotals(umbrellas) as Record<EstimateUmbrella, number>,
    bySection: groupTotals(sections),
    byUmbrellaNet: groupTotals(umbrellasNet) as Record<EstimateUmbrella, number>,
    bySectionNet: groupTotals(sectionsNet),
    laborBaseCents: bounded(laborBase),
    laborDiscountCents: bounded(labor.cents), totalDiscountCents: bounded(total.cents),
    totalCents: bounded(afterLabor - total.cents),
    /** An amount exceeded its base and was reduced. Not set when there is no labor to discount. */
    laborDiscountCapped: labor.capped && hasLabor, totalDiscountCapped: total.capped,
    /** A labor discount is set but the version has no labor lines; it applies 0. */
    laborDiscountNoLaborLines: !!discounts.labor && !hasLabor,
  };
}
export type VersionTotals = ReturnType<typeof computeVersionTotals>;

/** Versions carry their discount settings as nullable kind/value columns. */
export function versionDiscounts(version: {
  laborDiscountKind?: EstimateDiscountKind | null; laborDiscountValue?: number | null;
  totalDiscountKind?: EstimateDiscountKind | null; totalDiscountValue?: number | null;
}): VersionDiscounts {
  return {
    labor: version.laborDiscountKind && version.laborDiscountValue != null ? { kind: version.laborDiscountKind, value: version.laborDiscountValue } : null,
    total: version.totalDiscountKind && version.totalDiscountValue != null ? { kind: version.totalDiscountKind, value: version.totalDiscountValue } : null,
  };
}
/** The customer-facing total of any version: live for a draft, frozen otherwise.
 * Versions frozen before discounts existed have no frozen total; their gross
 * frozen subtotal was the whole price. Never re-derives a frozen version. */
export function displayedVersionTotal(version: {
  status: string; frozenTotalCents?: number | null; frozenSubtotalCents?: number | null;
}, liveTotal: () => number): number | null {
  return version.status === "draft" ? liveTotal() : version.frozenTotalCents ?? version.frozenSubtotalCents ?? null;
}
