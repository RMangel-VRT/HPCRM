import { describe, expect, it } from "vitest";
import type { AgreementTerm, RateCardItem, TermRate } from "@workspace/db";
import {
  expandPayments, recoverPayments, paymentSummary, validateDates, validatePayments,
  validateSnow, buildScope, snapshotRates, increasedPayments, renewalDates, renewalRates,
  assertMove, allowedMoves, displayStatus, renewalDue, selectCurrent,
} from "./contractCenterService";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";

export const pavilionPayments = [
  { component: "Grounds maintenance", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: [11,12,1,2].includes(i + 1) ? 58750 : 117500 })) },
  { component: "Fertilization", months: Array.from({ length: 7 }, (_, i) => ({ month: i + 3, amountCents: i === 6 ? 34284 : 34286 })) },
];
const start = "2026-10-01", end = "2027-09-30";
const card = RATE_CARD_DEFAULTS.map(({ key, ...r }, sortOrder) => ({ ...r, rateKey: key,
  priceText: r.priceText ?? null, minimum: r.minimum ?? null, active: true, sortOrder })) as RateCardItem[];
const term = (overrides = {}) => ({ id: "old", status: "signed", startDate: start, endDate: end, renewedFromTermId: null, ...overrides }) as AgreementTerm;

describe("payment placement and annual totals", () => {
  it("places MSI grounds and seven fertilization payments independently", () => {
    const grounds = expandPayments([pavilionPayments[0]], start, end);
    expect(grounds).toHaveLength(12);
    expect(grounds.find(r => r.month === "2026-11-01")?.amountCents).toBe(58750);
    expect(paymentSummary([pavilionPayments[0]], "landscape").annualPriceCents).toBe(1175000);
    const all = expandPayments(pavilionPayments, start, end);
    expect(all.filter(r => r.component === "Fertilization").map(r => r.month)).toEqual(
      Array.from({ length: 7 }, (_, i) => `2027-${String(i + 3).padStart(2, "0")}-01`));
    expect(paymentSummary(pavilionPayments, "landscape")).toEqual({ annualPriceCents: 1415000, billingType: "monthly_variable" });
    expect(recoverPayments(all)).toEqual(pavilionPayments);
  });
  it("repeats two years while retaining the one-year annual total", () => {
    const rows = expandPayments(pavilionPayments, start, "2028-09-30");
    expect(rows).toHaveLength(38);
    expect(recoverPayments(rows)).toEqual(pavilionPayments);
    expect(paymentSummary(recoverPayments(rows), "landscape").annualPriceCents).toBe(1415000);
  });
  it("places seasonal equal payments April through March and skips zero amounts", () => {
    const equal = [{ component: "Contract", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 100 })) }];
    const rows = expandPayments(equal, "2026-04-01", "2026-10-31");
    expect(rows[0].month).toBe("2026-04-01"); expect(rows[11].month).toBe("2027-03-01");
    expect(paymentSummary(equal, "landscape").billingType).toBe("equal_monthly");
    expect(expandPayments([{ component: "Zero", months: [{ month: 1, amountCents: 0 }] }], start, end)).toEqual([]);
  });
  it("counts five flat-snow payments and keeps T&M annual price null", () => {
    const snow = [{ component: "Snow", months: [12,1,2,3,4].map(month => ({ month, amountCents: 10000 })) }];
    validateSnow("snow", { snowPricing: "flat_rate", snowFlatPriceCents: 50000 });
    expect(paymentSummary(snow, "snow", "flat_rate").annualPriceCents).toBe(50000);
    expect(paymentSummary([], "snow", "time_and_materials")).toEqual({ annualPriceCents: null, billingType: "time_and_materials" });
    expect(paymentSummary([{ component: "Snow", months: [{ month: 1, amountCents: 0 }] }], "snow", "time_and_materials").annualPriceCents).toBeNull();
    expect(() => paymentSummary(snow, "snow", "time_and_materials")).toThrow();
  });
  it.each([
    ["0205-11-01", "2026-10-31"], ["1999-12-31", "2000-01-01"],
    ["2020-01-01", "2025-01-01"], ["2026-12-01", "2026-11-01"], ["2026-02-30", end],
  ])("rejects invalid dates %s to %s", (s, e) => expect(() => validateDates(s, e)).toThrow());
  it("allows 2000 and exactly 60 inclusive months", () => expect(() => validateDates("2000-01-01", "2004-12-31")).not.toThrow());
  it("rejects duplicates, noninteger cents, negative amounts and overflowing annual totals", () => {
    expect(() => validatePayments([pavilionPayments[0], pavilionPayments[0]])).toThrow();
    expect(() => validatePayments([{ component: "A", months: [{ month: 1, amountCents: 0 }, { month: 1, amountCents: 5 }] }])).toThrow();
    for (const amountCents of [-1, 1.5, 2147483648])
      expect(() => validatePayments([{ component: "A", months: [{ month: 1, amountCents }] }])).toThrow();
    expect(() => paymentSummary([{ component: "A", months: [{ month: 1, amountCents: 2147483647 }, { month: 2, amountCents: 1 }] }], "landscape")).toThrow();
  });
  it("enforces snow choice and flat-price rules", () => {
    expect(() => validateSnow("landscape", { snowPricing: "flat_rate", snowFlatPriceCents: 1 })).toThrow();
    expect(() => validateSnow("both", {})).toThrow();
    expect(() => validateSnow("snow", { snowPricing: "flat_rate" })).toThrow();
    expect(() => validateSnow("snow", { snowPricing: "time_and_materials", snowFlatPriceCents: 1 })).toThrow();
  });
});
describe("scope and snapshots", () => {
  it("orders catalog scope before labelled custom lines and derives line", () => {
    const scope = buildScope([{ serviceKey: "other:custom", included: true, details: { label: "Custom" } },
      { serviceKey: "backflow", included: false }, { serviceKey: "mowing", included: true }], "both");
    expect(scope.map(s => s.serviceKey)).toEqual(["mowing", "backflow", "other:custom"]);
    expect(scope[1].line).toBe("irrigation");
    expect(buildScope([{ serviceKey: "other:c", included: true, details: { label: "X" } }], "snow")[0].line).toBe("snow");
    expect(() => buildScope([{ serviceKey: "unknown", included: true }], "both")).toThrow();
    expect(() => buildScope([{ serviceKey: "other:c", included: true }], "both")).toThrow();
    expect(() => buildScope([{ serviceKey: "mowing", included: true }, { serviceKey: "mowing", included: false }], "both")).toThrow();
  });
  it("snapshots all active rows for both, retains card reference for overrides, validates custom rates", () => {
    const rows = snapshotRates([...card, { ...card[0], rateKey: "retired", active: false }], [{ rateKey: "rate_plow_truck", priceCents: 17000 }], "both");
    expect(rows).toHaveLength(43);
    expect(rows.find(r => r.rateKey === "rate_plow_truck")).toMatchObject({ priceCents: 17000, cardPriceCents: 14500 });
    expect(snapshotRates(card, [], "landscape").every(r => r.line !== "snow")).toBe(true);
    expect(() => snapshotRates(card, [{ rateKey: "custom", line: "snow", unit: "ton", category: "Materials" }], "snow")).toThrow();
    expect(snapshotRates(card, [{ rateKey: "custom", label: "Ice", line: "snow", unit: "ton", category: "Materials", priceCents: 5 }], "snow").at(-1)).toMatchObject({ cardPriceCents: null, priceCents: 5 });
  });
});
describe("renewal, status and Colorado display", () => {
  it("does not round exact twelve-dollar multiples up due to floating-point noise", () => {
    const after = increasedPayments([{ component: "A", months: [{ month: 1, amountCents: 12000 }] }], 10, "twelve");
    expect(after[0].months[0].amountCents).toBe(13200);
    const small = increasedPayments([{ component: "A", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 50 })) }], 0, "dollar");
    expect(small[0].months.every(m => m.amountCents >= 0)).toBe(true);
    expect(small[0].months.reduce((n, m) => n + m.amountCents, 0)).toBe(600);
  });
  it.each(["dollar", "twelve"] as const)("reconciles each annual line with %s rounding", round => {
    const payments = increasedPayments(pavilionPayments, 3, round);
    payments.forEach((p, i) => {
      const old = pavilionPayments[i].months.reduce((n, m) => n + m.amountCents, 0);
      expect(p.months.reduce((n, m) => n + m.amountCents, 0)).toBe(round === "dollar" ? Math.round(old * 1.03 / 100) * 100 : Math.ceil(old * 1.03 / 1200) * 1200);
    });
    expect(renewalDates(term())).toEqual({ startDate: "2027-10-01", endDate: "2028-09-30", seasonLabel: "2027–28" });
    expect(renewalDates(term({ endDate: "2028-09-30" })).seasonLabel).toBe("2028–30");
  });
  it("refreshes unmodified rates but retains numeric, text and custom overrides", () => {
    const old = snapshotRates(card, [{ rateKey: "rate_plow_truck", priceCents: 17000 },
      { rateKey: "rate_holiday", priceText: "2x" },
      { rateKey: "custom", label: "Custom", category: "Snow", unit: "hour", line: "snow", priceCents: 500 }], "both") as TermRate[];
    const next = card.map(r => ({ ...r, priceCents: r.rateKey === "rate_skid_loader" ? 30000 : r.priceCents }));
    const result = renewalRates(old, next, "both");
    expect(result.rates.find(r => r.rateKey === "rate_plow_truck")?.priceCents).toBe(17000);
    expect(result.rates.find(r => r.rateKey === "rate_holiday")?.priceText).toBe("2x");
    expect(result.rates.find(r => r.rateKey === "rate_skid_loader")?.priceCents).toBe(30000);
    expect(result.rates.find(r => r.rateKey === "custom")?.priceCents).toBe(500);
  });
  it("rejects direct signing and all computed status moves, and allows renewal draft loss", () => {
    expect(() => assertMove(term({ status: "draft" }), "signed")).toThrow();
    expect(allowedMoves("draft", false)).toEqual(["sent", "cancelled"]);
    expect(allowedMoves("draft", true)).toEqual(["sent", "cancelled", "lost"]);
    expect(() => assertMove(term({ status: "sent" }), "signed")).not.toThrow();
    expect(() => assertMove(term(), "active")).toThrow();
  });
  it("starts active today, expires after end, and becomes renewal due at exactly 60 days", () => {
    const t = term({ startDate: "2026-01-01", endDate: "2026-12-31" });
    expect(displayStatus(t, [], "2026-01-01")).toBe("active");
    expect(displayStatus(t, [], "2027-01-01")).toBe("expired");
    expect(renewalDue(t, [], "2026-10-31")).toBe(false);
    expect(renewalDue(t, [], "2026-11-01")).toBe(true);
    const renewal = term({ id: "new", startDate: "2027-01-01", endDate: "2027-12-31", renewedFromTermId: t.id, status: "draft" });
    expect(selectCurrent([t, renewal])?.id).toBe(t.id);
    expect(selectCurrent([t, { ...renewal, status: "signed" }])?.id).toBe("new");
    expect(displayStatus(t, [t, { ...renewal, status: "signed" }], "2027-01-01")).toBe("active");
  });
});
