import { describe, expect, it } from "vitest";
import { fiveParksFixture } from "./contractedServicesFixture";
import { buildContractedServicesModel as build, blockingServices, frequencyPhrase, ScopeNeedsReview } from "./contractedServicesDocument";
import { contractedServicesHtml } from "./documents/contractedServices";
import { customerServiceFulfillment } from "../lib/customerServiceFulfillment";

describe("SC3 pure explicit-season projection", () => {
  it("matches the approved fixture except owner-approved differences", () => {
    const model = build(fiveParksFixture(), "p", "t");
    expect(model.rows).toHaveLength(13);
    expect(model.dateLine).toBe("Contract year Nov 1, 2025 – Oct 31, 2026");
    expect(model.rows.map(r => r.name)).not.toContain("Bed and hard-surface weed control");
    expect(model.rows.flatMap(r => r.visits).every(v => !v.completed)).toBe(true);
    expect(model.rows.find(r => r.key === "cleanups")?.visits.map(v => v.label)).toEqual(["Fall leaf clean-up", "Final fall clean-up", "Spring clean-up"]);
    expect(model.rows.find(r => r.key === "irrigation_inspection")).toMatchObject({ included: "Monthly", visits: [{ date: "Monthly", completed: "" }] });
    expect(model.boundaryNote).toContain("Irrigation winterization (due Nov 30, 2026)");
    const html = contractedServicesHtml(model);
    expect(html).toContain(">Completed</th>");
    expect(html.replace(/<style>[\s\S]*?<\/style>/g, "")).not.toMatch(/>Agreement<\/th>|Broadleaf 2|\bcampaign\b|\bround\b/i);
    expect(html).toContain("13 contracted services");
  });
  it("prints the exact grouped spread, and orders crossing-year months without timezone drift", () => {
    expect(frequencyPhrase([0,0,0,2,5,4,4,4,5,2,0,0], "2025-11-01", "2026-10-31")).toBe("Weekly May – Sep 2026; twice a month in Apr and Oct");
    expect(frequencyPhrase([2,2,2,0,0,0,0,0,0,0,2,2], "2025-11-01", "2026-10-31")).toBe("Twice a month Nov 2025 – Mar 2026");
  });
  it("keeps valid no-count route pattern fallback numeric-safe and no denominator", () => {
    for (const pattern of ["Monthly", "26 standard visits", null]) {
      const data = fiveParksFixture();
      data.calendar.find(c => c.serviceKey === "irrigation_inspection")!.pattern = pattern;
      data.visits.push({ id: "v", companyId: "c", customerId: "p", serviceKey: "irrigation_inspection", sourceType: "route", visitDate: "2026-06-12", status: "done" } as any);
      const row = build(data, "p", "t").rows.find(r => r.key === "irrigation_inspection")!;
      expect(row.included).toBe(pattern === "Monthly" ? "Monthly" : "As scheduled");
      expect(row.visits[0]).toMatchObject({ date: row.included, completed: "1 done" });
      expect(JSON.stringify(row)).not.toContain("26");
      expect(row.visits[0].completed).not.toContain(" of ");
    }
  });
  it("uses spread for both no-count fields and calendar window only for counted routes", () => {
    const data = fiveParksFixture();
    data.scope![0].quantity = null;
    const row = build(data, "p", "t").rows.find(r => r.key === "mowing")!;
    expect(row.included).toBe("Weekly May – Sep 2026; twice a month in Apr and Oct");
    expect(row.visits[0].date).toBe(row.included);
    data.scope![0].quantity = 5; data.scope![0].monthSpread = null;
    expect(build(data, "p", "t").rows.find(r => r.key === "mowing")).toMatchObject({ included: "5 visits", visits: [{ date: "Apr – Oct 2026", completed: "" }] });
  });
  it.each(["campaign", "checklist", "route"])("checks all %s issue flags, regardless of display status or zero", scheduling => {
    for (const issue of ["no_count", "needs_rounds", "invalid_count", "duplicate_lines"]) {
      const row = { serviceKey: "aeration", scheduling, owed: 0, status: "waiting_on_signature", issues: ["waiting_on_signature", issue] } as any;
      expect(blockingServices([row]).length).toBe(scheduling === "route" && ["no_count", "needs_rounds"].includes(issue) ? 0 : 1);
    }
  });
  it.each([-1, 1.5, 25])("blocks invalid round counts %s instead of hiding unknown rows", quantity => {
    const data = fiveParksFixture();
    data.scope!.push({ ...data.scope![0], serviceKey: "broadleaf", quantity, monthSpread: null });
    expect(() => build(data, "p", "t")).toThrow(ScopeNeedsReview);
  });
  it("omits zero and exclusions, blank customer labels never fall back, and Jan–Dec has no note", () => {
    const data = fiveParksFixture();
    data.scope!.push({ ...data.scope![0], serviceKey: "broadleaf", included: false });
    data.scope![0].quantity = 0;
    data.calendar.forEach(c => c.customerLabel = null);
    let model = build(data, "p", "t");
    expect(model.rows.some(r => ["mowing", "broadleaf"].includes(r.key))).toBe(false);
    expect(model.rows.flatMap(r => r.visits).every(v => !v.label)).toBe(true);
    expect(model.boundaryNote).not.toContain("Winterization and blowout");
    data.terms[0].startDate = "2026-01-01"; data.terms[0].endDate = "2026-12-31";
    expect(build(data, "p", "t").boundaryNote).toBe("");
  });
  it("uses only exact stated term rates and included billing scope metadata", () => {
    const data = fiveParksFixture();
    expect(build(data, "p", "t").sections).toEqual([]);
    data.card = [{ label: "NEVER COPY", priceCents: 99 }] as any;
    data.rates = [{ companyId: "c", termId: "t", sortOrder: 1, label: "Exact stated rate", priceCents: 15500, priceText: "as agreed", unit: "per device", minimum: "one device" }] as any;
    data.scope![0].details = { billing: "billed_when_done", billingPrice: "$123 per visit as agreed" };
    expect(build(data, "p", "t", { commercial: true }).sections).toMatchObject([
      { title: "Billed separately", entries: [expect.stringContaining("$123 per visit as agreed")] },
      { title: "Rates in your agreement", entries: ["Exact stated rate · $155.00 · as agreed · per device · one device"] },
    ]);
    expect(JSON.stringify(build(data, "p", "t"))).not.toContain("NEVER COPY");
  });
  it("prints eligible unscheduled services and optional on-request prices, while omitting unsupported services", () => {
    const data = fiveParksFixture();
    data.scope!.push(...["retention_pond", "pool", "other", "fall_aeration"].map(serviceKey =>
      ({ ...data.scope![0], serviceKey, quantity: null, details: { billingPrice: "$55 per visit" } })));
    const model = build(data, "p", "t", { commercial: true });
    expect(model.rows.find(r => r.key === "retention_pond")).toMatchObject({ included: "Per your agreement", visits: [] });
    expect(model.rows.some(r => ["pool", "other", "fall_aeration"].includes(r.key))).toBe(false);
    expect(model.sections).toEqual([{ title: "On request (priced when ordered)", entries: ["Fall aeration · $55 per visit"] }]);
    data.scope!.push({ ...data.scope![0], serviceKey: "snow_alleys", quantity: null });
    data.terms[0].snowTriggers = null;
    const snow = build(data, "p", "t").rows.filter(r => r.key === "snow");
    expect(snow).toHaveLength(1);
    expect(snow[0]).toMatchObject({ description: "Sidewalks and steps; Alleys", included: "As needed", visits: [{ date: "As snow falls", completed: "" }] });
  });
  it("fails closed for commercial sections when the caller supplies no commercial access", () => {
    const data = fiveParksFixture();
    data.scope![0].details = { billing: "billed_when_done", billingPrice: "PRIVATE_SCOPE_PRICE" };
    data.scope!.push({ ...data.scope![0], serviceKey: "fall_aeration", details: { billingPrice: "PRIVATE_OPTION_PRICE" } });
    data.rates = [{ companyId: "c", termId: "t", sortOrder: 1, label: "PRIVATE_RATE", priceCents: 99999 }] as any;
    const model = build(data, "p", "t");
    expect(model.sections).toEqual([]);
    expect(contractedServicesHtml(model)).not.toMatch(/PRIVATE_SCOPE_PRICE|PRIVATE_OPTION_PRICE|PRIVATE_RATE/);
    expect(build(data, "p", "t", { commercial: false }).sections).toEqual([]);
  });
  it.each([
    ["2026-06-13T01:00:00Z", "Jun 12, 2026"],
    ["2026-03-08T06:30:00Z", "Mar 7, 2026"],
    ["2026-03-08T09:30:00Z", "Mar 8, 2026"],
    ["2026-11-01T07:30:00Z", "Nov 1, 2026"],
  ])("aligns company-local completion %s only beside the second application", (completedAt, expected) => {
    const data = fiveParksFixture();
    const broadleaf = customerServiceFulfillment(data, "p", "t")!.rows.find(r => r.serviceKey === "broadleaf")!;
    broadleaf.rounds.forEach((r, i) => {
      data.campaigns.push({ id: `c${i}`, companyId: "c", serviceKey: "broadleaf", source: "contract", calendarEntryId: r.calendarEntryId, roundYear: r.roundYear, windowStart: r.windowStart, windowEnd: r.windowEnd, title: `Internal ${i}` } as any);
      data.items.push({ id: `i${i}`, companyId: "c", campaignId: `c${i}`, customerId: "p", status: i === 1 ? "completed" : i === 2 ? "skipped" : "pending", completedAt: i === 1 ? new Date(completedAt) : null } as any);
    });
    const row = build(data, "p", "t").rows.find(r => r.key === "broadleaf")!;
    expect(row.visits.map(v => v.completed)).toEqual(["", expected, "Skipped"]);
    expect(row.visits[1].label).toBe("Second application");
  });
});
