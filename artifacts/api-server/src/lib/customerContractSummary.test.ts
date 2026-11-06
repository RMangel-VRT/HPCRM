import { describe, expect, it } from "vitest";
import { customerContractProjector, projectContractSummary, type CustomerContractInputs } from "./customerContractSummary";
import { contractQuestionCandidates, NO_TERM_NOTE } from "./contractQuestionFlags";
import { expandPayments, paymentSummary, recoverPayments } from "./contractCenterService";
import { hasSnowCoverageWrite } from "./snowCoverageInput";

const today = "2026-11-05";
const term = (id: string, agreementId: string, overrides = {}) => ({
  id, agreementId, companyId: "company", seasonLabel: "2026–27", line: "both", form: "ours", status: "signed",
  startDate: "2026-10-01", endDate: "2027-09-30", renewedFromTermId: null,
  snowPricing: "flat_rate", snowTriggers: "2 inches", ...overrides,
});
const payments = [{ component: "Contract", months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amountCents: 112800 })) }];
function fixture(): CustomerContractInputs {
  return {
    customers: [
      { id: "ute", companyId: "company", status: "active", active: "true", parentCustomerId: null },
      { id: "branch", companyId: "company", status: "active", active: "true", parentCustomerId: "ute" },
      { id: "none", companyId: "company", status: "active", active: "true", parentCustomerId: null },
    ] as any,
    agreements: [{ id: "a", customerId: "ute", companyId: "company" }] as any,
    terms: [term("current", "a"), term("previous", "a", { startDate: "2025-10-01", endDate: "2026-09-30", status: "renewed" }),
      term("next", "a", { startDate: "2027-10-01", endDate: "2028-09-30" })] as any,
    billingMonths: expandPayments(payments, "2026-10-01", "2027-09-30").map(p => ({ ...p, termId: "current", companyId: "company" })) as any,
    rates: [{ termId: "current", rateKey: "labor", label: "Negotiated labor", unit: "per hour", priceCents: 6500, sortOrder: 1 }] as any,
  };
}
describe("customer Contract Center projection", () => {
  it("projects the Contract Center renewal rule, including suppression for a signed successor or non-renewal", () => {
    const data = fixture();
    data.terms = [term("ending", "a", { endDate: "2027-01-04" })] as any;
    expect(customerContractProjector(data, today)("ute")!.current[0].renewalDue).toBe(true);
    data.terms.push(term("successor", "a", { startDate: "2027-01-05", endDate: "2028-01-04", renewedFromTermId: "ending" }) as any);
    expect(customerContractProjector(data, today)("ute")!.current[0].renewalDue).toBe(false);
    data.terms = [term("ending", "a", { endDate: "2027-01-04", nonRenewalOn: "2026-11-04" })] as any;
    expect(customerContractProjector(data, today)("ute")!.current[0].renewalDue).toBe(false);
  });
  it("Ute Creek parity: both coverage, 13,536 annual, twelve 1,128 payments and negotiated snapshot", () => {
    const data = fixture(), summary = customerContractProjector(data, today)("ute")!;
    expect(summary.coverage).toEqual({ landscape: true, snow: true });
    expect(summary.current).toHaveLength(1);
    expect(summary.current[0].annualCents).toBe(1353600);
    expect(summary.current[0].annualCents).toBe(paymentSummary(recoverPayments(data.billingMonths!), "both", "flat_rate").annualPriceCents);
    expect(summary.current[0].billingMonths).toHaveLength(12);
    expect(summary.current[0].billingMonths.every(p => p.amountCents === 112800)).toBe(true);
    expect(summary.current[0].rates[0]).toMatchObject({ label: "Negotiated labor", priceCents: 6500 });
    expect(summary.upcoming[0].termId).toBe("next");
    expect(summary.previous[0].termId).toBe("previous");
  });
  it("retains concurrent agreements, including unpriced T&M", () => {
    const data = fixture();
    data.terms[0].line = "landscape"; data.terms[0].snowPricing = null;
    data.agreements.push({ id: "snow", companyId: "company", customerId: "ute" } as any);
    data.terms.push(term("snow-current", "snow", { line: "snow", snowPricing: "time_and_materials" }) as any);
    const summary = customerContractProjector(data, today)("ute")!;
    expect(summary.current).toHaveLength(2); expect(summary.coverage).toEqual({ landscape: true, snow: true });
    expect(summary.current[1].annualCents).toBeNull();
  });
  it("inherits direct parent with provenance, but an effective own agreement governs", () => {
    const data = fixture();
    expect(customerContractProjector(data, today)("branch")?.parentCustomerId).toBe("ute");
    data.agreements.push({ id: "branch-agreement", customerId: "branch" } as any);
    data.terms.push(term("branch-term", "branch-agreement", { line: "landscape", snowPricing: null }) as any);
    const branch = customerContractProjector(data, today)("branch")!;
    expect(branch.current.map(t => t.termId)).toEqual(["branch-term"]);
    expect(branch.coverage.snow).toBe(false); expect(branch.parentCustomerId).toBeNull();
  });
  it.each(["draft", "sent", "cancelled", "lost"])("never grants %s display fallback coverage", status => {
    const data = fixture(); data.terms = [term("t", "a", { status })] as any;
    const s = customerContractProjector(data, today)("ute")!;
    expect(s.current).toEqual([]); expect(s.coverage).toEqual({ landscape: false, snow: false });
  });
  it("inclusive Colorado date bounds; no historical or future fallback", () => {
    const data = fixture(); data.terms = [data.terms[0]];
    expect(customerContractProjector(data, "2026-09-30")("ute")?.current).toEqual([]);
    expect(customerContractProjector(data, "2026-10-01")("ute")?.current).toHaveLength(1);
    expect(customerContractProjector(data, "2027-09-30")("ute")?.current).toHaveLength(1);
    expect(customerContractProjector(data, "2027-10-01")("ute")?.current).toEqual([]);
  });
  it("field projection has no identity, history, future or nested commercial leakage", () => {
    const s = customerContractProjector(fixture(), today)("branch")!;
    const result = projectContractSummary(s, false);
    expect(Object.keys(result).sort()).toEqual(["asOf", "coverage", "current"]);
    expect(Object.keys(result.current[0]).sort()).toEqual(["endDate", "label", "line", "startDate"]);
    expect(JSON.stringify(result)).not.toMatch(/annualCents|billingMonths|rates|agreementId|parentCustomerId|snowTriggers/);
  });
  it("rejects foreign parent and unowned agreements even with corrupt inputs", () => {
    const data = fixture(); data.customers = [data.customers[1]];
    expect(customerContractProjector(data, today)("branch")?.coverage.snow).toBe(false);
    expect(customerContractProjector(data, today)("ute")).toBeNull();
  });
});
describe("contract-question rules", () => {
  it("flags active missing terms only, never a branch covered by its parent", () => {
    const d = fixture(); const candidates = contractQuestionCandidates(d, today);
    expect([...candidates.keys()]).toEqual(["no-term:none"]);
    expect(candidates.get("no-term:none")?.note).toBe(NO_TERM_NOTE);
    d.customers[2].status = "prospect";
    expect(contractQuestionCandidates(d, today).size).toBe(0);
    d.customers[2].status = "inactive";
    expect(contractQuestionCandidates(d, today).size).toBe(0);
  });
  it("future signed blank-trigger snow flags qualify, landscape and closed terms do not", () => {
    const d = fixture(); d.terms[2].snowTriggers = "   "; d.terms[0].snowTriggers = "";
    expect([...contractQuestionCandidates(d, today).keys()]).toEqual(["snow-triggers:current", "snow-triggers:next", "no-term:none"]);
    d.terms[0].line = "landscape"; d.terms[2].status = "cancelled";
    expect([...contractQuestionCandidates(d, today).keys()]).toEqual(["no-term:none"]);
  });
});
describe("snow switch freeze", () => {
  it.each([true, false, null, "", 0])("provided %s is rejected, including nested wizard input", value => {
    expect(hasSnowCoverageWrite({ snowEnabled: value })).toBe(true);
    expect(hasSnowCoverageWrite({ customer: { snowEnabled: value } })).toBe(true);
  });
  it("omission is not a write", () => expect(hasSnowCoverageWrite({ customer: { name: "Changed" } })).toBe(false));
});
