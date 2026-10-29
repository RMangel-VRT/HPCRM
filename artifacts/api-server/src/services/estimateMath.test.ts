import { describe, expect, it } from "vitest";
import { calculateExtendedCents, computeVersionTotals, moneyStringToCents, normalizeQuantity, PLANT_DEFAULT_PRICE } from "./estimateMath";
import { createEstimateLineSchema, patchEstimateLineSchema, patchEstimateSectionSchema, createEstimateSchema, ESTIMATE_UMBRELLAS } from "@workspace/db/estimate-contracts";
import { companyToday } from "../lib/companyDay";

describe("exact estimate arithmetic", () => {
  it.each([["2.5", 33, 83], ["0.01", 50, 1], ["0.01", 49, 0], ["1.01", 150, 152], ["1", 0, 0]])("half-up %s times %s", (qty, cents, expected) => {
    expect(calculateExtendedCents(qty, cents)).toBe(expected);
  });
  it("normalizes exact quantities and money", () => {
    expect(normalizeQuantity("0001.2")).toBe("1.20");
    expect(moneyStringToCents("123.45")).toBe(12345);
    expect(moneyStringToCents("21474836.47")).toBe(2147483647);
    expect(calculateExtendedCents("9999999999.99", 0)).toBe(0);
  });
  it.each(["1.001", "1e2", "-1", "0", "0.00", "10000000000", "1.", ".5", "NaN", " 1"])("rejects unsupported quantity %s", qty => {
    expect(() => normalizeQuantity(qty)).toThrow(RangeError);
  });
  it("rejects overflow without unsafe intermediate arithmetic", () => {
    expect(() => calculateExtendedCents("9999999999.99", 2147483647)).toThrow(RangeError);
    expect(() => calculateExtendedCents("1", 2147483648)).toThrow(RangeError);
    expect(() => calculateExtendedCents("1", 1.1)).toThrow(RangeError);
    expect(() => moneyStringToCents("21474836.48")).toThrow(RangeError);
    expect(() => moneyStringToCents("1.001")).toThrow(RangeError);
  });
  it("plant wholesale first including known zero; otherwise sale then zero", () => {
    expect(PLANT_DEFAULT_PRICE("12.34", "200")).toBe(2468);
    expect(PLANT_DEFAULT_PRICE("0", "200")).toBe(0);
    expect(PLANT_DEFAULT_PRICE(null, "12.34")).toBe(1234);
    expect(PLANT_DEFAULT_PRICE(null, null)).toBe(0);
    expect(() => PLANT_DEFAULT_PRICE("21474836.47", null)).toThrow(RangeError);
  });
  it("margin excludes unknown costs and includes known-zero costs", () => {
    const totals = computeVersionTotals([
      { quantity: "2.5", unitPriceCents: 33, unitCostCents: 10, sectionId: "a", umbrellaKey: "plants" },
      { quantity: "1", unitPriceCents: 10000, unitCostCents: null, sectionId: "b", umbrellaKey: "landscape_labor" },
      { quantity: "1", unitPriceCents: 17, unitCostCents: 0, sectionId: "a", umbrellaKey: "plants" },
    ]);
    expect(totals).toMatchObject({ subtotalCents: 10100, costKnownCents: 25, costUnknownLines: 1, materialMarginPct: 75, bySection: { a: 100, b: 10000 } });
    expect(Object.keys(totals.byUmbrella)).toEqual([...ESTIMATE_UMBRELLAS]);
    expect(totals.byUmbrella.fees_surcharges).toBe(0);
  });
  it("zero revenue margin is explicitly null, even with known cost", () => {
    expect(computeVersionTotals([]).materialMarginPct).toBeNull();
    expect(computeVersionTotals([{ quantity: "1", unitPriceCents: 0, unitCostCents: 50, sectionId: "s", umbrellaKey: "plants" }]).materialMarginPct).toBeNull();
  });
  it("negative and fractional margins are deterministic", () => {
    expect(computeVersionTotals([{ quantity: "1", unitPriceCents: 3, unitCostCents: 4, sectionId: "s", umbrellaKey: "plants" }]).materialMarginPct).toBe(-33.3333);
  });
  it("total overflow is rejected even when individual lines fit", () => {
    expect(() => computeVersionTotals(Array.from({ length: 2 }, () => ({ quantity: "1", unitPriceCents: 2147483647, unitCostCents: null, sectionId: "s", umbrellaKey: "plants" as const })))).toThrow(RangeError);
    expect(() => computeVersionTotals(Array.from({ length: 2 }, () => ({ quantity: "1", unitPriceCents: 0, unitCostCents: 2147483647, sectionId: "s", umbrellaKey: "plants" as const })))).toThrow(RangeError);
  });
  it("Colorado year changes at Colorado midnight, not UTC midnight", () => {
    expect(companyToday(new Date("2027-01-01T06:59:59Z"))).toBe("2026-12-31");
    expect(companyToday(new Date("2027-01-01T07:00:00Z"))).toBe("2027-01-01");
  });
});
describe("driver-free strict contracts", () => {
  it("PATCH has no defaults and retains explicit nulls", () => {
    expect(patchEstimateLineSchema.parse({ quantity: "2" })).toEqual({ quantity: "2" });
    expect(patchEstimateLineSchema.parse({ detail: null, paletteTypeLabel: null })).toEqual({ detail: null, paletteTypeLabel: null });
    expect(patchEstimateSectionSchema.parse({ name: "A" })).toEqual({ name: "A" });
    expect(patchEstimateLineSchema.parse({})).toEqual({});
  });
  it.each(["plant", "hardscape", "irrigation", "labor"])("rejects client price/source/lifecycle overrides on %s", lineType => {
    const reference = lineType === "labor" ? { rateKey: "labor" } : { [`${lineType}CatalogItemId`]: "i" };
    const base = { lineType, sectionId: "s", quantity: "1", ...reference };
    expect(createEstimateLineSchema.safeParse(base).success).toBe(true);
    for (const extra of [{ unitPriceCents: 1 }, { unitCostCents: 0 }, { priceSource: "manual" }, { name: "override" }, { includeInPalette: false }, { extendedCents: 1 }])
      expect(createEstimateLineSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
  it.each(["equipment", "fee"])("enforces exclusive quick-list/free entry for %s", lineType => {
    const base = { lineType, sectionId: "s", quantity: 1 };
    expect(createEstimateLineSchema.safeParse({ ...base, quickItemId: "q" }).success).toBe(true);
    expect(createEstimateLineSchema.safeParse({ ...base, name: "Free", unit: "ea", unitPriceCents: 0, umbrellaKey: "fees_surcharges" }).success).toBe(true);
    expect(createEstimateLineSchema.safeParse({ ...base, quickItemId: "q", unitPriceCents: 0 }).success).toBe(false);
    expect(createEstimateLineSchema.safeParse({ ...base, name: "Incomplete" }).success).toBe(false);
  });
  it("rejects lifecycle writes at both levels", () => {
    expect(createEstimateSchema.safeParse({ customerId: "c", title: "T", voidedAt: null }).success).toBe(false);
    for (const field of ["status", "termId", "priceSource", "unitCostCents", "versionId", "frozenSubtotalCents"])
      expect(patchEstimateLineSchema.safeParse({ [field]: 1 }).success).toBe(false);
  });
});
