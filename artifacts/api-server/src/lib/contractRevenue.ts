import { agreements, agreementTerms, customers, termBillingMonths } from "@workspace/db";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { Reader } from "./contractCenterPersistence";
import { compareTermPriority, IN_EFFECT_TERM_STATUSES, isNotRenewing } from "./contractCenterService";
import { billingMonth, monthOf } from "./companyDay";

export { billingMonth } from "./companyDay";

/** Payment dates own the schedule, including explicitly permitted pre-start payments. */
export async function loadContractRevenueRows(reader: Reader, companyId: string, fromMonth: string, toMonth: string,
  renewalBasis?: { includeLostFrom?: string }) {
  const window = and(gte(termBillingMonths.month, fromMonth), lte(termBillingMonths.month, toMonth));
  // Annual fallback is season-relative, not relative to the displayed years.
  // The bridge also needs the final payment month of a recorded non-renewal.
  const seasonStartMonth = sql`date_trunc('month', ${agreementTerms.startDate})::date`;
  const rows = await reader.select({
    agreementId: agreements.id,
    customerId: customers.id,
    customerName: customers.name,
    termId: agreementTerms.id,
    seasonLabel: agreementTerms.seasonLabel,
    line: agreementTerms.line,
    form: agreementTerms.form,
    startDate: agreementTerms.startDate,
    endDate: agreementTerms.endDate,
    nonRenewalOn: agreementTerms.nonRenewalOn,
    component: termBillingMonths.component,
    isFee: termBillingMonths.isFee,
    month: termBillingMonths.month,
    amountCents: termBillingMonths.amountCents,
  })
    .from(termBillingMonths)
    .innerJoin(agreementTerms, eq(termBillingMonths.termId, agreementTerms.id))
    .innerJoin(agreements, eq(agreementTerms.agreementId, agreements.id))
    .innerJoin(customers, eq(agreements.customerId, customers.id))
    .where(and(
      eq(termBillingMonths.companyId, companyId),
      eq(agreementTerms.companyId, companyId),
      eq(agreements.companyId, companyId),
      eq(customers.companyId, companyId),
      inArray(agreementTerms.status, IN_EFFECT_TERM_STATUSES),
      renewalBasis ? or(window,
        sql`${agreementTerms.annualPriceCents} is null and not ${termBillingMonths.isFee}
          and ${termBillingMonths.month} >= ${seasonStartMonth}
          and ${termBillingMonths.month} < ${seasonStartMonth} + interval '1 year'`,
        renewalBasis.includeLostFrom ? sql`${agreementTerms.nonRenewalOn} is not null
          and ${agreementTerms.endDate} >= ${renewalBasis.includeLostFrom}::date` : undefined,
      ) : window,
    ));

  return rows.map(({ nonRenewalOn, ...row }) => ({
    ...row,
    notRenewing: isNotRenewing({ nonRenewalOn }),
    stream: row.line === "snow" ? "snow" as const : "contract" as const,
  }));
}

export type ContractRevenueRow = Awaited<ReturnType<typeof loadContractRevenueRows>>[number];
type SeasonStart = Pick<ContractRevenueRow, "agreementId" | "termId" | "startDate" | "seasonLabel">;
export type RevenueLine = "all" | "contract" | "snow" | "fee";

/** For the matrix only: earlier seasons need not have a payment in the requested year. */
export async function loadContractRevenueSeasons(reader: Reader, companyId: string, agreementIds: readonly string[], year: number) {
  if (!agreementIds.length) return [];
  return reader.select({
    agreementId: agreementTerms.agreementId,
    termId: agreementTerms.id,
    startDate: agreementTerms.startDate,
    seasonLabel: agreementTerms.seasonLabel,
  }).from(agreementTerms).where(and(
    eq(agreementTerms.companyId, companyId),
    inArray(agreementTerms.agreementId, agreementIds),
    inArray(agreementTerms.status, IN_EFFECT_TERM_STATUSES),
    lte(agreementTerms.startDate, `${String(year).padStart(4, "0")}-12-31`),
  ));
}

export async function countInEffectSnowTm(reader: Reader, companyId: string, today: string) {
  return (await inEffectSnowPricing(reader, companyId, today)).snowTmCount;
}

export async function inEffectSnowPricing(reader: Reader, companyId: string, today: string) {
  const [result] = await reader.select({
    snowTmCount: sql<number>`count(*) filter (where ${agreementTerms.snowPricing} = 'time_and_materials')`.mapWith(Number),
    hasFlatSnow: sql<boolean>`coalesce(bool_or(${agreementTerms.snowPricing} = 'flat_rate'), false)`,
  })
    .from(agreementTerms)
    .innerJoin(agreements, eq(agreementTerms.agreementId, agreements.id))
    .innerJoin(customers, eq(agreements.customerId, customers.id))
    .where(and(
      eq(agreementTerms.companyId, companyId),
      eq(agreements.companyId, companyId),
      eq(customers.companyId, companyId),
      inArray(agreementTerms.status, IN_EFFECT_TERM_STATUSES),
      lte(agreementTerms.startDate, today),
      gte(agreementTerms.endDate, today),
      inArray(agreementTerms.line, ["snow", "both"]),
    ));
  return result;
}

function yearMonthIndex(month: string, year: number): number {
  return Number(month.slice(0, 4)) === year ? Number(month.slice(5, 7)) - 1 : -1;
}

export function monthlyTotals(rows: readonly ContractRevenueRow[], year: number): number[] {
  const months = Array<number>(12).fill(0);
  for (const row of rows) {
    const index = yearMonthIndex(row.month, year);
    if (index >= 0) months[index] += row.amountCents;
  }
  return months;
}

const DASHBOARD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The legacy dashboard contract is dollars; aggregate in cents before converting. */
export function dashboardRevenueMonths(rows: readonly ContractRevenueRow[], year: number) {
  return monthlyTotals(rows, year).map((cents, index) => ({ month: DASHBOARD_MONTHS[index], revenue: cents / 100 }));
}

export function filterRevenueLine(rows: readonly ContractRevenueRow[], line: RevenueLine) {
  if (line === "all") return rows;
  if (line === "fee") return rows.filter(row => row.isFee);
  return rows.filter(row => row.stream === line && !row.isFee);
}

type CustomerYear = {
  customerId: string;
  customerName: string;
  agreementId: string;
  months: number[];
  totalCents: number;
  seasonStarts: Array<{ month: string; seasonLabel: string }>;
  breakdown: Record<Exclude<RevenueLine, "all">, number[]>;
};

export function byCustomer(rows: readonly ContractRevenueRow[], year: number, seasons: readonly SeasonStart[] = rows): CustomerYear[] {
  const entries = new Map<string, CustomerYear>();
  for (const row of rows) {
    const index = yearMonthIndex(row.month, year);
    if (index < 0) continue;
    let entry = entries.get(row.agreementId);
    if (!entry) {
      entry = { customerId: row.customerId, customerName: row.customerName, agreementId: row.agreementId,
        months: Array<number>(12).fill(0), totalCents: 0, seasonStarts: [],
        breakdown: { contract: Array<number>(12).fill(0), snow: Array<number>(12).fill(0), fee: Array<number>(12).fill(0) } };
      entries.set(row.agreementId, entry);
    }
    entry.months[index] += row.amountCents;
    entry.breakdown[row.isFee ? "fee" : row.stream][index] += row.amountCents;
    entry.totalCents += row.amountCents;
  }

  const firstStart = new Map<string, string>();
  const uniqueSeasons = new Map(seasons.map(season => [season.termId, season]));
  for (const { agreementId, startDate } of uniqueSeasons.values()) {
    const first = firstStart.get(agreementId);
    if (!first || startDate < first) firstStart.set(agreementId, startDate);
  }
  for (const { agreementId, startDate, seasonLabel } of uniqueSeasons.values()) {
    const entry = entries.get(agreementId);
    if (entry && yearMonthIndex(startDate, year) >= 0 && firstStart.get(agreementId)! < startDate) {
      entry.seasonStarts.push({ month: monthOf(startDate), seasonLabel });
    }
  }
  return [...entries.values()].filter(entry => entry.totalCents !== 0).map(entry => {
    entry.seasonStarts.sort((a, b) => a.month.localeCompare(b.month) || a.seasonLabel.localeCompare(b.seasonLabel));
    return entry;
  }).sort((a, b) => a.customerName.localeCompare(b.customerName) || a.agreementId.localeCompare(b.agreementId));
}

type BillingEntry = Pick<ContractRevenueRow, "customerId" | "customerName" | "agreementId" | "termId" | "seasonLabel" | "line" | "form" | "notRenewing"> & {
  lines: Array<Pick<ContractRevenueRow, "component" | "isFee" | "amountCents">>;
  amountCents: number;
};

export function summarizeBillingMonth(rows: readonly ContractRevenueRow[]) {
  const totals = { amountCents: 0, contractCents: 0, snowCents: 0, feeCents: 0, landscapeCents: 0, flatSnowCents: 0 };
  const entries = new Map<string, { term: ContractRevenueRow; amountCents: number; lines: BillingEntry["lines"] }>();
  for (const row of rows) {
    totals.amountCents += row.amountCents;
    totals[row.stream === "snow" ? "snowCents" : "contractCents"] += row.amountCents;
    totals[row.isFee ? "feeCents" : row.stream === "snow" ? "flatSnowCents" : "landscapeCents"] += row.amountCents;
    let entry = entries.get(row.agreementId);
    if (!entry) {
      entry = { term: row, amountCents: 0, lines: [] };
      entries.set(row.agreementId, entry);
    }
    // Adjacent seasons can both bill in one month. Count every payment but use
    // Contract Center's latest-season priority for the single header.
    if (compareTermPriority(
      { startDate: row.startDate, id: row.termId },
      { startDate: entry.term.startDate, id: entry.term.termId },
    ) < 0) entry.term = row;
    entry.lines.push({ component: row.component, isFee: row.isFee, amountCents: row.amountCents });
    entry.amountCents += row.amountCents;
  }
  const customers: BillingEntry[] = [...entries.values()].map(({ term, amountCents, lines }) => {
    const { customerId, customerName, agreementId, termId, seasonLabel, line, form, notRenewing } = term;
    lines.sort((a, b) => a.component.localeCompare(b.component) || Number(a.isFee) - Number(b.isFee) || a.amountCents - b.amountCents);
    return { customerId, customerName, agreementId, termId, seasonLabel, line, form, notRenewing, lines, amountCents };
  });
  customers.sort((a, b) => b.amountCents - a.amountCents || a.agreementId.localeCompare(b.agreementId));
  return { totals, customers };
}
