import type { RevenueIncome, RevenueIncomeStream, RevenueIncomeYears, RevenueTargets } from "@workspace/api-client-react";
import { REVENUE_STREAMS, type RevenueStream } from "../../../../../lib/db/src/revenueStreams";

const byStream = <T,>(build: (key: RevenueStream, index: number) => T) =>
  Object.fromEntries(REVENUE_STREAMS.map((key, index) => [key, build(key, index)])) as Record<RevenueStream, T>;
const annualTarget = (index: number) => 26_000_000 - index * 4_500_000;
const monthlyTarget = (annual: number, month: number) => Math.floor(annual / 12) + Number(month < annual % 12);

export function revenueIncomeFixture(year: number, currentYear: number, options: {
  targets?: boolean; loaded?: boolean; currentMonth?: number; other?: boolean; factor?: number;
} = {}): RevenueIncome {
  const { targets = false, loaded = true, currentMonth = 11, other = false, factor = 1 } = options;
  const closed = year < currentYear ? 12 : year > currentYear ? 0 : currentMonth - 1;
  const monthDate = (month: number) => `${year}-${String(month).padStart(2, "0")}-01`;
  const money = (index: number, month: number) => (2_100_000 - index * 380_000 + month * 20_100) * factor;
  const row = (index: number): RevenueIncomeStream => {
    const months = Array.from({ length: 12 }, (_, month) => ({
      month: monthDate(month + 1),
      earnedCents: loaded && month < closed ? money(index, month) : null,
      signedCents: month >= closed && index === 0 ? money(index, month) : 0,
      estimatedCents: month >= closed && index !== 0 ? money(index, month) : 0,
    }));
    const earned = months.reduce((sum, month) => sum + (month.earnedCents ?? 0), 0);
    const signedCents = months.reduce((sum, month) => sum + month.signedCents, 0);
    const estimatedCents = months.reduce((sum, month) => sum + month.estimatedCents, 0);
    return {
      months, earnedCents: loaded && closed > 0 ? earned : null, signedCents, estimatedCents,
      forecastCents: earned + signedCents + estimatedCents, targetCents: targets && index < 5 ? annualTarget(index) : null,
      lastYearCents: money(index, 0) * 12,
    };
  };
  const streams = { ...byStream((_, index) => row(index)), ...(other ? { other: row(5) } : {}) };
  const rows = Object.values(streams);
  const sum = (field: keyof Omit<RevenueIncomeStream, "months">) => rows.reduce((total, stream) => total + (stream[field] ?? 0), 0);
  return {
    year, closedThrough: closed ? monthDate(closed) : null, qboMissing: closed > 0 && !loaded,
    streams, qbo: { loaded, fetchedAt: loaded ? `${year}-11-17T12:00:00Z` : null, unmappedCount: other ? 2 : 0 },
    totals: { earnedCents: loaded && closed > 0 ? sum("earnedCents") : null, signedCents: sum("signedCents"),
      estimatedCents: sum("estimatedCents"), forecastCents: sum("forecastCents"), targetCents: targets ? sum("targetCents") : null,
      lastYearCents: sum("lastYearCents") },
    targetMonths: targets ? Array.from({ length: 12 }, (_, i) => REVENUE_STREAMS.reduce((n, _, k) => n + monthlyTarget(annualTarget(k), i), 0)) : null,
    ...(year === currentYear ? { concentration: {
      top5: ["Ponderosa Community", "Mesa Business Center", "Vista Townhomes", "South Creek HOA", "Overland Commons"].map((customerName, index) =>
        ({ customerId: `fixture-${index}`, customerName, cents: 6_400_000 - index * 850_000, shareOfContractPct: 26 - index * 4 })),
      theirFormSharePct: 41.5, snowSharePct: 16.2,
      snowRange: { minCents: 1_400_000, maxCents: 5_300_000, years: [year - 2, year - 1, year] },
    } } : {}),
  };
}

export function revenueTargetsFixture(year: number): RevenueTargets {
  const annual = byStream((_, index) => annualTarget(index));
  return { year, annual, saved: true, streams: byStream(key => Array.from({ length: 12 }, (_, i) => monthlyTarget(annual[key], i))) };
}

export function revenueTrendsFixture(currentYear: number): RevenueIncomeYears {
  const incomes = Array.from({ length: 5 }, (_, i) => revenueIncomeFixture(currentYear - 4 + i, currentYear, { factor: i + 1 }));
  const seasonality = (key: RevenueStream | "all") => incomes.map(income => ({
    year: income.year,
    months: Array.from({ length: 12 }, (_, index) => {
      const parts = key === "all" ? Object.values(income.streams) : [income.streams[key]];
      return parts.reduce((sum, stream) => {
        const m = stream.months[index];
        return sum + (m.earnedCents ?? 0) + m.signedCents + m.estimatedCents;
      }, 0);
    }),
  }));
  return {
    years: incomes.map(income => {
      const comparison = ({ forecastCents, lastYearCents }: RevenueIncome["totals"]) => ({ forecastCents, lastYearCents });
      return { year: income.year, closedThrough: income.closedThrough, totals: comparison(income.totals),
        streams: byStream(key => comparison(income.streams[key])),
        recurringSharePct: income.streams.contract.forecastCents / income.totals.forecastCents * 100 };
    }),
    monthsByStream: { ...byStream(seasonality), all: seasonality("all") },
  };
}
