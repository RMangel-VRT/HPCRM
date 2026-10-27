import { describe, it, expect } from "vitest";
import { IrrigationCsvError, parseIrrigationCsv } from "./irrigationCsv";

describe("irrigation CSV contract", () => {
  const irrigoProHeader = "Part Type,Product/Service Name,SKU,Sales Description,Price,Cost,Brand,Size,Material,Fitting Type,Detail,Active,Approval Status,QuickBooks ID";

  it("maps the full IrrigoPro export, defaults blank categories and ignores populated extra columns", () => {
    const parsed = parseIrrigationCsv([
      irrigoProHeader,
      " Fittings , Elbow , A , Sales text ,12.34,5.67,Hunter,1in,PVC,Elbow,Threaded,yes,Pending review,QB-123",
      ",Blank category,B,Blank category description,0,0,Rain Bird,2in,ABS,Tee,Slip,false,Unrecognized status,QB-456",
      '"   ",Whitespace category,C,,1,,,,,,,true,Approved,QB-789',
      "Misc,Explicit misc,D,,2,,,,,,,1,Rejected,QB-012",
      ",Missing SKU,   ,,3,,,,,,,yes,Approved,QB-345",
      ",   ,E,,4,,,,,,,yes,Approved,QB-678",
    ].join("\n"));
    expect(parsed.rows).toEqual([
      { externalSku: "A", name: "Elbow", category: "Fittings", description: "Sales text", retailPriceCents: 1234, wholesaleCostCents: 567, brand: "Hunter", size: "1in", material: "PVC", fittingType: "Elbow", detail: "Threaded", unit: "ea", isActive: true },
      { externalSku: "B", name: "Blank category", category: "Misc", description: "Blank category description", retailPriceCents: 0, wholesaleCostCents: 0, brand: "Rain Bird", size: "2in", material: "ABS", fittingType: "Tee", detail: "Slip", unit: "ea", isActive: false },
      { externalSku: "C", name: "Whitespace category", category: "Misc", description: null, retailPriceCents: 100, wholesaleCostCents: null, brand: null, size: null, material: null, fittingType: null, detail: null, unit: "ea", isActive: true },
      { externalSku: "D", name: "Explicit misc", category: "Misc", description: null, retailPriceCents: 200, wholesaleCostCents: null, brand: null, size: null, material: null, fittingType: null, detail: null, unit: "ea", isActive: true },
    ]);
    expect(parsed.skippedRows).toEqual([
      { line: 6, reason: "Required value missing: sku" },
      { line: 7, reason: "Required value missing: name" },
    ]);
    expect([...parsed.presentSkus]).toEqual(["A", "B", "C", "D", "E"]);
  });

  it.each([
    ["Name", "Product/Service Name"],
    ["Category", "Part Type"],
    ["Description", "Sales Description"],
    ["Product/Service Name", "product_service-name"],
  ])("rejects duplicate canonical headers %s and %s", (first, second) => {
    expect(() => parseIrrigationCsv(`sku,name,category,price,${first},${second}\nA,Part,F,1,x,y`))
      .toThrow("Invalid CSV header: malformed, blank or duplicate column names");
  });

  it("still requires Part Type and the other required export headers", () => {
    for (const [header, canonical] of [
      ["SKU", "sku"], ["Product/Service Name", "name"], ["Part Type", "category"], ["Price", "price"],
    ]) {
      expect(() => parseIrrigationCsv(irrigoProHeader.split(",").filter(name => name !== header).join(",")))
        .toThrow(`Missing required CSV headers: ${canonical}`);
    }
  });

  it("retains legacy headers, optional fields and blank-category fallback", () => {
    const parsed = parseIrrigationCsv("sku,name,category,price,description,unit,is_active\nA,Legacy,Fittings,1,Old description,box,false\nB,Uncategorized,   ,2,,ea,true");
    expect(parsed.rows[0]).toMatchObject({ externalSku: "A", name: "Legacy", category: "Fittings", description: "Old description", unit: "box", isActive: false });
    expect(parsed.rows[1]).toMatchObject({ externalSku: "B", category: "Misc" });
    expect(parsed.skippedRows).toEqual([]);
  });

  it("keeps first-occurrence precedence and tracks skipped SKUs with blank categories", () => {
    const parsed = parseIrrigationCsv("SKU,Product/Service Name,Part Type,Price\nA,, ,1\nA,Later,,2\nB,First,,3\nB,Later,Fittings,4\nC,Bad money,,1e2\nD,Bad active,,1,extra");
    expect(parsed.rows.map(row => [row.externalSku, row.category])).toEqual([["B", "Misc"]]);
    expect([...parsed.presentSkus]).toEqual(["A", "B", "C", "D"]);
    expect(parsed.skippedRows).toEqual([
      { line: 2, reason: "Required value missing: name" },
      { line: 3, reason: "Duplicate SKU: first occurrence wins" },
      { line: 5, reason: "Duplicate SKU: first occurrence wins" },
      { line: 6, reason: expect.stringContaining("Invalid dollar amount") },
      { line: 7, reason: "Column count does not match header" },
    ]);
  });

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
