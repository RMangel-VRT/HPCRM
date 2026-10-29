import { describe, expect, it, vi } from "vitest";
import type { AgreementTerm, RateCardItem, TermRate } from "@workspace/db";
vi.mock("../db", () => ({ db: {} }));
import { isLaborRelevant, resolveFromRows, previewFromRows } from "./estimateRates";
import { isTermInEffect, selectCurrent, selectInEffectTerm } from "../lib/contractCenterService";
import { companyToday } from "../lib/companyDay";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";
const card = (v = {}) => ({ rateKey: "labor", line: "landscape", category: "Labor", label: "Labor", unit: "hour",
  priceCents: 10000, priceText: null, active: true, ...v }) as RateCardItem;
const term = (v = {}) => ({ id: "t", line: "landscape", startDate: "2026-01-01", endDate: "2026-12-31", status: "signed", renewedFromTermId: null, ...v }) as AgreementTerm;
const rate = (v = {}) => ({ rateKey: "labor", termId: "t", label: "Contract labor", unit: "day", priceCents: 8000, priceText: null, ...v }) as TermRate;
const today = "2026-10-27";
describe("shared in-effect predicate and ordering", () => {
  it.each(["signed", "active", "renewed"])("accepts %s with inclusive bounds", status => {
    expect(isTermInEffect(term({ status }), "2026-01-01")).toBe(true);
    expect(isTermInEffect(term({ status }), "2026-12-31")).toBe(true);
    expect(isTermInEffect(term({ status }), "2027-01-01")).toBe(false);
  });
  it.each(["draft", "sent", "lost", "cancelled", "up_for_renewal"])("never prices %s", status => {
    expect(selectInEffectTerm([term({ status })], today)).toBeUndefined();
  });
  it("keeps the existing display fallback without allowing pricing to use it", () => {
    const expired = term({ endDate: "2025-12-31" }), future = term({ id: "f", startDate: "2027-01-01", endDate: "2027-12-31" });
    expect(selectCurrent([expired, future], today)?.id).toBe("f");
    expect(selectInEffectTerm([expired, future], today)).toBeUndefined();
  });
  it("uses Colorado evening dates rather than the UTC day, including DST seasons", () => {
    expect(companyToday(new Date("2026-10-28T03:00:00Z"))).toBe("2026-10-27");
    expect(companyToday(new Date("2026-01-02T04:00:00Z"))).toBe("2026-01-01");
  });
});
describe("contract-first exact-key pricing", () => {
  it("returns contract label/unit and cents before card", () => {
    expect(resolveFromRows(card(), [term()], [rate()], "labor", today)).toMatchObject({
      rateCents: 8000, source: "contract", termId: "t", label: "Contract labor", unit: "day",
    });
  });
  it("falls back to card without an in-effect term, or when its exact key is absent", () => {
    expect(resolveFromRows(card(), [], [], "labor", today).source).toBe("rate_card");
    expect(resolveFromRows(card(), [term()], [rate({ rateKey: "Labor" })], "labor", today).rateCents).toBe(10000);
  });
  it("returns unset without either source", () => {
    expect(resolveFromRows(undefined, [], [], "unknown", today)).toMatchObject({ source: "unset", rateCents: null, priceText: null });
  });
  it("does not fall through text-only or deliberately empty contract/card rows", () => {
    expect(resolveFromRows(card(), [term()], [rate({ priceCents: null, priceText: "Quote manually" })], "labor", today))
      .toMatchObject({ source: "contract", rateCents: null, priceText: "Quote manually" });
    expect(resolveFromRows(card(), [term()], [rate({ priceCents: null })], "labor", today).source).toBe("contract");
    expect(resolveFromRows(card({ priceCents: null, priceText: "Manual" }), [], [], "labor", today))
      .toMatchObject({ source: "rate_card", rateCents: null, priceText: "Manual" });
  });
  it("selects latest-start then descending id across overlapping company/customer agreements before key lookup", () => {
    const terms = [term({ id: "a" }), term({ id: "z", startDate: "2026-05-01" }), term({ id: "b", startDate: "2026-05-01" })];
    expect(resolveFromRows(card(), terms, [rate({ termId: "a" })], "labor", today).source).toBe("rate_card");
    expect(resolveFromRows(card(), terms, [rate({ termId: "z", priceCents: 7000 }), rate({ termId: "b", priceCents: 9000 })], "labor", today))
      .toMatchObject({ source: "contract", rateCents: 7000, termId: "z" });
  });
  it("uses term-owned line, accepts landscape irrigation and both, excludes newer snow-only terms", () => {
    const terms = [term(), term({ id: "snow", line: "snow", startDate: "2026-10-01" })];
    expect(resolveFromRows(card({ line: "irrigation" }), terms, [rate()], "labor", today).termId).toBe("t");
    expect(resolveFromRows(card({ line: "general" }), terms, [rate({ termId: "snow" })], "labor", today).termId).toBe("snow");
    expect(resolveFromRows(card(), [term({ line: "both" })], [rate()], "labor", today).source).toBe("contract");
  });
  it("supports snapshot-only keys using deterministic latest eligible term across lines", () => {
    expect(resolveFromRows(undefined, [term()], [rate({ rateKey: "custom" })], "custom", today)).toMatchObject({ source: "contract", rateCents: 8000 });
    expect(resolveFromRows(undefined, [term(), term({ id: "new", startDate: "2026-09-01" })], [rate({ rateKey: "custom" })], "custom", today).source).toBe("unset");
  });
});
describe("labor-category preview rule against seeded and custom values", () => {
  it("includes seeded landscape/irrigation Labor and excludes snow/material/repair limits", () => {
    const keys = RATE_CARD_DEFAULTS.filter(r => isLaborRelevant(card(r))).map(r => r.key);
    expect(keys).toEqual(["rate_general_labor", "rate_emergency_general_labor", "rate_operator_labor", "rate_irrigation_labor", "rate_emergency_irrigation_labor"]);
  });
  it.each(["Labor", " LABOR ", "Equipment & Labor", "equipment-and-labor", "equipment_and_labor"])("includes custom category %s", category => {
    expect(isLaborRelevant(card({ category, line: "general" }))).toBe(true);
  });
  it.each(["Materials", "Repair limits", "Snow equipment & labor", "Other Labor"])("excludes unrelated category %s", category => {
    expect(isLaborRelevant(card({ category }))).toBe(false);
  });
  it("excludes inactive and snow rows", () => {
    expect(isLaborRelevant(card({ active: false }))).toBe(false);
    expect(isLaborRelevant(card({ line: "snow" }))).toBe(false);
  });
});

describe("preview governing context metadata", () => {
  it("reports the governing season even when its missing exact key falls back to card", () => {
    const result = previewFromRows([card()], [term({ seasonLabel: "2026 landscape" })], [], today);
    expect(result.governingContexts).toEqual([{ line: "landscape", termId: "t", seasonLabel: "2026 landscape" }]);
    expect(result.items[0]).toEqual(resolveFromRows(card(), [term({ seasonLabel: "2026 landscape" })], [], "labor", today));
    expect(result.items[0].source).toBe("rate_card");
    expect(result.items[0]).not.toHaveProperty("termId");
  });
  it("preserves distinct service-line contexts and deduplicates card rows by line", () => {
    const cards = [card(), card({ rateKey: "extra" }), card({ line: "irrigation" }), card({ line: "general" })];
    const terms = [term({ seasonLabel: "Summer" }), term({ id: "snow", line: "snow", startDate: "2026-10-01", seasonLabel: "Winter" })];
    expect(previewFromRows(cards, terms, [], today).governingContexts).toEqual([
      { line: "landscape", termId: "t", seasonLabel: "Summer" },
      { line: "irrigation", termId: "t", seasonLabel: "Summer" },
      { line: "general", termId: "snow", seasonLabel: "Winter" },
    ]);
  });
  it("reports explicit rate-card context when no eligible term exists", () => {
    expect(previewFromRows([card()], [term({ status: "draft" })], [], today).governingContexts)
      .toEqual([{ line: "landscape", termId: null, seasonLabel: null }]);
    expect(previewFromRows([card({ active: false }), card({ category: "Materials" })], [term()], [], today))
      .toEqual({ items: [], governingContexts: [] });
  });
});
