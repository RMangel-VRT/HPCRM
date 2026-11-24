import { describe, expect, it } from "vitest";
import {
  billingMonth, byCustomer, filterRevenueLine, monthlyTotals, summarizeBillingMonth, type ContractRevenueRow,
} from "./contractRevenue";

const parentTerm = {
  customerId: "parent", customerName: "Parent HOA", agreementId: "parent-agreement",
  termId: "old", seasonLabel: "2025–26", line: "both", form: "ours",
  startDate: "2025-10-01", endDate: "2026-09-30", notRenewing: false,
  stream: "contract", component: "Maintenance", isFee: false,
  month: "2026-01-01", amountCents: 12345,
} satisfies ContractRevenueRow;

describe("contract revenue projections", () => {
  it("combines exact cross-year prices and marks renewals only on the same agreement", () => {
    const renewed = {
      ...parentTerm, termId: "renewal", seasonLabel: "2026–27",
      startDate: "2026-10-01", endDate: "2027-09-30", amountCents: 15679,
    };
    const rows = [
      ...Array.from({ length: 12 }, (_, index) => ({
        ...index < 9 ? parentTerm : renewed, month: billingMonth(2026, index + 1),
      })),
      { ...parentTerm, month: "2025-12-01" },
      { ...renewed, month: "2027-01-01" },
    ];
    const months = [...Array(9).fill(12345), ...Array(3).fill(15679)];
    expect(monthlyTotals(rows, 2026)).toEqual(months);
    expect(byCustomer(rows, 2026)).toEqual([{
      customerId: "parent", customerName: "Parent HOA", agreementId: "parent-agreement",
      months, totalCents: 158142, seasonStarts: [{ month: "2026-10-01", seasonLabel: "2026–27" }],
      breakdown: { contract: months, snow: Array(12).fill(0), fee: Array(12).fill(0) },
    }]);

    const different = { ...renewed, agreementId: "different", month: "2026-10-01" };
    expect(byCustomer([rows[0], different], 2026).every(row => !row.seasonStarts.length)).toBe(true);
  });

  it("uses season history outside the filtered payments and omits zero-year agreements", () => {
    const renewal = { ...parentTerm, termId: "renewal", startDate: "2026-10-12", seasonLabel: "New",
      month: "2026-10-01", isFee: true, amountCents: 511 };
    const zero = { ...parentTerm, agreementId: "zero", termId: "zero", amountCents: 0 };
    expect(byCustomer(filterRevenueLine([renewal, zero], "fee"), 2026, [renewal, parentTerm, parentTerm])).toEqual([{
      customerId: "parent", customerName: "Parent HOA", agreementId: "parent-agreement",
      months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 511, 0, 0], totalCents: 511,
      seasonStarts: [{ month: "2026-10-01", seasonLabel: "New" }],
      breakdown: { contract: Array(12).fill(0), snow: Array(12).fill(0), fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 511, 0, 0] },
    }]);
    expect(byCustomer([zero], 2026)).toEqual([]);
  });

  it("counts fees in their own stream and prints them separately under the actual agreement owner", () => {
    const snow: ContractRevenueRow = { ...parentTerm, agreementId: "branch-snow", customerId: "branch",
      customerName: "Branch", termId: "snow", line: "snow", stream: "snow", amountCents: 9000,
      component: "Snow", notRenewing: true };
    const snowFee = { ...snow, component: "Snow fee", isFee: true, amountCents: 501 };
    const fee = { ...parentTerm, component: "Equipment fee", isFee: true, amountCents: 1001 };
    const rows = [snow, fee, parentTerm, snowFee];
    const billed = summarizeBillingMonth(rows);
    expect(billed.totals).toEqual({ amountCents: 22847, contractCents: 13346, snowCents: 9501, feeCents: 1502,
      landscapeCents: 12345, flatSnowCents: 9000 });
    expect(billed.customers.map(x => [x.customerId, x.amountCents, x.notRenewing])).toEqual([
      ["parent", 13346, false], ["branch", 9501, true],
    ]);
    expect(billed.customers[0].lines).toEqual([
      { component: "Equipment fee", isFee: true, amountCents: 1001 },
      { component: "Maintenance", isFee: false, amountCents: 12345 },
    ]);
    expect(filterRevenueLine(rows, "contract")).toEqual([parentTerm]);
    expect(filterRevenueLine(rows, "snow")).toEqual([snow]);
    expect(filterRevenueLine(rows, "fee")).toEqual([fee, snowFee]);
  });

  it("keeps every dated payment if two counted seasons of one agreement bill that month", () => {
    const renewal = { ...parentTerm, termId: "new", seasonLabel: "New", startDate: "2026-02-01", amountCents: 5000 };
    expect(summarizeBillingMonth([renewal, parentTerm]).customers).toMatchObject([
      { agreementId: parentTerm.agreementId, termId: "new", seasonLabel: "New", amountCents: 17345,
        lines: [{ amountCents: 5000 }, { amountCents: 12345 }] },
    ]);
  });
});
