import { describe, expect, it } from "vitest";
import { customerListQboState, listSeason, projectCustomerListContracts } from "./customerListSummary";
import { customerContractProjector, type CustomerContractInputs } from "../lib/customerContractSummary";

const today = "2026-11-06";
function fixture() {
  return {
    customers: ["parent", "land", "both", "tm", "none", "inherited"].map(id => ({
      id, companyId: "company", parentCustomerId: ["land", "inherited"].includes(id) ? "parent" : null,
      isParent: id === "parent" ? "true" : "false",
    })),
    agreements: ["parent", "land", "both", "tm"].map(id => ({ id: `${id}-a`, customerId: id, companyId: "company" })),
    terms: ["parent", "land", "both", "tm"].map(id => ({
      id: `${id}-t`, agreementId: `${id}-a`, companyId: "company", seasonLabel: "2026–27",
      line: id === "tm" ? "snow" : "landscape", status: "signed", startDate: "2026-10-01", endDate: "2027-09-30",
      snowPricing: id === "tm" ? "time_and_materials" : null,
    })),
    billingMonths: ["parent", "land", "both"].map((id, i) => ({
      id, termId: `${id}-t`, companyId: "company", component: "Contract", month: "2026-11", amountCents: (i + 1) * 10000,
    })),
    rates: [], scope: [],
  } as unknown as CustomerContractInputs;
}
const addSnow = (data: CustomerContractInputs, owner: string, amount: number | null) => {
  data.agreements.push({ id: "snow-a", companyId: "company", customerId: owner } as any);
  data.terms.push({ id: "snow-t", agreementId: "snow-a", companyId: "company", seasonLabel: "Snow 2026–27",
    line: "snow", status: "active", startDate: "2026-10-01", endDate: "2027-09-30",
    snowPricing: amount == null ? "time_and_materials" : "flat_rate" } as any);
  if (amount != null) data.billingMonths!.push({ termId: "snow-t", component: "Snow", month: "2026-11", amountCents: amount } as any);
};
describe("CP4 This season Contract Center batching projection", () => {
  it("sums multiple in-effect priced landscape/snow agreements, matching CP1 selections", () => {
    const d = fixture(); addSnow(d, "both", 12000);
    const s = projectCustomerListContracts(d, ["both"], today).both;
    expect(s.current).toEqual(customerContractProjector(d, today)("both")!.current);
    expect(s.season).toEqual({ annualCents: 42000, hasSnowTm: false, hasTerm: true });
  });
  it("priced landscape plus snow T&M preserves amount and indicates unpriced snow", () => {
    const d = fixture(); addSnow(d, "both", null);
    expect(projectCustomerListContracts(d, ["both"], today).both.season)
      .toEqual({ annualCents: 30000, hasSnowTm: true, hasTerm: true });
  });
  it("T&M without fixed price is not zero; no term has no amount", () => {
    const s = projectCustomerListContracts(fixture(), ["tm", "none"], today);
    expect(s.tm.season).toEqual({ annualCents: null, hasSnowTm: true, hasTerm: true });
    expect(s.none.season).toEqual({ annualCents: null, hasSnowTm: false, hasTerm: false });
  });
  it("parent own-plus-offpage/collapsed branch contributions count governing terms once", () => {
    const d = fixture(); addSnow(d, "parent", null);
    // Only parent is requested; neither its own-price branch nor inherited branch is on the page.
    const s = projectCustomerListContracts(d, ["parent"], today).parent;
    expect(s.branchCount).toBe(2);
    expect(s.current.map((t: any) => t.termId)).toEqual(["parent-t", "snow-t", "land-t"]);
    expect(s.season).toEqual({ annualCents: 30000, hasSnowTm: true, hasTerm: true });
    // Exact CP3 parent rollup rule: parent terms + each child's own terms, dedup identity.
    const project = customerContractProjector(d, today);
    const cp3 = [...new Map([...project("parent")!.current, ...d.customers.filter(c => c.parentCustomerId === "parent")
      .flatMap(c => project(c.id)!.current.filter(t => !t.parentCustomerId))].map(t => [t.termId, t])).values()];
    expect(s.current).toEqual(cp3);
    const branch = projectCustomerListContracts(d, ["inherited"], today).inherited;
    expect(branch.season.annualCents).toBeNull(); // Never fabricate an allocation.
    expect(branch.season.hasTerm).toBe(true);
  });
  it("deduplicates identical term identities and never revives old/future terms", () => {
    const d = fixture(), terms = customerContractProjector(d, today)("land")!.current;
    expect(listSeason([...terms, ...terms]).annualCents).toBe(20000);
    expect(projectCustomerListContracts(d, ["land"], "2030-01-01").land.season.hasTerm).toBe(false);
    expect(projectCustomerListContracts(d, ["foreign"], today)).toEqual({});
  });
});
describe("CP4 QuickBooks state parity", () => {
  const c = { companyId: "company", parentCustomerId: "p", qboCustomerId: "linked", qboSyncState: "linked" } as any;
  it("matches card precedence and scopes parent billing", () => {
    const parent = { id: "p", companyId: "company", isParent: "true", branchBillingMode: "master" } as any;
    expect(customerListQboState(c, parent, true)).toBe("via_parent");
    expect(customerListQboState(c, { ...parent, companyId: "foreign" }, true)).toBe("collision");
    expect(customerListQboState({ ...c, qboSyncState: "error" }, undefined, false)).toBe("error");
    expect(customerListQboState({ ...c, qboSyncState: "pending_push" }, undefined, false)).toBe("waiting");
    expect(customerListQboState(c, undefined, false)).toBe("linked");
    expect(customerListQboState({ ...c, qboCustomerId: null }, undefined, false)).toBe("not_linked");
  });
});
