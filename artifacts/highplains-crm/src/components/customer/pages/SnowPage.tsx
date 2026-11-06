import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import { Snowflake, AlertTriangle } from "lucide-react";
import type { SnowEvent, SnowEventPropertyImpact } from "@shared/schema";
import type { CustomerContractSummary } from "@/hooks/useCustomerContractSummary";
import { OPEN_SNOW_FLAG_STATUSES } from "@/hooks/useCustomerContractSummary";
import { contractTermHref } from "@/components/customer/CustomerContractPanels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerScope } from "@/lib/customerScope";

export default function SnowPage({ customerId, summary, canOpenContract }: { customerId: string; summary?: CustomerContractSummary; canOpenContract: boolean }) {
  const { t } = useTranslation();
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
        <CardHeader className="pb-2"><CardTitle className="text-base">{t("customerPages.snow.terms")}</CardTitle></CardHeader>
        <CardContent className="pt-0 divide-y">
          {terms.length === 0 ? <p className="text-sm text-muted-foreground">{t("cp1.noContract")}</p> : terms.map((term, i) => {
            const triggers = term.snowTriggers?.trim();
            const status = term.termId ? flags.get(term.termId) : undefined;
            const open = !!status && (OPEN_SNOW_FLAG_STATUSES as readonly string[]).includes(status);
            return (
              <div key={term.termId ?? i} className="py-3 space-y-1.5 text-sm" data-testid={`snow-term-${term.termId ?? i}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {canOpenContract && term.termId ? <Link href={contractTermHref(term)} className="font-medium underline">{term.label}</Link> : <span className="font-medium">{term.label}</span>}
                  <span className="text-muted-foreground">{term.startDate} – {term.endDate}</span>
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
  const { t } = useTranslation();
  const scope = useCustomerScope();
  const { data: impacts = [], isLoading } = useQuery<(SnowEventPropertyImpact & { snowEvent: SnowEvent })[]>({
    queryKey: [`/api/customers/${customerId}/snow-impacts`, ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson(`/api/customers/${customerId}/snow-impacts`, signal),
  });

  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (impacts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Snowflake className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("customerDetail.noSnowHistory")}</p>
        </CardContent>
      </Card>
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
        <h3 className="text-lg font-semibold">{t("customerPages.snow.history")}</h3>
        <Badge variant="secondary" data-testid="badge-snow-count">
          {impacts.length} {t("customerDetail.stormEvent")}{impacts.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="space-y-3">
        {impacts.map((impact) => {
          const event = impact.snowEvent;
          const eventDate = new Date(event.eventStartDateTime);
          return (
            <Card
              key={impact.id}
              className="hover-elevate cursor-pointer"
              onClick={() => navigate(`/dashboard/snow/${event.id}`)}
              data-testid={`card-snow-impact-${impact.id}`}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {event.eventName || eventDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <Badge variant="secondary" data-testid={`badge-range-${impact.id}`}>
                        {event.snowRange}
                      </Badge>
                      <Badge
                        variant={event.status === "locked" ? "default" : "outline"}
                        data-testid={`badge-status-${impact.id}`}
                      >
                        {event.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {eventDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      {event.eventEndDateTime && ` — ${new Date(event.eventEndDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                    </p>
                    {impact.serviceTypes && impact.serviceTypes.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {impact.serviceTypes.map((svc: string) => (
                          <Badge key={svc} variant="outline" className="text-xs">
                            {svc}
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
                      {billingStatusLabels[impact.billingStatus] || impact.billingStatus}
                    </Badge>
                    {impact.laborHours && (
                      <span className="text-xs text-muted-foreground">{impact.laborHours} hrs</span>
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
