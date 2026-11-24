import type {
  RevenueConcentration, RevenueIncome, RevenueIncomeMonth, RevenueIncomeStream, RevenueIncomeStreams,
  RevenueIncomeTotals, RevenueIncomeYears, RevenuePlan, RevenuePlanProjection, RevenueTrendAmount,
} from "@workspace/api-zod";
import { REVENUE_STREAMS, type IncomeAccountStream, type RevenueStream } from "@workspace/db/revenue-streams";
import { billingMonth, calendarDaysBetween, monthOf } from "./companyDay";
import {
  compareTermPriority, IN_EFFECT_TERM_STATUSES, isNotRenewing, monthIndex, RENEWAL_WINDOW_DAYS,
  selectInEffectTerm, selectRenewalSource,
} from "./contractCenterService";
import { recordedContractLoss } from "./contractState";
import type { ContractRevenueRow } from "./contractRevenue";
import type { ContractRenewalHistory, RenewalDueRow } from "./contractCenterPersistence";
import { planDefaults } from "./revenuePlanning";

const streams = [...REVENUE_STREAMS, "other"] as const;
type StreamKey = (typeof streams)[number];
type GridKey = StreamKey | "all";
type History = Omit<ContractRenewalHistory, "terms"> & { terms: readonly RevenueSeason[] };
type RevenueSeason = Pick<ContractRenewalHistory["terms"][number],
  "id" | "status" | "startDate" | "endDate" | "line" | "annualPriceCents" |
  "seasonLabel" | "nonRenewalOn" | "nonRenewalReason" | "renewedFromTermId"> &
  Partial<Pick<ContractRenewalHistory["terms"][number], "billingType">>;
type Billing = Pick<ContractRevenueRow,
  "agreementId" | "customerId" | "customerName" | "termId" | "stream" | "form" | "isFee" | "month" | "amountCents">;

export interface IncomeInputs {
  today: string;
  bills: readonly Billing[];
  histories: readonly History[];
  earned: readonly { qboAccountId: string; month: string; amountCents: number }[];
  fetchedYears: readonly { year: number; fetchedAt: Date }[];
  mappings: readonly { qboAccountId: string; stream: IncomeAccountStream | null }[];
  plans: readonly RevenuePlan[];
  targets: readonly { stream: RevenueStream; month: string; amountCents: number }[];
}

const yearOf = (day: string) => Number(day.slice(0, 4));
const months = (year: number) => Array.from({ length: 12 }, (_, i) => billingMonth(year, i + 1));
const sum = <T>(items: readonly T[], cents: (item: T) => number) => items.reduce((n, item) => n + cents(item), 0);
const share = (part: number, whole: number) => whole === 0 ? null : part / whole * 100;
const total = (m: RevenueIncomeMonth) => (m.earnedCents ?? 0) + m.signedCents + m.estimatedCents;
const byKey = <K extends string, T>(keys: readonly K[], fn: (key: K) => T) =>
  Object.fromEntries(keys.map(key => [key, fn(key)])) as Record<K, T>;
const indexBy = <T, K>(items: readonly T[], key: (item: T) => K) => {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const value = key(item), group = groups.get(value);
    if (group) group.push(item);
    else groups.set(value, [item]);
  }
  return groups;
};
const add = <K>(map: Map<K, number>, key: K, cents: number) => map.set(key, (map.get(key) ?? 0) + cents);
const basisPoints = (pct: number) => BigInt(Math.round(pct * 100));

/** Round to the nearest cent, ties toward positive infinity, without float intermediates. */
function roundRatio(numerator: bigint, denominator: bigint) {
  const rounded = numerator * 2n + denominator, divisor = denominator * 2n;
  const cents = Number(rounded / divisor - (rounded % divisor < 0n ? 1n : 0n));
  if (!Number.isSafeInteger(cents)) throw new RangeError("Projected amount exceeds safe integer cents");
  return cents;
}

function contractRenewals(histories: IncomeInputs["histories"], bills: IncomeInputs["bills"]) {
  const firstYearByTerm = new Map<string, number>(), lastBillByTerm = new Map<string, string>();
  const terms = new Map(histories.flatMap(({ terms }) => terms.map(term => [term.id, term] as const)));
  for (const row of bills) {
    const term = terms.get(row.termId);
    if (!term) continue;
    if (row.month > (lastBillByTerm.get(term.id) ?? "")) lastBillByTerm.set(term.id, row.month);
    const offset = monthIndex(row.month) - monthIndex(term.startDate);
    if (term.annualPriceCents === null && !row.isFee && offset >= 0 && offset < 12)
      add(firstYearByTerm, term.id, row.amountCents);
  }
  const annual = (term: RevenueSeason) => term.annualPriceCents ?? firstYearByTerm.get(term.id) ?? null;
  const latestBill = (term: RevenueSeason) => lastBillByTerm.get(term.id) ?? null;
  const groups = histories.flatMap(({ terms, ...owner }) => {
    // Revenue fills only after the last counted end date, including a future
    // signed successor. Contract Center owns the outcome and draft lineage.
    const latest = terms.filter(term => IN_EFFECT_TERM_STATUSES.some(status => status === term.status))
      .sort((a, b) => b.endDate.localeCompare(a.endDate) || compareTermPriority(a, b))[0];
    if (!latest) return [];
    const source = selectRenewalSource([...terms]);
    const loss = recordedContractLoss(terms, latest, source);
    return [{
      ...owner, latest, source, eligible: !loss.direct && !loss.renewal && !isNotRenewing(latest),
      annualCents: annual(latest) ?? 0,
      stream: latest.line === "snow" ? "snow" as const : "contract" as const,
      lastMonth: source ? latestBill(source) : null,
    }];
  });
  return { groups, annual, latestBill };
}

function revenueRenewalDetail(inputs: IncomeInputs, year: number, dueRows: readonly RenewalDueRow[],
  { annual, latestBill }: ReturnType<typeof contractRenewals>): RevenuePlanProjection["renewals"] {
  // RV6 specifies a 60-day Revenue drill-down. The merged Contract Center
  // classifier uses a wider action window; narrow the display, not its rules.
  const windowDays = Math.min(60, RENEWAL_WINDOW_DAYS);
  const result: RevenuePlanProjection["renewals"] = { windowDays, inEffect: [], signed: [], atRisk: [], notRenewing: [] };
  const dueByAgreement = new Map(dueRows.map(row => [row.agreementId, row]));
  const inEffectStatuses = new Set<string>(IN_EFFECT_TERM_STATUSES);
  for (const { id, customerName, terms } of inputs.histories) {
    const info = (term: RevenueSeason) => ({ agreementId: id, customerName, seasonLabel: term.seasonLabel,
      startDate: term.startDate, endDate: term.endDate, annualCents: annual(term) });
    const current = selectInEffectTerm([...terms], inputs.today);
    const due = dueByAgreement.get(id);
    if (current) {
      result.inEffect.push({ ...info(current), billingType: current.billingType ?? null });
      const daysLeft = calendarDaysBetween(inputs.today, current.endDate);
      // Contract Center supplies eligibility. In-progress rows describe the
      // draft; the expiry displayed here belongs to the current, signed source.
      if (daysLeft >= 0 && daysLeft <= windowDays &&
          (due?.state === "renewal_due" || due?.state === "renewal_in_progress")) {
        result.atRisk.push({ ...info(current), daysLeft,
          draftStatus: due.renewalDraft?.sourceTermId === current.id ? due.renewalDraft.status : null });
      }
    }
    const byId = new Map(terms.map(term => [term.id, term]));
    // Next season is relative to Colorado today, not the plan's calendar
    // year. Pick the first upcoming counted season before checking lineage,
    // so a new agreement's first season cannot be skipped for a later one.
    const upcoming = terms.filter(term => term.startDate > inputs.today && inEffectStatuses.has(term.status))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || compareTermPriority(a, b))[0];
    const prior = upcoming?.renewedFromTermId ? byId.get(upcoming.renewedFromTermId) : undefined;
    if (upcoming && prior && inEffectStatuses.has(prior.status)) {
      result.signed.push({ ...info(upcoming), previousAnnualCents: annual(prior) });
    }
    const source = selectRenewalSource([...terms]);
    if (source && inEffectStatuses.has(source.status) && isNotRenewing(source) &&
      source.endDate >= billingMonth(year - 1, 1)) {
      result.notRenewing.push({ ...info(source), lastMonth: latestBill(source), reason: source.nonRenewalReason });
    }
  }
  const byCustomer = (a: { customerName: string; agreementId: string }, b: typeof a) =>
    a.customerName.localeCompare(b.customerName) || a.agreementId.localeCompare(b.agreementId);
  result.inEffect.sort(byCustomer);
  result.signed.sort((a, b) => a.startDate.localeCompare(b.startDate) || byCustomer(a, b));
  result.atRisk.sort((a, b) => a.daysLeft - b.daysLeft || byCustomer(a, b));
  result.notRenewing.sort(byCustomer);
  return result;
}

function summarize(months: readonly RevenueIncomeMonth[]) {
  const earnedCents = months.some(m => m.earnedCents !== null) ? sum(months, m => m.earnedCents ?? 0) : null;
  const signedCents = sum(months, m => m.signedCents), estimatedCents = sum(months, m => m.estimatedCents);
  return { earnedCents, signedCents, estimatedCents, forecastCents: (earnedCents ?? 0) + signedCents + estimatedCents };
}

function withoutMonths({ months: _months, ...totals }: RevenueIncomeStream): RevenueIncomeTotals {
  return totals;
}

/** A request-scoped, pure forecast over loaded data. Raw years are memoized,
 * so an open prior-year month is calculated once, under its own plan. */
export function incomeForecast(inputs: IncomeInputs) {
  const currentMonth = monthOf(inputs.today), currentYear = yearOf(currentMonth);
  const billsByYear = indexBy(inputs.bills, row => yearOf(row.month));
  const targetsByYear = indexBy(inputs.targets, row => yearOf(row.month));
  const loaded = new Map(inputs.fetchedYears.map(row => [row.year, row.fetchedAt]));
  const mappings = new Map(inputs.mappings.map(row => [row.qboAccountId, row.stream]));
  const plans = new Map(inputs.plans.map(row => [row.year, row]));
  const planFor = (year: number): RevenuePlan => plans.get(year) ?? { ...planDefaults(year), saved: false };
  const signed = { contract: new Map<string, number>(), snow: new Map<string, number>() };
  for (const row of inputs.bills) add(signed[row.stream], row.month, row.amountCents);
  const earned = byKey(streams, () => new Map<string, number>());
  const unmapped = new Map<number, Set<string>>();
  for (const { qboAccountId, month, amountCents } of inputs.earned) {
    const year = yearOf(month), mapping = mappings.get(qboAccountId);
    if (!loaded.has(year) || mapping === "exclude") continue;
    if (!mapping) {
      const accounts = unmapped.get(year) ?? new Set<string>();
      accounts.add(qboAccountId);
      unmapped.set(year, accounts);
    }
    if (month < currentMonth) add(earned[mapping ?? "other"], month, amountCents);
  }
  const renewalBasis = contractRenewals(inputs.histories, inputs.bills);
  const renewals = renewalBasis.groups;
  const rawYears = new Map<number, Record<GridKey, RevenueIncomeMonth[]>>();

  function rawYear(year: number): Record<GridKey, RevenueIncomeMonth[]> {
    const cached = rawYears.get(year);
    if (cached) return cached;
    const plan = planFor(year);
    const dates = months(year);
    const open = year >= currentYear;
    const expected = { contract: new Map<string, number>(), snow: new Map<string, number>() };
    if (open) for (const { eligible, latest, annualCents, stream } of renewals) {
      if (!eligible || !annualCents || latest.endDate >= dates[11]) continue;
      const monthly = roundRatio(BigInt(annualCents) * (10000n + basisPoints(plan.renewalIncreasePct)) * BigInt(plan.keptPct), 12000000n);
      for (const month of dates) if (month >= currentMonth && latest.endDate < month)
        add(expected[stream], month, monthly);
    }

    const grid = byKey(streams, stream => dates.map((month, index): RevenueIncomeMonth => {
      const closed = month < currentMonth, hasEarned = closed && loaded.has(year);
      const earnedCents = hasEarned ? earned[stream].get(month) ?? 0 : null;
      let signedCents = 0, estimatedCents = 0;
      if (stream === "contract" || stream === "snow") {
        if (!hasEarned) signedCents = signed[stream].get(month) ?? 0;
        if (!closed) {
          estimatedCents = expected[stream].get(month) ?? 0;
          if (stream === "snow") {
            let count = 0, snow = 0n;
            for (let offset = 1; offset <= plan.snowYears; offset++) {
              const prior = year - offset, priorMonth = billingMonth(prior, index + 1);
              if (!loaded.has(prior) || priorMonth >= currentMonth) continue;
              count++;
              snow += BigInt(earned.snow.get(priorMonth) ?? 0);
            }
            if (count > 0) estimatedCents += roundRatio(snow, BigInt(count));
          }
        }
      } else if (!closed && stream !== "other") {
        const base = total(rawYear(year - 1)[stream][index]);
        estimatedCents = roundRatio(BigInt(base) * (10000n + basisPoints(plan[`${stream}GrowthPct`])), 10000n);
      }
      return { month, earnedCents, signedCents, estimatedCents };
    }));
    const all = dates.map((month, index) => {
      const { earnedCents, signedCents, estimatedCents } = summarize(streams.map(stream => grid[stream][index]));
      return { month, earnedCents, signedCents, estimatedCents };
    });
    const result = { ...grid, all };
    rawYears.set(year, result);
    return result;
  }

  function yearTotals(year: number, key: GridKey): RevenueIncomeTotals {
    const current = summarize(rawYear(year)[key]);
    const rows = (targetsByYear.get(year) ?? []).filter(row => key === "all" || row.stream === key);
    return { ...current, targetCents: rows.length ? sum(rows, row => row.amountCents) : null,
      lastYearCents: sum(rawYear(year - 1)[key], total) };
  }
  function streamTotals(year: number): RevenueIncomeStreams {
    const grid = rawYear(year);
    const totals = byKey(REVENUE_STREAMS, key => ({ ...yearTotals(year, key), months: grid[key] }));
    return grid.other.some(m => total(m) !== 0)
      ? { ...totals, other: { ...yearTotals(year, "other"), months: grid.other } }
      : totals;
  }
  const closedThrough = (year: number) => months(year).filter(month => month < currentMonth).at(-1) ?? null;

  function concentration(year: number, totals: RevenueIncomeTotals): RevenueConcentration {
    const projectedRows = billsByYear.get(year) ?? [];
    const contractRows = projectedRows.filter(row => row.stream === "contract");
    const contract = sum(contractRows, row => row.amountCents);
    const top5 = [...indexBy(contractRows, row => row.customerId).values()].map(rows => {
      const { customerId, customerName } = rows[0], cents = sum(rows, row => row.amountCents);
      return { customerId, customerName, cents, shareOfContractPct: share(cents, contract) };
    }).filter(row => row.cents !== 0).sort((a, b) => b.cents - a.cents || a.customerId.localeCompare(b.customerId)).slice(0, 5);
    const years = [...loaded.keys()].filter(y => closedThrough(y) !== null).sort((a, b) => a - b);
    const snow = years.map(y => sum(months(y), month => earned.snow.get(month) ?? 0));
    return {
      top5, theirFormSharePct: share(sum(projectedRows.filter(row => row.form === "theirs"), row => row.amountCents),
        sum(projectedRows, row => row.amountCents)),
      snowSharePct: share(sum(rawYear(year).snow, total), totals.forecastCents),
      snowRange: { minCents: snow.length ? Math.min(...snow) : null, maxCents: snow.length ? Math.max(...snow) : null, years },
    };
  }

  function income(year: number): RevenueIncome {
    const through = closedThrough(year), fetchedAt = loaded.get(year) ?? null, totals = yearTotals(year, "all");
    const targets = targetsByYear.get(year);
    const byMonth = new Map<string, number>();
    for (const row of targets ?? []) add(byMonth, row.month, row.amountCents);
    return {
      year, closedThrough: through, qboMissing: through !== null && fetchedAt === null,
      qbo: { loaded: fetchedAt !== null, fetchedAt, unmappedCount: unmapped.get(year)?.size ?? 0 },
      streams: streamTotals(year), totals, targetMonths: targets ? months(year).map(month => byMonth.get(month) ?? 0) : null,
      ...(year === currentYear ? { concentration: concentration(year, totals) } : {}),
    };
  }

  function trends(from: number, to: number): RevenueIncomeYears {
    const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const seasonality = (key: GridKey) => years.map(year => ({ year, months: rawYear(year)[key].map(total) }));
    const comparison = (year: number, key: GridKey): RevenueTrendAmount => ({
      forecastCents: sum(rawYear(year)[key], total), lastYearCents: sum(rawYear(year - 1)[key], total),
    });
    const other = years.some(year => rawYear(year).other.some(m => total(m) !== 0));
    return {
      years: years.map(year => {
        const totals = comparison(year, "all"), byStream = byKey(REVENUE_STREAMS, key => comparison(year, key));
        return { year, closedThrough: closedThrough(year), totals,
          streams: { ...byStream, ...(other ? { other: comparison(year, "other") } : {}) },
          recurringSharePct: share(byStream.contract.forecastCents, totals.forecastCents) };
      }),
      monthsByStream: { ...byKey([...REVENUE_STREAMS, "all"], seasonality), ...(other ? { other: seasonality("other") } : {}) },
    };
  }

  function planProjection(year: number, due: readonly RenewalDueRow[], pipeline: RevenuePlanProjection["pipeline"]): RevenuePlanProjection {
    const baseStreams = streamTotals(year - 1), planned = streamTotals(year);
    const base = { ...byKey(REVENUE_STREAMS, key => withoutMonths(baseStreams[key])),
      ...(baseStreams.other ? { other: withoutMonths(baseStreams.other) } : {}) };
    const contractBills = indexBy((billsByYear.get(year - 1) ?? []).filter(row => row.stream === "contract"), row => row.agreementId);
    const lost = renewals.flatMap(({ id, customerName, source, lastMonth }) => {
      if (!source || !isNotRenewing(source) || source.endDate < billingMonth(year - 1, 1)) return [];
      const rows = contractBills.get(id) ?? [];
      if (source.line === "snow" && !rows.length) return [];
      return [{ agreementId: id, customerName, seasonLabel: source.seasonLabel, reason: source.nonRenewalReason,
        lastMonth, cents: sum(rows, row => row.amountCents) }];
    }).sort((a, b) => b.cents - a.cents || a.agreementId.localeCompare(b.agreementId));
    const startCents = base.contract.forecastCents, lostCents = sum(lost, row => row.cents);
    const { signedCents, estimatedCents: expectedCents } = planned.contract;
    const drafts = new Map(due.map(row => [row.agreementId, row.renewalDraft]));
    const eligible = renewals.filter(renewal => renewal.eligible);
    const first = billingMonth(year, 1), next = billingMonth(year + 1, 1);
    const renewalsPending = eligible.filter(r => r.latest.endDate < first).map(({ id, customerName, latest, annualCents }) => {
      const draft = drafts.get(id);
      return { agreementId: id, customerName, seasonLabel: latest.seasonLabel, endDate: latest.endDate, annualCents,
        renewalDraft: draft?.sourceTermId === latest.id ? { status: draft.status, annualCents: draft.annualCents } : null };
    }).sort((a, b) => a.endDate.localeCompare(b.endDate) || a.agreementId.localeCompare(b.agreementId));
    return { plan: planFor(year), base, baseQboMissing: closedThrough(year - 1) !== null && !loaded.has(year - 1), planned,
      bridge: { startCents, lost, lostCents, carriedCents: startCents - lostCents, signedCents, expectedCents, totalCents: signedCents + expectedCents },
      renewalsPending, laterRenewalsCount: eligible.filter(r => first <= r.latest.endDate && r.latest.endDate < next).length, pipeline,
      renewals: revenueRenewalDetail(inputs, year, due, renewalBasis) };
  }

  function targetAmountsFromPlan(year: number) {
    return byKey(REVENUE_STREAMS, key => rawYear(year)[key].map(month => roundRatio(BigInt(total(month)), 100n) * 100));
  }

  return { income, trends, planProjection, targetAmountsFromPlan };
}
