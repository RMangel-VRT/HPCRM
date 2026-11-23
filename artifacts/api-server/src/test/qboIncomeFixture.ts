export const incomeData = (id: string, name: string, jan: string, feb = "") => ({
  type: "Data",
  // The Total column deliberately sits between months and also carries StartDate.
  ColData: [{ id, value: name }, { value: jan }, { value: "not an amount" }, { value: feb }],
});

export const incomeSection = (children: unknown[]) => ({ type: "Section", group: "Income", Rows: { Row: children } });

export function incomeReport(year: number, children: unknown[]) {
  const column = (month: string, ColTitle: string) => ({
    ColTitle, ColType: "Money",
    MetaData: [{ Name: "StartDate", Value: `${year}-${month}-01` }],
  });
  return {
    Header: { ReportName: "ProfitAndLoss", ReportBasis: "Accrual", StartPeriod: `${year}-01-01`, EndPeriod: `${year}-12-31` },
    Columns: { Column: [{ ColTitle: "", ColType: "Account" }, column("01", "January"), column("01", "Total"), column("02", "February")] },
    Rows: { Row: children },
  };
}
