import { describe, expect, it } from "vitest";
import { campaignDemand } from "./campaignDemand";
import { renewalDemandThrough } from "./campaignDemandCoverage";
import { demandFixture } from "./campaignDemand.test";

const members = (data: any, key = "cleanups", year = 2027) => campaignDemand(data, year, "2026-11-12").rounds
  .filter(r => r.serviceKey === key && r.members.length);
const omissions = (data: any, key = "cleanups", year = 2027) => campaignDemand(data, year, "2026-11-12").rounds
  .filter(r => r.serviceKey === key).flatMap(r => r.nonmembers ?? []);
describe("standard landscape package and bounded renewal demand", () => {
  it("explains a silent nonpackage service but keeps explicit missing-standard and over-capacity cases as gaps", () => {
    const d = demandFixture(); d.scope = [];
    d.calendar.filter((e: {serviceKey: string}) => e.serviceKey === "cleanups")
      .forEach((e: {inStandard: boolean}) => e.inStandard = false);
    expect(members(d)).toHaveLength(0);
    expect(omissions(d).map(m => m.reason)).toEqual(Array(3).fill("not_in_package"));
    d.scope = demandFixture("cleanups", null).scope;
    expect(campaignDemand(d, 2027, "2026-11-12").gaps).toEqual(expect.arrayContaining([expect.objectContaining({serviceKey: "cleanups", kind: "no_count"})]));
    expect(omissions(d)).toHaveLength(0);
    d.scope[0].quantity = 4;
    expect(campaignDemand(d, 2027, "2026-11-12").gaps).toEqual(expect.arrayContaining([expect.objectContaining({serviceKey: "cleanups", kind: "needs_rounds"})]));
    expect(omissions(d)).toHaveLength(0);
  });
  it("includes silent standard cleanups, excludes false/zero and selects first two", () => {
    const d = demandFixture(); d.scope = [];
    expect(members(d)).toHaveLength(3);
    expect(members(d).every(r => r.members[0].count === "standard")).toBe(true);
    d.scope = [{ termId: "t", companyId: "c", serviceKey: "cleanups", included: false, quantity: null }];
    expect(members(d)).toHaveLength(0);
    expect(omissions(d).map(m => m.reason)).toEqual(Array(3).fill("excluded_by_contract"));
    d.scope[0].included = true; d.scope[0].quantity = 0;
    expect(members(d)).toHaveLength(0);
    d.scope[0].quantity = 2;
    expect(members(d).map(r => r.name)).toEqual(["Spring clean-up", "Fall leaf clean-up 1"]);
    expect(omissions(d)).toMatchObject([{ reason: "count_covers_fewer" }]);
  });
  it("does not enumerate absent natives/backflow; blank natives and device checklists remain included", () => {
    const d = demandFixture("native_areas", null); d.scope = [];
    expect(members(d, "native_areas")).toHaveLength(0);
    expect(omissions(d, "native_areas")).toHaveLength(0);
    d.scope = demandFixture("native_areas", null).scope;
    expect(members(d, "native_areas")).toHaveLength(2);
    const b = demandFixture("backflow", 8);
    expect(members(b, "backflow")).toHaveLength(1);
    b.scope = []; expect(omissions(b, "backflow")).toHaveLength(0);
  });
  it("treats chemical legacy as informational while explicit split exclusions govern", () => {
    const d = demandFixture("chemical", 3);
    expect(members(d, "fertilization")).toHaveLength(3);
    expect(members(d, "broadleaf")).toHaveLength(3);
    expect(campaignDemand(d, 2027, "").gaps).toContainEqual(expect.objectContaining({ kind: "legacy_chemical", informational: true }));
    d.scope.push({ ...d.scope[0], serviceKey: "fertilization", included: false }, { ...d.scope[0], serviceKey: "broadleaf", included: false });
    expect(members(d, "fertilization")).toHaveLength(0);
    expect(members(d, "broadleaf")).toHaveLength(0);
  });
  it("continues October–September fall rounds and retains original-season obligations after nonrenewal", () => {
    const d = demandFixture("cleanups", null);
    Object.assign(d.terms[0], { startDate: "2026-10-01", endDate: "2027-09-30" });
    expect(members(d).filter(r => r.due > "2027-09-30").every(r => r.members[0].renewalPending)).toBe(true);
    d.terms[0].nonRenewalOn = "2027-07-01";
    expect(members(d).map(r => r.name)).toEqual(["Spring clean-up"]);
    expect(omissions(d).map(m => m.reason)).toEqual(["not_renewing", "not_renewing"]);
    expect(members(d, "cleanups", 2026)).toHaveLength(2);
  });
  it("uses exact twelve-calendar-month bounds, never reviving older nonrenewing or expired seasons", () => {
    const d = demandFixture("cleanups", null);
    d.calendar = d.calendar.filter((e: any) => e.serviceKey === "cleanups");
    Object.assign(d.terms[0], { startDate: "2025-12-31", endDate: "2026-12-31" });
    expect(members(d).at(-1)?.due).toBe("2027-12-31");
    d.terms[0].endDate = "2026-12-30";
    expect(omissions(d).at(-1)?.reason).toBe("renewal_beyond_12_months");
    d.terms.push({ ...d.terms[0], id: "latest", endDate: "2027-01-01", nonRenewalOn: "2027-01-01" });
    expect(members(d)).toHaveLength(0);
    expect(omissions(d).every(m => m.reason === "not_renewing")).toBe(true);
    expect(renewalDemandThrough("2024-02-29")).toBe("2025-02-28");
  });
  it("reassigns demand to an entered renewal, keeps firm priority and refuses lost/cancelled", () => {
    const d = demandFixture("cleanups", null);
    Object.assign(d.terms[0], { startDate: "2026-10-01", endDate: "2027-09-30" });
    d.terms.push({ ...d.terms[0], id: "renewal", startDate: "2027-10-01", endDate: "2028-09-30" });
    expect(members(d).at(-1)?.members[0]).toMatchObject({ termId: "renewal", renewalPending: false });
    d.terms.push({ ...d.terms[1], id: "sent", status: "sent", startDate: "2027-10-15" });
    expect(members(d).at(-1)?.members[0].termId).toBe("renewal");
    d.terms.forEach((t: any) => t.status = "lost");
    expect(members(d)).toHaveLength(0);
  });
  it("preserves own exclusions over parent inclusion and company isolation", () => {
    const d = demandFixture("cleanups", null);
    d.customers.push({ ...d.customers[0], id: "parent", isParent: "true" });
    d.customers[0].parentCustomerId = "parent";
    d.agreements.push({ ...d.agreements[0], id: "parent-agreement", customerId: "parent" });
    d.terms.push({ ...d.terms[0], id: "parent-term", agreementId: "parent-agreement" });
    d.scope[0].included = false;
    d.scope.push({ ...d.scope[0], termId: "parent-term", included: true });
    expect(members(d)).toHaveLength(0);
    d.terms[0].companyId = "foreign";
    expect(members(d)).toHaveLength(3);
    d.customers[1].companyId = "foreign";
    expect(members(d)).toHaveLength(0);
    const foreignCalendar = demandFixture(); foreignCalendar.scope = [];
    foreignCalendar.calendar.forEach((entry: any) => entry.companyId = "foreign");
    expect(members(foreignCalendar)).toHaveLength(0);
  });
  it("retains invalid/duplicate/overcapacity gaps, not false omission explanations", () => {
    for (const quantity of [-1, 25, 1.5, 4]) {
      const d = demandFixture("cleanups", quantity);
      expect(members(d)).toHaveLength(0); expect(omissions(d)).toHaveLength(0);
      expect(campaignDemand(d, 2027, "").gaps).toContainEqual(expect.objectContaining({
        kind: quantity === 4 ? "needs_rounds" : "invalid_count",
      }));
    }
    const d = demandFixture(); d.scope.push({ ...d.scope[0], included: false });
    expect(omissions(d)).toHaveLength(0);
    expect(campaignDemand(d, 2027, "").gaps[0].kind).toBe("duplicate_lines");
  });
});
