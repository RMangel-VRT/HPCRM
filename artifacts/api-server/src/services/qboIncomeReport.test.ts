import { describe, expect, it } from "vitest";
import { incomeData, incomeReport, incomeSection } from "../test/qboIncomeFixture";
import { parseQboIncomeReport } from "./qboIncomeReport";

describe("QuickBooks P&L income parser", () => {
  it("reads account headers and nested data by metadata, ignoring totals and other sections", () => {
    const parent = incomeData("1", "Maintenance", "20.123", " ");
    const child = incomeData("2", "Total Care", "-10.51", "30.24");
    const blank = incomeData("3", "Blank", "", "");
    const subtotal = incomeData("1", "Total Maintenance", "99999", "99999");
    const report = incomeReport(2025, [
      incomeSection([{ type: "Section", Header: { ColData: parent.ColData },
        Rows: { Row: [{ type: "Section", Header: { ColData: blank.ColData }, Rows: { Row: [
          child, { ...subtotal, type: "Summary" }, { ...subtotal, type: "Total" },
        ] } }] }, Summary: { ColData: subtotal.ColData } }]),
      ...["OtherIncome", "COGS", "Expenses"].map(group => ({
        type: "Section", group, Rows: { Row: [subtotal] },
      })),
      { type: "Section", group: "NetIncome", Summary: { ColData: subtotal.ColData } },
    ]);
    expect(parseQboIncomeReport(report, 2025)).toEqual({
      accounts: [{ qboAccountId: "1", accountName: "Maintenance" }, { qboAccountId: "2", accountName: "Total Care" }],
      months: [
        { qboAccountId: "1", month: "2025-01-01", amountCents: 2012 },
        { qboAccountId: "1", month: "2025-02-01", amountCents: 0 },
        { qboAccountId: "2", month: "2025-01-01", amountCents: -1051 },
        { qboAccountId: "2", month: "2025-02-01", amountCents: 3024 },
      ],
    });
  });

  it("combines fragments for one account/month and keeps zero-valued Data accounts", () => {
    const report = incomeReport(2025, [incomeSection([
      incomeData("1", "Income", "1.50"), incomeData("1", "Income", "-1.50"), incomeData("2", "No activity", ""),
    ])]);
    const parsed = parseQboIncomeReport(report, 2025);
    expect(parsed.accounts).toHaveLength(2);
    expect(parsed.months.map(row => row.amountCents)).toEqual([0, 0, 0, 0]);
  });

  it("accepts genuine empty envelopes and reports without an Income section", () => {
    const empty = incomeReport(2025, []);
    for (const report of [
      empty,
      { ...empty, Rows: {} },
      { ...empty, Header: { ...empty.Header, Option: [{ Name: "NoReportData", Value: "true" }] },
        Columns: { Column: [empty.Columns.Column[0], empty.Columns.Column[2]] }, Rows: {} },
      incomeReport(2025, [incomeSection([])]),
      incomeReport(2025, [{ type: "Section", group: "Expenses", Rows: {} }]),
    ]) expect(parseQboIncomeReport(report, 2025)).toEqual({ accounts: [], months: [] });
  });

  const invalidRow = (row: unknown) => incomeReport(2025, [incomeSection([row])]);
  const valid = incomeReport(2025, []);
  it.each([
    ["missing envelope", {}],
    ["provider fault", { ...valid, Fault: {} }],
    ["no month metadata", { ...valid, Columns: { Column: [{ ColType: "Account" }, { ColType: "Money" }] } }],
    ["total-only without no-data flag", { ...valid, Columns: { Column: [valid.Columns.Column[0], valid.Columns.Column[2]] } }],
    ["duplicate months", { ...valid, Columns: { Column: [...valid.Columns.Column, valid.Columns.Column[1]] } }],
    ["wrong year", incomeReport(2024, [])],
    ["cash report", { ...valid, Header: { ...valid.Header, ReportBasis: "Cash" } }],
    ["missing root rows", { ...valid, Rows: null }],
    ["wrong nested rows", incomeReport(2025, [{ ...incomeSection([]), Rows: { Row: {} } }])],
    ["broken Income section", incomeReport(2025, [{ type: "Section", group: "Income" }])],
    ["unknown row type", invalidRow({})],
    ["missing account ID", invalidRow(incomeData("", "Income", "10"))],
    ["truncated row", invalidRow({ type: "Data", ColData: [{ id: "1", value: "Income" }, { value: "10" }] })],
    ["nonnumeric cell", invalidRow(incomeData("1", "Income", "1,2x"))],
    ["overflow", invalidRow(incomeData("1", "Income", "9999999999999999"))],
  ])("rejects %s instead of returning an empty or partial mirror", (_name, input) => {
    expect(() => parseQboIncomeReport(input, 2025)).toThrow("Invalid QuickBooks Profit and Loss report");
  });
});
