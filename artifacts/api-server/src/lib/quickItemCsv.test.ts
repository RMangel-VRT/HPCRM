import { describe, expect, it } from "vitest";
import { exportQuickItemCsv, importQuickItemCsv, parseQuickItemCsv, QUICK_ITEM_CSV_HEADERS, QuickItemCsvRowError } from "./quickItemCsv";
import { writeCsv } from "./csv";
import { ESTIMATE_UNIT_ALIASES } from "../../../../lib/db/src/estimateUnits";

const header = QUICK_ITEM_CSV_HEADERS.join(",");
const csv = (...rows: string[][]) => writeCsv([QUICK_ITEM_CSV_HEADERS, ...rows]);
const row = (changes: Partial<Record<number, string>> = {}) =>
  ["service", "General", "Aeration", "hour", "Variable", "Landscape Labor", "yes"].map((v, i) => changes[i] ?? v);

describe("quick item CSV conversion contract", () => {
  it("requires exact unique headers but allows BOM, case, reordering and a header-only file", () => {
    for (const invalid of ["", "kind,name", header + ",extra", header.replace("unit", "name"), '"bad']) {
      expect(() => parseQuickItemCsv(invalid, "services")).toThrow("headers");
    }
    expect(parseQuickItemCsv(`\uFEFF${header.toUpperCase()}`, "services")).toEqual([]);
    expect(parseQuickItemCsv("active,posts_to,price,unit,name,category,kind\nyes,landscape_labor,,HR,Name,General,service", "services")[0].data)
      .toMatchObject({ defaultUnit: "HR", defaultRateCents: null, label: "Name" });
  });
  it.each(Object.entries(ESTIMATE_UNIT_ALIASES))("uses predecessor alias %s", (alias, canonical) => {
    expect(parseQuickItemCsv(csv(row({ 3: ` ${alias.toUpperCase()} ` })), "services")[0].data?.defaultUnit).toBe(canonical);
  });
  it.each(["", "Variable", " variable ", "VARIABLE"])("keeps %s prices null", price => {
    expect(parseQuickItemCsv(csv(row({ 4: price })), "services")[0].data?.defaultRateCents).toBeNull();
  });
  it.each([["0", 0], ["$1,234.50", 123450], ["21474836.47", 2147483647]])("parses exact %s dollars", (price, cents) => {
    expect(parseQuickItemCsv(csv(row({ 4: String(price) })), "services")[0].data?.defaultRateCents).toBe(cents);
  });
  it.each(["-1", "21474836.48", "1.001", "1e2"])("rejects invalid price %s", price => {
    expect(parseQuickItemCsv(csv(row({ 4: price })), "services")[0].reason).toBeTruthy();
  });
  it.each(["true", "false", "YES", "no", "1", "0"])("accepts explicit active %s", active => {
    expect(parseQuickItemCsv(csv(row({ 6: active })), "services")[0].data?.isActive).toBe(["true", "yes", "1"].includes(active.toLowerCase()));
  });
  it.each([
    [{ 0: "plant" }, "Kind"], [{ 0: "fee", 1: "" }, "not allowed"], [{ 1: "" }, "category"],
    [{ 1: "x".repeat(101) }, "category"], [{ 2: " " }, "label"], [{ 2: "x".repeat(201) }, "label"],
    [{ 3: "pallet" }, "Unknown unit"], [{ 5: "unknown" }, "Unknown posts_to"], [{ 6: "" }, "Active"],
  ] as const)("diagnoses bad values without losing later rows", (changes, reason) => {
    const rows = parseQuickItemCsv(csv(row(changes), row({ 2: "Later" })), "services");
    expect(rows[0].reason).toContain(reason);
    expect(rows[1].data?.label).toBe("Later");
  });
  it.each(["equipment", "fee"])("permits %s only with a blank category and equipment-fees scope", kind => {
    expect(parseQuickItemCsv(csv(row({ 0: kind, 1: "" })), "equipment-fees")[0].data?.kind).toBe(kind);
    expect(parseQuickItemCsv(csv(row({ 0: kind })), "equipment-fees")[0].reason).toContain("blank category");
    expect(parseQuickItemCsv(csv(row()), "equipment-fees")[0].reason).toContain("not allowed");
  });
  it("retains physical lines, quoted commas/quotes/newlines, and recovers malformed records", async () => {
    const text = csv(row({ 2: 'One,\r\n"two"' })) + 'service,General,bad"quote,hour,,landscape_labor,true\r\n' +
      row({ 2: "Later" }).join(",") + "\r\n";
    const rows = parseQuickItemCsv(text, "services");
    expect(rows[0].data?.label).toBe('One,\r\n"two"');
    expect(rows[1]).toMatchObject({ line: 4, reason: "Malformed CSV quoting" });
    expect(rows[2]).toMatchObject({ line: 5, data: { label: "Later" } });
    const broken = `${header}\nservice,General,"Unclosed,hour,,landscape_labor,true\n${row({ 2: "Survives" }).join(",")}`;
    expect(parseQuickItemCsv(broken, "services")[1].data?.label).toBe("Survives");
    expect(parseQuickItemCsv(`${header}\nservice,General`, "services")[0].reason).toContain("seven");
  });
  it("reports created categories and isolates validation/collision/save failures", async () => {
    const result = await importQuickItemCsv(csv(row(), row({ 2: "Collision" }), row({ 2: "Fails" }), row({ 2: "Later" }), row({ 3: "bad" })), "services", async data => {
      if (data.label === "Collision") throw new QuickItemCsvRowError("Name belongs to fee");
      if (data.label === "Fails") throw new Error("private database detail");
      return { outcome: data.label === "Later" ? "updated" : "inserted", categoryCreated: data.label === "Aeration" ? "General" : undefined };
    });
    expect(result).toMatchObject({ inserted: 1, updated: 1, categoriesCreated: ["General"] });
    expect(result.skipped).toEqual([{ line: 3, reason: "Name belongs to fee" }, { line: 4, reason: "Unable to save row" }, { line: 6, reason: "Unknown unit: bad" }]);
  });
  it("exports scoped inactive rows with exact prices, canonical units and display umbrellas for lossless reimport", () => {
    const base = { kind: "service", label: 'One, "two"\nthree', defaultUnit: "1,000 sq ft", defaultRateCents: null, umbrellaKey: "landscape_labor", isActive: false, serviceCategoryName: "General" };
    const text = exportQuickItemCsv([base, { ...base, kind: "fee" }], "services");
    expect(text).toContain('Variable,Landscape Labor,false');
    expect(parseQuickItemCsv(text, "services")[0].data).toEqual({
      kind: "service", label: base.label, category: "General", defaultUnit: "1,000 SF",
      defaultRateCents: null, umbrellaKey: "landscape_labor", isActive: false,
    });
    expect(parseQuickItemCsv(exportQuickItemCsv([{ ...base, kind: "fee", defaultRateCents: 0 }], "equipment-fees"), "equipment-fees")[0].data)
      .toMatchObject({ category: "", defaultRateCents: 0 });
    expect(() => exportQuickItemCsv([{ ...base, defaultUnit: "pallet" }], "services")).toThrow("unknown unit");
    expect(() => exportQuickItemCsv([{ ...base, serviceCategoryName: null }], "services")).toThrow("missing category");
  });
});
