import { useState } from "react";
import { RateHistoryNote } from "./RateHistoryNote";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MONTH_LETTERS, coloradoDay, coloradoToday, dateOnly, dateTime, monthName, money } from "./contractFormat";
import { cardRateRows, isCustomRate, rateDisplay } from "./RatesEditor";
import { useScopedRateCard } from "./useRateCard";
import { equal12, msi } from "./paymentPresets";
import { linesFromBilling, lineSum, startMonthOf } from "./paymentDraft";
import { calendarTimed, type ScopeRow } from "./ScopeEditor";
import { standardRoundCount, type PackageCalendarEntry } from "@workspace/api-zod/contractScope";
import { FeeTag } from "./PaymentEditor";
import { ExplicitScheduleEditor } from "./ExplicitScheduleEditor";
import { explicitFromBilling } from "./explicitSchedule";
import type { AgreementLine, DetailTerm, TermRateRow } from "./contractTypes";

export type PanelId = "billing" | "documents" | "details" | "scope" | "rates" | "history";
export type EditPanel = "billing" | "details" | "scope" | "rates";
export const PANEL_LABEL: Record<PanelId, string> = {
  billing: "Billing", documents: "Documents", details: "Contract details", scope: "Scope", rates: "Rates", history: "History",
};

/** Resolves "#term-<id>" plus any legacy suffix ("#term-<id>-rates", "#term-<id>&tab=scope") to a known season id. */
export function resolveTermHash(hash: string, ids: string[]): string | null {
  if (!hash.startsWith("#term-")) return null;
  const rest = hash.slice(6);
  if (ids.includes(rest)) return rest;
  const hits = ids.filter(id => rest.startsWith(id) && /[^A-Za-z0-9_]/.test(rest.charAt(id.length)));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Card wording for a season's display status. */
export function statusWords(t: DetailTerm): string {
  switch (t.displayStatus) {
    case "active": return "In effect";
    case "signed": return `Signed, starts ${dateOnly(t.startDate)}`;
    case "renewed": return "Renewed";
    case "expired": return "Expired";
    case "lost": return "Lost";
    case "cancelled": return "Cancelled";
    case "sent": return "Sent, awaiting signature";
    case "draft": return "Draft";
    default: return t.displayStatus;
  }
}

const dayNum = (d: string) => { const [y, m, dd] = d.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, dd) / 86400000; };
/** Colorado calendar days from today to a date-only value (negative when past). */
export const daysUntil = (day: string) => Math.round(dayNum(day) - dayNum(coloradoToday()));

/** Fee components (billed monthly, outside the contract price): server figure first, else the pattern year. */
export function feeSummary(t: Pick<DetailTerm, "billingMonths" | "feesAnnualCents"> & Partial<Pick<DetailTerm, "paymentSchedule" | "startDate">>): { cents: number; names: string[] } {
  const rows = t.billingMonths.filter(b => b.isFee);
  const names = [...new Set(rows.map(b => b.component))];
  const start = t.startDate?.slice(0, 7) + "-01";
  const annualRows = t.paymentSchedule === "explicit" && t.startDate ? rows.filter(b => {
    const offset = (Number(b.month.slice(0, 4)) - Number(t.startDate!.slice(0, 4))) * 12 + Number(b.month.slice(5, 7)) - Number(t.startDate!.slice(5, 7));
    return b.month >= start && offset < 12;
  }) : rows;
  const cents = t.feesAnnualCents ?? linesFromBilling(annualRows).reduce((s, l) => s + lineSum(l), 0);
  return { cents, names };
}

export function monthlyOf(t: DetailTerm): number | null {
  const rows = t.billingMonths.filter(b => !b.isFee);
  if (!rows.length) return t.annualPriceCents != null ? Math.round(t.annualPriceCents / 12) : null;
  const first = rows.map(b => b.month).sort()[0];
  return rows.filter(b => b.month === first).reduce((s, b) => s + b.amountCents, 0);
}

export function paymentPattern(t: DetailTerm): string | null {
  const lines = linesFromBilling(t.billingMonths.filter(b => !b.isFee));
  if (!lines.length) return t.billingType === "equal_monthly" ? "12 equal payments" : null;
  const totals = Array.from({ length: 12 }, (_, i) => lines.reduce((s, l) => s + l.months[i], 0));
  const total = totals.reduce((s, n) => s + n, 0);
  const matches = (amounts: number[]) => totals.every((v, i) => v === amounts[i]);
  // Preset names are not persisted: recognize the actual calendar-indexed pattern,
  // including its final-month rounding, instead of inventing a billingType enum.
  if (total > 0 && matches(msi(total, startMonthOf(t.startDate)).amounts)) return "MSI 10% / 5%";
  if (total > 0 && matches(equal12(total, startMonthOf(t.startDate)).amounts)) return "12 equal payments";
  const paid = totals.filter(v => v > 0);
  if (paid.length && paid.every(v => v === paid[0])) return `${paid.length} equal payment${paid.length === 1 ? "" : "s"}`;
  return "Variable";
}

/** Contract-year cells (start month first) with combined and per-component amounts. */
export function contractYear(t: DetailTerm) {
  const [sy, sm] = t.startDate.split("-").map(Number);
  const since = (m: string) => { const [y, mo] = m.split("-").map(Number); return (y - sy) * 12 + mo - sm; };
  return Array.from({ length: 12 }, (_, i) => {
    const rows = t.billingMonths.filter(b => since(b.month) === i);
    return { month: ((sm - 1 + i) % 12) + 1, amount: rows.reduce((s, b) => s + b.amountCents, 0) };
  });
}

export function Panel({ id, title, meta, editable, editing, onEdit, editDisabled, children, actions }: {
  id: PanelId; title: string; meta?: ReactNode; editable?: boolean; editing?: boolean; onEdit?: () => void; editDisabled?: boolean;
  children: ReactNode; actions?: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card text-card-foreground flex flex-col", editing && "ring-2 ring-primary/40 border-primary/50")}
      data-testid={`panel-${id}`} aria-label={title}>
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {meta && <span className="text-xs text-muted-foreground truncate" data-testid={`text-panel-meta-${id}`}>{meta}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          {editable && !editing && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit} disabled={editDisabled} data-testid={`button-edit-${id}`}>
              <Pencil className="w-3.5 h-3.5 mr-1" />Edit
            </Button>
          )}
        </div>
      </header>
      <div className="p-4 space-y-3 min-w-0 flex-1">{children}</div>
    </section>
  );
}

export function PanelEditBar({ id, saving, canSave, onSave, onCancel, problems }: {
  id: EditPanel; saving: boolean; canSave: boolean; onSave: () => void; onCancel: () => void; problems: string[];
}) {
  return (
    <div className="space-y-2 border-t pt-3">
      {problems.map((p, i) => <p key={i} className="text-sm text-destructive" role="alert" data-testid={`error-panel-${id}`}>{p}</p>)}
      <div className="flex gap-2">
        <Button size="sm" disabled={saving || !canSave} onClick={onSave} data-testid={id === "billing" ? "button-save-payments" : `button-save-${id}`}>{saving ? "Saving..." : "Save"}</Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={onCancel} data-testid={`button-cancel-${id}`}>Cancel</Button>
      </div>
    </div>
  );
}

export function Tile({ id, label, value, sub }: { id: string; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-4 py-3" data-testid={`tile-${id}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight" data-testid={`text-tile-${id}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground" data-testid={`text-tile-${id}-sub`}>{sub}</div>}
    </div>
  );
}

export function BillingSummary({ term, snow, snowLineOnly }: { term: DetailTerm; snow: boolean; snowLineOnly: boolean }) {
  const { t } = useTranslation();
  const tm = snow && term.snowPricing !== "flat_rate";
  if (snowLineOnly && tm && !term.billingMonths.some(b => b.isFee)) {
    return <p className="text-sm" data-testid="text-snow-billing">Billed per event (time and materials)</p>;
  }
  const components = [...new Set(term.billingMonths.map(b => b.component))];
  const feeSet = new Set(term.billingMonths.filter(b => b.isFee).map(b => b.component));
  const fees = feeSummary(term);
  const explicit = term.paymentSchedule === "explicit";
  const cells = contractYear(term);
  const max = Math.max(1, ...cells.map(c => c.amount));
  const nowMonth = Number(coloradoToday().slice(5, 7));
  const inSeason = daysUntil(term.startDate) <= 0 && daysUntil(term.endDate) >= 0;
  const total = cells.reduce((s, c) => s + c.amount, 0);
  const paid = cells.filter(c => c.amount > 0).length;
  return (
    <div className="space-y-3" data-testid="tab-billing-body">
      {snow && (
        <p className="text-sm" data-testid="text-snow-billing">
          {tm ? "Snow billed per event (time and materials)" : `Flat rate ${money(term.snowFlatPriceCents)}, paid on the Snow line`}
        </p>
      )}
      {!components.length ? <p className="text-sm text-muted-foreground" data-testid="empty-billing">No payment lines.</p> : (
        <>
          <ul className="divide-y text-sm">
            {components.map(c => (
              <li key={c} className={cn("flex justify-between py-1.5", feeSet.has(c) && "text-muted-foreground")} data-testid={`billing-line-${c}`}>
                <span className="truncate">{c}{feeSet.has(c) && <FeeTag testId={`tag-fee-${c}`} />}</span>
                <span className="tabular-nums">{money(explicit
                  ? term.billingMonths.filter(b => b.component === c).reduce((s, b) => s + b.amountCents, 0)
                  : lineSum(linesFromBilling(term.billingMonths.filter(b => b.component === c))[0]))}</span>
              </li>
            ))}
          </ul>
          {fees.cents > 0 && (
            <p className="text-sm" data-testid="text-contract-split">
              {t("contractFees.split", { contract: money(term.annualPriceCents), fees: money(fees.cents), names: fees.names.join(", ") })}
            </p>
          )}
          {(term.durationMonths ?? 0) > 12 && term.contractTotalCents != null && (
            <p className="text-sm" data-testid="text-billing-contract-total">{t("contractFees.contractTotalLine", { amount: money(term.contractTotalCents), count: term.durationMonths })}</p>
          )}
          {explicit && (
            <div className="space-y-1" data-testid="billing-explicit">
              <span className="text-xs text-muted-foreground">{t("contractFees.exactSummary")}</span>
              <ExplicitScheduleEditor readOnly draft={explicitFromBilling(term.billingMonths, term.startDate)} onChange={() => {}} startDate={term.startDate} endDate={term.endDate} />
            </div>
          )}
          <div className="grid grid-cols-12 gap-1" data-testid="strip-billing-months">
            {cells.map((x, i) => {
              const current = inSeason && x.month === nowMonth;
              return (
                <div key={i} className="text-center" title={`${monthName(x.month)}: ${money(x.amount)}`} data-testid={`bar-billing-${i}`}>
                  <div className={cn("h-12 flex items-end rounded-sm bg-muted overflow-hidden", current && "ring-1 ring-primary")}>
                    <div className={cn("w-full", current ? "bg-primary" : "bg-primary/55")} style={{ height: `${(x.amount / max) * 100}%` }} />
                  </div>
                  <div className={cn("mt-1 text-[10px]", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{monthName(x.month)}</div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-billing-summary">
            {money(total)} over {paid} payment{paid === 1 ? "" : "s"}, {monthName(cells[0].month)} to {monthName(cells[11].month)}
          </p>
        </>
      )}
    </div>
  );
}

export function DetailsList({ items }: { items: { key: string; label: string; value: string | null | undefined }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="list-contract-details">
      {items.map(i => (
        <div key={i.key} className="contents">
          <dt className="text-xs text-muted-foreground pt-0.5">{i.label}</dt>
          <dd className={cn("min-w-0 break-words whitespace-pre-line", !i.value && "text-muted-foreground")} data-testid={`text-detail-${i.key}`}>{i.value || "\u2014"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ScopeSummary({ rows, calendar = [] }: { rows: ScopeRow[]; calendar?: readonly PackageCalendarEntry[] }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const included = rows.filter(r => r.included);
  if (!included.length) return <p className="text-sm text-muted-foreground" data-testid="empty-scope">No services on this season.</p>;
  const shown = all ? included : included.slice(0, 8);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-scope-summary">
          <thead>
            <tr className="text-[10px] text-muted-foreground">
              <th className="text-left font-normal pb-1">Service</th><th className="text-right font-normal pb-1 pr-3">Qty</th>
              <th className="pb-1"><div className="grid grid-cols-12 w-[9rem] font-normal">{MONTH_LETTERS.map((m, i) => <span key={i} className="text-center">{m}</span>)}</div></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.serviceKey} className="border-t" data-testid={`scope-row-${r.serviceKey}`}>
                <td className="py-1.5 pr-2">{r.label}
                  <div className="text-xs text-muted-foreground">
                    {r.implicitDefault && <span>{t("sc22.default")} · </span>}
                    {((r.packageService && !r.included) || (calendarTimed(r.serviceKey) && r.quantity !== null)) && <span>{t("sc22.differs")} · </span>}
                    {t(r.details.billing === "billed_when_done" ? "sc22.billed" : "sc22.included")}
                    {typeof r.details.billingPrice === "string" && r.details.billingPrice ? ` · ${r.details.billingPrice}` :
                      r.priceCents != null ? ` · ${money(r.priceCents)}` : ""}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </div>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                  {r.quantity ?? (calendarTimed(r.serviceKey) ? t("sc22.standard", { count: standardRoundCount(r.serviceKey, calendar) }) : "\u2014")}
                  {r.unit ? ` ${r.unit}` : ""}</td>
                <td className="py-1.5">
                  <div className="grid grid-cols-12 w-[9rem]" aria-label={`${r.label} months January to December`}>
                    {Array.from({ length: 12 }, (_, i) => {
                      const v = r.monthSpread?.[i] ?? 0;
                      return <span key={i} className="flex justify-center" aria-label={`${monthName(i + 1)}: ${v}`} title={`${monthName(i + 1)}: ${v}`}><span className={cn("h-2 w-2 rounded-full", v > 0 ? "bg-primary" : "bg-muted")} /></span>;
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {included.length > 8 && (
        <Button size="sm" variant="ghost" className="h-auto p-0 text-primary underline-offset-4 hover:underline hover:bg-transparent" aria-expanded={all} onClick={() => setAll(!all)} data-testid="button-scope-show-all">
          {all ? "Show fewer" : `Show all ${included.length} services`}
        </Button>
      )}
    </div>
  );
}

/** True when a stated card-key row's price differs from the card snapshot taken for reference. */
export const differsFromCard = (r: TermRateRow) => !isCustomRate(r) && (r.cardPriceCents != null || r.cardPriceText != null) &&
  (r.priceCents !== r.cardPriceCents || (r.priceCents == null && (r.priceText ?? null) !== (r.cardPriceText ?? null)));

/** Every rate the contract states, in the contract's order. */
export function RatesSummary({ rates }: { rates: TermRateRow[] }) {
  const { t } = useTranslation();
  const onReq = t("contractRates.onRequest");
  if (!rates.length) return <p className="text-sm text-muted-foreground" data-testid="empty-rates">{t("contractRates.empty")}</p>;
  return (
    <ul className="divide-y text-sm" data-testid="list-rates">
      {rates.map(r => (
        <li key={r.rateKey} className="flex flex-wrap items-baseline gap-x-2 py-1.5" data-testid={`rate-stated-${r.rateKey}`}>
          <span className="min-w-0 flex-1 truncate">{r.label}{isCustomRate(r) && <span className="ml-1.5 text-xs text-muted-foreground">{t("contractRates.custom")}</span>}</span>
          {differsFromCard(r) && <span className="text-xs text-muted-foreground tabular-nums" data-testid={`text-rate-card-${r.rateKey}`}>{t("contractRates.cardNote", { price: rateDisplay(r.cardPriceCents, r.cardPriceText, onReq) })}</span>}
          <span className="tabular-nums font-medium">{rateDisplay(r.priceCents, r.priceText, onReq)}</span>
          <span className="text-xs text-muted-foreground">{r.unit}</span>
          {r.minimum && <span className="w-full text-xs text-muted-foreground pl-0">{t("contractRates.minimum")}: {r.minimum}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface StandardRateRow { rateKey: string; label: string; priceCents: number | null; priceText: string | null; unit: string; minimum?: string | null }

/** Collapsed list of standard rates the contract does not state. Rows are supplied or loaded lazily on open. */
export function StandardRatesSection({ rows, loading, error, onOpen, onRetry, testId = "section-standard-rates" }: {
  rows: StandardRateRow[] | undefined; loading?: boolean; error?: boolean; onOpen?: () => void; onRetry?: () => void; testId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const onReq = t("contractRates.onRequest");
  return (
    <div className="border-t pt-2" data-testid={testId}>
      <button type="button" className="flex w-full items-center gap-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={open} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }} data-testid="button-standard-rates">
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{t("contractRates.standardTitle")}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5" data-testid="list-standard-rates">
          <p className="text-xs text-muted-foreground">{t("contractRates.standardNote")}</p>
          {error ? <p className="text-xs text-destructive">{t("contractRates.cardError")}{onRetry && <> <button type="button" className="underline" onClick={onRetry}>{t("contractRates.retry")}</button></>}</p>
            : loading || !rows ? <Skeleton className="h-10 w-full" />
            : !rows.length ? <p className="text-xs text-muted-foreground">{t("contractRates.standardEmpty")}</p>
            : (
              <ul className="divide-y text-sm text-muted-foreground">
                {rows.map(r => (
                  <li key={r.rateKey} className="flex items-baseline gap-2 py-1" data-testid={`rate-standard-${r.rateKey}`}>
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    <span className="tabular-nums">{rateDisplay(r.priceCents, r.priceText, onReq)}</span>
                    <span className="text-xs">{r.unit}</span>
                    {r.minimum != null && <span className="text-xs">{t("contractRates.minimum")}: {r.minimum}</span>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}

/** Contract-page standard section: lazily loads the company card (admin/office) and omits stated keys. */
export function ContractStandardRates({ line, rates }: { line: AgreementLine; rates: TermRateRow[] }) {
  const [want, setWant] = useState(false);
  const card = useScopedRateCard(want);
  if (!card.allowed) return null;
  const stated = new Set(rates.map(r => r.rateKey));
  const rows = card.data ? cardRateRows(card.data, line).filter(r => !stated.has(r.rateKey)) : undefined;
  return <StandardRatesSection rows={rows} loading={card.isLoading} error={card.isError} onOpen={() => setWant(true)} onRetry={() => void card.refetch()} />;
}

export function HistoryList({ term }: { term: DetailTerm }) {
  const [all, setAll] = useState(false);
  if (!term.history.length) return <p className="text-sm text-muted-foreground" data-testid="empty-history">No history yet.</p>;
  const sorted = [...term.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="space-y-2">
      <ul className="divide-y" data-testid="list-history">
        {(all ? sorted : sorted.slice(0, 5)).map(h => (
          <li key={h.id} className="py-2 text-sm" data-testid={`history-${h.id}`}>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground"><span>{dateTime(h.createdAt)}</span><span>{h.changedByName ?? "System"}</span>
              <span>{h.oldStatus && h.oldStatus !== h.newStatus ? `${h.oldStatus} \u2192 ${h.newStatus}` : h.newStatus}</span></div>
            {h.note && <div className="mt-0.5"><RateHistoryNote note={h.note} /></div>}
          </li>
        ))}
      </ul>
      {sorted.length > 5 && (
        <Button size="sm" variant="ghost" className="h-auto p-0 text-primary underline-offset-4 hover:underline hover:bg-transparent" aria-expanded={all} onClick={() => setAll(!all)} data-testid="button-history-see-all">
          {all ? "Show latest 5" : `See all ${sorted.length}`}
        </Button>
      )}
    </div>
  );
}

/** Signed date (Colorado day) and signer from history, when present. */
export function signedInfo(t: DetailTerm) {
  if (!t.signedAt) return null;
  const h = [...t.history].filter(x => x.newStatus === "signed" && x.oldStatus !== "signed" && x.changedByName).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { day: dateOnly(coloradoDay(t.signedAt)), by: h?.changedByName ?? null };
}

/**
 * Coverage context only from explicit data: a CC2-9 renewal set, else a signed document
 * whose coversThroughTermId names a later season (CC2-13 chain).
 */
export function coverageContext(term: DetailTerm, terms: DetailTerm[]): string | null {
  const set = term.renewalSet;
  if (set && set.length > 1) return `One signed ${set.length * 12}-month contract \u00b7 year ${set.year} of ${set.length}`;
  const own = term.documents.find(d => d.kind === "signed" && d.coversThroughTermId);
  const covered = term.coveredBy?.find(d => d.kind === "signed" && d.coversThroughTermId);
  const doc = own ? { from: term.id, through: own.coversThroughTermId! } : covered?.fromTermId ? { from: covered.fromTermId, through: covered.coversThroughTermId! } : null;
  if (!doc) return null;
  const order = [...terms].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const a = order.findIndex(t => t.id === doc.from), b = order.findIndex(t => t.id === doc.through), me = order.findIndex(t => t.id === term.id);
  if (a < 0 || b <= a || me < a || me > b) return null;
  const n = b - a + 1;
  // Duration comes from the explicit covered interval, not an assumption that
  // every linked season is twelve months long.
  const start = order[a].startDate, end = order[b].endDate;
  const [sy, sm] = start.split("-").map(Number), [ey, em] = end.split("-").map(Number);
  const months = (ey - sy) * 12 + em - sm + (Number(end.slice(8, 10)) >= Number(start.slice(8, 10)) ? 1 : 0);
  return `One signed ${months}-month contract \u00b7 year ${me - a + 1} of ${n}`;
}
