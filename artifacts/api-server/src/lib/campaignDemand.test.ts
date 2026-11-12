import { describe, expect, it } from "vitest";
import { campaignDemand, calendarInstance } from "./campaignDemand";
import { coverageResolver } from "./contractCoverage";
import { STARTING_SERVICE_CALENDAR } from "../../../../lib/db/src/serviceCalendarContracts";
const months = (v: Record<number, number>) => Array.from({length: 12}, (_, i) => v[i + 1] ?? 0);
export function demandFixture(key = "cleanups", quantity: number | null = 3, spread: number[] | null = null) {
  return {
    customers: [{id: "p", name: "Property", parentCustomerId: null, isParent: "false", companyId: "c"}],
    agreements: [{id: "a", customerId: "p", companyId: "c"}],
    terms: [{id: "t", agreementId: "a", companyId: "c", line: "landscape", status: "signed", startDate: "2027-01-01", endDate: "2027-12-31", seasonLabel: "2027"}],
    scope: [{termId: "t", companyId: "c", serviceKey: key, included: true, quantity, monthSpread: spread}],
    calendar: STARTING_SERVICE_CALENDAR.map((e, i) => ({...e, id: `calendar-${i}`})),
  } as any;
}
// Predecessor allocation assertions isolate the explicitly tested services;
// full-package and omission projections are covered by campaignDemand.sc22.
const run = (data: any, year = 2027) => {
  const keys = new Set(data.scope.map((s: any) => s.serviceKey));
  const report = campaignDemand({ ...data, calendar: data.calendar.filter((e: any) => keys.has(e.serviceKey)) }, year, "2026-11-11");
  return { ...report, rounds: report.rounds.filter(r => r.members.length) };
};
describe("calendar deadline demand", () => {
  it("allocates October seasons by deadline, including the preceding December opening", () => {
    const data = demandFixture("shrub_trimming", null);
    Object.assign(data.terms[0], {startDate: "2026-10-01", endDate: "2027-09-30"});
    data.scope.push({...data.scope[0], serviceKey: "fertilization"}, {...data.scope[0], serviceKey: "ornamental_grass"});
    const all = [...run(data, 2026).rounds, ...run(data).rounds];
    expect(all.filter(r => r.name === "Fall shrub trim").map(r => r.due)).toEqual(["2026-10-31", "2027-10-31"]);
    expect(all.filter(r => r.name === "Fall fertilizer").map(r => r.due)).toEqual(["2027-09-30"]);
    expect(all.find(r => r.serviceKey === "ornamental_grass")).toMatchObject({opens: "2026-12-01", due: "2027-01-30"});
    Object.assign(data.terms[0], {startDate: "2026-10-15", endDate: "2027-10-14"});
    expect([...run(data, 2026).rounds, ...run(data).rounds].filter(r => r.name === "Fall shrub trim")).toHaveLength(2);
  });
  it("selects clean-ups first N or blank standards regardless of stated months", () => {
    expect(run(demandFixture()).rounds).toHaveLength(3);
    for (const spread of [null, months({11: 2}), months({6: 1}), [-1], [NaN], Array(12).fill(99)]) {
      expect(run(demandFixture("cleanups", 2, spread)).rounds.map(r => r.name)).toEqual(["Spring clean-up", "Fall leaf clean-up 1"]);
      expect(run(demandFixture("cleanups", 3, spread)).rounds).toHaveLength(3);
      expect(run(demandFixture("cleanups", 4, spread))).toMatchObject({rounds: [], gaps: [{kind: "needs_rounds", count: 4}]});
      expect(run(demandFixture("cleanups", null, spread)).rounds).toHaveLength(3);
    }
    expect(run(demandFixture("cleanups", null)).rounds).toHaveLength(3);
    const data = demandFixture("cleanups", null); data.calendar.forEach((e: any) => e.inStandard = false);
    expect(run(data).gaps[0].kind).toBe("no_count");
    data.calendar = []; expect(run(data).gaps[0].kind).toBe("no_count");
  });
  it("ignores June/October shrubs and June clean-up months", () => {
    expect(run(demandFixture("shrub_trimming", 2, months({6: 1, 10: 1}))).rounds.map(r => r.name))
      .toEqual(["Spring shrub trim", "Fall shrub trim"]);
    expect(run(demandFixture("cleanups", 1, months({6: 1}))).rounds.map(r => r.name)).toEqual(["Spring clean-up"]);
  });
  it("distinguishes explicit first N from an equal-cardinality standard subset and observes reordering", () => {
    const data = demandFixture("cleanups", null);
    const entries = data.calendar.filter((e: any) => e.serviceKey === "cleanups");
    entries[0].inStandard = false;
    expect(run(data).rounds.map(r => r.name)).toEqual(["Fall leaf clean-up 1", "Fall leaf clean-up 2"]);
    data.scope[0].quantity = 2;
    expect(run(data).rounds.map(r => r.name)).toEqual(["Spring clean-up", "Fall leaf clean-up 1"]);
    [entries[0].position, entries[2].position] = [entries[2].position, entries[0].position];
    expect(run(data).rounds.map(r => r.name)).toEqual(["Fall leaf clean-up 1", "Fall leaf clean-up 2"]);
    expect(run(data).rounds.flatMap(r => r.members).every(m => m.timing === "calendar")).toBe(true);
  });
  it("maps cross-year December grass to January deadline year", () => {
    const data = demandFixture("ornamental_grass", 1, months({12: 1}));
    expect(run(data).rounds[0]).toMatchObject({opens: "2026-12-01", due: "2027-01-30"});
    expect(calendarInstance(data.calendar.find((e: any) => e.serviceKey === "ornamental_grass"), 2027).roundYear).toBe(2027);
  });
  it("reports legacy-only chemical, and informational legacy alongside valid new treatments", () => {
    const data = demandFixture("chemical", 3);
    expect(run(data)).toMatchObject({rounds: [], gaps: [{kind: "legacy_chemical", informational: true}]});
    data.scope.push({...data.scope[0], serviceKey: "fertilization"});
    expect(run(data).rounds).toHaveLength(3);
    expect(run(data).gaps).toMatchObject([{kind: "legacy_chemical", informational: true}]);
  });
  it.each([null, 1, 8])("owes one annual backflow independent of device count %s", quantity => {
    const data = demandFixture("backflow", quantity, [-1]);
    Object.assign(data.terms[0], {startDate: "2026-10-01", endDate: "2027-09-30"});
    expect([...run(data, 2026).rounds, ...run(data).rounds].map(r => r.due)).toEqual(["2026-12-31", "2027-12-31"]);
  });
  it("preserves explicit zero, invalid and duplicate safeguards", () => {
    expect(run(demandFixture("cleanups", 0, months({11: 1})))).toEqual({rounds: [], gaps: []});
    for (const n of [-1, 1.5, 25]) expect(run(demandFixture("cleanups", n)).gaps[0].kind).toBe("invalid_count");
    const data = demandFixture(); data.scope.push({...data.scope[0], included: false});
    expect(run(data)).toMatchObject({rounds: [], gaps: [{kind: "duplicate_lines"}]});
    expect(run(demandFixture("cleanups", 1, [-1])).gaps).toEqual([]);
  });
  it("uses firm before sent, term priority, inclusive exact boundaries and own exclusions", () => {
    const data = demandFixture("shrub_trimming", null);
    data.terms.push({...data.terms[0], id: "sent", status: "sent", startDate: "2027-02-01"});
    data.scope.push({...data.scope[0], termId: "sent"});
    let resolver = coverageResolver({...data, scopes: data.scope}, {statuses: ["signed", "sent"]});
    expect(resolver.forDate("p", "shrub_trimming", "2027-10-31")?.term.id).toBe("t");
    expect(resolver.forDate("p", "shrub_trimming", "2027-12-31")?.term.id).toBe("t");
    expect(resolver.forDate("p", "shrub_trimming", "2028-01-01")).toBeNull();
    data.terms.push({...data.terms[0], id: "newest", startDate: "2027-03-01"});
    resolver = coverageResolver({...data, scopes: data.scope});
    expect(resolver.forDate("p", "shrub_trimming", "2027-10-31")?.term.id).toBe("newest");
    data.customers.push({id: "parent", companyId: "c", isParent: "true", parentCustomerId: null});
    data.customers[0].parentCustomerId = "parent";
    data.agreements[0].customerId = "parent";
    data.agreements.push({id: "own", companyId: "c", customerId: "p"});
    data.terms = [data.terms[0], {...data.terms[0], agreementId: "own", id: "own", status: "sent"}];
    data.scope.push({...data.scope[0], termId: "own", included: false});
    expect(run(data).rounds).toEqual([]);
  });
  it("keeps Routes yearly resolution and forMonth behavior", () => {
    const data = demandFixture("mowing", 26, months({4: 1}));
    const resolver = coverageResolver({...data, scopes: data.scope});
    expect(resolver("p", "mowing", 2027)).toMatchObject({months: [4], window: {start: "2027-04-01", end: "2027-04-30"}});
    expect(resolver.forMonth("p", "mowing", "2027-01-01")?.term.id).toBe("t");
    expect(run(data).rounds).toEqual([]);
  });
});
