import { describe, expect, it } from "vitest";
import { ESTIMATE_UNITS, ESTIMATE_UNIT_ALIASES, normalizeEstimateUnit, formatEstimateUnit } from "../../../../lib/db/src/estimateUnits";
import { createEstimateLineSchema, patchEstimateLineSchema } from "../../../../lib/db/src/estimateContracts";
import { createHardscapeBody, parseHardscapeCsv, exportHardscapeCsv } from "./hardscapeCsv";
import { parseIrrigationCsv } from "./irrigationCsv";
import { canonicalEstimateUnit } from "../services/estimateUnit";
import { createQuickItemSchema, createServiceCategorySchema } from "@workspace/db";

describe("one estimate unit contract at write/import boundaries", () => {
  it.each(Object.entries(ESTIMATE_UNIT_ALIASES))("maps legacy %s to %s ignoring case and outer whitespace", (old, unit) => {
    expect(normalizeEstimateUnit(` ${old.toUpperCase()} `)).toBe(unit);
    expect(formatEstimateUnit(old)).toBe(unit);
  });
  it.each(ESTIMATE_UNITS)("accepts canonical %s unchanged everywhere new units are written", unit => {
    expect(normalizeEstimateUnit(unit)).toBe(unit);
    expect(createHardscapeBody.parse({ name: "Test", category: "general", unit }).unit).toBe(unit);
    expect(createEstimateLineSchema.parse({ sectionId: "s", lineType: "custom", name: "Test", unit, quantity: "1",
      unitPriceCents: 100, umbrellaKey: "landscape_materials" })).toMatchObject({ unit });
    expect(patchEstimateLineSchema.parse({ unit })).toEqual({ unit });
    expect(canonicalEstimateUnit(unit)).toBe(unit);
    expect(createQuickItemSchema.parse({ kind: "equipment", label: "Test", defaultUnit: unit }).defaultUnit).toBe(unit);
    expect(createServiceCategorySchema.parse({ name: "Test", defaultUnit: unit }).defaultUnit).toBe(unit);
  });
  it.each(["pallet", "meters", " visitx ", "", "constructor", "__proto__"])("does not invent a unit for %s", unit => {
    expect(normalizeEstimateUnit(unit)).toBeUndefined();
    expect(formatEstimateUnit(unit)).toBe(unit);
    expect(() => canonicalEstimateUnit(unit)).toThrow();
    expect(patchEstimateLineSchema.safeParse({ unit }).success).toBe(false);
    expect(createHardscapeBody.safeParse({ name: "Test", category: "general", unit }).success).toBe(false);
  });
  it("normalizes import aliases, reports invalid physical rows and retains unknown export bytes", () => {
    const rows = parseHardscapeCsv('sku,category,name,description,unit,wholesale_cost,retail_price,active\n1,general,Yard,, yd3 ,,,true\n2,general,Unknown,,pallet,,,true');
    expect(rows[0].data?.unit).toBe("CU. YD");
    expect(rows[1]).toMatchObject({ line: 3, reason: expect.stringContaining("unit") });
    const irrigation = parseIrrigationCsv("sku,name,category,price,unit\n1,One,Parts,1,each\n2,Two,Parts,1,pallet");
    expect(irrigation.rows[0].unit).toBe("EA");
    expect(irrigation.skippedRows).toEqual([{ line: 3, reason: "Invalid unit: pallet" }]);
    expect([...irrigation.presentSkus]).toEqual(["1", "2"]); // invalid rows still protect existing SKUs
    expect(() => parseIrrigationCsv("sku,name,category,price,unit\n1,One,Parts,1,pallet")).toThrow("not replaced");
    const csv = exportHardscapeCsv([{ unit: "yd3" }, { unit: "pallet" }] as never);
    expect(csv).toContain("CU. YD");
    expect(csv).toContain("pallet");
    expect(csv).not.toContain("yd3");
  });
});
