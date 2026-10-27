import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowRight, FileSignature, BookOpen, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/hardscapeCatalog";
import { RATES_PREVIEW_API, RATE_CARD_SETTINGS_PATH, moneyOrText, scopeOf, type RatePreviewResponse, type RateSource } from "@/lib/estimateSettings";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import CustomerSearchInput from "@/components/CustomerSearchInput";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SOURCE_STYLE: Record<RateSource, string> = {
  contract: "border-primary/40 bg-primary/10 text-primary",
  rate_card: "border-border bg-muted text-foreground",
  unset: "border-dashed border-[hsl(var(--est-warn))] text-[hsl(var(--est-warn))]",
};

export default function LaborRatesPreview() {
  const { user } = useAuth();
  return <LaborRatesContent key={scopeOf(user)} />;
}

function LaborRatesContent() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [companyId] = useState(() => user?.activeCompanyId ?? "");
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const isAdmin = user?.activeRole === "admin";
  const lang = i18n.language;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<RatePreviewResponse>({
    queryKey: [RATES_PREVIEW_API, user?.activeCompanyId, user?.id, user?.activeRole, customer?.id],
    queryFn: ({ signal }) => fetchJson<RatePreviewResponse>(`${RATES_PREVIEW_API}?customerId=${encodeURIComponent(customer!.id)}`, companyId, signal),
    enabled: !!user && !!customer,
  });
  const rows = data?.items ?? [];
  const contractCount = rows.filter((r) => r.source === "contract").length;
  const dash = <span className="text-muted-foreground">{t("laborRates.none")}</span>;

  return (
    <SectionRailLayout rail={<EstimatesRail activeKey="labor_rates" />}>
      <div className="mx-auto max-w-6xl" data-testid="page-labor-rates">
        <header className="border-b pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--rail-active-icon))]">{t("estimates.settings")}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight" data-testid="text-page-title">{t("laborRates.title")}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("laborRates.subtitle")}</p>
        </header>

        <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-md border border-l-4 border-l-primary bg-card p-4" data-testid="panel-explainer">
          <div className="min-w-0 max-w-2xl">
            <p className="text-sm font-semibold">{t("laborRates.explainerTitle")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-primary"><FileSignature className="h-3.5 w-3.5" />{t("laborRates.col.contract")}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-1"><BookOpen className="h-3.5 w-3.5" />{t("laborRates.col.card")}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t("laborRates.explainer")}</p>
          </div>
          {isAdmin ? (
            <Link href={RATE_CARD_SETTINGS_PATH} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline" data-testid="link-rate-card">
              {t("laborRates.openRateCard")}<ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <p className="max-w-xs text-xs text-muted-foreground" data-testid="text-rate-card-guidance">{t("laborRates.officeGuidance")}</p>
          )}
        </section>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="grid w-full max-w-sm gap-1.5">
            <span className="text-sm font-medium">{t("laborRates.customer")}</span>
            <CustomerSearchInput mode="any" expectedCompanyId={companyId} requestScope={scopeOf(user)} testId="input-customer" placeholder={t("laborRates.customerPlaceholder")}
              selectedId={customer?.id} selectedCustomerName={customer?.name ?? ""}
              onSelect={(c) => setCustomer({ id: c.id, name: c.name })} />
          </div>
          {customer && (
            <Button variant="ghost" size="sm" onClick={() => setCustomer(null)} data-testid="button-clear-customer"><X className="mr-1 h-4 w-4" />{t("laborRates.clear")}</Button>
          )}
        </div>

        <div className="mt-4">
          {!customer ? (
            <div className="rounded-md border border-dashed bg-card/60 px-6 py-12 text-center" data-testid="rates-pick-customer">
              <p className="font-semibold">{t("laborRates.pickCustomer")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("laborRates.pickCustomerHint")}</p>
            </div>
          ) : isError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-5" data-testid="rates-error">
              <p className="text-sm">{t("laborRates.loadError")}</p>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">{t("laborRates.retry")}</Button>
            </div>
          ) : isLoading ? (
            <div role="status" aria-label={t("laborRates.loading")} className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/60 px-6 py-12 text-center" data-testid="rates-empty"><p className="font-semibold">{t("laborRates.empty")}</p></div>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground" data-testid="text-contract-summary">
                {contractCount === 0 ? t("laborRates.noContract") : t("laborRates.contractCount", { count: contractCount })}
              </p>
              <div className={cn("overflow-x-auto rounded-md border bg-card transition-opacity", isFetching && "opacity-70")}>
                <Table data-testid="table-rates">
                  <TableHeader>
                    <TableRow className="bg-[hsl(var(--table-header))]">
                      <TableHead>{t("laborRates.col.rate")}</TableHead>
                      <TableHead>{t("laborRates.col.unit")}</TableHead>
                      <TableHead className="text-right">{t("laborRates.col.card")}</TableHead>
                      <TableHead className="text-right">{t("laborRates.col.contract")}</TableHead>
                      <TableHead>{t("laborRates.col.uses")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const card = moneyOrText(r.cardRateCents, r.cardPriceText, lang);
                      const contract = moneyOrText(r.contractRateCents, r.contractPriceText, lang);
                      const used = moneyOrText(r.rateCents, r.priceText, lang);
                      return (
                        <TableRow key={r.rateKey} data-testid={`row-rate-${r.rateKey}`}>
                          <TableCell className="font-medium">{r.label}</TableCell>
                          <TableCell className="text-xs">{r.unit ?? ""}</TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`text-card-${r.rateKey}`}>{card ?? dash}</TableCell>
                          <TableCell className="text-right tabular-nums" data-testid={`text-contract-${r.rateKey}`}>{contract ?? dash}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-2">
                              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", SOURCE_STYLE[r.source])} data-testid={`badge-source-${r.rateKey}`}>
                                {t(`laborRates.source.${r.source}`)}
                              </span>
                              {r.source !== "unset" && used && <span className="text-sm font-semibold tabular-nums" data-testid={`text-uses-${r.rateKey}`}>{used}</span>}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>
    </SectionRailLayout>
  );
}
