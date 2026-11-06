import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CardListSkeleton, CustomerCardHeader, PageEmptyState, fromNestedControl, rowKeyOpen, useCustomerDates } from "@/components/customer/page";
import { useLocation, Link } from "wouter";
import { Snowflake, AlertTriangle, FileText } from "lucide-react";
import type { SnowEvent, SnowEventPropertyImpact } from "@shared/schema";
import type { CustomerContractSummary } from "@/hooks/useCustomerContractSummary";
import { OPEN_SNOW_FLAG_STATUSES } from "@/hooks/useCustomerContractSummary";
import { contractTermHref } from "@/components/customer/CustomerContractPanels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useCustomerScope } from "@/lib/customerScope";

export default function SnowPage({ customerId, summary, canOpenContract }: { customerId: string; summary?: CustomerContractSummary; canOpenContract: boolean }) {
  const { t } = useTranslation();
  const dates = useCustomerDates();
  const terms = (summary?.current ?? []).filter(term => term.line === "snow" || term.line === "both");
  const flags = new Map((summary?.snowTriggerFlags ?? []).map(f => [f.termId, f.status]));
  const hasTermIds = terms.some(term => !!term.termId);
  const openCount = (summary?.snowTriggerFlags ?? []).filter(f => (OPEN_SNOW_FLAG_STATUSES as readonly string[]).includes(f.status)).length;
  return (
    <div className="space-y-5" data-testid="snow-page">
      {!hasTermIds && openCount > 0 && (
        <p className="rounded-md border p-3 text-sm flex items-center gap-2" data-testid="snow-flag-summary">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--est-warn))]" />{t("customerPages.snow.openQuestions", { count: openCount })}
        </p>
      )}
      <Card>
        <CustomerCardHeader icon={FileText} title={t("customerPages.snow.terms")} />
        <CardContent className="pt-0 divide-y">
          {terms.length === 0 ? <PageEmptyState icon={Snowflake} message={t("cp1.noContract")} testId="snow-terms-empty" className="my-2" /> : terms.map((term, i) => {
            const triggers = term.snowTriggers?.trim();
            const status = term.termId ? flags.get(term.termId) : undefined;
            const open = !!status && (OPEN_SNOW_FLAG_STATUSES as readonly string[]).includes(status);
            return (
              <div key={term.termId ?? i} className="py-3 space-y-1.5 text-sm" data-testid={`snow-term-${term.termId ?? i}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {canOpenContract && term.termId ? <Link href={contractTermHref(term)} className="font-medium underline">{term.label}</Link> : <span className="font-medium">{term.label}</span>}
                  <span className="text-muted-foreground" data-testid={`text-snow-term-dates-${term.termId ?? i}`}>{dates.day(term.startDate)} – {dates.day(term.endDate)}</span>
                </div>
                <p><span className="text-muted-foreground">{t("customerPages.snow.pricing")}: </span>
                  {term.snowPricing ? t(`customerPages.snow.pricingTypes.${term.snowPricing}`, { defaultValue: term.snowPricing }) : t("cp1.notStated")}</p>
                <p data-testid={`text-snow-triggers-${term.termId ?? i}`} className={triggers ? "" : "text-[hsl(var(--est-warn))]"}>
                  <span className="text-muted-foreground">{t("cp1.snowTriggers")}: </span>{triggers || t("cp1.notStated")}
                </p>
                {status && (
                  <p className="flex items-center gap-1.5" data-testid={`snow-flag-status-${term.termId}`}>
                    {open && <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--est-warn))]" />}
                    <span className="text-muted-foreground">{t("customerPages.snow.flag")}: </span>
                    <Badge variant={open ? "secondary" : "outline"} className="text-xs">{t(`customerPages.snow.flagStatus.${status}`, { defaultValue: status })}</Badge>
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <SnowHistory customerId={customerId} />
    </div>
  );
}

function SnowHistory({ customerId }: { customerId: string }) {
  const { t, i18n } = useTranslation();
  const scope = useCustomerScope();
  const dates = useCustomerDates();
  const { data: impacts = [], isLoading } = useQuery<(SnowEventPropertyImpact & { snowEvent: SnowEvent })[]>({
    queryKey: [`/api/customers/${customerId}/snow-impacts`, ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson(`/api/customers/${customerId}/snow-impacts`, signal),
  });

  const [, navigate] = useLocation();

  if (isLoading) {
    return <CardListSkeleton count={2} testId="snow-history-skeleton" />;
  }

  if (impacts.length === 0) {
    return (
      <PageEmptyState icon={Snowflake} message={t("customerDetail.noSnowHistory")} testId="snow-history-empty" />
    );
  }

  const billingStatusLabels: Record<string, string> = {
    not_created: t("statuses.pending"),
    ticket_created: t("statuses.ticketCreated"),
    invoiced: t("statuses.invoiced"),
    paid: t("statuses.paid"),
  };

  const billingStatusVariant = (status: string) => {
    switch (status) {
      case "paid": return "default";
      case "invoiced": return "secondary";
      case "ticket_created": return "outline";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-[13.5px] font-semibold">{t("customerPages.snow.history")}</h3>
        <Badge variant="secondary" data-testid="badge-snow-count">
          {t("cp4.snow.storms", { count: impacts.length })}
        </Badge>
      </div>

      <div className="space-y-3">
        {impacts.map((impact) => {
          const event = impact.snowEvent;
          const eventDate = new Date(event.eventStartDateTime);
          return (
            <Card
              key={impact.id}
              role="link"
              tabIndex={0}
              className="cursor-pointer hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              onClick={e => { if (!fromNestedControl(e)) navigate(`/dashboard/snow/${event.id}`); }}
              onKeyDown={rowKeyOpen(() => navigate(`/dashboard/snow/${event.id}`))}
              data-testid={`card-snow-impact-${impact.id}`}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {event.eventName || dates.day(eventDate)}
                      </span>
                      <Badge variant="secondary" data-testid={`badge-range-${impact.id}`}>
                        {event.snowRange}
                      </Badge>
                      <Badge
                        variant={event.status === "locked" ? "default" : "outline"}
                        data-testid={`badge-status-${impact.id}`}
                      >
                        {t(`statuses.${event.status}`, { defaultValue: t("cp4.status.pending") })}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {dates.day(eventDate)}
                      {event.eventEndDateTime && ` — ${dates.day(event.eventEndDateTime)}`}
                    </p>
                    {impact.serviceTypes && impact.serviceTypes.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {impact.serviceTypes.map((svc: string) => (
                          <Badge key={svc} variant="outline" className="text-xs">
                            {t(`cp4.snow.serviceTypes.${svc.replace(/[^A-Za-z]/g, "")}`, { defaultValue: svc })}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {impact.siteNotes && (
                      <p className="text-sm text-muted-foreground mt-1">{impact.siteNotes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={billingStatusVariant(impact.billingStatus) as any} data-testid={`badge-billing-${impact.id}`}>
                      {billingStatusLabels[impact.billingStatus] || t("cp4.status.pending")}
                    </Badge>
                    {impact.laborHours && (
                      <span className="text-xs text-muted-foreground" data-testid={`text-labor-hours-${impact.id}`}>{t("cp4.snow.hours", { count: Number(impact.laborHours), hours: new Intl.NumberFormat(i18n.language).format(Number(impact.laborHours)) })}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
