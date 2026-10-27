import { describe, it, expect } from "vitest";
import { IrrigationCsvError, parseIrrigationCsv } from "./irrigationCsv";

describe("irrigation CSV contract", () => {
  it("requires named headers, validates structural headers, rejects empty/all-invalid inputs", () => {
    expect(() => parseIrrigationCsv("name,category,price\nPart,Fittings,1")).toThrow("sku");
    for (const csv of ["", "sku,name,category,price", "sku,name,category,price\nA,,F,1",
      "sku,SKU,name,category,price\nA,A,Part,F,1", "sku,name,category,price,\nA,Part,F,1,",
      "sku,name,category,price,active,is_active\nA,Part,F,1,true,false"]) {
      expect(() => parseIrrigationCsv(csv)).toThrow(IrrigationCsvError);
    }
    try { parseIrrigationCsv("sku,name,category,price\nA,,F,1"); }
    catch (error) { expect((error as IrrigationCsvError).skippedRows).toEqual([{ line: 2, reason: "Required value missing: name" }]); }
  });
  it.each(["fittingType", "fitting_type", "FITTING TYPE"])("accepts alias %s, BOM, CRLF and quote-aware physical lines", fitting => {
    const parsed = parseIrrigationCsv(`\uFEFFsku,name,category,price,cost,${fitting},is_active\r\n A ,"A ""part"",\r\nwith lines",F,"$1,234.56",0,Elbow,false\r\nB,Next,F,1.005,,Tee,true\r\nC,Third,F,0,,Tee,yes`);
    expect(parsed.rows[0]).toMatchObject({ externalSku: "A", name: 'A "part",\r\nwith lines', fittingType: "Elbow", isActive: false, retailPriceCents: 123456, wholesaleCostCents: 0 });
    expect(parsed.skippedRows).toEqual([{ line: 4, reason: expect.stringContaining("Invalid dollar amount") }]);
    expect(parsed.rows[1].externalSku).toBe("C");
  });
  it("maps optional blanks to null, defaults unit/active, preserves zero and parses false explicitly", () => {
    const parsed = parseIrrigationCsv("sku,name,category,price,cost,unit,active\nA,Part,F,,,,\nB,Part,F,0,0,box,0\nC,Part,F,1,,,no\nD,Part,F,1,,,YES\nE,Part,F,1,,,truthy");
    expect(parsed.rows[0]).toEqual({ externalSku: "A", name: "Part", category: "F", description: null, material: null, size: null, brand: null, fittingType: null, detail: null, unit: "ea", retailPriceCents: null, wholesaleCostCents: null, isActive: true });
    expect(parsed.rows.map(row => row.isActive)).toEqual([true, false, false, true]);
    expect(parsed.rows[1]).toMatchObject({ retailPriceCents: 0, wholesaleCostCents: 0, unit: "box" });
    expect(parsed.skippedRows[0]).toMatchObject({ line: 6, reason: expect.stringContaining("Active must") });
  });
  it("first SKU occurrence wins including invalid first; identifiable skips remain present and SKU case is exact", () => {
    const parsed = parseIrrigationCsv("sku,name,category,price\nA,,F,1\nA,Later,F,2\nB,First,F,1\nB,Later,F,2\nb,Lower,F,3\nC,Wrong,F,1,extra\n,Missing,F,2");
    expect(parsed.rows.map(row => [row.externalSku, row.retailPriceCents])).toEqual([["B", 100], ["b", 300]]);
    expect([...parsed.presentSkus]).toEqual(["A", "B", "b", "C"]);
    expect(parsed.skippedRows.map(row => row.line)).toEqual([2, 3, 5, 7, 8]);
    expect(parsed.skippedRows[1].reason).toContain("first occurrence");
  });
  it("continues after malformed quoting and rejects money exponents, negatives and int overflow", () => {
    const parsed = parseIrrigationCsv('sku,name,category,price\nA,ba"d,F,1\nB,Good,F,2\nC,Part,F,-1\nD,Part,F,1e2\nE,Part,F,21474836.48');
    expect(parsed.rows.map(row => row.externalSku)).toEqual(["B"]);
    expect(parsed.skippedRows.map(row => row.line)).toEqual([2, 4, 5, 6]);
  });
});
