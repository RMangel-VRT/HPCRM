import { describe, expect, it } from "vitest";
import type { AgreementTerm, Customer, TermScopeLine } from "@workspace/db";
import type { DemandTimingProgram } from "../../../../lib/db/src/campaignGenerationContracts";
import { campaignDemand } from "./campaignDemand";
import { coverageResolver } from "./contractCoverage";
import { campaignServices } from "../shared/contractCatalog";
import type { CustomerContractInputs } from "./customerContractSummary";
const months = (entries: Record<number, number>) => Array.from({ length: 12 }, (_, i) => entries[i + 1] ?? 0);
const term = (overrides = {}) => ({ id: "t", agreementId: "a", line: "landscape", status: "signed",
  startDate: "2027-01-01", endDate: "2027-12-31", seasonLabel: "2027", ...overrides } as AgreementTerm);
const line = (overrides = {}) => ({ termId: "t", serviceKey: "chemical", included: true, quantity: 3,
  monthSpread: null, ...overrides } as TermScopeLine);
const program = (overrides = {}) => ({ serviceKey: "chemical", rounds: 3, monthSpread: months({ 3: 1, 6: 1, 9: 1 }),
  isStandard: false, ...overrides } as DemandTimingProgram);
function inputs(overrides: Partial<CustomerContractInputs & { programs: DemandTimingProgram[] }> = {}) {
  return { customers: [{ id: "p", name: "Property", parentCustomerId: null, isParent: "false" } as Customer],
    agreements: [{ id: "a", customerId: "p" }] as CustomerContractInputs["agreements"],
    terms: [term()], scope: [line()], programs: [program()], ...overrides };
}
const demand = (overrides = {}) => campaignDemand(inputs(overrides), 2027, "2026-11-10");
describe("contract-driven campaign demand", () => {
  it("uses exact-count program timing only when contract months are unstated", () => {
    expect(demand().rounds.map(r => r.roundMonth)).toEqual(["2027-03-01", "2027-06-01", "2027-09-01"]);
    const report = demand({ scope: [line({ monthSpread: months({ 4: 1, 7: 2 }) })] });
    expect(report.rounds.map(r => [r.roundMonth, r.roundSeq])).toEqual([["2027-04-01", 1], ["2027-07-01", 1], ["2027-07-01", 2]]);
    expect(report.rounds[0].members[0]).toMatchObject({ timing: "contract", count: "contract" });
  });
  it("all-zero months are unstated; no timing gap is emitted once, not monthly", () => {
    expect(demand({ scope: [line({ monthSpread: months({}) })] }).rounds).toHaveLength(3);
    expect(demand({ programs: [] }).gaps).toMatchObject([{ kind: "no_timing", count: 3 }]);
    expect(demand({ programs: [] }).rounds).toEqual([]);
  });
  it("NULL count requires an explicit standard, never catalog defaults or inferred month totals", () => {
    expect(demand({ scope: [line({ quantity: null })] }).gaps).toMatchObject([{ kind: "no_count" }]);
    expect(demand({ scope: [line({ quantity: null, monthSpread: months({ 5: 1 }) })] }).rounds).toEqual([]);
    const r = demand({ scope: [line({ quantity: null })], programs: [program({ isStandard: true })] });
    expect(r.rounds).toHaveLength(3);
    expect(r.rounds[0].members[0]).toMatchObject({ timing: "program", count: "standard" });
  });
  it("stated count beats a different standard and requires its own timing", () => {
    const r = demand({ programs: [program({ rounds: 2, isStandard: true, monthSpread: months({ 4: 1, 10: 1 }) })] });
    expect(r.rounds).toEqual([]); expect(r.gaps).toMatchObject([{ kind: "no_timing", count: 3 }]);
  });
  it("zero means no demand even with standard or stated positive months", () => {
    const r = demand({ scope: [line({ quantity: 0, monthSpread: months({ 4: 1 }) })], programs: [program({ isStandard: true })] });
    expect(r).toEqual({ rounds: [], gaps: [] });
  });
  it.each([-1, 1.5, 25])("reports invalid count %s without rounds", quantity => {
    const r = demand({ scope: [line({ quantity })] });
    expect(r.rounds).toEqual([]); expect(r.gaps).toMatchObject([{ kind: "invalid_count" }]);
  });
  it("reports duplicate lines once and never sums or arbitrarily chooses them", () => {
    const r = demand({ scope: [line(), line({ included: false })] });
    expect(r.rounds).toEqual([]); expect(r.gaps).toMatchObject([{ kind: "duplicate_lines" }]);
  });
  it("preserves contract months and reports mismatched totals, without redistribution", () => {
    const r = demand({ scope: [line({ monthSpread: months({ 4: 2 }) })] });
    expect(r.rounds).toHaveLength(2);
    expect(r.gaps).toMatchObject([{ kind: "count_mismatch", count: 3, monthTotal: 2 }]);
    expect(demand({ scope: [line({ monthSpread: [-1] })] }).gaps).toMatchObject([{ kind: "invalid_count" }]);
  });
  it("clips each month to term boundaries and handles split seasons", () => {
    const r = demand({ terms: [term({ endDate: "2027-10-31" }), term({ id: "next", startDate: "2027-11-01" })],
      scope: [line({ monthSpread: months({ 10: 1, 11: 1, 12: 1 }) }), line({ termId: "next", monthSpread: months({ 10: 1, 11: 1, 12: 1 }) })] });
    expect(r.rounds.map(r => r.members[0].termId)).toEqual(["t", "next", "next"]);
  });
  it("includes renewal in the firm tier before sent, then compares newest start within each tier", () => {
    const terms = [term({ status: "sent", startDate: "2027-02-01", id: "sent" }),
      term({ status: "up_for_renewal", startDate: "2027-01-15", id: "renewal" }), term()];
    const scope = terms.map(t => line({ termId: t.id }));
    expect(demand({ terms, scope }).rounds[0].members[0].termId).toBe("renewal");
    expect(demand({ terms: [terms[0], terms[2]], scope }).rounds[0].members[0].termId).toBe("t");
    expect(demand({ terms: terms.slice(0, 2), scope }).rounds[0].members[0].termId).toBe("renewal");
    expect(demand({ terms: terms.slice(0, 1), scope }).rounds[0].members[0].termStatus).toBe("sent");
  });
  it.each(["draft", "lost", "cancelled"])("excludes %s terms", status => {
    expect(demand({ terms: [term({ status })] }).rounds).toEqual([]);
  });
  it("inherits only immediate parent and never gives parents items or revives excluded own scope", () => {
    const customers = [{ id: "parent", name: "Parent", parentCustomerId: null, isParent: "true" },
      { id: "p", name: "Branch", parentCustomerId: "parent", isParent: "false" }] as Customer[];
    const inherited = inputs({ customers, agreements: [{ id: "a", customerId: "parent" }] as CustomerContractInputs["agreements"] });
    expect(campaignDemand(inherited, 2027, "2026-11-10").rounds[0].members.map(m => m.propertyId)).toEqual(["p"]);
    inherited.agreements.push({ id: "own", customerId: "p" } as typeof inherited.agreements[number]);
    inherited.terms.push(term({ id: "own", agreementId: "own", status: "sent" }));
    inherited.scope!.push(line({ termId: "own", included: false }));
    expect(campaignDemand(inherited, 2027, "2026-11-10").rounds).toEqual([]);
  });
  it("never produces route, on-request or event rounds", () => {
    expect(demand({ scope: ["mowing", "fall_aeration", "crabgrass", "snow_walks"].map(serviceKey =>
      line({ serviceKey, monthSpread: months({ 3: 3 }) })) }).rounds).toEqual([]);
    expect(campaignServices()).toHaveLength(10);
  });
  it("retains the Routes default signature, status set and own-property precedence", () => {
    const d = inputs({ terms: [term({ status: "sent" })], scope: [line({ monthSpread: months({ 4: 3 }) })] });
    const old = coverageResolver({ ...d, scopes: d.scope! });
    expect(old("p", "chemical", 2027)).toBeNull();
    d.terms = [term()]; const signed = coverageResolver({ ...d, scopes: d.scope! });
    expect(signed("p", "chemical", 2027)).toMatchObject({ months: [4], window: { start: "2027-04-01", end: "2027-04-30" } });
  });
});
