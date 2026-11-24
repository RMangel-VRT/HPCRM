import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RevenueIncomeYears, RevenueTrendAmount } from "@workspace/api-client-react";
import { RevenueSeasonalityChart, type SeasonLine } from "./RevenueSeasonalityChart";
import { closedIndex, priorChange, money, monthLabels, pct, streamKeys, streamVar, type StreamKey } from "./revenueFormat";
import "./revenue-v2.css";

export interface RevenueYearOverYearProps {
  trends: RevenueIncomeYears;
  currentYear: number;
  loadedYears: ReadonlySet<number>;
}

const V = "revenueV2.views";
type Key = StreamKey | "all";

export function RevenueYearOverYear({ trends, currentYear, loadedYears }: RevenueYearOverYearProps) {
  const { t, i18n } = useTranslation();
  const [season, setSeason] = useState<Key>("all");
  const names = useMemo(() => monthLabels(i18n.language), [i18n.language]);
  const years = useMemo(() => [...trends.years].sort((a, b) => a.year - b.year), [trends.years]);
  const keys = streamKeys(years.at(-1)?.streams ?? {});
  const label = (k: Key) => (k === "all" ? t(`${V}.allIncome`) : t(`${V}.streams.${k}`));

  /** Only complete annual figures can be compared; keep the current forecast visible as partial. */
  const available = (y: number, closedThrough: string | null) => closedThrough === null || loadedYears.has(y);
  const avail = new Map(years.map(y => [y.year, available(y.year, y.closedThrough)]));
  const currentPartial = avail.get(currentYear) === false;
  const priorAvail = (y: number) => avail.get(y - 1) ?? loadedYears.has(y - 1);

  const amount = (row: (typeof years)[number], k: Key): RevenueTrendAmount | undefined =>
    k === "all" ? row.totals : row.streams[k as StreamKey];

  function avgGrowth(k: Key) {
    const pts = years.filter(y => avail.get(y.year)).map(y => ({ y: y.year, v: amount(y, k)?.forecastCents ?? 0 }));
    if (pts.length < 2) return null;
    const a = pts[0], b = pts.at(-1)!;
    if (a.v <= 0 || b.v <= 0) return null;
    return (Math.pow(b.v / a.v, 1 / (b.y - a.y)) - 1) * 100;
  }

  function spark(k: Key) {
    const vals = years.map(y => ({ y: y.year, ok: avail.get(y.year), v: amount(y, k)?.forecastCents ?? 0 }));
    const max = Math.max(1, ...vals.filter(v => v.ok).map(v => v.v));
    return (
      <span className="rv-spark" style={{ ["--c" as string]: streamVar(k) }} aria-hidden="true">
        {vals.map(v => (
          <span key={v.y} className={!v.ok ? "rv-spark-na" : v.y >= currentYear ? "rv-spark-fcst" : ""}
            style={{ height: v.ok ? `${Math.max(2, (Math.max(0, v.v) / max) * 22)}px` : undefined }} />
        ))}
      </span>
    );
  }

  function row(k: Key) {
    const g = avgGrowth(k);
    return (
      <tr key={k} data-testid={`row-yoy-${k}`}>
        <th scope="row" className="rv-sticky">{k !== "all" && <span className="rv-dot" style={{ background: streamVar(k) }} />}{label(k)}</th>
        {years.map(y => {
          const a = amount(y, k);
          const partial = y.year === currentYear && currentPartial;
          if ((!avail.get(y.year) && !partial) || !a) return <td key={y.year} className="rv-cell-unavailable" data-testid={`yoy-unavailable-${y.year}`}>{t(`${V}.unavailable`)}</td>;
          const c = priorChange(a.forecastCents, a.lastYearCents, priorAvail(y.year));
          return (
            <td key={y.year} className={y.year >= currentYear ? "rv-now" : ""}>
              <span className={k === "all" ? "font-semibold" : ""}>{money(a.forecastCents)}</span>
              {partial ? <small className="rv-partial">{t(`${V}.partial`)}</small> :
                <span className={`rv-chg ${c.state !== "pct" ? "rv-muted" : c.value >= 0 ? "rv-pos" : "rv-neg"}`}>
                {c.state === "unloaded" ? t(`${V}.yoy.priorUnavailable`) : c.state === "fromZero" ? t(`${V}.glance.noPrior`) : pct(c.value, { signed: true, digits: 1 })}
                </span>}
            </td>
          );
        })}
        <td className={`rv-year ${g === null ? "rv-muted" : g >= 0 ? "rv-pos" : "rv-neg"}`}>{g === null ? "\u2014" : pct(g, { signed: true, digits: 1 })}</td>
        <td>{spark(k)}</td>
      </tr>
    );
  }

  const seasonKeys: Key[] = ["all", ...keys];
  const seasonSeries = (season === "all" ? trends.monthsByStream.all : trends.monthsByStream[season]) ?? [];
  const lastThree = [currentYear - 2, currentYear - 1, currentYear];
  const missing: number[] = [];
  const lines: SeasonLine[] = [];
  for (const y of lastThree) {
    const meta = years.find(r => r.year === y);
    const data = seasonSeries.find(s => s.year === y);
    if (!meta || !data || (y !== currentYear && !avail.get(y))) { missing.push(y); continue; }
    const closedIdx = closedIndex(meta.closedThrough);
    lines.push({ year: y, months: data.months, closedIdx, isCurrent: y === currentYear,
      firstIndex: y === currentYear && currentPartial ? closedIdx + 1 : 0 });
  }

  return (
    <div className="rv-view rv-fade-in" data-testid="revenue-yoy">
      <section className="rv-card" aria-labelledby="rv-yoy-title">
        <div className="rv-card-pad border-b">
          <h3 id="rv-yoy-title" className="rv-card-title">{t(`${V}.yoy.title`)}</h3>
          <p className="text-xs rv-muted mt-0.5">{t(`${V}.yoy.subtitle`)}</p>
        </div>
        <div className="rv-scroller" tabIndex={0} role="region" aria-label={t(`${V}.yoy.scrollLabel`)}>
          <table className="rv-grid rv-yoy rv-yoy-grid" data-testid="revenue-yoy-table">
            <thead>
              <tr>
                <th scope="col" className="rv-sticky">{t(`${V}.glance.colStream`)}</th>
                {years.map(y => (
                  <th key={y.year} scope="col" className={y.year >= currentYear ? "rv-now" : ""}>
                    {y.year}{y.year >= currentYear && <span className="ml-1 normal-case font-normal">{t(`${V}.yoy.fcst`)}</span>}
                  </th>
                ))}
                <th scope="col" className="rv-year">{t(`${V}.yoy.avgGrowth`)}</th>
                <th scope="col">{t(`${V}.yoy.trend`)}</th>
              </tr>
            </thead>
            <tbody>{keys.map(k => row(k))}</tbody>
            <tfoot>
              {row("all")}
              <tr data-testid="row-yoy-recurring">
                <th scope="row" className="rv-sticky">{t(`${V}.glance.recurringShare`)}</th>
                {years.map(y => (
                  <td key={y.year} className={y.year >= currentYear ? "rv-now" : ""}>
                    {avail.get(y.year) ? pct(y.recurringSharePct) ?? "\u2014" : <span className="rv-cell-unavailable">{t(`${V}.unavailable`)}</span>}
                  </td>
                ))}
                <td className="rv-year" /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rv-card rv-card-pad" aria-labelledby="rv-season-title" data-testid="revenue-seasonality">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 id="rv-season-title" className="rv-card-title">{t(`${V}.yoy.seasonality`)}</h3>
            <p className="text-xs rv-muted mt-0.5">{t(`${V}.yoy.seasonalitySub`)}</p>
          </div>
          <div className="rv-seg" role="group" aria-label={t(`${V}.yoy.seasonPicker`)}>
            {seasonKeys.map(k => (
              <button key={k} type="button" aria-pressed={season === k} onClick={() => setSeason(k)} data-testid={`button-season-${k}`}>{label(k)}</button>
            ))}
          </div>
        </div>
        <RevenueSeasonalityChart lines={lines} monthNames={names}
          ariaLabel={t(`${V}.yoy.seasonAria`, { stream: label(season), years: lines.map(l => l.year).join(", ") })} />
        <div className="rv-legend">
          {lines.map(l => <span key={l.year} className="rv-num">{l.year}{l.isCurrent ? ` (${t(`${V}.yoy.openDots`)})` : ""}</span>)}
          {missing.map(y => <span key={y} className="rv-muted" data-testid={`seasonality-missing-${y}`}>{t(`${V}.yoy.yearUnavailable`, { year: y })}</span>)}
          {currentPartial && <span className="rv-muted" data-testid="seasonality-partial">{t(`${V}.yoy.openMonthsOnly`, { year: currentYear })}</span>}
        </div>
      </section>
    </div>
  );
}
