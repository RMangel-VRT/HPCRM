import { describe, it, expect } from "vitest";
import type { AgreementTerm, TermScopeLine, TermRate } from "@workspace/db";
import { RATE_CARD_DEFAULTS, SCOPE_CATALOG } from "../shared/contractCatalog";
import { initialScope } from "@workspace/api-zod/contractScope";
import { planChangingRenewal, renewalScope } from "./contractChangingRenewal";
import { scaledPayments, renewalCoverage, renewSchema, renewalSet, increasedPayments, type Payments } from "./contractCenterService";

const source = { id: "source", companyId: "c", agreementId: "a", line: "landscape", form: "theirs",
  status: "signed", seasonLabel: "2025–26", startDate: "2025-10-01", endDate: "2026-09-30",
  createdAt: new Date("2025-01-01"), renewedFromTermId: null, snowPricing: null, snowFlatPriceCents: null } as AgreementTerm;
const card = RATE_CARD_DEFAULTS.map(({ key, ...r }, i) => ({ ...r, id: key, rateKey: key,
  priceText: r.priceText ?? null, minimum: r.minimum ?? null, sortOrder: i, active: true, companyId: "c", createdAt: new Date(), updatedAt: new Date() }));
const total = (p: Payments) => p.reduce((n, l) => n + l.months.reduce((s, m) => s + m.amountCents, 0), 0);
const pattern: Payments = [{ component: "Grounds maintenance", months: Array.from({ length: 12 }, (_, i) =>
  ({ month: i + 1, amountCents: [1, 2, 11, 12].includes(i + 1) ? 150000 : 300000 })) }];
const scope = initialScope("both", SCOPE_CATALOG).filter(s => s.included) as unknown as TermScopeLine[];
const run = (request: object, s = source, payments = pattern, rates: TermRate[] = []) =>
  planChangingRenewal(s, payments, scope.filter(row => s.line === "both" || (s.line === "snow" ? row.line === "snow" : row.line !== "snow")),
    rates, card, renewSchema.parse({ roundTo: "dollar", increasePct: 3, ...request }));

describe("contract-changing renewal calculations", () => {
  it("requires exactly one first-year price and one to five years", () => {
    for (const b of [{}, { increasePct: 3, targetAnnualCents: 1 }, { increasePct: 3, laterYearPcts: [1, 2, 3, 4, 5] }])
      expect(renewSchema.safeParse({ roundTo: "dollar", ...b }).success).toBe(false);
    expect(renewSchema.parse({ increasePct: 3, roundTo: "dollar" }).laterYearPcts).toEqual([]);
  });
  it("scales MSI pattern and multiple lines proportionally to exact odd cents", () => {
    const p = scaledPayments(pattern, 3150000, "dollar");
    expect(total(p)).toBe(3150000);
    expect(p[0].months.map(m => m.amountCents)).toEqual(pattern[0].months.map(m => m.amountCents * 1.05));
    const two = [...pattern, { component: "Fertilization", months: [{ month: 3, amountCents: 1000000 }] }];
    const result = scaledPayments(two, 4200001, "dollar");
    expect(total(result)).toBe(4200001);
    expect(result[1].months[0].amountCents).toBe(1050001);
    expect(scaledPayments(two, 4200001, "twelve")[1].months[0].amountCents).toBe(1050001);
  });
  it("uses the twelve equal payment preset for zero total and rejects invalid money", () => {
    const p = scaledPayments([], 1000000, "dollar");
    expect(p[0].component).toBe("Grounds maintenance");
    expect(p[0].months.slice(0, 11).every(m => m.amountCents === 83333)).toBe(true);
    expect(p[0].months[11].amountCents).toBe(83337);
    for (const n of [-1, 1.2, Infinity, 2147483648]) expect(() => scaledPayments(pattern, n, "dollar")).toThrow();
  });
  it.each(["landscape", "snow", "both"] as const)("transforms every transition from %s without converting T&M to flat", from => {
    for (const line of ["landscape", "snow", "both"] as const) {
      const snowSource = { ...source, line: from, snowPricing: from === "landscape" ? null : "flat_rate" as const, snowFlatPriceCents: from === "landscape" ? null : 120000 };
      const p = [...pattern, { component: "Snow", months: [{ month: 1, amountCents: 120000 }] }];
      const c = renewalCoverage(snowSource, line, p);
      if (line === "landscape") {
        expect(c.snowPricing).toBeNull(); expect(c.snowFlatPriceCents).toBeNull();
        expect(c.payments.some(p => p.component === "Snow")).toBe(false);
      } else if (from === "landscape") {
        expect(c.snowPricing).toBe("time_and_materials"); expect(c.snowFlatPriceCents).toBeNull();
      }
      if (line === "snow") expect(c.payments.every(p => p.component === "Snow")).toBe(true);
    }
  });
  it("removes T&M snow-only payments and rejects an exact positive target", () => {
    expect(renewalCoverage({ ...source, line: "both", snowPricing: "time_and_materials" }, "snow", pattern).payments).toEqual([]);
    expect(() => run({ increasePct: undefined, targetAnnualCents: 12000, line: "snow" })).toThrow("cannot have payments");
  });
  it("adds snow and defaults to reset when switching to Our form; lists removed custom rates", () => {
    const custom = { rateKey: "custom_one", line: "landscape", label: "Custom", priceCents: 15000, priceText: null,
      unit: "hour", category: "Custom", minimum: null, cardPriceCents: null, cardPriceText: null, sortOrder: 1 } as TermRate;
    const p = run({ form: "ours", line: "both" }, source, pattern, [custom]);
    expect(p.snowPricing).toBe("time_and_materials");
    expect(p.rateChanges).toContainEqual(expect.objectContaining({ rateKey: "custom_one", reason: "removed" }));
    expect(p.rates.some(r => r.line === "snow")).toBe(true);
    expect(p.scopeChanges.added).toContain("snow_walks");
    expect(run({ form: "ours", rates: "carry" }, source, pattern, [custom]).rates.some(r => r.rateKey === "custom_one")).toBe(true);
  });
  it("drops uncovered custom rates as well as card rates, and shares standard scope defaults", () => {
    const custom = { rateKey: "custom_snow", line: "snow", label: "Custom", priceCents: 1, priceText: null } as TermRate;
    const p = run({ line: "landscape" }, { ...source, line: "both", snowPricing: "flat_rate", snowFlatPriceCents: 120000 },
      [...pattern, { component: "Snow", months: [{ month: 1, amountCents: 120000 }] }], [custom]);
    expect(p.rates.some(r => r.line === "snow")).toBe(false);
    expect(p.rateChanges.some(r => r.rateKey === "custom_snow" && r.reason === "removed")).toBe(true);
    expect(p.scope.some(s => s.line === "snow")).toBe(false);
    expect(p.snowPricing).toBeNull(); expect(total(p.after)).toBe(3090000);
    for (const line of ["landscape", "snow", "both"] as const) {
      const standard = renewalScope([], source.line, line, "standard");
      expect(standard.map(s => s.serviceKey)).toEqual(initialScope(line, SCOPE_CATALOG).filter(s => s.included).map(s => s.serviceKey));
    }
  });
  it("creates contiguous annual dates, stepped prices and compatible old-call output", () => {
    const p = run({ laterYearPcts: [3, 2.5] });
    expect(p.years.map(y => y.annualPriceCents)).toEqual([3090000, 3182700, 3262300]);
    expect(p.years.map(y => [y.startDate, y.endDate])).toEqual([
      ["2026-10-01", "2027-09-30"], ["2027-10-01", "2028-09-30"], ["2028-10-01", "2029-09-30"],
    ]);
    expect(run({}).after).toEqual(increasedPayments(pattern, 3, "dollar"));
  });
  it("retains multi-year duration only for one-year renewals", () => {
    const s = { ...source, endDate: "2028-09-30" };
    expect(run({}, s).endDate).toBe("2031-09-30");
    expect(run({ laterYearPcts: [3] }, s).years[0].endDate).toBe("2029-09-30");
  });
  it("scales flat snow by the exact target factor", () => {
    const s = { ...source, line: "both" as const, snowPricing: "flat_rate" as const, snowFlatPriceCents: 1000000 };
    const p = run({ increasePct: undefined, targetAnnualCents: 4200000 }, s,
      [...pattern, { component: "Snow", months: [{ month: 1, amountCents: 1000000 }] }]);
    expect(p.snowFlatPriceCents).toBe(1050000); expect(p.renewalIncreasePct).toBe("5.00");
  });
});
describe("custom seasonal scope carry", () => {
  const custom = { serviceKey: "other:snow_watch", line: "snow", included: true, quantity: 7,
    details: { label: "Snow watch" }, sortOrder: 777 };
  it.each([["both", "both", true], ["snow", "both", true], ["both", "landscape", false]] as const)(
    "preserves custom Snow coverage from %s to %s", (from, to, retained) => {
      const result = renewalScope([custom], from, to, "carry");
      if (retained) expect(result.find(s => s.serviceKey === custom.serviceKey)).toMatchObject(custom);
      else expect(result.some(s => s.serviceKey === custom.serviceKey)).toBe(false);
    });
  it("drops a custom Snow service after carrying it through a Both season", () => {
    const first = renewalScope([custom], "both", "both", "carry");
    expect(renewalScope(first, "both", "landscape", "carry").some(s => s.serviceKey === custom.serviceKey)).toBe(false);
  });
});
describe("derived renewal sets", () => {
  const year1 = { ...source, id: "year1", renewedFromTermId: "source", createdAtExact: "2026-01-01 12:00:00.123456",
    renewalNote: "Renewed from 2025–26 (year 1 of 2026–2028 renewal, +3%)" };
  const year2 = { ...year1, id: "year2", renewedFromTermId: "year1",
    renewalNote: "Renewed from 2026–27 (year 2 of 2026–2028 renewal, +3%)" };
  it("survives signing and groups by same-agreement chain AND full transaction timestamp", () => {
    const terms = [source, { ...year1, status: "renewed" as const }, { ...year2, status: "signed" as const }];
    expect(renewalSet(terms, terms[2]).map(t => t.id)).toEqual(["year1", "year2"]);
    expect(renewalSet([source, year1, { ...year2, createdAtExact: "2026-01-01 12:00:00.123457" }], year1)).toHaveLength(1);
    expect(renewalSet([source, year1, { ...year2, agreementId: "other" }], year1)).toHaveLength(1);
    expect(renewalSet([year1, { ...year2, renewedFromTermId: null }], year1)).toHaveLength(1);
  });
  it("never groups same-transaction imported histories or missing/inconsistent creation notes", () => {
    const imported = [year1, year2].map(t => ({ ...t, renewalNote: null }));
    expect(renewalSet(imported, imported[1]).map(t => t.id)).toEqual(["year2"]);
    expect(renewalSet([year1, { ...year2, renewalNote: null }], year1)).toEqual([year1]);
    expect(renewalSet([year1, { ...year2, renewalNote: "Renewed from x (year 1 of 2026–2028 renewal, +3%)" }], year2)).toEqual([year2]);
    expect(renewalSet([year2], year2)).toEqual([year2]);
  });
});
