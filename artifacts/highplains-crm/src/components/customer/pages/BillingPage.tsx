import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Info } from "lucide-react";
import { useCustomerContractSummary, type ContractSummaryTerm } from "@/hooks/useCustomerContractSummary";
import { contractTermHref } from "@/components/customer/CustomerContractPanels";
import QboCustomerCard from "@/components/qbo/QboCustomerCard";
import { formatCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type BillingView = "rates" | "revenue";

/** Rates grouped by their authoritative CP1 rate line (server-sorted by sortOrder). */
export function splitRatesByLine(term: ContractSummaryTerm | undefined) {
  const rates = term?.rates ?? [];
  const fallback = term?.line === "snow" ? "snow" : "landscape";
  return {
    landscape: rates.filter(r => (r.line ?? fallback) === "landscape"),
    snow: rates.filter(r => (r.line ?? fallback) === "snow"),
  };
}

/** Contract amounts per month for the selected term (planned payments, not invoices). */
export function contractByMonth(term: ContractSummaryTerm | undefined) {
  const map = new Map<string, number>();
  for (const m of term?.billingMonths ?? []) map.set(m.month, (map.get(m.month) ?? 0) + m.amountCents);
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, cents]) => ({ month, cents }));
}

function TermPicker({ rows, value, onChange }: { rows: { term: ContractSummaryTerm; period: string }[]; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <label className="flex gap-2 items-center text-sm min-w-0 max-w-full">
      <span className="text-muted-foreground shrink-0">{t("cp1.term")}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="border rounded-md h-8 px-2 bg-background min-w-0 max-w-full flex-1" aria-label={t("cp1.term")} data-testid="select-billing-term">
        {rows.map(({ term, period }) => (
          <option key={`${period}:${term.termId}`} value={term.termId ?? ""}>
            {t(`cp1.${period}`)} · {term.label} · {t(`cp1.${term.line}`)} · {term.startDate} – {term.endDate}
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
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {list.length === 0 ? <p className="text-sm text-muted-foreground px-6 pb-4">{t("customerPages.billing.noRates")}</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("cp1.rate")}</TableHead>
              <TableHead className="text-right">{t("customerPages.billing.price")}</TableHead>
              <TableHead>{t("cp1.unit")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {list.map(r => (
                <TableRow key={r.rateKey} data-testid={`row-rate-${r.rateKey}`}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.priceCents == null ? r.priceText ?? "\u2014" : money(r.priceCents)}</TableCell>
                  <TableCell>{t(`cp1.units.${r.unit}`, { defaultValue: r.unit })}</TableCell>
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

      {summary.isLoading ? <Skeleton className="h-40 w-full" /> : summary.error ? (
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
            </div>
          ) : (
            <div className="space-y-4" data-testid="billing-revenue">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card><CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{t("customerPages.billing.kpiContract")}</p>
                  <p className="text-2xl font-semibold tabular-nums" data-testid="kpi-contract-term">{money(term.annualCents)}</p>
                  {tm && <p className="text-xs text-muted-foreground">{t("cp1.timeAndMaterials")}</p>}
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
                      </TableRow></TableHeader>
                      <TableBody>
                        {months.map(m => (
                          <TableRow key={m.month} data-testid={`row-month-${m.month}`}>
                            <TableCell>{m.month}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(m.cents)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold">
                          <TableCell>{t("customerPages.billing.total")}</TableCell>
                          <TableCell className="text-right tabular-nums" data-testid="text-months-total">{money(months.reduce((n, m) => n + m.cents, 0))}</TableCell>
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
