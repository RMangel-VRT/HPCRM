import { describe, expect, it } from "vitest";
import { estimateDiscountInputSchema, patchEstimateVersionSchema } from "@workspace/db/estimate-contracts";
import { basisPointsToPercentString, computeVersionTotals, displayedVersionTotal, percentStringToBasisPoints, versionDiscounts,
  type TotalsLine } from "./estimateMath";

type Umbrella = TotalsLine["umbrellaKey"];
const line = (id: string, lineType: string, cents: number, umbrellaKey: Umbrella, extra: Partial<TotalsLine> = {}): TotalsLine =>
  ({ id, lineType, quantity: "1", unitPriceCents: cents, unitCostCents: null, sectionId: "s1", umbrellaKey, sortOrder: 0, ...extra });

const mixed = [
  line("labor-a", "labor", 40000, "landscape_labor", { sortOrder: 0 }),
  line("labor-b", "labor", 20000, "irrigation_labor", { sortOrder: 1, sectionId: "s2" }),
  line("equip", "equipment", 15000, "fees_surcharges", { sortOrder: 2 }),
  line("svc", "service", 10000, "landscape_labor", { sortOrder: 3 }),
  line("fee", "fee", 5000, "fees_surcharges", { sortOrder: 4 }),
  line("plant", "plant", 30000, "plants", { sortOrder: 5, unitCostCents: 15000 }),
];

describe("estimate discount math", () => {
  it("undiscounted results are identical to the gross figures", () => {
    const base = computeVersionTotals(mixed);
    expect(base).toMatchObject({ subtotalCents: 120000, laborDiscountCents: 0, totalDiscountCents: 0, totalCents: 120000,
      laborDiscountCapped: false, totalDiscountCapped: false, laborDiscountNoLaborLines: false });
    expect(base.byUmbrellaNet).toEqual(base.byUmbrella);
    expect(base.bySectionNet).toEqual(base.bySection);
    expect(base.materialMarginPct).toBe(base.materialMarginGrossPct);
    expect(computeVersionTotals(mixed, { labor: null, total: null })).toEqual(base);
  });

  it("labor percent touches only labor lines; equipment, service and fee keep full price", () => {
    const t = computeVersionTotals(mixed, { labor: { kind: "percent", value: 1500 } });
    expect(t.laborBaseCents).toBe(60000);
    expect(t.laborDiscountCents).toBe(9000);
    expect(t.totalCents).toBe(111000);
    expect(t.subtotalCents).toBe(120000);
    // Gross groupings unchanged; net labor umbrellas carry the whole discount pro rata.
    expect(t.byUmbrella).toEqual(computeVersionTotals(mixed).byUmbrella);
    expect(t.byUmbrellaNet.landscape_labor).toBe(40000 - 6000 + 10000);
    expect(t.byUmbrellaNet.irrigation_labor).toBe(20000 - 3000);
    expect(t.byUmbrellaNet.fees_surcharges).toBe(20000);
    expect(t.byUmbrellaNet.plants).toBe(30000);
  });

  it("applies labor first, then the total discount on what remains", () => {
    const t = computeVersionTotals(mixed, { labor: { kind: "percent", value: 1500 }, total: { kind: "percent", value: 1000 } });
    expect(t.laborDiscountCents).toBe(9000);
    expect(t.totalDiscountCents).toBe(11100); // 10% of 111000, not of 120000
    expect(t.totalCents).toBe(99900);
    const amounts = computeVersionTotals(mixed, { labor: { kind: "amount", value: 2500 }, total: { kind: "amount", value: 7500 } });
    expect(amounts).toMatchObject({ laborDiscountCents: 2500, totalDiscountCents: 7500, totalCents: 110000 });
  });

  it("caps amounts at their base and reports the no-labor case", () => {
    const capped = computeVersionTotals(mixed, { labor: { kind: "amount", value: 99999999 }, total: { kind: "amount", value: 99999999 } });
    expect(capped).toMatchObject({ laborDiscountCents: 60000, totalDiscountCents: 60000, totalCents: 0, laborDiscountCapped: true, totalDiscountCapped: true });
    expect(Object.values(capped.byUmbrellaNet).every(v => v === 0)).toBe(true);
    const noLabor = computeVersionTotals([line("p", "plant", 1000, "plants")], { labor: { kind: "percent", value: 5000 } });
    expect(noLabor).toMatchObject({ laborDiscountCents: 0, totalCents: 1000, laborDiscountNoLaborLines: true, laborDiscountCapped: false });
    const noLaborAmount = computeVersionTotals([line("p", "plant", 1000, "plants")], { labor: { kind: "amount", value: 500 } });
    expect(noLaborAmount).toMatchObject({ laborDiscountCents: 0, laborDiscountNoLaborLines: true, laborDiscountCapped: false });
    expect(computeVersionTotals([], { total: { kind: "percent", value: 10000 } })).toMatchObject({ totalCents: 0, totalDiscountCents: 0 });
    expect(computeVersionTotals(mixed, { total: { kind: "percent", value: 10000 } }).totalCents).toBe(0);
  });

  it("rounds half up in integer cents", () => {
    // 15% of $0.33 = 4.95¢ → 5¢; 15% of $0.03 = 0.45¢ → 0¢; 50% of $0.01 = 0.5¢ → 1¢.
    expect(computeVersionTotals([line("l", "labor", 33, "landscape_labor")], { labor: { kind: "percent", value: 1500 } }).laborDiscountCents).toBe(5);
    expect(computeVersionTotals([line("l", "labor", 3, "landscape_labor")], { labor: { kind: "percent", value: 1500 } }).laborDiscountCents).toBe(0);
    expect(computeVersionTotals([line("l", "labor", 1, "landscape_labor")], { labor: { kind: "percent", value: 5000 } }).laborDiscountCents).toBe(1);
    expect(computeVersionTotals([line("l", "labor", 1, "landscape_labor")], { total: { kind: "percent", value: 1 } }).totalDiscountCents).toBe(0);
  });

  it("largest-remainder allocation sums exactly and breaks ties by sortOrder, then id", () => {
    const three = [line("c", "labor", 100, "landscape_labor", { sortOrder: 1 }), line("a", "labor", 100, "irrigation_labor", { sortOrder: 1, sectionId: "s2" }),
      line("b", "labor", 100, "landscape_labor", { sortOrder: 0, sectionId: "s3" })];
    const t = computeVersionTotals(three, { labor: { kind: "amount", value: 2 } });
    // Equal remainders: sortOrder 0 ("b") first, then id "a" before "c".
    expect(t.bySectionNet).toEqual({ s1: 100, s2: 99, s3: 99 });
    expect(t.byUmbrellaNet.landscape_labor + t.byUmbrellaNet.irrigation_labor).toBe(298);
    // Input order never changes the result.
    expect(computeVersionTotals([...three].reverse(), { labor: { kind: "amount", value: 2 } }).bySectionNet).toEqual(t.bySectionNet);
    for (const value of [1, 7, 333, 1234, 9999]) {
      const r = computeVersionTotals(mixed, { labor: { kind: "percent", value }, total: { kind: "amount", value: value * 3 } });
      const net = Object.values(r.byUmbrellaNet).reduce((a, b) => a + b, 0);
      expect(net).toBe(r.totalCents);
      expect(Object.values(r.bySectionNet).reduce((a, b) => a + b, 0)).toBe(r.totalCents);
      expect(Object.values(r.byUmbrellaNet).every(v => v >= 0)).toBe(true);
    }
  });

  it("net margin uses allocated net revenue; gross margin keeps the old figure; undefined stays null", () => {
    const lines = [line("plant", "plant", 10000, "plants", { unitCostCents: 5000 }), line("l", "labor", 10000, "landscape_labor")];
    const t = computeVersionTotals(lines, { total: { kind: "percent", value: 1000 } });
    expect(t.materialMarginGrossPct).toBe(50);
    // Plant net = 10000 − 1000 = 9000; (9000 − 5000) / 9000 = 44.4444%.
    expect(t.materialMarginPct).toBe(44.4444);
    // Labor-only discount never moves the material margin.
    expect(computeVersionTotals(lines, { labor: { kind: "percent", value: 5000 } }).materialMarginPct).toBe(50);
    const all = computeVersionTotals(lines, { total: { kind: "percent", value: 10000 } });
    expect(all.materialMarginPct).toBeNull();
    expect(all.materialMarginGrossPct).toBe(50);
    expect(computeVersionTotals([line("l", "labor", 100, "landscape_labor")], { total: { kind: "amount", value: 10 } }).materialMarginPct).toBeNull();
  });

  it("rejects invalid settings and keeps every output bounded", () => {
    expect(() => computeVersionTotals(mixed, { labor: { kind: "percent", value: 10001 } })).toThrow(RangeError);
    expect(() => computeVersionTotals(mixed, { total: { kind: "amount", value: 0 } })).toThrow(RangeError);
    expect(() => computeVersionTotals(mixed, { total: { kind: "amount", value: 1.5 } })).toThrow(RangeError);
    expect(() => computeVersionTotals(mixed, { total: { kind: "bogus" as "amount", value: 5 } })).toThrow(RangeError);
    const max = computeVersionTotals([line("l", "labor", 2147483647, "landscape_labor")], { labor: { kind: "percent", value: 9999 }, total: { kind: "percent", value: 9999 } });
    expect(max.totalCents).toBeGreaterThanOrEqual(0);
    expect(max.laborDiscountCents + max.totalDiscountCents + max.totalCents).toBe(2147483647);
  });

  it("converts percent strings exactly and displays them compactly", () => {
    expect(percentStringToBasisPoints("15")).toBe(1500);
    expect(percentStringToBasisPoints("12.5")).toBe(1250);
    expect(percentStringToBasisPoints("0.01")).toBe(1);
    expect(percentStringToBasisPoints("100")).toBe(10000);
    expect(percentStringToBasisPoints("33.33")).toBe(3333);
    for (const bad of ["0", "100.01", "1.234", "-5", "1e2", ""]) expect(() => percentStringToBasisPoints(bad)).toThrow(RangeError);
    expect(basisPointsToPercentString(1500)).toBe("15");
    expect(basisPointsToPercentString(1250)).toBe("12.5");
    expect(basisPointsToPercentString(1)).toBe("0.01");
    expect(basisPointsToPercentString(10000)).toBe("100");
  });

  it("reads version settings and resolves displayed totals with the legacy fallback", () => {
    expect(versionDiscounts({ laborDiscountKind: "percent", laborDiscountValue: 1500, totalDiscountKind: null, totalDiscountValue: null }))
      .toEqual({ labor: { kind: "percent", value: 1500 }, total: null });
    const never = () => { throw new Error("frozen versions never recompute"); };
    expect(displayedVersionTotal({ status: "sent", frozenTotalCents: 900, frozenSubtotalCents: 1000 }, never)).toBe(900);
    expect(displayedVersionTotal({ status: "accepted", frozenTotalCents: null, frozenSubtotalCents: 1000 }, never)).toBe(1000);
    expect(displayedVersionTotal({ status: "draft", frozenTotalCents: null, frozenSubtotalCents: null }, () => 42)).toBe(42);
  });
});

describe("discount PATCH contract", () => {
  it("is no-defaults: omitted keys stay absent and null clears", () => {
    expect(patchEstimateVersionSchema.parse({})).toEqual({});
    expect(patchEstimateVersionSchema.parse({ laborDiscount: null })).toEqual({ laborDiscount: null });
    expect(patchEstimateVersionSchema.parse({ totalDiscount: { kind: "amount", value: "250.00" } })).toEqual({ totalDiscount: { kind: "amount", value: "250.00" } });
    expect(patchEstimateVersionSchema.parse({ laborDiscount: { kind: "percent", value: "15", label: "Winter labor discount" } }))
      .toEqual({ laborDiscount: { kind: "percent", value: "15", label: "Winter labor discount" } });
  });
  it("rejects floats, out-of-range percents, zero amounts, unknown kinds and extra keys", () => {
    for (const bad of [
      { kind: "percent", value: 15 }, { kind: "percent", value: "0" }, { kind: "percent", value: "100.01" }, { kind: "percent", value: "1.234" },
      { kind: "amount", value: "0.00" }, { kind: "amount", value: "-5" }, { kind: "amount", value: "21474836.48" }, { kind: "fixed", value: "5" },
      { kind: "amount", value: "5", extra: true }, { kind: "amount", value: "5", label: "x".repeat(81) },
    ]) expect(estimateDiscountInputSchema.safeParse(bad).success).toBe(false);
    expect(patchEstimateVersionSchema.safeParse({ frozenTotalCents: 1 }).success).toBe(false);
    expect(patchEstimateVersionSchema.safeParse({ laborDiscountValue: 1500 }).success).toBe(false);
  });
});
