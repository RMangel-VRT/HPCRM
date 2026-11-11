import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Lock, ExternalLink } from "lucide-react";
import type { ServiceFulfillment, ServiceRound } from "@workspace/api-client-react";
import { SCOPE_CATALOG } from "@shared/contractCatalog";
import { useCustomerServices } from "@/hooks/useCustomerServices";
import { useContractCustomerServices, useServiceSeason } from "@/hooks/useContractCustomerServices";
import { useAuth } from "@/hooks/use-auth";
import { DisplayStatusBadge, PageEmptyState, TableSkeleton, useCustomerDates } from "@/components/customer/page";
import { serviceDisplayStatus, serviceStatusLabel } from "@/lib/contractCustomerServices";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DASH, RoundItemPanel, ServiceRowItem, ServiceTile, accessFor, seasonOptionLabel } from "./services/ServiceParts";

type Drawer =
  | { kind: "item"; row: ServiceFulfillment | null; itemId: string; title: string; start: string; end: string }
  | { kind: "route"; row: ServiceFulfillment };

const UNCOUNTED_DEFAULT: Record<string, string> = { on_request: "On request", event: "Snow", none: "Not scheduled" };

function RetainedRoundTitle({ customerId, campaignId }: { customerId: string; campaignId: string }) {
  const { items } = useCustomerServices(customerId);
  const title = items.find((item: any) => item.campaignId === campaignId)?.campaignTitle;
  return <span className="text-xs text-muted-foreground">{title || "Round"}</span>;
}

export default function ServicesPage({ customerId, parentName }: { customerId: string; parentName?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const day = useCustomerDates().day;
  const access = accessFor((user as any)?.accessRole ?? user?.activeRole);
  const { termId, selectTerm, resetTerm, scopeKey } = useServiceSeason(customerId);
  const query = useContractCustomerServices(customerId, termId);
  const { data, isLoading, error, refetch, isFetching, unavailable } = query;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<Drawer | null>(null);

  // Clear local UI state when the scope (company/customer/viewer/role) changes.
  useEffect(() => { setExpanded(new Set()); setDrawer(null); }, [scopeKey]);

  const status = (error as any)?.status as number | undefined;
  // A disappeared explicit season resets to default once; a default 404 is shown as an error.
  useEffect(() => { if (status === 404 && termId) resetTerm(); }, [status, termId, resetTerm]);

  const rows = data?.rows ?? [];
  const term = data?.selectedTerm ?? null;
  const toggle = (k: string) => setExpanded(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const openItem = (row: ServiceFulfillment | null, itemId: string, title: string, start: string, end: string) =>
    setDrawer({ kind: "item", row, itemId, title, start, end });
  const openRound = (row: ServiceFulfillment) => (r: ServiceRound) =>
    r.itemId && openItem(row, r.itemId, row.label, r.windowStart, r.windowEnd);

  const uncounted = useMemo(() => data?.alsoInContract ?? [], [data]);

  if (unavailable || status === 403) {
    return <PageEmptyState icon={Lock} message={t("customerPages.services.notAvailable", { defaultValue: "Services are not available for your role." })} testId="services-unavailable" />;
  }
  if (isLoading || (status === 404 && termId)) return <TableSkeleton rows={5} cols={3} testId="services-skeleton" />;
  if (error || !data) {
    return (
      <div role="alert">
        <PageEmptyState icon={AlertCircle} message={t("cp1.loadFailed")} testId="services-error"
          action={<Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="button-services-retry">{t("common.retry", { defaultValue: "Retry" })}</Button>} />
      </div>
    );
  }

  const terms = data.availableTerms;
  const campaignLink = (id: string, testId: string) => access.campaigns
    ? <Link href={`/dashboard/campaigns/${id}`} className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline" data-testid={testId}>{t("customerPages.services.openRound", { defaultValue: "Round" })}<ExternalLink className="w-3 h-3" aria-hidden="true" /></Link>
    : null;

  return (
    <div className="space-y-5" data-testid="services-page">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground" data-testid="text-services-asof">
          {t("customerPages.services.asOf", { date: day(data.asOf), defaultValue: "As of {{date}}" })}
        </p>
        {terms.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("customerPages.services.season", { defaultValue: "Season" })}</span>
            <Select value={term?.termId ?? ""} onValueChange={v => { setExpanded(new Set()); setDrawer(null); selectTerm(v); }}>
              <SelectTrigger className="w-full sm:w-80 h-8 text-left" data-testid="select-services-season"><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map(s => (
                  <SelectItem key={s.termId} value={s.termId} data-testid={`option-season-${s.termId}`}>{seasonOptionLabel(s, day, t, parentName)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!term ? (
        <PageEmptyState icon={CheckCircle2} message={t("customerPages.services.noSeason", { defaultValue: "No contract season for this property." })} testId="services-no-season" />
      ) : (
        <>
          {rows.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" data-testid="services-summary">
              {rows.map(r => <ServiceTile key={r.serviceKey} row={r} />)}
            </div>
          )}

          {rows.length === 0 ? (
            <PageEmptyState icon={CheckCircle2} message={t("customerPages.services.empty")} testId="services-empty" />
          ) : (
            <section data-testid="services-counted">
              <h3 className="text-[13px] font-semibold text-muted-foreground mb-1.5">
                {t("customerPages.services.counted", { defaultValue: "Contracted services" })} <span className="tabular-nums">({rows.length})</span>
              </h3>
              <div className="rounded-md border bg-card">
                {rows.map(r => (
                  <ServiceRowItem key={r.serviceKey} row={r} term={term} access={access}
                    expanded={expanded.has(r.serviceKey)} onToggle={() => toggle(r.serviceKey)}
                    onOpen={() => r.scheduling === "route" ? setDrawer({ kind: "route", row: r }) : toggle(r.serviceKey)}
                    onOpenItem={openRound(r)} />
                ))}
              </div>
            </section>
          )}

          {uncounted.length > 0 && (
            <section data-testid="services-also-in-contract">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {t("customerPages.services.alsoInContract", { defaultValue: "Also in this contract" })}
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {uncounted.map(u => (
                  <li key={u.serviceKey} className="rounded-md border bg-card px-2 py-1 text-xs" data-testid={`item-uncounted-${u.serviceKey}`}>
                    {u.label} <span className="text-muted-foreground">{DASH} {t(`customerPages.services.uncounted.${u.scheduling}`, { defaultValue: UNCOUNTED_DEFAULT[u.scheduling] ?? u.scheduling })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {data.retainedWork.length > 0 && (
        <section data-testid="services-retained">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {t("customerPages.services.retained", { defaultValue: "Retained rounds" })} <span className="tabular-nums">({data.retainedWork.length})</span>
          </h3>
          <p className="text-xs text-muted-foreground mb-1.5">{t("customerPages.services.retainedHint", { defaultValue: "Kept because work had started. Review on the round." })}</p>
          <div className="rounded-md border bg-card">
            {data.retainedWork.map(w => {
              const label = rows.find(r => r.serviceKey === w.serviceKey)?.label ?? uncounted.find(u => u.serviceKey === w.serviceKey)?.label ?? SCOPE_CATALOG.find(s => s.key === w.serviceKey)?.label ?? w.serviceKey ?? DASH;
              return (
                <div key={w.itemId} className="min-h-[44px] flex items-center gap-3 px-3 py-2 border-b last:border-b-0" data-testid={`row-retained-${w.itemId}`}>
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{label}</span>
                  <RetainedRoundTitle customerId={customerId} campaignId={w.campaignId} />
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => openItem(null, w.itemId, label, "", "")} data-testid={`button-retained-item-${w.itemId}`}>{t("customerPages.services.openItem", { defaultValue: "Item" })}</button>
                  {campaignLink(w.campaignId, `link-retained-campaign-${w.itemId}`)}
                  <DisplayStatusBadge status={serviceDisplayStatus(w.status)} label={serviceStatusLabel(w.status, t)} testId={`status-retained-${w.itemId}`} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {data.otherWork.length > 0 && (
        <section data-testid="services-other-work">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {t("customerPages.services.otherWork", { defaultValue: "Other work" })} <span className="tabular-nums">({data.otherWork.length})</span>
          </h3>
          <p className="text-xs text-muted-foreground mb-1.5">{t("customerPages.services.otherWorkHint", { defaultValue: "Hand-built campaigns. These never count toward contracted services." })}</p>
          <div className="rounded-md border bg-card">
            {data.otherWork.map(w => (
              <div key={w.itemId} className="min-h-[44px] flex items-center gap-3 px-3 py-2 border-b last:border-b-0" data-testid={`row-other-${w.itemId}`}>
                <button type="button" className="flex-1 min-w-0 text-left text-sm font-medium truncate hover:underline" onClick={() => openItem(null, w.itemId, w.title, "", "")} data-testid={`button-other-item-${w.itemId}`}>{w.title}</button>
                {campaignLink(w.campaignId, `link-other-campaign-${w.itemId}`)}
                <DisplayStatusBadge status={serviceDisplayStatus(w.status)} label={serviceStatusLabel(w.status, t)} testId={`status-other-${w.itemId}`} />
              </div>
            ))}
          </div>
        </section>
      )}

      <Sheet open={!!drawer} onOpenChange={open => { if (!open) setDrawer(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {drawer && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle data-testid="drawer-title">{drawer.kind === "item" ? drawer.title : drawer.row.label}</SheetTitle>
                <SheetDescription>{t("customerPages.services.detailReadOnly")}</SheetDescription>
              </SheetHeader>
              {drawer.kind === "item" ? (
                <RoundItemPanel customerId={customerId} itemId={drawer.itemId} onClose={() => setDrawer(null)}
                  fallback={{ title: drawer.title, start: drawer.start, end: drawer.end, category: drawer.row?.serviceKey ?? "" }} />
              ) : (
                <div className="space-y-4 text-sm">
                  <DisplayStatusBadge status={serviceDisplayStatus(drawer.row.status)} label={serviceStatusLabel(drawer.row.status, t)} testId="drawer-status" />
                  <p className="text-muted-foreground tabular-nums" data-testid="drawer-counts">
                    {t("customerPages.services.owed", { defaultValue: "Owed" })} {drawer.row.owed ?? DASH} · {t("customerPages.services.done", { defaultValue: "Done" })} {drawer.row.done} · {t("customerPages.services.planned", { defaultValue: "Planned" })} {drawer.row.planned} · {t("customerPages.services.inProgress", { defaultValue: "In progress" })} {drawer.row.inProgress}
                  </p>
                  {access.routes && (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/routes" data-testid="link-route-visit">{t("customerPages.services.openRoutes")}</Link>
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
