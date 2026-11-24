import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Info, Search, X } from "lucide-react";
import {
  getGetRevenueContractBillingQueryKey,
  useGetRevenueContractBilling,
  type GetRevenueContractBillingParams,
  type RevenueContractBilling,
} from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { ContractDetail } from "@/components/contracts/contractTypes";
import { revenueKey, revenueRequest, type RevenueScope } from "./revenueQueries";
import { downloadCsv, exactMoney, csvAmount, monthTitle, shiftMonth, type CsvValue } from "./revenueContractViews";
import "./revenue-v2.css";
import "./revenue-contracts.css";

type Row = RevenueContractBilling["customers"][number];
const k = (s: string) => `revenueV2.billing.${s}`;

export function RevenueBilling({ scope, today }: { scope: RevenueScope; today: string }) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const params: GetRevenueContractBillingParams = { month };
  const query = useGetRevenueContractBilling(params, {
    query: { queryKey: revenueKey(scope, getGetRevenueContractBillingQueryKey(params)), staleTime: 30_000 },
    request: revenueRequest(scope),
  });
  const data = query.data;
  const label = monthTitle(month, i18n.language);
  const monthName = label.split(" ")[0];

  const lineText = (r: Row) => r.line === "snow" ? t(k("lineSnow")) : r.line === "both" ? t(k("lineBoth")) : t(k("lineLandscape"));
  const feeTag = (isFee: boolean) => isFee ? ` [${t(k("fee"))}]` : "";
  const paymentText = (r: Row) => r.lines.length === 1 ? r.lines[0].component + feeTag(r.lines[0].isFee)
    : r.lines.map(l => `${l.component}${feeTag(l.isFee)} ${exactMoney(l.amountCents)}`).join("; ");

  const rows = useMemo(() => {
    const all = data?.customers ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(r => [r.customerName, r.seasonLabel, ...r.lines.map(l => l.component)].join(" ").toLowerCase().includes(needle));
  }, [data, q]);
  const shownTotal = rows.reduce((s, r) => s + r.amountCents, 0);

  function exportCsv() {
    const out: CsvValue[][] = [[t(k("colCustomer")), t(k("colContract")), t(k("colLines")), t(k("colAmount")), t(k("colFees")), t(k("colInvoiced"))]];
    let feeTotal = 0;
    for (const r of rows) {
      const fees = r.lines.filter(l => l.isFee).reduce((s, l) => s + l.amountCents, 0);
      feeTotal += fees;
      out.push([r.customerName, `${r.seasonLabel} ${lineText(r)}${r.notRenewing ? ` (${t(k("notRenewing"))})` : ""}`, paymentText(r), csvAmount(r.amountCents), csvAmount(fees), ""]);
    }
    out.push([t(k("total")), "", "", csvAmount(shownTotal), csvAmount(feeTotal), ""]);
    downloadCsv(t(k("csvFile"), { month }), out);
  }

  const totals = data?.totals;

  return (
    <div className="rv-view" data-testid="revenue-billing">
      <div className="rvc-toolbar">
        <div className="rvc-stepper" role="group" aria-label={label}>
          <button type="button" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label={t(k("prevMonth"))} data-testid="button-billing-prev-month"><ChevronLeft size={16} /></button>
          <span className="rvc-stepper-label" aria-live="polite" data-testid="text-billing-month">{label}</span>
          <button type="button" onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label={t(k("nextMonth"))} data-testid="button-billing-next-month"><ChevronRight size={16} /></button>
        </div>
        <button type="button" className="rvc-btn" onClick={exportCsv} disabled={!data || rows.length === 0} data-testid="button-billing-export">
          <Download size={14} /> {t(k("exportCsv"))}
        </button>
      </div>

      {query.isError ? (
        <div className="rv-card rvc-state" role="alert" data-testid="status-billing-error">
          <p>{t(k("error"))}</p>
          <button type="button" className="rvc-btn" onClick={() => void query.refetch()} data-testid="button-billing-retry">{t(k("retry"))}</button>
        </div>
      ) : !data || !totals ? (
        <div className="rv-view" data-testid="status-billing-loading" aria-busy="true">
          <div className="rv-kpis">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <div className="rv-kpis rv-fade-in">
            <div className="rv-card rv-kpi" style={{ "--rv-accent": "var(--rv-contract)" } as CSSProperties}>
              <span className="rv-eyebrow">{t(k("contractBilling"))}</span>
              <span className="rv-kpi-value rv-num" data-testid="text-billing-total">{exactMoney(totals.amountCents)}</span>
              <span className="rvc-split rv-num">
                <span><i className="rv-dot" style={{ background: "var(--rv-contract)" }} />{t(k("landscape"))} <b data-testid="text-billing-landscape">{exactMoney(totals.landscapeCents)}</b></span>
                <span><i className="rv-dot" style={{ background: "var(--rv-snow)" }} />{t(k("snowFlat"))} <b data-testid="text-billing-snow">{exactMoney(totals.flatSnowCents)}</b></span>
                <span><i className="rv-dot" style={{ background: "var(--rv-other)" }} />{t(k("fees"))} <b data-testid="text-billing-fees">{exactMoney(totals.feeCents)}</b></span>
              </span>
            </div>
            <div className="rv-card rv-kpi" style={{ "--rv-accent": "var(--rv-irrigation)" } as CSSProperties}>
              <span className="rv-eyebrow">{t(k("customersBilling"))}</span>
              <span className="rv-kpi-value rv-num" data-testid="text-billing-customers">{new Set(data.customers.map(c => c.customerId)).size}</span>
              <span className="rv-kpi-sub">{t(k("customersSub"), { count: data.customers.length })}</span>
            </div>
            <div className="rv-card rv-kpi" style={{ "--rv-accent": "var(--rv-projects)" } as CSSProperties}>
              <span className="rv-eyebrow">{t(k("ytd"))}</span>
              <span className="rv-kpi-value rv-num" data-testid="text-billing-ytd">{exactMoney(data.yearToDateCents)}</span>
              <span className="rv-kpi-sub">{t(k("ytdSub"), { month: monthName })}</span>
            </div>
            <div className="rv-card rv-kpi" style={{ "--rv-accent": "var(--rv-all)" } as CSSProperties}>
              <span className="rv-eyebrow">{t(k("fullYear"))}</span>
              <span className="rv-kpi-value rv-num" data-testid="text-billing-full-year">{exactMoney(data.fullYearCents)}</span>
              <span className="rv-kpi-sub">{t(k("fullYearSub"), { year: month.slice(0, 4) })}</span>
            </div>
          </div>

          <p className="rvc-notice" data-testid="text-billing-notice"><Info size={14} aria-hidden />{t(k("notice"), { snowTmCount: data.snowTmCount })}</p>

          <div className="rv-card">
            <div className="rvc-card-head">
              <label className="rvc-search">
                <Search size={14} aria-hidden />
                <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t(k("search"))} aria-label={t(k("search"))} data-testid="input-billing-search" />
              </label>
              <span className="rv-muted text-xs" data-testid="text-billing-shown">{t(k("shown"), { shown: rows.length, total: data.customers.length })}</span>
            </div>
            {data.customers.length === 0 ? (
              <div className="rvc-state" data-testid="status-billing-empty"><p>{t(k("emptyMonth"), { month: label })}</p></div>
            ) : rows.length === 0 ? (
              <div className="rvc-state" data-testid="status-billing-no-match">
                <p>{t(k("emptySearch"), { q })}</p>
                <button type="button" className="rvc-btn" onClick={() => setQ("")} data-testid="button-billing-clear-search"><X size={14} />{t(k("clearSearch"))}</button>
              </div>
            ) : (
              <div className="rv-scroller" tabIndex={0} role="region" aria-label={label}>
                <table className="rvc-table" data-testid="table-billing">
                  <thead><tr>
                    <th scope="col">{t(k("colCustomer"))}</th><th scope="col">{t(k("colContract"))}</th><th scope="col">{t(k("colLines"))}</th>
                    <th scope="col" className="rvc-r">{t(k("colAmount"))}</th><th scope="col" className="rvc-r">{t(k("colInvoiced"))}</th><th scope="col"><span className="sr-only">{t(k("open"))}</span></th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.termId} className="rvc-click" onClick={() => setOpen(r)} data-testid={`row-billing-${r.termId}`}>
                        <th scope="row">
                          <button type="button" className="rvc-link" onClick={e => { e.stopPropagation(); setOpen(r); }} aria-label={t(k("details"), { name: r.customerName })} data-testid={`button-billing-details-${r.termId}`}>{r.customerName}</button>
                        </th>
                        <td>
                          <span className="rvc-season">{r.seasonLabel}</span>
                          <span className={`rvc-chip rvc-chip-${r.line}`}>{lineText(r)}</span>
                          {r.notRenewing && <span className="rvc-chip rvc-chip-warn" data-testid={`status-not-renewing-${r.termId}`}>{t(k("notRenewing"))}</span>}
                        </td>
                        <td data-testid={`text-billing-lines-${r.termId}`}>
                          {r.lines.length === 1 ? (
                            <span>{r.lines[0].component}{r.lines[0].isFee && <span className="rvc-chip rvc-chip-fee">{t(k("fee"))}</span>}</span>
                          ) : (
                            <ul className="rvc-lines">{r.lines.map((l, i) => (
                              <li key={i}><span>{l.component}{l.isFee && <span className="rvc-chip rvc-chip-fee">{t(k("fee"))}</span>}</span><span className="rv-num">{exactMoney(l.amountCents)}</span></li>
                            ))}</ul>
                          )}
                        </td>
                        <td className="rvc-r rv-num rvc-strong" data-testid={`text-billing-amount-${r.termId}`}>{exactMoney(r.amountCents)}</td>
                        <td className="rvc-r rv-muted" data-testid={`text-billing-invoiced-${r.termId}`}>{"\u2014"}</td>
                        <td className="rvc-r">
                          <Link href={`/dashboard/contracts/${encodeURIComponent(r.agreementId)}`} onClick={e => e.stopPropagation()} className="rvc-link rvc-nowrap" aria-label={t(k("openAria"), { name: r.customerName })} data-testid={`link-billing-contract-${r.termId}`}>{t(k("open"))} {"\u203a"}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr>
                    <th scope="row" colSpan={3}>{t(k("total"))}</th>
                    <td className="rvc-r rv-num" data-testid="text-billing-shown-total">{exactMoney(shownTotal)}</td><td /><td />
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Sheet open={!!open} onOpenChange={o => { if (!o) setOpen(null); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="panel-billing-contract">
          {open && <SchedulePanel scope={scope} row={open} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SchedulePanel({ scope, row }: { scope: RevenueScope; row: Row }) {
  const { t, i18n } = useTranslation();
  const detailQ = useQuery<ContractDetail>({
    queryKey: revenueKey(scope, ["contractDetail", row.agreementId]),
    retry: false, staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/contract-center/contracts/${encodeURIComponent(row.agreementId)}`, { ...revenueRequest(scope), signal });
      if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status });
      return res.json();
    },
  });
  const terms = detailQ.data?.terms ?? [];
  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.customerName}</SheetTitle>
        <SheetDescription>{t(k("panelTitle"))}</SheetDescription>
      </SheetHeader>
      <div className="rvc-panel-links">
        <Link href={`/dashboard/contracts/${encodeURIComponent(row.agreementId)}`} className="rvc-btn" data-testid="link-panel-contract-center">{t(k("openContractCenter"))}</Link>
        <Link href={`/dashboard/customers/${encodeURIComponent(row.customerId)}?tab=billing&view=revenue`} className="rvc-btn" data-testid="link-panel-customer-billing">{t(k("customerBilling"))}</Link>
      </div>
      {detailQ.isLoading ? (
        <div className="space-y-2 mt-4" aria-busy="true" aria-label={t(k("panelLoading"))}><Skeleton className="h-6 w-40" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : detailQ.isError ? (
        <div className="rvc-state" role="alert" data-testid="status-panel-error">
          <p>{t(k("panelError"))}</p>
          <button type="button" className="rvc-btn" onClick={() => void detailQ.refetch()} data-testid="button-panel-retry">{t(k("retry"))}</button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {[...terms].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(term => {
            const pay = [...term.billingMonths].sort((a, b) => a.month.localeCompare(b.month) || a.component.localeCompare(b.component));
            const sum = pay.reduce((s, p) => s + p.amountCents, 0);
            return (
              <section key={term.id} className={`rvc-season-block${term.id === row.termId ? " rvc-season-current" : ""}`} data-testid={`section-panel-season-${term.id}`}>
                <header><b>{term.seasonLabel}</b></header>
                {pay.length === 0 ? <p className="rv-muted text-xs">{t(k("noPayments"))}</p> : (
                  <table className="rvc-mini">
                    <tbody>{pay.map((p, i) => (
                      <tr key={i}><td>{monthTitle(p.month.slice(0, 7), i18n.language)}</td>
                        <td>{p.component}{p.isFee && <span className="rvc-chip rvc-chip-fee">{t(k("fee"))}</span>}</td>
                        <td className="rvc-r rv-num">{exactMoney(p.amountCents)}</td></tr>
                    ))}</tbody>
                    <tfoot><tr><td colSpan={2}>{t(k("seasonTotal"))}</td><td className="rvc-r rv-num">{exactMoney(sum)}</td></tr></tfoot>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default RevenueBilling;
