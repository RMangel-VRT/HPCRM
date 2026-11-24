import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { RevenueIncome } from "@workspace/api-client-react";
import { RevenueMonthChart } from "./RevenueMonthChart";
import {
  closedIndex, money, monthKind, monthLabels, monthTotal, pct, priorChange, ratioPct, streamKeys, streamVar,
  type PriorChange, type StreamKey,
} from "./revenueFormat";
import "./revenue-v2.css";

export interface RevenueGlanceProps {
  income: RevenueIncome;
  currentYear: number;
  goalCents: number | null;
  priorYearLoaded: boolean;
  goalUnavailable?: boolean;
}

const V = "revenueV2.views";
type Comp = { kind: "earned" | "signed" | "estimated"; v: number };
type Domain = { min: number; max: number };

const comps = (e: number | null, s: number, x: number): Comp[] =>
  [{ kind: "earned" as const, v: e ?? 0 }, { kind: "signed" as const, v: s }, { kind: "estimated" as const, v: x }];
const posSum = (c: Comp[]) => c.reduce((n, p) => n + Math.max(0, p.v), 0);
const negSum = (c: Comp[]) => c.reduce((n, p) => n + Math.min(0, p.v), 0);

/** Signed progress bar on a shared domain: positive parts grow right of zero, credits grow left of it. */
function SignedBar({ color, parts, target, domain, label, tickTestId }: {
  color: string; parts: Comp[]; target: number | null; domain: Domain; label: string; tickTestId: string;
}) {
  const span = domain.max - domain.min;
  const at = (c: number) => ((c - domain.min) / span) * 100;
  let up = 0, down = 0;
  return (
    <div className="rv-bar" style={{ ["--c" as string]: color }} role="img" aria-label={label}>
      {parts.map(p => {
        if (p.v === 0) return null;
        let left: number, width = (Math.abs(p.v) / span) * 100;
        if (p.v > 0) { left = at(up); up += p.v; } else { down += p.v; left = at(down); }
        return <span key={p.kind} className={`rv-bar-seg rv-seg-${p.kind}${p.v < 0 ? " rv-seg-credit" : ""}`}
          style={{ left: `${left}%`, width: `${width}%` }} data-credit={p.v < 0 || undefined} />;
      })}
      {domain.min < 0 && <span className="rv-zero" style={{ left: `${at(0)}%` }} />}
      {target !== null && <span className="rv-tick" data-testid={tickTestId} style={{ left: `${at(target)}%` }} />}
    </div>
  );
}

export function RevenueGlance({ income, currentYear, goalCents, priorYearLoaded, goalUnavailable }: RevenueGlanceProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<StreamKey | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const year = income.year;
  const tense = year < currentYear ? "past" : year > currentYear ? "next" : "current";
  const keys = streamKeys(income.streams);
  const totals = income.totals;
  const fc = totals.forecastCents;
  const partial = income.qboMissing;
  const names = useMemo(() => monthLabels(i18n.language), [i18n.language]);
  const ci = closedIndex(income.closedThrough);
  const streamLabel = (k: StreamKey) => t(`${V}.streams.${k}`);
  const kindLabel = (k: string) => t(`${V}.kinds.${k}`);
  const stream = (k: StreamKey) => income.streams[k]!;
  const lastYear = year - 1;

  const totalParts = comps(totals.earnedCents, totals.signedCents, totals.estimatedCents);
  const rowParts = (k: StreamKey) => { const s = stream(k); return comps(s.earnedCents, s.signedCents, s.estimatedCents); };
  const domain: Domain = {
    min: Math.min(0, negSum(totalParts), ...keys.map(k => negSum(rowParts(k)))),
    max: Math.max(1, posSum(totalParts), totals.targetCents ?? 0, ...keys.map(k => Math.max(posSum(rowParts(k)), stream(k).targetCents ?? 0))),
  };

  const describe = (parts: Comp[], target: number | null) => [
    ...parts.filter(p => p.v !== 0).map(p => `${kindLabel(p.kind)} ${money(p.v)}${p.v < 0 ? ` (${kindLabel("credit")})` : ""}`),
    target !== null ? `${kindLabel("target")} ${money(target)}` : null,
  ].filter(Boolean).join(" \u00b7 ");

  const share = (cents: number) => (fc > 0 ? pct(ratioPct(cents, fc)) ?? "\u2014" : "\u2014");
  const prior = (now: number, before: number) => priorChange(now, before, priorYearLoaded);
  const priorText = (c: PriorChange) =>
    c.state === "unloaded" ? t(`${V}.unavailable`) : c.state === "fromZero" ? t(`${V}.glance.noPrior`) : pct(c.value, { signed: true }) ?? "\u2014";
  const priorTone = (c: PriorChange) => (c.state !== "pct" || partial ? "rv-muted" : c.value >= 0 ? "rv-pos" : "rv-neg");
  const deltaTone = (d: number | null) => (d === null || partial ? "rv-muted" : d >= 0 ? "rv-pos" : "rv-neg");

  // Card 1
  const yoy = prior(fc, totals.lastYearCents);
  const forecastTitle = tense === "past" ? t(`${V}.glance.totalIncome`) : tense === "next" ? t(`${V}.glance.signedEstimated`) : t(`${V}.glance.forecast`);

  // Card 2
  let targetValue: string, targetSub: string, targetTone = "";
  if (tense === "next") {
    if (goalUnavailable) { targetValue = "\u2014"; targetSub = t(`${V}.glance.goalUnavailable`); }
    else if (goalCents === null) { targetValue = "\u2014"; targetSub = t(`${V}.glance.noGoal`); }
    else {
      const gap = goalCents - fc;
      targetValue = money(goalCents);
      targetSub = gap > 0 ? t(`${V}.glance.stillToFind`, { amount: money(gap) }) : t(`${V}.glance.goalCovered`, { amount: money(-gap) });
    }
  } else if (totals.targetCents === null) {
    targetValue = "\u2014"; targetSub = t(`${V}.glance.noTarget`);
  } else {
    const d = fc - totals.targetCents;
    targetValue = d >= 0 ? t(`${V}.glance.aheadBy`, { amount: money(d) }) : t(`${V}.glance.shortBy`, { amount: money(-d) });
    targetTone = deltaTone(d);
    targetSub = partial ? t(`${V}.glance.partialVariance`) : t(`${V}.glance.ofTarget`, { amount: money(totals.targetCents) });
  }

  // Card 3
  let earnedValue: string, earnedSub: string, earnedTitle = t(`${V}.glance.earnedToDate`);
  if (tense === "next") {
    earnedTitle = t(`${V}.glance.alreadySigned`);
    earnedValue = money(totals.signedCents);
    earnedSub = t(`${V}.glance.underContract`, { pct: share(totals.signedCents) });
  } else if (ci < 0) {
    earnedValue = "\u2014"; earnedSub = t(`${V}.glance.noMonthsClosed`);
  } else if (totals.earnedCents === null) {
    if (partial && totals.signedCents !== 0) {
      earnedTitle = t(`${V}.glance.signedFallbackTitle`);
      earnedValue = money(totals.signedCents);
      earnedSub = t(`${V}.glance.signedFallbackSub`);
    } else { earnedValue = t(`${V}.unavailable`); earnedSub = t(`${V}.glance.earnedNotLoaded`); }
  } else {
    earnedValue = money(totals.earnedCents);
    const range = ci === 0 ? names[0] : `${names[0]}\u2013${names[ci]}`;
    earnedSub = t(`${V}.glance.earnedSub`, { range, pct: share(totals.earnedCents) });
  }

  const recurring = fc > 0 ? pct(ratioPct(income.streams.contract.forecastCents, fc)) : null;
  const conc = tense === "current" ? income.concentration : undefined;
  const negativeStreams = keys.filter(k => stream(k).forecastCents < 0);

  function openPanel(k: StreamKey, el: HTMLButtonElement) { triggerRef.current = el; setOpen(k); }

  return (
    <div className="rv-view rv-fade-in" data-testid="revenue-glance">
      <div className="rv-kpis">
        <section className="rv-card rv-kpi" style={{ ["--rv-accent" as string]: "hsl(var(--primary))" }} data-testid="revenue-card-forecast">
          <span className="rv-eyebrow">{forecastTitle}</span>
          <span className="rv-kpi-value rv-num">{money(fc)}</span>
          <span className="rv-kpi-sub">
            {yoy.state === "pct"
              ? <span className={priorTone(yoy)}>{t(`${V}.glance.vsYear`, { pct: pct(yoy.value, { signed: true, digits: 1 }), year: lastYear })}</span>
              : yoy.state === "fromZero" ? t(`${V}.glance.noPriorYear`, { year: lastYear })
              : t(`${V}.glance.lastYearUnavailable`, { year: lastYear })}
          </span>
          {partial && <span className="rv-kpi-sub" data-testid="text-forecast-partial">{t(`${V}.glance.partialAnnual`)}</span>}
        </section>
        <section className="rv-card rv-kpi" style={{ ["--rv-accent" as string]: "var(--rv-tick)" }} data-testid="revenue-card-target">
          <span className="rv-eyebrow">{tense === "next" ? t(`${V}.glance.goal`) : t(`${V}.glance.target`)}</span>
          <span className={`rv-kpi-value rv-num ${targetTone}`}>{targetValue}</span>
          <span className="rv-kpi-sub">{targetSub}</span>
        </section>
        <section className="rv-card rv-kpi" style={{ ["--rv-accent" as string]: "var(--rv-contract)" }} data-testid="revenue-card-earned">
          <span className="rv-eyebrow">{earnedTitle}</span>
          <span className="rv-kpi-value rv-num">{earnedValue}</span>
          <span className="rv-kpi-sub">{earnedSub}</span>
        </section>
        <section className="rv-card rv-kpi" style={{ ["--rv-accent" as string]: "var(--rv-snow)" }} data-testid="revenue-card-recurring">
          <span className="rv-eyebrow">{t(`${V}.glance.recurringShare`)}</span>
          <span className="rv-kpi-value rv-num">{recurring ?? "\u2014"}</span>
          <span className="rv-kpi-sub">{t(`${V}.glance.recurringSub`)}</span>
        </section>
      </div>

      <section className="rv-card rv-card-pad" aria-labelledby="rv-mix-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
          <h3 id="rv-mix-title" className="rv-card-title">{t(`${V}.glance.mixTitle`)}</h3>
          <span className="rv-legend !mt-0" aria-hidden="true">
            <span><span className="rv-dot" style={{ background: "var(--rv-all)" }} />{kindLabel("earned")}</span>
            <span><span className="rv-dot" style={{ background: "color-mix(in srgb, var(--rv-all) 45%, transparent)" }} />{kindLabel("signed")}</span>
            <span><span className="rv-dot rv-seg-estimated" style={{ ["--c" as string]: "var(--rv-all)" }} />{kindLabel("estimated")}</span>
            <span><span className="rv-dot rv-seg-credit" />{kindLabel("credit")}</span>
            {totals.targetCents !== null && <span><span className="rv-dot" style={{ background: "var(--rv-tick)", width: 2 }} />{kindLabel("target")}</span>}
          </span>
        </div>
        {fc > 0 ? (
          <div className="rv-mix" role="img" data-testid="revenue-mix-bar"
            aria-label={keys.filter(k => stream(k).forecastCents > 0).map(k => `${streamLabel(k)} ${share(stream(k).forecastCents)}`).join(", ")}>
            {keys.map(k => {
              const v = stream(k).forecastCents;
              const posTotal = keys.reduce((n, kk) => n + Math.max(0, stream(kk).forecastCents), 0);
              return v > 0 ? <span key={k} style={{ width: `${(v / posTotal) * 100}%`, background: streamVar(k) }} /> : null;
            })}
          </div>
        ) : <p className="text-xs rv-muted" data-testid="text-mix-nonpositive">{t(`${V}.glance.mixNonPositive`)}</p>}
        <div className="rv-legend">
          {keys.map(k => (
            <span key={k}><span className="rv-dot" style={{ background: streamVar(k) }} />{streamLabel(k)}{" "}
              <span className="rv-muted rv-num">{share(stream(k).forecastCents)}</span></span>
          ))}
        </div>
        {negativeStreams.length > 0 && (
          <p className="text-xs rv-neg mt-2" data-testid="text-mix-credit">
            {t(`${V}.glance.mixNegative`, { streams: negativeStreams.map(k => `${streamLabel(k)} ${money(stream(k).forecastCents)}`).join(", ") })}
          </p>
        )}
      </section>

      <section className="rv-card" aria-labelledby="rv-streams-title">
        <h3 id="rv-streams-title" className="sr-only">{t(`${V}.glance.streamsTitle`)}</h3>
        <div className="rv-scroller" tabIndex={0} role="region" aria-labelledby="rv-streams-title">
          <table className="rv-stream-table" data-testid="revenue-glance-streams">
            <colgroup>
              <col className="rv-c-stream" /><col className="rv-c-bar" /><col className="rv-c-num" /><col className="rv-c-num" /><col className="rv-c-num" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{t(`${V}.glance.colStream`)}</th>
                <th scope="col">{t(`${V}.glance.colProgress`)}</th>
                <th scope="col">{t(`${V}.glance.colForecast`)}</th>
                <th scope="col">{t(`${V}.glance.colVsTarget`)}</th>
                <th scope="col">{t(`${V}.glance.colVsYear`, { year: lastYear })}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => {
                const s = stream(k);
                const parts = rowParts(k);
                const dT = s.targetCents === null ? null : s.forecastCents - s.targetCents;
                const dY = prior(s.forecastCents, s.lastYearCents);
                const note = describe(parts, s.targetCents);
                return (
                  <tr key={k} data-testid={`revenue-stream-row-${k}`}>
                    <th scope="row">
                      <button type="button" className="rv-stream-btn" aria-haspopup="dialog" data-testid={`button-stream-${k}`}
                        onClick={e => openPanel(k, e.currentTarget)}>
                        <span className="rv-dot" style={{ background: streamVar(k), margin: 0 }} aria-hidden="true" />{streamLabel(k)}
                      </button>
                      <div className="rv-stream-share">{fc > 0 ? t(`${V}.glance.ofIncome`, { pct: share(s.forecastCents) }) : "\u2014"}</div>
                    </th>
                    <td>
                      <SignedBar color={streamVar(k)} parts={parts} target={s.targetCents} domain={domain} label={note} tickTestId="revenue-target-tick" />
                      <div className="rv-bar-note">{note}</div>
                    </td>
                    <td className="rv-num" data-testid={`text-forecast-${k}`}>
                      {money(s.forecastCents)}{partial && <small className="rv-partial">{t(`${V}.partial`)}</small>}
                    </td>
                    <td className={deltaTone(dT)}>{dT === null ? t(`${V}.glance.noTargetShort`) : money(dT, { signed: true })}</td>
                    <td className={priorTone(dY)}>{priorText(dY)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr data-testid="revenue-stream-totals">
                <th scope="row">{t(`${V}.allIncome`)}</th>
                <td>
                  <SignedBar color="var(--rv-all)" parts={totalParts} target={totals.targetCents} domain={domain}
                    label={describe(totalParts, totals.targetCents)} tickTestId="revenue-target-tick" />
                  <div className="rv-bar-note">{describe(totalParts, totals.targetCents)}</div>
                </td>
                <td>{money(fc)}{partial && <small className="rv-partial">{t(`${V}.partial`)}</small>}</td>
                <td className={deltaTone(totals.targetCents === null ? null : fc - totals.targetCents)}>
                  {totals.targetCents === null ? t(`${V}.glance.noTargetShort`) : money(fc - totals.targetCents, { signed: true })}
                </td>
                <td className={priorTone(yoy)}>{priorText(yoy)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {partial && <p className="rv-card-pad !pt-0 text-xs rv-muted">{t(`${V}.glance.partialTableNote`)}</p>}
      </section>

      <div className="rv-split">
        <section className="rv-card rv-card-pad" aria-labelledby="rv-bymonth-title">
          <div className="flex items-baseline justify-between mb-3">
            <h3 id="rv-bymonth-title" className="rv-card-title">{t(`${V}.glance.byMonth`)}</h3>
            {income.targetMonths && <span className="text-xs rv-muted">{t(`${V}.glance.dashedTarget`)}</span>}
          </div>
          <RevenueMonthChart
            rows={keys.map(k => ({ key: k, months: stream(k).months }))}
            targetMonths={income.targetMonths}
            monthNames={names}
            currentIndex={tense === "current" ? ci + 1 : -1}
            ariaLabel={t(`${V}.glance.byMonthAria`, { year })}
            netLabel={t(`${V}.glance.net`)}
            targetLabel={kindLabel("target")}
          />
        </section>

        {conc && (
          <section className="rv-card rv-card-pad" aria-labelledby="rv-risk-title" data-testid="revenue-risk">
            <h3 id="rv-risk-title" className="rv-card-title mb-2">{t(`${V}.glance.riskTitle`)}</h3>
            <div className="rv-eyebrow mt-3 mb-1">{t(`${V}.glance.topCustomers`)}</div>
            {conc.top5.length === 0 && <p className="text-xs rv-muted">{t(`${V}.glance.noContractIncome`)}</p>}
            {conc.top5.map(c => (
              <div key={c.customerId} className="rv-risk-row" data-testid={`risk-customer-${c.customerId}`}>
                <span className="truncate">{c.customerName}</span>
                <span className="rv-num rv-muted">{money(c.cents)} <b className="text-foreground">{pct(c.shareOfContractPct, { digits: 1 }) ?? "\u2014"}</b></span>
              </div>
            ))}
            <div className="rv-eyebrow mt-4 mb-1">{t(`${V}.glance.exposure`)}</div>
            <div className="rv-risk-row"><span>{t(`${V}.glance.theirForms`)}</span><b className="rv-num">{pct(conc.theirFormSharePct, { digits: 1 }) ?? "\u2014"}</b></div>
            <div className="rv-risk-row"><span>{t(`${V}.glance.weatherShare`)}</span><b className="rv-num">{pct(conc.snowSharePct, { digits: 1 }) ?? "\u2014"}</b></div>
            <p className="text-xs rv-muted mt-2">
              {conc.snowRange.minCents !== null && conc.snowRange.maxCents !== null
                ? t(`${V}.glance.snowRange`, { min: money(conc.snowRange.minCents), max: money(conc.snowRange.maxCents), years: conc.snowRange.years.join(", ") })
                : t(`${V}.glance.snowRangeNone`)}
            </p>
          </section>
        )}
      </div>

      <p className="text-xs rv-muted leading-relaxed" data-testid="revenue-footnote">{t(`${V}.glance.footnote`)}</p>

      <DialogPrimitive.Root open={open !== null} onOpenChange={o => !o && setOpen(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md overflow-y-auto border-l bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
            data-testid="revenue-stream-panel"
            onCloseAutoFocus={e => { e.preventDefault(); triggerRef.current?.focus(); }}>
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={t(`${V}.panel.close`)} data-testid="button-close-stream-panel">
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>
            {open && (() => {
              const s = stream(open);
              return (
                <>
                  <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-semibold pr-8">
                    <span className="rv-dot" style={{ background: streamVar(open), margin: 0 }} aria-hidden="true" />{`${streamLabel(open)} \u00b7 ${year}`}
                  </DialogPrimitive.Title>
                  <div className="rv-eyebrow mt-4">{t(`${V}.panel.sourcesHeading`)}</div>
                  <DialogPrimitive.Description className="text-sm rv-muted mt-1">{t(`${V}.sources.${open}`)}</DialogPrimitive.Description>
                  {open === "contract" && <p className="text-xs rv-muted mt-3">{t(`${V}.glance.byCustomerSoon`)}</p>}
                  <table className="w-full mt-4 text-sm rv-num">
                    <caption className="sr-only">{t(`${V}.panel.caption`, { stream: streamLabel(open), year })}</caption>
                    <thead>
                      <tr className="border-b text-xs rv-muted">
                        <th scope="col" className="py-1 text-left font-medium">{t(`${V}.panel.month`)}</th>
                        <th scope="col" className="py-1 text-left font-medium">{t(`${V}.panel.kind`)}</th>
                        <th scope="col" className="py-1 text-right font-medium">{t(`${V}.panel.amount`)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.months.map((m, i) => {
                        const kind = monthKind(m, i <= ci, partial);
                        return (
                          <tr key={m.month} className="border-b" data-testid={`panel-month-${i}`}>
                            <th scope="row" className="py-2 text-left font-normal">{names[i]}</th>
                            <td className="py-2 text-xs rv-muted">{kindLabel(kind)}</td>
                            <td className={`py-2 text-right ${kind === "earned" ? "rv-cell-earned" : kind === "estimated" ? "rv-cell-estimated" : ""}`}>
                              {kind === "unavailable" ? t(`${V}.unavailable`) : kind === "mixed" ? (
                                <span className="rv-cell-stack"><span>{money(m.signedCents)}</span><small className="rv-cell-estimated">{money(m.estimatedCents, { signed: true })}</small></span>
                              ) : money(monthTotal(m))}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="font-semibold">
                        <th scope="row" className="py-2 text-left">{t(`${V}.year`)}</th><td />
                        <td className="py-2 text-right">{money(s.forecastCents)}{partial && <small className="rv-partial">{t(`${V}.partial`)}</small>}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              );
            })()}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
