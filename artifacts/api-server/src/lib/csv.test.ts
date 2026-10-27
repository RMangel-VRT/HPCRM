import { describe, expect, it } from "vitest";
import { dollarsToCents, parseCsv, parseCsvLine, writeCsv } from "./csv";
import { createHardscapeBody, patchHardscapeBody, parseHardscapeCsv, importHardscapeCsv, exportHardscapeCsv, HARDSCAPE_CSV_HEADERS } from "./hardscapeCsv";
import type { HardscapeCatalogItem } from "@workspace/db";

describe("shared CSV and exact dollar conversion", () => {
  it.each([["$1,234.50", 123450], [" 0 ", 0], ["12.3", 1230], ["0.29", 29], ["", null], ["  ", null], ["21474836.47", 2147483647]])("parses %s", (input, expected) => {
    expect(dollarsToCents(input as string)).toBe(expected);
  });
  it.each(["-1", "+1", "1e2", "1.234", "$", "NaN", "Infinity", "12,34.50", "1,234,56", ".50", "1.", "21474836.48"])("rejects %s instead of rounding", input => {
    expect(() => dollarsToCents(input)).toThrow();
  });
  it("quotes commas, quotes, CRLF, surrounding whitespace and embedded newlines losslessly", () => {
    const fields = ['Rock, cobble', 'A "quote"', "one\r\ntwo", " spaced ", "", "last"];
    expect(parseCsv(writeCsv([fields]))[0].fields).toEqual(fields);
    expect(parseCsvLine('"Name, Inc.","q""bo",')).toEqual(["Name, Inc.", 'q"bo', ""]);
    expect(parseCsv("a,b\r\n\r\nc,d\n")[1].line).toBe(3);
  });
  it("attaches quoting errors to a row and continues after a recoverable malformed row", () => {
    const records = parseCsv('a,b\nbad"quote,c\nok,d');
    expect(records[1].error).toBeTruthy();
    expect(records[2]).toEqual({ line: 3, fields: ["ok", "d"] });
    expect(parseCsv('"unterminated')[0].error).toContain("Unterminated");
  });
});

const header = HARDSCAPE_CSV_HEADERS.join(",");
describe("hardscape CSV contracts", () => {
  it("validates exact, unique headers, allowing reordered/case-normalized headers and BOM", () => {
    for (const invalid of ["", "name,sku", header + ",extra", header.replace("sku", "name")]) {
      expect(() => parseHardscapeCsv(invalid)).toThrow("headers");
    }
    expect(parseHardscapeCsv(`\uFEFF${header.toUpperCase()}`)).toEqual([]);
    expect(parseHardscapeCsv("active,retail_price,wholesale_cost,unit,description,name,category,sku\ntrue,,,ea,,Rock,general,")).toEqual([
      { line: 2, data: { sku: null, name: "Rock", category: "general", description: null, unit: "ea", wholesaleCostCents: null, retailPriceCents: null, isActive: true } },
    ]);
  });
  it("normalizes keys, preserves quoted descriptions and skips invalid values with physical line numbers", async () => {
    const upsert = async () => "inserted" as const;
    const csv = `${header}\r\n A ,general,"Rock,\r\nCobble"," keep ",ton,"$1,234.50",,YES\r\nB,general,Bad,,ea,-1,,true\r\nC,general,Bad,,ea,,,maybe\r\nD,general,Good,,ea,0,0,0`;
    const rows = parseHardscapeCsv(csv);
    expect(rows[0].data).toMatchObject({ sku: "A", name: "Rock,\r\nCobble", description: " keep ", wholesaleCostCents: 123450, retailPriceCents: null });
    const result = await importHardscapeCsv(csv, upsert);
    expect(result).toMatchObject({ inserted: 2, updated: 0 });
    expect(result.skipped.map(row => row.line)).toEqual([4, 5]);
  });
  it.each(["true", "TRUE", "1", "yes", "false", "0", "no"])("accepts explicit active value %s", active => {
    expect(parseHardscapeCsv(`${header}\n,general,Rock,,ea,,,${active}`)[0].data?.isActive).toBe(["true", "1", "yes"].includes(active.toLowerCase()));
  });
  it("isolates storage failures and continues remaining rows", async () => {
    let calls = 0;
    const result = await importHardscapeCsv(`${header}\n,general,One,,ea,,,true\n,general,Two,,ea,,,true\n,general,Three,,ea,,,false`, async () => {
      if (++calls === 2) throw { cause: { code: "23505" } };
      return "inserted";
    });
    expect(result).toEqual({ inserted: 2, updated: 0, skipped: [{ line: 3, reason: "Duplicate SKU" }] });
    expect(calls).toBe(3);
  });
  it("recovers following physical rows after an unterminated quoted field", async () => {
    const result = await importHardscapeCsv(`${header}\n,general,"Unclosed,,ea,,,true\nNEXT,general,Good,,ea,,,true`, async () => "inserted");
    expect(result).toEqual({ inserted: 1, updated: 0, skipped: [{ line: 2, reason: "Unterminated quoted field" }] });
  });
  it("round-trips every field including null vs zero, quotes, multiline text and inactive state", async () => {
    const item = {
      id: "id", companyId: "company", sku: null, name: 'Rock, "large"', category: "general",
      description: " first line\nsecond ", unit: "ea", wholesaleCostCents: null, retailPriceCents: 0,
      isActive: false, umbrellaKey: "landscape_materials", createdAt: new Date(), updatedAt: new Date(),
    } satisfies HardscapeCatalogItem;
    const csv = exportHardscapeCsv([item]);
    expect(csv.split("\r\n")[0]).toBe(header);
    const result = await importHardscapeCsv(csv, async data => {
      for (const [key, value] of Object.entries(data)) expect(value).toEqual(item[key as keyof typeof item]);
      return "updated";
    });
    expect(result).toEqual({ inserted: 0, updated: 1, skipped: [] });
  });
  it("PATCH has no injected defaults, keeps null clearing, rejects immutable keys and invalid cents", () => {
    expect(patchHardscapeBody.parse({})).toEqual({});
    expect(patchHardscapeBody.parse({ name: "Renamed", sku: "", description: null, wholesaleCostCents: null })).toEqual({
      name: "Renamed", sku: null, description: null, wholesaleCostCents: null,
    });
    expect(createHardscapeBody.parse({ name: "Stone", category: "general" })).toEqual({ name: "Stone", category: "general", unit: "ea", isActive: true });
    for (const body of [{ companyId: "foreign" }, { umbrellaKey: "other" }, { wholesaleCostCents: -1 }, { retailPriceCents: 0.5 }, { category: " " }]) {
      expect(patchHardscapeBody.safeParse(body).success).toBe(false);
    }
  });
});
