import {
  agreements, agreementTerms, customers, estimates, estimateVersions, revenueIncomeAccounts,
  revenuePlans, revenueQboIncomeMonths, revenueQboIncomeYears, revenueTargets,
} from "@workspace/db";
import { and, eq, gte, isNull, lt, lte, or } from "drizzle-orm";
import { db, type AppTransaction } from "../db";
import { billingMonth, companyDayBounds, companyToday } from "../lib/companyDay";
import { loadRenewalsDue, type ContractRenewalHistory } from "../lib/contractCenterPersistence";
import { loadContractRevenueRows } from "../lib/contractRevenue";
import { incomeForecast } from "../lib/incomeStreams";
import { revenueEstimatePipeline, revenuePipelineWindow } from "../lib/revenueEstimatePipeline";
import { revenueTargetUpdate } from "../lib/revenuePlanning";
import { saveRevenueTargets } from "./revenuePlanning";

type ReadPurpose = "income" | "years" | "projection" | "from-plan";

async function loadHistories(tx: AppTransaction, companyId: string) {
  const rows = await tx.select({ id: agreements.id, customerId: customers.id, customerName: customers.name, term: agreementTerms })
    .from(agreements)
    .innerJoin(customers, and(eq(customers.id, agreements.customerId), eq(customers.companyId, companyId)))
    .innerJoin(agreementTerms, and(eq(agreementTerms.agreementId, agreements.id), eq(agreementTerms.companyId, companyId)))
    .where(eq(agreements.companyId, companyId));
  const histories = new Map<string, ContractRenewalHistory>();
  for (const { term, ...owner } of rows) {
    const history = histories.get(owner.id);
    if (history) history.terms.push(term);
    else histories.set(owner.id, { ...owner, terms: [term] });
  }
  return [...histories.values()];
}

async function loadPipeline(tx: AppTransaction, companyId: string, today: string) {
  const { from, to } = revenuePipelineWindow(today);
  return tx.select({
    status: estimateVersions.status, acceptedOn: estimateVersions.acceptedOn,
    declinedAt: estimateVersions.declinedAt, frozenSubtotalCents: estimateVersions.frozenSubtotalCents,
  }).from(estimateVersions)
    .innerJoin(estimates, and(eq(estimates.id, estimateVersions.estimateId), eq(estimates.companyId, companyId)))
    .where(and(eq(estimateVersions.companyId, companyId), isNull(estimates.voidedAt), or(
      eq(estimateVersions.status, "sent"),
      and(eq(estimateVersions.status, "accepted"), gte(estimateVersions.acceptedOn, from), lt(estimateVersions.acceptedOn, to)),
      and(eq(estimateVersions.status, "declined"), gte(estimateVersions.declinedAt, companyDayBounds(from).start),
        lt(estimateVersions.declinedAt, companyDayBounds(to).start)),
    )));
}

/** A single, consistent local snapshot. Query count does not grow with the
 * number of years, accounts, customers, agreements or estimate versions. */
async function loadForecast(companyId: string, from: number, to: number, purpose: ReadPurpose) {
  const today = companyToday(), current = Number(today.slice(0, 4));
  const projection = purpose === "projection";
  const earliest = Math.min(from - (projection ? 2 : 1), current - 1);
  const firstMonth = billingMonth(earliest, 1), lastMonth = billingMonth(to, 12);
  const allHistory = purpose === "income" && from === current;
  const earliestEarned = Math.min(earliest, to >= current ? current - 5 : earliest);
  const firstEarnedMonth = billingMonth(earliestEarned, 1);
  const throughYear = Math.min(to, current);

  return db.transaction(async tx => {
    const bills = await loadContractRevenueRows(tx, companyId, firstMonth, lastMonth,
      to >= current || projection ? { includeLostFrom: projection ? billingMonth(from - 1, 1) : undefined } : undefined);
    const histories = to >= current || projection ? await loadHistories(tx, companyId) : [];
    const fetchedYears = await tx.select({ year: revenueQboIncomeYears.year, fetchedAt: revenueQboIncomeYears.fetchedAt })
      .from(revenueQboIncomeYears).where(and(eq(revenueQboIncomeYears.companyId, companyId),
        lte(revenueQboIncomeYears.year, throughYear), allHistory ? undefined : gte(revenueQboIncomeYears.year, earliestEarned)));
    const earned = await tx.select({
      qboAccountId: revenueQboIncomeMonths.qboAccountId, month: revenueQboIncomeMonths.month, amountCents: revenueQboIncomeMonths.amountCents,
    }).from(revenueQboIncomeMonths).where(and(eq(revenueQboIncomeMonths.companyId, companyId),
      lte(revenueQboIncomeMonths.month, billingMonth(throughYear, 12)),
      allHistory ? undefined : gte(revenueQboIncomeMonths.month, firstEarnedMonth)));
    const mappings = await tx.select({ qboAccountId: revenueIncomeAccounts.qboAccountId, stream: revenueIncomeAccounts.stream })
      .from(revenueIncomeAccounts).where(eq(revenueIncomeAccounts.companyId, companyId));
    const plans = to >= current || projection
      ? await tx.select().from(revenuePlans).where(and(eq(revenuePlans.companyId, companyId),
        gte(revenuePlans.year, projection ? Math.min(from, current) : current), lte(revenuePlans.year, to)))
      : [];
    const targets = purpose === "income" || projection
      ? await tx.select({ stream: revenueTargets.stream, month: revenueTargets.month, amountCents: revenueTargets.amountCents })
        .from(revenueTargets).where(and(eq(revenueTargets.companyId, companyId),
          gte(revenueTargets.month, billingMonth(projection ? from - 1 : from, 1)), lte(revenueTargets.month, lastMonth)))
      : [];
    const due = projection ? await loadRenewalsDue(tx, companyId, today, histories) : [];
    const pipeline = projection ? await loadPipeline(tx, companyId, today) : [];
    return { inputs: { today, bills, histories, fetchedYears, earned, mappings,
      plans: plans.map(row => ({ ...row, saved: true })), targets }, due, pipeline };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function loadIncome(companyId: string, year: number) {
  const { inputs } = await loadForecast(companyId, year, year, "income");
  return incomeForecast(inputs).income(year);
}

export async function loadIncomeYears(companyId: string, from: number, to: number) {
  const { inputs } = await loadForecast(companyId, from, to, "years");
  return incomeForecast(inputs).trends(from, to);
}

export async function loadPlanProjection(companyId: string, year: number) {
  const { inputs, due, pipeline } = await loadForecast(companyId, year, year, "projection");
  return incomeForecast(inputs).planProjection(year, due, revenueEstimatePipeline(pipeline, inputs.today));
}

export async function saveTargetsFromPlan(companyId: string, year: number, updatedBy: string) {
  const { inputs } = await loadForecast(companyId, year, year, "from-plan");
  const streams = incomeForecast(inputs).targetAmountsFromPlan(year);
  // The RV3 target store is deliberately nonnegative int32. A refund or
  // large projection can be valid income but not a valid target; do not
  // silently alter it or replace only part of the target grid.
  const parsed = revenueTargetUpdate.safeParse({ streams });
  if (!parsed.success) return null;
  return saveRevenueTargets(companyId, year, updatedBy, parsed.data.streams);
}
