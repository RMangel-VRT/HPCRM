import { describe, expect, it } from "vitest";
import { buildFieldPatch, saveSections } from "./contractSave";
import { buildScopeRows, scopeProblems } from "./ScopeEditor";
import { ratesFingerprint, toRateRows } from "./RatesEditor";

describe("saveSections (Done coordinator)", () => {
  it("keeps going after a failure and reports which sections saved", async () => {
    const ran: string[] = [];
    const r = await saveSections([
      { name: "fields", run: async () => { ran.push("fields"); } },
      { name: "scope", run: async () => { throw new Error('409: {"message":"This term can no longer be edited"}'); } },
      { name: "rates", run: async () => { ran.push("rates"); } },
    ]);
    expect(ran).toEqual(["fields", "rates"]);
    expect(r.ok).toEqual(["fields", "rates"]);
    expect(r.failures).toEqual({ scope: "This term can no longer be edited" });
  });
});

describe("field patch", () => {
  const term = { snowPricing: "flat_rate", snowFlatPriceCents: 500000, seasonLabel: "2026–27" } as any;
  it("blocks an invalid flat price instead of converting it to null", () => {
    const r = buildFieldPatch({ flatInput: "12abc" }, term);
    expect(r.problems).toHaveLength(1);
    expect(r.patch).not.toHaveProperty("snowFlatPriceCents");
  });
  it("clears flat cents when switching to time and materials", () => {
    expect(buildFieldPatch({ snowPricing: "time_and_materials" }, term).patch)
      .toEqual({ snowPricing: "time_and_materials", snowFlatPriceCents: null });
  });
  it("sends only changed fields and rejects blank required ones", () => {
    expect(buildFieldPatch({ seasonLabel: "2026–27", po: "" }, term).patch).toEqual({});
    expect(buildFieldPatch({ seasonLabel: "" }, term).problems).toHaveLength(1);
  });
});

describe("scope and rates validation", () => {
  const row = (spread: number[] | null) => buildScopeRows([{ serviceKey: "mowing", line: "landscape", included: true, quantity: 26,
    unit: "visits", monthSpread: spread, details: {}, priceCents: null, notes: null }], "landscape").find(r => r.serviceKey === "mowing")!;
  it("rejects an explicit all-zero spread that does not match the quantity", () => {
    expect(scopeProblems([row(Array(12).fill(0))])).toHaveLength(1);
  });
  it("treats a null spread as no timing chosen", () => {
    expect(scopeProblems([row(null)])).toHaveLength(0);
  });
  it("sees invalid raw rate input as a change", () => {
    const base = toRateRows([{ rateKey: "r", line: "snow", category: "c", label: "L", priceCents: null, priceText: null, unit: "u", minimum: null, cardPriceCents: null, cardPriceText: null }]);
    expect(ratesFingerprint([{ ...base[0], input: "abc" }])).not.toBe(ratesFingerprint(base));
  });
});
