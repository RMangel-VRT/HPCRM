import { describe, expect, it } from "vitest";
import { aggregateTerms, calendarAge, customerInitials, evaluateAttention, serviceDashboardRows } from "./dashboardModel";
import type { ContractSummaryTerm } from "@/hooks/useCustomerContractSummary";
import type { ServiceFulfillment } from "@workspace/api-client-react";
import { serviceRowFixture } from "@/lib/contractCustomerServices.fixtures";

const term = (over: Partial<ContractSummaryTerm> = {}): ContractSummaryTerm => ({
  agreementId: "a", termId: "t", label: "2026–27", line: "both", annualCents: 1353600,
  startDate: "2026-11-01", endDate: "2027-10-31", ...over,
});
const service = (id: string, status: string, over: Partial<ServiceFulfillment> = {}): ServiceFulfillment =>
  serviceRowFixture({ serviceKey: id, status, issues: [], ...over });
describe("CP3 identity and commercial projection", () => {
  it("excludes billed fees from both annual and monthly contract values", () => {
    expect(aggregateTerms([term({ annualCents: 2224800, billingMonths: [
      { month: "2026-11", component: "Grounds", amountCents: 185400 },
      { month: "2026-11", component: "Mobilization", amountCents: 3995, isFee: true },
    ] })])).toMatchObject({ annualCents: 2224800, monthlyCents: 185400 });
  });
  it.each([["18 at Ute Creek", "UC"], ["The Village of Pine", "VP"], ["1st Bank", "1B"], ["18 at the", ""], ["Álamo and Cedar", "ÁC"]])(
    "%s → %s", (name, expected) => expect(customerInitials(name)).toBe(expected));
  it("keeps Ute Creek's authoritative fixture and both lines", () => {
    expect(aggregateTerms([term()])).toMatchObject({ annualCents: 1353600, labels: ["2026–27"], lines: ["landscape", "snow"] });
  });
  it("combines separate priced terms, labels, lines and uniform monthly schedules without duplicates", () => {
    const landscape = term({ line: "landscape", annualCents: 100000, billingMonths: [{ month: "2026-11", component: null, amountCents: 10000 }] });
    const snow = term({ agreementId: "b", termId: "s", line: "snow", label: "Winter 2026", annualCents: 353600,
      billingMonths: [{ month: "2026-11", component: null, amountCents: 20000 }] });
    expect(aggregateTerms([landscape, snow, snow])).toMatchObject({
      annualCents: 453600, labels: ["2026–27", "Winter 2026"], lines: ["landscape", "snow"], monthlyCents: 30000,
    });
  });
  it("does not convert T&M, unknown or inherited revenue to zero/branch revenue", () => {
    const snow = term({ termId: "s", line: "snow", annualCents: null, snowPricing: "time_and_materials" });
    expect(aggregateTerms([term({ line: "landscape" }), snow])).toMatchObject({ annualCents: 1353600, hasSnowTm: true });
    expect(aggregateTerms([snow]).annualCents).toBeNull();
    expect(aggregateTerms([term({ annualCents: null })])).toMatchObject({ annualCents: null, hasUnpriced: true, monthlyCents: null });
    expect(aggregateTerms([term({ parentCustomerId: "parent" })])).toMatchObject({ annualCents: null, hasInherited: true });
    expect(aggregateTerms([{ ...snow, parentCustomerId: "parent" }])).toMatchObject({
      annualCents: null, hasInherited: true, hasSnowTm: true,
    });
  });
  it("does not fabricate a monthly number for unequal schedules", () => {
    expect(aggregateTerms([term({ billingMonths: [
      { month: "2026-11", component: null, amountCents: 100 }, { month: "2026-12", component: null, amountCents: 200 },
    ] })]).monthlyCents).toBeNull();
  });
});

describe("CP3 deterministic attention rules", () => {
  const base = { customerId: "ute", today: "2026-11-05" };
  it("returns an empty strip for no issues", () => expect(evaluateAttention(base)).toEqual([]));
  it("links every regular issue to its precise fix", () => {
    const result = evaluateAttention({ ...base, services: [service("overdue", "overdue")],
      tickets: [{ createdAt: "2026-10-05", currentStatusId: "open" }], proposals: [{ status: "draft" }],
      snowFlagCount: 1, managerName: "Resolved AM", missingSetupCount: 3, qboAttention: true,
      terms: [{ ...term({ endDate: "2027-01-04" }), renewalDue: true }],
    });
    expect(result.map(i => [i.key, i.tab ?? i.href])).toEqual([
      ["overdue", "services"], ["snow", "snow"], ["oldTickets", "tickets"], ["drafts", "proposals"],
      ["setup", "/dashboard/customers/ute/edit"], ["qbo", "billing"], ["ending", "contracts"],
    ]);
    expect(result.find(i => i.key === "snow")?.values.manager).toBe("Resolved AM");
    expect(result.find(i => i.key === "ending")?.values.days).toBe(60);
  });
  it("uses >30 calendar days, company final status, draft-only and an open snow flag", () => {
    expect(evaluateAttention({ ...base, tickets: [
      { createdAt: "2026-10-06" }, // exactly 30
      { createdAt: "2026-10-05", currentStatusId: "closed" },
      { createdAt: null },
    ], statuses: [{ id: "closed", isFinal: "true" }], proposals: [{ status: "sent" }], snowFlagCount: 0 })).toEqual([]);
  });
  it.each([[-1, false], [0, true], [60, true], [61, false]])("ending day %s visible=%s", (days, visible) => {
    const end = new Date(Date.UTC(2026, 10, 5 + days)).toISOString().slice(0, 10);
    expect(evaluateAttention({ ...base, terms: [{ ...term({ endDate: end }), renewalDue: true }] }).length > 0).toBe(visible);
  });
  it("honors owner renewal policy rather than reflagging renewed/nonrenewing terms", () => {
    expect(evaluateAttention({ ...base, terms: [{ ...term({ endDate: "2026-11-05" }), renewalDue: false }] })).toEqual([]);
  });
  it("parent rules exclude regular issues and link aggregate problems", () => {
    expect(evaluateAttention({ ...base, isParent: true, branchOpenTickets: 2, uncoveredBranches: 3,
      missingSetupCount: 10, services: [service("s", "overdue")], qboAttention: true }).map(i => [i.key, i.tab])).toEqual([
      ["branchTickets", "tickets"], ["uncovered", "branches"], ["qbo", "billing"],
    ]);
  });
});

describe("CP3 Colorado day and observed services", () => {
  it("uses Colorado's day on UTC evenings and across DST", () => {
    expect(calendarAge("2026-11-06T01:00:00Z", "2026-11-05")).toBe(0);
    expect(calendarAge("2026-11-01T06:00:00Z", "2026-11-02")).toBe(1);
    expect(calendarAge("2026-10-31", "2026-11-02")).toBe(2);
    expect(calendarAge("invalid")).toBeNull();
    expect(calendarAge("2026-02-30")).toBeNull();
  });
  it("preserves endpoint order and sums supplied known values only", () => {
    const result = serviceDashboardRows([
      service("track", "on_track", { owed: 10, done: 4 }), service("late", "overdue", { owed: 3, done: 1 }),
      service("setup", "no_count", { owed: null, done: 15 }), service("skip", "closed_with_skips", { owed: 2, done: 0, skipped: 2 }),
    ]);
    expect(result.rows.map(s => s.serviceKey)).toEqual(["track", "late", "setup", "skip"]);
    expect(result).toMatchObject({ done: 5, owed: 15, unknownCount: 1, overdue: 1, setup: 1 });
  });
});
