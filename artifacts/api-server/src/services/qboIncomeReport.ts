type JsonObject = Record<string, unknown>;
type MonthColumn = { index: number; month: string };
type IncomeMonth = { qboAccountId: string; month: string; amountCents: number };
const nonIncomeGroups = new Set(["OtherIncome", "COGS", "Expenses", "OtherExpenses", "GrossProfit", "NetOperatingIncome", "NetIncome"]);

function invalid(reason: string): never {
  throw new Error(`Invalid QuickBooks Profit and Loss report: ${reason}`);
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(label);
  return value as JsonObject;
}

function rows(value: unknown): unknown[] {
  const container = object(value, "missing Rows");
  // QuickBooks can return Rows: {} rather than Rows: { Row: [] } for no activity.
  if (Object.keys(container).length === 0) return [];
  if (!Array.isArray(container.Row)) invalid("invalid Rows.Row");
  return container.Row;
}

function monthColumns(value: unknown, year: number): MonthColumn[] {
  const { Column } = object(value, "missing Columns");
  if (!Array.isArray(Column) || Column.length === 0) invalid("missing report columns");
  const account = object(Column[0], "invalid account column");
  if (account.ColType !== undefined && account.ColType !== "Account") invalid("first column is not an account");

  const months = new Map<string, number>();
  for (let index = 1; index < Column.length; index++) {
    const column = object(Column[index], "invalid column");
    // The Total column can also have StartDate/EndDate for the full report.
    if (String(column.ColTitle).trim().toLowerCase() === "total" || column.ColType === "Total") continue;
    if (!Array.isArray(column.MetaData)) invalid("missing month metadata");
    const metadata = column.MetaData.map(entry => object(entry, "invalid column metadata"));
    if (metadata.some(entry => entry.Name === "ColKey" && entry.Value === "total")) continue;
    const dates = metadata.filter(entry => entry.Name === "StartDate");
    const month = dates[0]?.Value;
    if (dates.length !== 1 || typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month)
      || !month.startsWith(`${year}-`) || months.has(month)) invalid("invalid or duplicate month");
    months.set(month, index);
  }
  return [...months].map(([month, index]) => ({ month, index }));
}

function int32(value: number): number {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) invalid("amount is outside the integer cents range");
  return value === 0 ? 0 : value;
}

function cents(value: string): number {
  if (!value) return 0;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) invalid("invalid month amount");
  return int32(Math.round(Number(value) * 100));
}

export function parseQboIncomeReport(payload: unknown, year: number) {
  const report = object(payload, "expected a report object");
  if ("Fault" in report) invalid("provider returned a fault");
  const header = report.Header === undefined ? {} : object(report.Header, "invalid report header");
  if ((header.ReportName !== undefined && header.ReportName !== "ProfitAndLoss")
    || (header.ReportBasis !== undefined && header.ReportBasis !== "Accrual")
    || (header.StartPeriod !== undefined && header.StartPeriod !== `${year}-01-01`)
    || (header.EndPeriod !== undefined && header.EndPeriod !== `${year}-12-31`)) invalid("unexpected report or period");

  const columns = monthColumns(report.Columns, year);
  const root = rows(report.Rows);
  const accounts = new Map<string, { accountName: string; amounts: Map<string, number> }>();

  function record(value: unknown, headerOnly: boolean) {
    if (!Array.isArray(value)) invalid("missing account cells");
    const label = object(value[0], "missing account label");
    // Structural section headers have no QuickBooks account ID.
    if (headerOnly && (label.id === undefined || label.id === "")) return;
    const amounts = columns.map(({ index, month }) => {
      const cell = object(value[index], "missing month cell");
      if (cell.value !== null && typeof cell.value !== "string" && typeof cell.value !== "number") invalid("invalid month cell");
      return { month, value: String(cell.value ?? "").trim() };
    });
    if (headerOnly && amounts.every(cell => cell.value === "")) return;
    if (typeof label.id !== "string" || !label.id || label.id !== label.id.trim() || label.id.length > 200 || label.id.includes("\0")
      || typeof label.value !== "string" || !label.value.trim() || label.value.includes("\0")) {
      invalid("missing account ID or name");
    }
    const account = accounts.get(label.id) ?? { accountName: label.value, amounts: new Map<string, number>() };
    accounts.set(label.id, account);
    for (const { month, value } of amounts) {
      account.amounts.set(month, (account.amounts.get(month) ?? 0) + cents(value));
    }
  }

  function walk(entries: unknown[], insideIncome: boolean) {
    for (const entry of entries) {
      const row = object(entry, "invalid report row");
      if (row.type === "Summary" || row.type === "Total") continue;
      if (row.type === "Data" && insideIncome) {
        record(row.ColData, false);
        continue;
      }
      if (row.type !== "Section") invalid("unexpected row type");
      if (row.group !== undefined && typeof row.group !== "string") invalid("invalid section group");
      if (row.group && row.group !== "Income" && (!insideIncome || nonIncomeGroups.has(row.group))) continue;
      const inIncome = insideIncome || row.group === "Income";
      if (inIncome && row.group !== "Income" && row.Header !== undefined) {
        record(object(row.Header, "invalid section header").ColData, true);
      }
      if (row.Rows !== undefined) walk(rows(row.Rows), inIncome);
      else if (!row.Header && !row.Summary) invalid("section has no rows or header");
    }
  }

  if (columns.length === 0) {
    // A no-data report can contain just the Account and Total columns. Do not
    // treat a total-only response as empty without the provider's explicit flag.
    const noReportData = Array.isArray(header.Option) && header.Option.some(
      option => option?.Name === "NoReportData" && (option.Value === "true" || option.Value === true),
    );
    if (root.length !== 0 || !noReportData) invalid("no month columns");
  }
  walk(root, false);
  const months: IncomeMonth[] = [];
  for (const [qboAccountId, { amounts }] of accounts) {
    for (const [month, amount] of amounts) months.push({ qboAccountId, month, amountCents: int32(amount) });
  }
  return {
    accounts: [...accounts].map(([qboAccountId, { accountName }]) => ({ qboAccountId, accountName })),
    months,
  };
}
