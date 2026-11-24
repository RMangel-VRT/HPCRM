import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RevenueIncome, RevenueTargets } from "@workspace/api-client-react";
import { closedIndex, money, monthKind, monthLabels, monthTotal, streamKeys, streamVar, type StreamKey } from "./revenueFormat";
import "./revenue-v2.css";

export interface RevenueMonthlyProps {
  income: RevenueIncome;
  targets: RevenueTargets | null | undefined;
  /** Colorado YYYY-MM-DD */
  today: string;
}

type Mode = "forecast" | "target" | "delta";
const V = "revenueV2.views";

export function RevenueMonthly({ income, targets, today }: RevenueMonthlyProps) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>("forecast");
  const names = useMemo(() => monthLabels(i18n.language), [i18n.language]);
  const year = income.year;
  const todayYear = Number(today.slice(0, 4));
  const nowIdx = year === todayYear ? Number(today.slice(5, 7)) - 1 : -1;
  const ci = closedIndex(income.closedThrough);
  const keys = streamKeys(income.streams);
  const hasTargets = income.targetMonths !== null;
  const stream = (k: StreamKey) => income.streams[k]!;
  const label = (k: StreamKey) => t(`${V}.streams.${k}`);

  /** Stream target per month from the targets grid. The grid zero-fills streams with no rows,
   * so stream.targetCents (null = no rows) decides whether a stream has a target. Other never does. */
  const targetOf = (k: StreamKey, i: number): number | null => {
    if (k === "other" || stream(k).targetCents === null || !targets || targets.year !== year) return null;
    return targets.streams[k][i] ?? null;
  };
  const targetYear = (k: StreamKey): number | null => (k === "other" ? null : stream(k).targetCents);

  const partial = income.qboMissing;
  const unavailableMonth = (i: number) => i <= ci && partial;
  const colTotals = names.map((_, i) => keys.reduce((n, k) => n + monthTotal(stream(k).months[i]), 0));
  const colSigned = names.map((_, i) => keys.reduce((n, k) => n + stream(k).months[i].signedCents, 0));
  const running = colTotals.reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], []);
  const partialTag = <small className="rv-partial">{t(`${V}.partial`)}</small>;
  const signedOnly = (v: number) => (
    <span className="rv-cell-stack" title={t(`${V}.monthly.notLoadedTitle`)}>
      <span className="rv-cell-signed">{money(v)}</span><small className="rv-muted">{t(`${V}.monthly.signedOnly`)}</small>
    </span>
  );
  const notLoaded = <span className="rv-cell-unavailable" title={t(`${V}.monthly.notLoadedTitle`)}>{t(`${V}.unavailable`)}</span>;

  const thClass = (i: number) => (i === nowIdx ? "rv-now" : "");
  const deltaCell = (v: number | null, tentative = false) =>
    v === null ? <span className="rv-muted">{"\u2014"}</span>
      : <span className={tentative ? "rv-muted" : v >= 0 ? "rv-pos" : "rv-neg"}>{money(v, { signed: true })}{tentative && partialTag}</span>;

  function forecastCell(k: StreamKey, i: number) {
    const m = stream(k).months[i];
    const kind = monthKind(m, i <= ci, income.qboMissing);
    if (kind === "unavailable") return notLoaded;
    if (kind === "partial") return signedOnly(m.signedCents);
    if (kind === "mixed") return (
      <span className="rv-cell-stack" title={`${t(`${V}.kinds.signed`)} ${money(m.signedCents)} + ${t(`${V}.kinds.estimated`)} ${money(m.estimatedCents)}`}>
        <span className="rv-cell-signed">{money(m.signedCents)}</span>
        <small className="rv-cell-estimated">{money(m.estimatedCents, { signed: true })}</small>
      </span>
    );
    if (kind === "empty") return <span className="rv-muted">{"\u2014"}</span>;
    const v = monthTotal(m);
    return <span className={`rv-cell-${kind}`} title={t(`${V}.kinds.${kind}`)}>{money(v)}</span>;
  }

  function renderCell(k: StreamKey, i: number) {
    if (mode === "forecast") return forecastCell(k, i);
    const tg = targetOf(k, i);
    if (mode === "target") return tg === null ? <span className="rv-muted">{t(`${V}.monthly.noTargetCell`)}</span> : money(tg);
    if (tg === null) return <span className="rv-muted">{"\u2014"}</span>;
    if (unavailableMonth(i)) return notLoaded;
    return deltaCell(monthTotal(stream(k).months[i]) - tg);
  }

  function renderYear(k: StreamKey) {
    const s = stream(k);
    if (mode === "forecast") return <>{money(s.forecastCents)}{partial && partialTag}</>;
    const ty = targetYear(k);
    if (mode === "target") return ty === null ? <span className="rv-muted">{t(`${V}.monthly.noTargetCell`)}</span> : money(ty);
    return deltaCell(ty === null ? null : s.forecastCents - ty, partial);
  }

  const totalCell = (i: number) => {
    if (mode === "forecast") return unavailableMonth(i) ? (colSigned[i] !== 0 ? signedOnly(colSigned[i]) : notLoaded) : money(colTotals[i]);
    const tg = income.targetMonths?.[i] ?? null;
    if (mode === "target") return tg === null ? "\u2014" : money(tg);
    if (unavailableMonth(i)) return notLoaded;
    return deltaCell(tg === null ? null : colTotals[i] - tg);
  };
  const totalYear = () => {
    const tt = income.totals;
    if (mode === "forecast") return <>{money(tt.forecastCents)}{partial && partialTag}</>;
    if (mode === "target") return tt.targetCents === null ? "\u2014" : money(tt.targetCents);
    return deltaCell(tt.targetCents === null ? null : tt.forecastCents - tt.targetCents, partial);
  };

  const showEmpty = mode !== "forecast" && !hasTargets;
  const modes: Mode[] = ["forecast", "target", "delta"];

  return (
    <div className="rv-view rv-fade-in" data-testid="revenue-monthly">
      <section className="rv-card" aria-labelledby="rv-monthly-title">
        <div className="rv-card-pad flex flex-wrap items-center justify-between gap-3 border-b">
          <div>
            <h3 id="rv-monthly-title" className="rv-card-title">{t(`${V}.monthly.title`, { year })}</h3>
            <p className="text-xs rv-muted mt-0.5">
              <span className="rv-cell-earned">{t(`${V}.kinds.earned`)}</span>{" \u00b7 "}
              <span>{t(`${V}.kinds.signed`)}</span>{" \u00b7 "}
              <span className="rv-cell-estimated">{t(`${V}.kinds.estimated`)}</span>
            </p>
          </div>
          <div className="rv-seg" role="group" aria-label={t(`${V}.monthly.modeLabel`)}>
            {modes.map(m => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`button-month-mode-${m}`}>
                {t(`${V}.monthly.modes.${m}`)}
              </button>
            ))}
          </div>
        </div>

        {showEmpty ? (
          <div className="rv-card-pad py-12 text-center" data-testid="revenue-monthly-no-target">
            <p className="font-semibold">{t(`${V}.monthly.noTarget`, { year })}</p>
            <p className="text-sm rv-muted mt-1" data-testid="text-plan-pointer">{t(`${V}.monthly.planPointer`)}</p>
          </div>
        ) : (
          <div className="rv-scroller" tabIndex={0} role="region" aria-label={t(`${V}.monthly.scrollLabel`, { year })} data-testid="revenue-month-scroller">
            <table className="rv-grid" data-testid="revenue-month-grid">
              <thead>
                <tr>
                  <th scope="col" className="rv-sticky">{t(`${V}.glance.colStream`)}</th>
                  {names.map((n, i) => <th key={n} scope="col" className={thClass(i)} aria-current={i === nowIdx ? "date" : undefined}>{n}</th>)}
                  <th scope="col" className="rv-year">{t(`${V}.year`)}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k} data-testid={`row-month-${k}`}>
                    <th scope="row" className="rv-sticky">
                      <span className="rv-dot" style={{ background: streamVar(k) }} />{label(k)}
                      {mode !== "forecast" && k === "other" && <span className="block text-[11px] rv-muted font-normal">{t(`${V}.monthly.otherNoTarget`)}</span>}
                    </th>
                    {names.map((_, i) => <td key={i} className={thClass(i)}>{renderCell(k, i)}</td>)}
                    <td className="rv-year">{renderYear(k)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="rv-total-row" data-testid="row-month-total">
                  <th scope="row" className="rv-sticky">{t(`${V}.allIncome`)}</th>
                  {names.map((_, i) => <td key={i} className={thClass(i)}>{totalCell(i)}</td>)}
                  <td className="rv-year">{totalYear()}</td>
                </tr>
                {mode === "forecast" && (
                  <tr className="rv-running" data-testid="row-month-running">
                    <th scope="row" className="rv-sticky">{t(`${V}.monthly.running`)}</th>
                    {running.map((v, i) => <td key={i} className={thClass(i)}>
                      {partial && i <= ci ? notLoaded : <>{money(v)}{partial && partialTag}</>}
                    </td>)}
                    <td className="rv-year" />
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </section>
      {partial && <p className="text-xs rv-muted" data-testid="text-monthly-partial">{t(`${V}.monthly.partialNote`)}</p>}
      {mode !== "forecast" && hasTargets && keys.some(k => k !== "other" && stream(k).targetCents === null) && (
        <p className="text-xs rv-muted">{t(`${V}.monthly.optionalNote`)}</p>
      )}
    </div>
  );
}
