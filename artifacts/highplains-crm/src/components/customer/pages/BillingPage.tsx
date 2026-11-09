import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardListSkeleton, CustomerCardHeader, useCustomerDates } from "@/components/customer/page";
import { Receipt } from "lucide-react";
import { Link } from "wouter";
import { Info } from "lucide-react";
import { useCustomerContractSummary, type ContractSummaryTerm } from "@/hooks/useCustomerContractSummary";
import { contractTermHref } from "@/components/customer/CustomerContractPanels";
import QboCustomerCard from "@/components/qbo/QboCustomerCard";
import { formatCurrency } from "@/lib/currency";
import { Card, CardContent } from "@/components/ui/card";
import { StandardRatesSection } from "@/components/contracts/ContractWidgets";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type BillingView = "rates" | "revenue";

/** Rates grouped by their authoritative CP1 rate line (server-sorted by sortOrder). */
export function splitRatesByLine(term: ContractSummaryTerm | undefined) {
  const rates = term?.rates ?? [];
  const fallback = term?.line === "snow" ? "snow" : "landscape";
  return {
    landscape: rates.filter(r => (r.line ?? fallback) !== "snow"),
    snow: rates.filter(r => (r.line ?? fallback) === "snow"),
  };
}

/** Contract amounts per month for the selected term (planned payments, not invoices). */
export function contractByMonth(term: ContractSummaryTerm | undefined) {
  const map = new Map<string, { cents: number; fees: number }>();
  for (const m of term?.billingMonths ?? []) {
    const cur = map.get(m.month) ?? { cents: 0, fees: 0 };
    if (m.isFee) cur.fees += m.amountCents; else cur.cents += m.amountCents;
    map.set(m.month, cur);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v }));
}
/** Fee components shown apart from the contract value. */
export function feeTotals(term: ContractSummaryTerm | undefined) {
  const rows = (term?.billingMonths ?? []).filter(m => m.isFee);
  return { annual: term?.feesAnnualCents ?? null, names: [...new Set(rows.map(r => r.component ?? ""))].filter(Boolean), any: rows.length > 0 || (term?.feesAnnualCents ?? 0) > 0 };
}

export function TermPicker({ rows, value, onChange }: { rows: { term: ContractSummaryTerm; period: string }[]; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const dates = useCustomerDates();
  return (
    <label className="flex gap-2 items-center text-sm min-w-0 max-w-full">
      <span className="text-muted-foreground shrink-0">{t("cp1.term")}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="border rounded-md h-8 px-2 bg-background min-w-0 max-w-full flex-1" aria-label={t("cp1.term")} data-testid="select-billing-term">
        {rows.map(({ term, period }) => (
          <option key={`${period}:${term.termId}`} value={term.termId ?? ""}>
            {t(`cp1.${period}`)} · {term.label} · {t(`cp1.${term.line}`)} · {dates.day(term.startDate)} – {dates.day(term.endDate)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function BillingPage({ customerId, isParent, view, onViewChange, canEditCustomer }: {
  customerId: string; isParent: boolean; view: BillingView; onViewChange: (v: BillingView) => void; canEditCustomer: boolean;
}) {
  const { t, i18n } = useTranslation();
  const summary = useCustomerContractSummary(isParent ? undefined : customerId);
  const [selection, setSelection] = useState("");
  const rows = useMemo(() => [
    ...(summary.data?.current ?? []).map(term => ({ term, period: "current" })),
    ...(summary.data?.upcoming ?? []).map(term => ({ term, period: "upcoming" })),
    ...(summary.data?.previous ?? []).map(term => ({ term, period: "previous" })),
  ], [summary.data]);
  const term = (selection && rows.find(r => r.term.termId === selection)?.term) || summary.data?.current[0] || rows[0]?.term;
  const money = (v: number | null | undefined) => formatCurrency(v, false, i18n.language);

  const qbo = (
    <div className="max-w-xl space-y-1" data-testid="billing-qbo">
      <QboCustomerCard customerId={customerId} isParent={isParent} />
      {canEditCustomer && (
        <Link href={`/dashboard/customers/${customerId}/edit#billing`} className="text-xs text-primary underline" data-testid="link-edit-billing">
          {t("customerPages.billing.editBilling")}
        </Link>
      )}
    </div>
  );

  if (isParent) return <div className="space-y-4" data-testid="billing-page">{qbo}</div>;

  const renderRateTable = (title: string, list: NonNullable<ContractSummaryTerm["rates"]>, id: string) => (
    <Card key={id} data-testid={`rates-${id}`}>
      <CustomerCardHeader icon={Receipt} title={title} className="pb-2" />
      <CardContent className="p-0">
        {list.length === 0 ? <p className="text-sm text-muted-foreground px-6 pb-4">{t("customerPages.billing.noRates")}</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("cp1.rate")}</TableHead>
              <TableHead className="text-right">{t("customerPages.billing.price")}</TableHead>
              <TableHead>{t("cp1.unit")}</TableHead>
              <TableHead>{t("contractRates.minimum")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {list.map(r => (
                <TableRow key={r.rateKey} data-testid={`row-rate-${r.rateKey}`}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.priceCents == null ? r.priceText ?? "\u2014" : money(r.priceCents)}
                    {(r.cardPriceCents != null || r.cardPriceText != null) && (r.priceCents !== (r.cardPriceCents ?? null) || (r.priceCents == null && (r.priceText ?? null) !== (r.cardPriceText ?? null))) && (
                      <span className="block text-xs text-muted-foreground" data-testid={`text-billing-card-${r.rateKey}`}>
                        {t("contractRates.cardNote", { price: r.cardPriceCents != null ? money(r.cardPriceCents) : r.cardPriceText })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{t(`cp1.units.${r.unit}`, { defaultValue: r.unit })}</TableCell>
                  <TableCell>{r.minimum ?? "\u2014"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  const split = splitRatesByLine(term);
  const months = contractByMonth(term);
  const tm = term?.snowPricing === "time_and_materials";
  const fees = feeTotals(term);

  return (
    <div className="space-y-4" data-testid="billing-page">
      {qbo}
      <div role="tablist" aria-label={t("customerPages.pages.billing")} className="inline-flex rounded-md border bg-muted/40 p-0.5">
        {(["rates", "revenue"] as BillingView[]).map(v => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => onViewChange(v)}
            className={`px-3 h-8 text-sm rounded ${view === v ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            data-testid={`view-billing-${v}`}>
            {t(`customerPages.billing.views.${v}`)}
          </button>
        ))}
      </div>

      {summary.isLoading ? <CardListSkeleton count={2} testId="billing-skeleton" /> : summary.error ? (
        <p role="alert" className="text-sm text-destructive">{t("cp1.loadFailed")}</p>
      ) : !term ? (
        <p className="text-sm text-muted-foreground" data-testid="billing-no-contract">{t("cp1.noContract")}</p>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <TermPicker rows={rows} value={term.termId ?? ""} onChange={setSelection} />
            {term.termId && <Link className="text-sm text-primary underline" href={contractTermHref(term)}>{t("cp1.editOnContract")}</Link>}
          </div>
          {term.parentCustomerId && <p className="text-sm text-muted-foreground">{t("cp1.parentValue")}</p>}

          {view === "rates" ? (
            <div className="grid gap-4 lg:grid-cols-2" data-testid="billing-rates">
              {renderRateTable(t("cp1.landscape"), split.landscape, "landscape")}
              {renderRateTable(t("customerPages.billing.snowAndIce"), split.snow, "snow")}
              {term.standardRates && (
                <div className="lg:col-span-2">
                  <StandardRatesSection key={term.termId} rows={term.standardRates} testId="billing-standard-rates" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4" data-testid="billing-revenue">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{t("customerPages.billing.kpiContract")}</p>
                  <p className="text-2xl font-semibold tabular-nums" data-testid="kpi-contract-term">{money(term.annualCents)}</p>
                  {tm && <p className="text-xs text-muted-foreground">{t("cp1.timeAndMaterials")}</p>}
                  {(term.durationMonths ?? 0) > 12 && term.contractTotalCents != null && (
                    <p className="text-xs text-muted-foreground" data-testid="kpi-contract-total">{t("contractFees.contractTotalLine", { amount: money(term.contractTotalCents), count: term.durationMonths })}</p>
                  )}
                  {fees.any && (
                    <div className="mt-2 border-t pt-2" data-testid="kpi-fees-block">
                      <p className="text-xs text-muted-foreground">{t("contractFees.kpiFees")}</p>
                      <p className="text-base font-semibold tabular-nums" data-testid="kpi-fees">
                        {fees.annual != null ? t("contractFees.perYear", { amount: money(fees.annual) }) : money(months.reduce((n, m) => n + m.fees, 0))}
                      </p>
                      {fees.names.length > 0 && <p className="text-xs text-muted-foreground" data-testid="kpi-fee-names">{fees.names.join(", ")}</p>}
                    </div>
                  )}
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{t("customerPages.billing.kpiInvoiced")}</p>
                  <p className="text-2xl font-semibold text-muted-foreground" data-testid="kpi-invoiced">{t("customerPages.billing.unavailable")}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{t("customerPages.billing.kpiRemaining")}</p>
                  <p className="text-2xl font-semibold text-muted-foreground" data-testid="kpi-remaining">{t("customerPages.billing.unavailable")}</p>
                </CardContent></Card>
              </div>
              <p className="text-xs text-muted-foreground flex gap-1.5 items-start" data-testid="billing-contract-only-notice">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{t("customerPages.billing.contractOnly")}
              </p>
              <Card>
                <CardContent className="p-0">
                  {months.length === 0 ? <p className="text-sm text-muted-foreground p-4">{t("customerPages.billing.noMonths")}</p> : (
                    <Table data-testid="table-billing-months">
                      <TableHeader><TableRow>
                        <TableHead>{t("cp1.month")}</TableHead>
                        <TableHead className="text-right">{t("customerPages.billing.contractCol")}</TableHead>
                        {fees.any && <TableHead className="text-right">{t("contractFees.feeCol")}</TableHead>}
                      </TableRow></TableHeader>
                      <TableBody>
                        {months.map(m => (
                          <TableRow key={m.month} data-testid={`row-month-${m.month}`}>
                            <TableCell>{m.month}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(m.cents)}</TableCell>
                            {fees.any && <TableCell className="text-right tabular-nums text-muted-foreground" data-testid={`text-month-fees-${m.month}`}>{m.fees ? money(m.fees) : "\u2014"}</TableCell>}
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold">
                          <TableCell>{t("customerPages.billing.total")}</TableCell>
                          <TableCell className="text-right tabular-nums" data-testid="text-months-total">{money(months.reduce((n, m) => n + m.cents, 0))}</TableCell>
                          {fees.any && <TableCell className="text-right tabular-nums" data-testid="text-months-fees-total">{money(months.reduce((n, m) => n + m.fees, 0))}</TableCell>}
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
