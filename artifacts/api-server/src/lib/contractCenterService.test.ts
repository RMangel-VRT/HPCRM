import { describe, expect, it, vi } from "vitest";
import type { AgreementTerm, RateCardItem, TermRate } from "@workspace/db";
import {
  expandPayments, recoverPayments, paymentSummary, validateDates, validatePayments,
  validateSnow, buildScope, snapshotRates, increasedPayments, renewalDates, renewalRates,
  assertMove, allowedMoves, displayStatus, renewalDue, selectCurrent, selectRenewalSource,
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
    expect(paymentSummary(pavilionPayments, "landscape")).toEqual({ annualPriceCents: 1415000, feesAnnualCents: 0, billingType: "monthly_variable" });
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
    expect(paymentSummary([], "snow", "time_and_materials")).toEqual({ annualPriceCents: null, feesAnnualCents: 0, billingType: "time_and_materials" });
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
  it("hydrates omitted fields but preserves explicit null, zero, text, metadata and input order", () => {
    const input = [{ rateKey: "rate_irrigation_labor", priceCents: 8500, label: "Agreed irrigation", minimum: null },
      { rateKey: "rate_general_labor", priceCents: 0, priceText: "", unit: "visit" }];
    const rows = snapshotRates(card, input, "landscape");
    expect(rows.map(r => [r.rateKey, r.sortOrder])).toEqual(input.map((r, i) => [r.rateKey, i]));
    expect(rows[0]).toMatchObject({ priceCents: 8500, label: "Agreed irrigation", minimum: null,
      unit: card.find(c => c.rateKey === input[0].rateKey)!.unit });
    expect(rows[1]).toMatchObject({ priceCents: 0, priceText: "", unit: "visit" });
    expect(snapshotRates(card, [{ rateKey: "rate_general_labor", priceCents: null, priceText: "By quote" }], "landscape")[0])
      .toMatchObject({ priceCents: null, priceText: "By quote" });
    const standard = card.find(c => c.rateKey === "rate_general_labor")!;
    expect(snapshotRates(card, [{ rateKey: standard.rateKey }], "landscape")[0])
      .toMatchObject({ label: standard.label, unit: standard.unit, priceCents: standard.priceCents, cardPriceCents: standard.priceCents });
  });
  it("rejects duplicates, inactive and nonapplicable card keys even with custom metadata", () => {
    expect(() => snapshotRates(card, [{ rateKey: card[0].rateKey }, { rateKey: card[0].rateKey }], "both")).toThrow("Duplicate");
    expect(() => snapshotRates(card.map(c => ({ ...c, active: false })), [{ rateKey: card[0].rateKey,
      label: "Pretend custom", unit: "hour", category: "Custom", line: "general" }], "both")).toThrow("inactive");
    expect(() => snapshotRates(card, [{ rateKey: "rate_plow_truck" }], "landscape")).toThrow("does not apply");
  });
  it("renews exact retired/custom snapshots and refreshes references without repricing", () => {
    const old = snapshotRates(card, [{ rateKey: "rate_general_labor" }, { rateKey: "rate_irrigation_labor", priceCents: 8500 },
      { rateKey: "custom_visit", label: "Mobilization", unit: "visit", category: "Custom", line: "general", priceCents: 3995 }], "landscape") as TermRate[];
    const changed = card.map(c => ({ ...c, active: false, priceCents: 99999, unit: "changed" }));
    const before = structuredClone(old), result = renewalRates(old, changed, "landscape");
    expect(result.rates.map(r => [r.rateKey, r.priceCents, r.unit])).toEqual(old.map(r => [r.rateKey, r.priceCents, r.unit]));
    expect(result.rates[0].cardPriceCents).toBe(99999);
    expect(result.changes.every(c => c.reason === "carried")).toBe(true);
    expect(old).toEqual(before);
    expect(renewalRates(old, changed, "snow").rates.map(r => r.rateKey)).toEqual(["custom_visit"]);
    expect(renewalRates(old, changed, "snow").changes.filter(c => c.reason === "removed")).toHaveLength(2);
  });
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
  it("snapshots only supplied rows, retains card reference, validates custom rates", () => {
    const rows = snapshotRates([...card, { ...card[0], rateKey: "retired", active: false }], [{ rateKey: "rate_plow_truck", priceCents: 17000 }], "both");
    expect(rows).toHaveLength(1);
    expect(rows.find(r => r.rateKey === "rate_plow_truck")).toMatchObject({ priceCents: 17000, cardPriceCents: 14500 });
    expect(snapshotRates(card, [], "landscape")).toEqual([]);
    expect(() => snapshotRates(card, [{ rateKey: "custom", line: "snow", unit: "ton", category: "Materials" }], "snow")).toThrow();
    expect(snapshotRates(card, [{ rateKey: "custom", label: "Ice", line: "snow", unit: "ton", category: "Materials", priceCents: 5 }], "snow").at(-1)).toMatchObject({ cardPriceCents: null, priceCents: 5 });
  });
});
describe("renewal, status and Colorado display", () => {
  it("keeps operating seasons active through the inclusive end date, then projects non-renewal as lost", () => {
    const t = term({ startDate: "2026-01-01", endDate: "2026-12-31", nonRenewalOn: "2026-11-02" });
    expect(allowedMoves("signed", false)).toEqual(["cancelled"]);
    expect(allowedMoves("active", true, true)).toEqual(["cancelled"]);
    expect(renewalDue(t, [], "2026-12-01")).toBe(false);
    expect(displayStatus(t, [], "2026-12-30")).toBe("active");
    expect(displayStatus(t, [], "2026-12-31")).toBe("active");
    expect(displayStatus(t, [], "2027-01-01")).toBe("lost");
    expect(displayStatus({ ...t, status: "renewed" }, [], "2027-01-01")).toBe("lost");
    expect(displayStatus({ ...t, status: "renewed" }, [], "2026-12-31")).toBe("active");
    expect(displayStatus(t, [term({ id: "successor", renewedFromTermId: t.id })], "2027-01-01")).not.toBe("lost");
  });
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
  it("carries exact commitments without adding or repricing unstated rows", () => {
    const old = snapshotRates(card, [{ rateKey: "rate_plow_truck", priceCents: 17000 },
      { rateKey: "rate_holiday", priceText: "2x" },
      { rateKey: "custom", label: "Custom", category: "Snow", unit: "hour", line: "snow", priceCents: 500 }], "both") as TermRate[];
    const next = card.map(r => ({ ...r, priceCents: r.rateKey === "rate_skid_loader" ? 30000 : r.priceCents }));
    const result = renewalRates(old, next, "both");
    expect(result.rates.find(r => r.rateKey === "rate_plow_truck")?.priceCents).toBe(17000);
    expect(result.rates.find(r => r.rateKey === "rate_holiday")?.priceText).toBe("2x");
    expect(result.rates.find(r => r.rateKey === "rate_skid_loader")).toBeUndefined();
    expect(result.rates.find(r => r.rateKey === "custom")?.priceCents).toBe(500);
  });
  it("rejects direct signing and all computed status moves, and allows renewal draft loss", () => {
    expect(() => assertMove(term({ status: "draft" }), "signed")).toThrow();
    expect(allowedMoves("draft", false)).toEqual(["sent", "cancelled"]);
    expect(allowedMoves("draft", true)).toEqual(["sent", "cancelled", "lost"]);
    expect(allowedMoves("draft", false, true)).toEqual(["sent", "cancelled", "lost"]);
    expect(() => assertMove(term({ status: "draft", bidTicketId: "rfp" }), "lost")).not.toThrow();
    expect(() => assertMove(term({ status: "draft", bidTicketId: null }), "lost")).toThrow();
    expect(() => assertMove(term({ status: "draft", renewedFromTermId: "source" }), "lost")).not.toThrow();
    expect(() => assertMove(term({ status: "sent" }), "signed")).not.toThrow();
    expect(() => assertMove(term(), "active")).toThrow();
  });
  it("starts active today, expires after end, and becomes renewal due at exactly 90 days", () => {
    const t = term({ startDate: "2026-01-01", endDate: "2026-12-31" });
    expect(displayStatus(t, [], "2026-01-01")).toBe("active");
    expect(displayStatus(t, [], "2027-01-01")).toBe("expired");
    expect(renewalDue(t, [], "2026-10-01")).toBe(false);
    expect(renewalDue(t, [], "2026-10-02")).toBe(true);
    const renewal = term({ id: "new", startDate: "2027-01-01", endDate: "2027-12-31", renewedFromTermId: t.id, status: "draft" });
    expect(selectCurrent([t, renewal], "2026-12-01")?.id).toBe(t.id);
    expect(selectCurrent([t, { ...renewal, status: "signed" }], "2026-12-01")?.id).toBe(t.id);
    expect(selectCurrent([t, { ...renewal, status: "signed" }], "2027-01-01")?.id).toBe("new");
    expect(displayStatus(t, [t, { ...renewal, status: "signed" }], "2027-01-01")).toBe("active");
  });
});

describe("in-effect display versus final-season renewal source", () => {
  const chain = () => Array.from({ length: 5 }, (_, i) => term({
    id: `year-${i + 1}`, startDate: `${2026 + i}-01-01`, endDate: `${2026 + i}-12-31`,
    status: i === 4 ? "signed" : "renewed", renewedFromTermId: i ? `year-${i}` : null,
  }));
  it("defaults to the Colorado day rather than the host UTC day", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2027-01-01T06:30:00Z")); // Still December 31 in Colorado.
      const terms = chain();
      expect(selectCurrent(terms)).toBe(terms[0]);
      expect(displayStatus(terms[0], terms)).toBe("active");
      expect(renewalDue(terms[0], terms)).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it.each([["2026-11-15", 0], ["2028-06-15", 2]] as const)(
    "selects the in-effect renewed season on %s without mutating the imported chain", (today, index) => {
      const terms = chain(), before = structuredClone(terms);
      const current = selectCurrent(terms, today)!;
      expect(current).toBe(terms[index]);
      expect(displayStatus(current, terms, today)).toBe("active");
      expect(renewalDue(current, terms, today)).toBe(false);
      expect(selectRenewalSource(terms)).toBe(terms[4]);
      terms.forEach((t, i) => expect(displayStatus(t, terms, today)).toBe(
        i === index ? "active" : i === 4 ? "signed" : "renewed"));
      expect(terms).toEqual(before);
    });
  it("falls back to the expired final season after the chain ends", () => {
    const terms = chain(), today = "2031-01-01";
    expect(selectCurrent(terms, today)).toBe(terms[4]);
    expect(displayStatus(terms[4], terms, today)).toBe("expired");
    expect(displayStatus(terms[0], terms, today)).toBe("renewed");
  });
  it.each(["signed", "renewed"] as const)("includes both date boundaries for %s", status => {
    const source = term({ status }), next = term({ id: "next", startDate: "2028-01-01", endDate: "2028-12-31" });
    for (const today of [source.startDate, source.endDate]) {
      expect(selectCurrent([source, next], today)).toBe(source);
      expect(displayStatus(source, [source, next], today)).toBe("active");
    }
  });
  it("keeps an early-signed renewal future until it starts", () => {
    const source = term({ status: "renewed" }), next = term({ id: "next", renewedFromTermId: source.id,
      startDate: "2027-10-01", endDate: "2028-09-30" }), terms = [source, next];
    expect(selectCurrent(terms, "2027-09-30")).toBe(source);
    expect(displayStatus(source, terms, "2027-09-30")).toBe("active");
    expect(displayStatus(next, terms, "2027-09-30")).toBe("signed");
    expect(displayStatus(source, terms, "2027-10-01")).toBe("renewed");
    expect(selectCurrent(terms, "2027-10-01")).toBe(next);
  });
  it.each(["signed", "active", "renewed"] as const)("suppresses due for a direct %s successor inside 60 days", status => {
    const source = term(), next = term({ id: "next", status, renewedFromTermId: source.id,
      startDate: "2027-10-01", endDate: "2028-09-30" });
    expect(renewalDue(source, [source], "2027-09-01")).toBe(true);
    expect(renewalDue(source, [source, next], "2027-09-01")).toBe(false);
    expect(renewalDue(source, [source, { ...next, renewedFromTermId: "unrelated" }], "2027-09-01")).toBe(false);
  });
  it.each(["draft", "sent", "lost", "cancelled"] as const)("excludes linked %s renewals from both selectors", status => {
    const source = term(), pending = term({ id: "next", status, renewedFromTermId: source.id,
      startDate: "2027-10-01", endDate: "2028-09-30" });
    expect(selectCurrent([source, pending], "2028-01-01")).toBe(source);
    expect(selectRenewalSource([source, pending])).toBe(source);
    expect(renewalDue(source, [source, pending], "2027-09-01")).toBe(status === "cancelled");
  });
  it("uses latest start in gaps, before all terms, and for eligible unlinked draft/sent/lost terms", () => {
    const source = term(), next = term({ id: "next", startDate: "2028-01-01", endDate: "2028-12-31" });
    for (const today of ["2025-01-01", "2027-11-01"]) expect(selectCurrent([source, next], today)).toBe(next);
    for (const status of ["draft", "sent", "lost"] as const) {
      const unlinked = { ...next, status };
      expect(selectCurrent([source, unlinked], "2027-11-01")).toBe(unlinked);
      expect(selectRenewalSource([source, unlinked])).toBe(unlinked);
    }
    expect(selectCurrent([], "2026-01-01")).toBeUndefined();
    expect(selectRenewalSource([])).toBeUndefined();
    expect(selectCurrent([term({ status: "cancelled" })], "2026-11-01")).toBeUndefined();
  });
  it("breaks overlaps by latest start then descending id, without sorting the input", () => {
    const a = term({ id: "a", startDate: "2027-01-01" }), z = { ...a, id: "z", status: "active" as const };
    const terms = [z, term(), a], before = [...terms];
    expect(selectCurrent(terms, "2027-06-01")).toBe(z);
    expect(selectRenewalSource(terms)).toBe(z);
    expect(selectCurrent(terms, "2028-06-01")).toBe(z);
    expect(terms).toEqual(before);
  });
});
