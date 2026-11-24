import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { getGetRevenueContractsByCustomerQueryKey, useGetRevenueContractsByCustomer, type GetRevenueContractsByCustomerParams } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { revenueKey, revenueRequest, type RevenueScope } from "./revenueQueries";
import { money, monthLabels } from "./revenueFormat";
import "./revenue-v2.css";
import "./revenue-contracts.css";

type Line = "all" | "contract" | "snow" | "fee";
const LINES: Line[] = ["all", "contract", "snow", "fee"];
const PARTS = ["contract", "snow", "fee"] as const;
const PART_VAR = { contract: "var(--rv-contract)", snow: "var(--rv-snow)", fee: "var(--rv-other)" };
const k = (s: string) => `revenueV2.customers.${s}`;
const zero = () => Array<number>(12).fill(0);

export function RevenueCustomers({ scope, today, year, years, onYearChange }: {
  scope: RevenueScope; today: string; year: number; years: number[]; onYearChange: (y: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const [line, setLine] = useState<Line>("all");
  const [q, setQ] = useState("");
  const params: GetRevenueContractsByCustomerParams = { year, line };
  const query = useGetRevenueContractsByCustomer(params, {
    query: { queryKey: revenueKey(scope, getGetRevenueContractsByCustomerQueryKey(params)), staleTime: 30_000 },
    request: revenueRequest(scope),
  });
  const data = query.data;
  const months = monthLabels(i18n.language);
  const longMonths = monthLabels(i18n.language, "long");
  const nowIdx = Number(today.slice(0, 4)) === year ? Number(today.slice(5, 7)) - 1 : -1;

  const rows = useMemo(() => {
    const all = data?.customers ?? [];
    const n = q.trim().toLowerCase();
    return n ? all.filter(c => c.customerName.toLowerCase().includes(n)) : all;
  }, [data, q]);

  const agg = useMemo(() => {
    const totals = zero();
    const parts = { contract: zero(), snow: zero(), fee: zero() };
    for (const r of rows) for (let i = 0; i < 12; i++) {
      totals[i] += r.months[i];
      for (const p of PARTS) parts[p][i] += r.breakdown[p][i];
    }
    if (line !== "all") for (const p of PARTS) if (p !== line) parts[p] = zero();
    const max = Math.max(1, ...totals.map((tt, i) => Math.max(tt, PARTS.reduce((s, p) => s + Math.max(0, parts[p][i]), 0))));
    return { totals, parts, max, year: totals.reduce((a, b) => a + b, 0) };
  }, [rows, line]);

  const empty = data && data.customers.length === 0;

  return (
    <div className="rv-view" data-testid="revenue-customers">
      <div className="rvc-toolbar">
        <label className="rvc-select">
          <span className="rv-eyebrow">{t(k("year"))}</span>
          <select value={year} onChange={e => onYearChange(Number(e.target.value))} data-testid="select-customers-year">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="rv-seg" role="group" aria-label={t(k("lineFilter"))}>
          {LINES.map(l => (
            <button key={l} type="button" aria-pressed={line === l} onClick={() => setLine(l)} data-testid={`button-customers-line-${l}`}>{t(k(l))}</button>
          ))}
        </div>
        <label className="rvc-search rvc-push">
          <Search size={14} aria-hidden />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t(k("search"))} aria-label={t(k("search"))} data-testid="input-customers-search" />
        </label>
      </div>

      {query.isError ? (
        <div className="rv-card rvc-state" role="alert" data-testid="status-customers-error">
          <p>{t(k("error"))}</p>
          <button type="button" className="rvc-btn" onClick={() => void query.refetch()} data-testid="button-customers-retry">{t(k("retry"))}</button>
        </div>
      ) : !data ? (
        <Skeleton className="h-96" data-testid="status-customers-loading" />
      ) : empty ? (
        <div className="rv-card rvc-state" data-testid="status-customers-empty">
          <p>{line === "snow" ? (data.hasFlatSnow === false ? t(k("snowEmpty"), { n: data.snowTmCount }) : t(k("snowEmptyGeneric"), { year })) : t(k("empty"), { year })}</p>
          {line !== "all" && <button type="button" className="rvc-btn" onClick={() => setLine("all")} data-testid="button-customers-reset">{t(k("reset"))}</button>}
        </div>
      ) : (
        <div className="rv-card rv-fade-in">
          <div className="rvc-card-head">
            <div className="rv-legend" style={{ marginTop: 0 }}>
              {PARTS.filter(p => line === "all" || line === p).map(p => <span key={p}><i className="rv-dot" style={{ background: PART_VAR[p] }} />{t(k(p))}</span>)}
            </div>
            <span className="rv-muted text-xs" data-testid="text-customers-shown">{t(k("shown"), { shown: rows.length, total: data.customers.length })}</span>
          </div>
          {rows.length === 0 ? (
            <div className="rvc-state" data-testid="status-customers-no-match">
              <p>{t(k("emptySearch"), { q })}</p>
              <button type="button" className="rvc-btn" onClick={() => setQ("")} data-testid="button-customers-clear-search"><X size={14} />{t(k("clearSearch"))}</button>
            </div>
          ) : (
            <div className="rv-scroller" tabIndex={0} role="region" aria-label={t(k("scrollRegion"))} data-testid="scroller-customers">
              <table className="rv-grid rvc-matrix" data-testid="table-customers">
                <thead>
                  <tr className="rvc-bars-row" data-testid="row-customers-bars">
                    <th scope="row" className="rv-sticky rv-eyebrow">{t(k("composition"))}</th>
                    {months.map((m, i) => (
                      <td key={m} className={i === nowIdx ? "rv-now" : undefined}>
                        <div className="rvc-stack" aria-hidden>
                          {PARTS.map(p => {
                            const v = Math.max(0, agg.parts[p][i]);
                            return v ? <span key={p} style={{ height: `${(v / agg.max) * 100}%`, background: PART_VAR[p] }} /> : null;
                          })}
                        </div>
                        <span className="sr-only" data-testid={`text-customers-bar-${i}`}>{t(k("barLabel"), {
                          month: longMonths[i], total: money(agg.totals[i]), contract: money(agg.parts.contract[i]), snow: money(agg.parts.snow[i]), fee: money(agg.parts.fee[i]),
                        })}</span>
                      </td>
                    ))}
                    <td className="rv-year" />
                  </tr>
                  <tr>
                    <th scope="col" className="rv-sticky">{t(k("colCustomer"))}</th>
                    {months.map((m, i) => <th scope="col" key={m} className={i === nowIdx ? "rv-now" : undefined}><abbr title={longMonths[i]} style={{ textDecoration: "none" }}>{m}</abbr></th>)}
                    <th scope="col" className="rv-year">{t(k("colYear"))}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const starts = new Map(r.seasonStarts.filter(s => Number(s.month.slice(0, 4)) === year).map(s => [Number(s.month.slice(5, 7)), s.seasonLabel]));
                    const rowTotal = r.months.reduce((a, b) => a + b, 0);
                    return (
                      <tr key={`${r.customerId}:${r.agreementId}`} data-testid={`row-customers-${r.agreementId}`}>
                        <th scope="row" className="rv-sticky">
                          <Link href={`/dashboard/contracts/${encodeURIComponent(r.agreementId)}`} className="rvc-link" aria-label={t(k("openAria"), { name: r.customerName })} data-testid={`link-customers-contract-${r.agreementId}`}>{r.customerName}</Link>
                        </th>
                        {r.months.map((c, i) => {
                          const season = starts.get(i + 1);
                          const cls = [i === nowIdx ? "rv-now" : "", season ? "rvc-start" : "", c ? "" : "rv-muted"].filter(Boolean).join(" ");
                          return (
                            <td key={i} className={cls || undefined} title={season ? t(k("seasonStarts"), { season }) : undefined}
                              data-season-start={season ? "true" : undefined} data-testid={`cell-customers-${r.agreementId}-${i + 1}`}>
                              <span aria-hidden>{c ? money(c) : "\u00b7"}</span>
                              <span className="sr-only">{t(k("cellLabel"), { name: r.customerName, month: longMonths[i], amount: money(c) })}{season ? `. ${t(k("seasonStarts"), { season })}` : ""}</span>
                            </td>
                          );
                        })}
                        <td className="rv-year" data-testid={`text-customers-year-${r.agreementId}`}>{money(rowTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="rv-total-row">
                    <th scope="row" className="rv-sticky">{t(k("total"))}</th>
                    {agg.totals.map((c, i) => <td key={i} className={i === nowIdx ? "rv-now" : undefined} data-testid={`text-customers-month-total-${i + 1}`}>{money(c)}</td>)}
                    <td className="rv-year" data-testid="text-customers-grand-total">{money(agg.year)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RevenueCustomers;
