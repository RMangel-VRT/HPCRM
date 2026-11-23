import { and, count, desc, eq, gte, inArray, isNull, lt, sql, sum } from "drizzle-orm";
import { qboConnections, revenueIncomeAccounts, revenueQboIncomeMonths, revenueQboIncomeYears } from "@workspace/db";
import type { IncomeAccountStream } from "@workspace/db/revenue-streams";
import { db } from "../db";
import { companyToday } from "../lib/companyDay";
import { qboRequest } from "./qboClient";
import { parseQboIncomeReport } from "./qboIncomeReport";
import { incomeAccounts } from "./qboItems";

export class RevenueQboError extends Error {
  constructor(readonly status: 400 | 502 | 503, message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const disconnected = () => new RevenueQboError(503, "QuickBooks is not connected for this company");
const minRevenueYear = 2015;
export const currentRevenueYear = () => Number(companyToday().slice(0, 4));
export function isRevenueRefreshYear(year: number): boolean {
  return Number.isInteger(year) && year >= minRevenueYear && year <= currentRevenueYear();
}

async function isConnected(companyId: string): Promise<boolean> {
  const [connection] = await db.select({ status: qboConnections.status }).from(qboConnections)
    .where(eq(qboConnections.companyId, companyId));
  return connection?.status === "connected";
}

function incomeYearScope(companyId: string, year: number) {
  return and(
    eq(revenueQboIncomeMonths.companyId, companyId),
    gte(revenueQboIncomeMonths.month, `${year}-01-01`),
    lt(revenueQboIncomeMonths.month, `${year + 1}-01-01`),
  );
}

export async function getQboIncomeStatus(companyId: string) {
  const [connected, years, [unmapped]] = await Promise.all([
    isConnected(companyId),
    db.select({ year: revenueQboIncomeYears.year, fetchedAt: revenueQboIncomeYears.fetchedAt })
      .from(revenueQboIncomeYears).where(eq(revenueQboIncomeYears.companyId, companyId))
      .orderBy(desc(revenueQboIncomeYears.year)),
    db.select({ count: count() }).from(revenueIncomeAccounts)
      .where(and(eq(revenueIncomeAccounts.companyId, companyId), isNull(revenueIncomeAccounts.stream))),
  ]);
  return { connected, years, unmappedCount: unmapped.count };
}

async function activeIncomeAccounts(companyId: string) {
  try {
    return await incomeAccounts(companyId);
  } catch (cause) {
    throw new RevenueQboError(502, "Could not read income accounts from QuickBooks", { cause });
  }
}

export async function listIncomeAccounts(companyId: string) {
  const [active, stored, lastYearTotals] = await Promise.all([
    isConnected(companyId).then(connected => connected ? activeIncomeAccounts(companyId) : []),
    db.select().from(revenueIncomeAccounts).where(eq(revenueIncomeAccounts.companyId, companyId)),
    db.select({ id: revenueQboIncomeMonths.qboAccountId, cents: sum(revenueQboIncomeMonths.amountCents) })
      .from(revenueQboIncomeMonths).where(incomeYearScope(companyId, currentRevenueYear() - 1))
      .groupBy(revenueQboIncomeMonths.qboAccountId),
  ]);
  const activeById = new Map(active.map(({ id, name }) => [id, name]));
  const storedById = new Map(stored.map(row => [row.qboAccountId, row]));
  const totalsById = new Map(lastYearTotals.map(({ id, cents }) => [id, Number(cents)]));
  return [...new Set([...activeById.keys(), ...storedById.keys()])].map(qboAccountId => {
    const row = storedById.get(qboAccountId);
    return {
      qboAccountId,
      name: activeById.get(qboAccountId) ?? row!.accountName,
      stream: row?.stream ?? null,
      active: activeById.has(qboAccountId),
      lastYearCents: totalsById.get(qboAccountId) ?? 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.qboAccountId.localeCompare(b.qboAccountId));
}

const byAccountId = (a: { qboAccountId: string }, b: { qboAccountId: string }) =>
  a.qboAccountId < b.qboAccountId ? -1 : a.qboAccountId > b.qboAccountId ? 1 : 0;

export async function updateIncomeAccountMappings(
  companyId: string, updatedBy: string, changes: { qboAccountId: string; stream: IncomeAccountStream | null }[],
): Promise<void> {
  if (!changes.length) return;
  const stored = await db.select({
    id: revenueIncomeAccounts.qboAccountId, name: revenueIncomeAccounts.accountName,
  }).from(revenueIncomeAccounts).where(and(
    eq(revenueIncomeAccounts.companyId, companyId),
    inArray(revenueIncomeAccounts.qboAccountId, changes.map(row => row.qboAccountId)),
  ));
  const names = new Map(stored.map(({ id, name }) => [id, name]));
  if (changes.some(row => !names.has(row.qboAccountId))) {
    if (!await isConnected(companyId)) throw disconnected();
    for (const { id, name } of await activeIncomeAccounts(companyId)) names.set(id, name);
  }
  if (changes.some(row => !names.has(row.qboAccountId))) {
    throw new RevenueQboError(400, "One or more QuickBooks income accounts are not known for this company");
  }

  const updatedAt = new Date();
  // One statement is atomic. Use the same lock order as refreshes and leave
  // an existing report name snapshot alone, even if it changed after our read.
  await db.insert(revenueIncomeAccounts)
    .values([...changes].sort(byAccountId).map(row => ({
      ...row, companyId, accountName: names.get(row.qboAccountId)!, updatedBy, updatedAt,
    }))).onConflictDoUpdate({
      target: [revenueIncomeAccounts.companyId, revenueIncomeAccounts.qboAccountId],
      set: { stream: sql`excluded.stream`, updatedBy, updatedAt },
    });
}

export async function refreshQboIncome(companyId: string, year: number) {
  if (!isRevenueRefreshYear(year)) throw new RevenueQboError(400, "Invalid QuickBooks income year");
  if (!await isConnected(companyId)) throw disconnected();

  // Do not bind this read to the replacement transaction. A rotated OAuth
  // token needs to commit even if the report cannot be parsed or saved.
  let report: ReturnType<typeof parseQboIncomeReport>;
  try {
    const path = `/reports/ProfitAndLoss?start_date=${year}-01-01&end_date=${year}-12-31&accounting_method=Accrual&summarize_column_by=Month`;
    const response = await qboRequest(companyId, "GET", path);
    if (!response.ok) throw new Error(`QuickBooks Profit and Loss read failed (${response.status})`);
    report = parseQboIncomeReport(await response.json(), year);
  } catch (cause) {
    throw new RevenueQboError(502, "Could not read a valid Profit and Loss report from QuickBooks. Previously loaded income was not changed.", { cause });
  }

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`revenue-qbo-income:${companyId}:${year}`}, 0))`);
    const fetchedAt = new Date();
    await tx.delete(revenueQboIncomeMonths).where(incomeYearScope(companyId, year));
    for (let offset = 0; offset < report.months.length; offset += 1000) {
      await tx.insert(revenueQboIncomeMonths).values(report.months.slice(offset, offset + 1000)
        .map(row => ({ ...row, companyId, fetchedAt })));
    }
    await tx.insert(revenueQboIncomeYears).values({ companyId, year, fetchedAt }).onConflictDoUpdate({
      target: [revenueQboIncomeYears.companyId, revenueQboIncomeYears.year],
      set: { fetchedAt, basis: "accrual" },
    });
    const accounts = report.accounts.sort(byAccountId);
    for (let offset = 0; offset < accounts.length; offset += 1000) {
      await tx.insert(revenueIncomeAccounts).values(accounts.slice(offset, offset + 1000)
        .map(row => ({ ...row, companyId, updatedAt: fetchedAt }))).onConflictDoUpdate({
        target: [revenueIncomeAccounts.companyId, revenueIncomeAccounts.qboAccountId],
        set: { accountName: sql`excluded.account_name`, updatedAt: fetchedAt },
      });
    }
    return { year, fetchedAt };
  });
}
