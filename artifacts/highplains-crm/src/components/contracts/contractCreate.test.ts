import { describe, expect, it } from "vitest";
import { applyPreset, blankLine, paymentsPayload, annualCents, lineMismatch, setMonthCents, linesFromBilling, equalMonthly, lineProblems } from "./paymentDraft";
import { createBody, defaultDates, ensurePayments, newDraft, seasonLabelFor, setLine, sessionKey, stepProblems, applyScopePreset, initialScope, reviewRows } from "./newContractDraft";
import { createSequencer, parsePct, visibleRateChanges } from "./renewPreview";

const line = (name: string, total: string, chosen: number[] = []) => blankLine(name, { total, chosen });
describe("payment drafts", () => {
  it("builds the MSI Pavilion Villas example", () => {
    const g = applyPreset(line("Grounds maintenance", "11750"), "msi", 10);
    const f = applyPreset(line("Fertilization", "2400", [3, 4, 5, 6, 7, 8, 9]), "equalOver", 10);
    expect(g.months[10]).toBe(58750); expect(g.months[0]).toBe(58750); expect(g.months[2]).toBe(117500);
    expect(f.months[2]).toBe(34286); expect(f.months[8]).toBe(34284);
    expect(annualCents([g, f])).toBe(1415000);
    expect(paymentsPayload([g, f])[1].months).toHaveLength(7);
  });
  it("switches to Custom on edit and warns on mismatch", () => {
    const l = setMonthCents(applyPreset(line("A", "1000"), "equal12", 1), 1, 1);
    expect(l.preset).toBe("custom");
    expect(lineMismatch(l)).toEqual({ sum: l.months.reduce((a, b) => a + b, 0), total: 100000 });
  });
  it("puts odd cents on the last cycle month", () => {
    expect(applyPreset(line("A", "10000"), "equal12", 10).months[8]).toBe(83337);
    expect(applyPreset(line("A", "10000"), "equal12", 1).months[11]).toBe(83337);
  });
  it("recovers one year and detects equal monthly", () => {
    const l = applyPreset(line("A", "1200"), "equal12", 1);
    const rows = l.months.map((a, i) => ({ component: "A", month: `2026-${String(i + 1).padStart(2, "0")}-01`, amountCents: a }));
    expect(linesFromBilling([...rows, ...rows.map(r => ({ ...r, month: r.month.replace("2026", "2027") }))])[0].months).toEqual(l.months);
    expect(equalMonthly([l])).toBe(10000);
  });
  it("requires line names", () => expect(lineProblems([blankLine("")])).toHaveLength(1));
});

describe("new contract draft", () => {
  const today = "2026-10-12";
  it("defaults dates", () => {
    expect(defaultDates("landscape", today)).toEqual({ startDate: "2026-11-01", endDate: "2027-10-31" });
    expect(defaultDates("snow", today)).toEqual({ startDate: "2026-10-01", endDate: "2027-04-30" });
    expect(seasonLabelFor("2026-10-01", "2027-09-30")).toBe("2026\u201327");
  });
  it("validates steps", () => {
    const d = newDraft(today);
    expect(stepProblems(d, 1).length).toBe(3);
    const s = { ...d, customerId: "c", line: "both" as const, form: "ours" as const, snowPricing: "flat_rate" as const };
    expect(stepProblems(s, 1)).toEqual(["Enter a flat snow price above $0"]);
    expect(stepProblems({ ...s, startDate: "2027-01-02", endDate: "2027-01-01" }, 2)).toContain("The end date must be on or after the start date");
    expect(stepProblems({ ...s, startDate: "2026-01-01", endDate: "2031-01-01" }, 2)).toContain("A contract can span at most 60 months");
    expect(stepProblems({ ...s, payments: [blankLine("")] }, 5)[0]).toMatch(/needs a name/);
  });
  it("adds a flat snow line Dec to Apr that counts in the annual price", () => {
    let d = setLine({ ...newDraft(today), customerId: "c", form: "ours" }, "both", today);
    d = { ...d, snowPricing: "flat_rate", flatPrice: "5000", startDate: "2026-10-01" };
    const lines = ensurePayments(d);
    expect(lines.map(l => l.name)).toEqual(["Grounds maintenance", "Snow"]);
    expect(lines[1].months.filter(Boolean)).toHaveLength(5); expect(lines[1].months[11]).toBeGreaterThan(0); expect(lines[1].months[5]).toBe(0);
    const body = createBody({ ...d, payments: lines });
    expect(body.term.snowFlatPriceCents).toBe(500000);
    expect(body.payments).toHaveLength(1);
  });
  it("snow-only time and materials has no payments and picks scope presets", () => {
    const d = setLine({ ...newDraft(today), customerId: "c", form: "theirs" }, "snow", today);
    expect(ensurePayments(d)).toEqual([]);
    expect(createBody(d).payments).toEqual([]);
    expect(applyScopePreset(initialScope("snow"), "snow").filter(r => r.included).map(r => r.serviceKey).sort())
      .toEqual(["ice_melt", "snow_drives", "snow_stakes", "snow_walks"]);
  });
  it("scopes the session key by company and login", () => {
    expect(sessionKey("a", "u1")).not.toBe(sessionKey("b", "u1"));
    expect(sessionKey("a", "u1")).not.toBe(sessionKey("a", "u2"));
  });
  it("review includes edited card rates and custom rates using the submitted amounts", () => {
    const base = { line: "landscape", category: "Extras", priceText: null, unit: "per visit", minimum: null, cardPriceText: null };
    const rates = [
      { ...base, rateKey: "rate_additional_mowing", label: "Additional mowing", priceCents: 60000, cardPriceCents: 60000, input: "610" },
      { ...base, rateKey: "custom_mulch", label: "Seasonal mulch", priceCents: 25000, cardPriceCents: null, input: "250" },
    ];
    const d = { ...newDraft(today), rates };
    expect(reviewRows(d).changedRates.map(r => [r.label, r.input, r.custom])).toEqual([
      ["Additional mowing", "610", false], ["Seasonal mulch", "250", true],
    ]);
    expect(createBody(d).rates[0].priceCents).toBe(61000);
  });
});

describe("renew preview", () => {
  it("validates percent", () => {
    expect(parsePct("3")).toBe(3); expect(parsePct("-50")).toBe(-50); expect(parsePct("101")).toBeNull(); expect(parsePct("x")).toBeNull();
  });
  it("only the newest request is current", () => {
    const s = createSequencer(); const a = s.next(); const b = s.next();
    expect(s.isCurrent(a)).toBe(false); expect(s.isCurrent(b)).toBe(true); s.cancel(); expect(s.isCurrent(b)).toBe(false);
  });
  it("splits card changes from kept overrides", () => {
    const c = (reason: string, o: number, n: number) => ({ rateKey: reason + o, label: "x", reason, old: { priceCents: o, priceText: null }, new: { priceCents: n, priceText: null } });
    const v = visibleRateChanges([c("card changed", 1, 2), c("card changed", 3, 3), c("kept override", 5, 5)]);
    expect(v.card).toHaveLength(1); expect(v.kept).toHaveLength(1);
  });
});

import { paymentsFingerprint, setMonthRaw } from "./paymentDraft";
describe("raw month validity", () => {
  it("keeps invalid text, blocks saving, and clears when fixed", () => {
    const original = line("Grounds", "1000");
    const bad = setMonthRaw(original, 3, "1.234");
    expect(bad.invalid[3]).toBe("1.234");
    expect(paymentsFingerprint([bad])).not.toBe(paymentsFingerprint([original]));
    expect(lineProblems([bad]).join()).toMatch(/dollars/);
    const good = setMonthRaw(bad, 3, "1.23");
    expect(good.invalid[3]).toBeUndefined(); expect(good.months[2]).toBe(123);
    expect(lineProblems([good])).toEqual([]);
  });
  it("rejects duplicate and long names and an invalid total keeps the preset", () => {
    expect(lineProblems([blankLine("A"), blankLine(" a ")]).join()).toMatch(/already used/);
    expect(lineProblems([blankLine("x".repeat(151))]).join()).toMatch(/150/);
    const l = applyPreset(line("A", "1200"), "equal12", 1);
    const t = { ...l, total: "12x" };
    expect(paymentsFingerprint([t])).not.toBe(paymentsFingerprint([l]));
    expect(lineProblems([t]).join()).toMatch(/total/);
  });
});
