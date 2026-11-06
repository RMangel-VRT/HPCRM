import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, Clock, CalendarClock, MinusCircle } from "lucide-react";
import type { Season } from "@shared/schema";
import { useCustomerServices, type CustomerService, type ServiceState } from "@/hooks/useCustomerServices";
import { useCustomerScope } from "@/lib/customerScope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ChecklistItemDetailPanel from "@/components/ChecklistItemDetailPanel";

export const SERVICE_GROUP_ORDER = ["overdue", "in_window", "upcoming", "done"] as const;
type GroupKey = typeof SERVICE_GROUP_ORDER[number];

interface Row {
  service: CustomerService;
  category: string;
  seasonId: string | null;
  completedAt: string | null;
  item: any | null;
}

const groupOf = (state: ServiceState): GroupKey => (state === "skipped" ? "done" : state);

function fmtDay(value: string | null | undefined, pattern = "MMM d") {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : format(d, pattern);
}

export function buildServiceRows(services: CustomerService[], items: any[]): Row[] {
  const byId = new Map(items.map(i => [`campaign:${i.id}`, i]));
  return services.map(service => {
    const item = byId.get(service.id) ?? null;
    return {
      service,
      item,
      category: String(item?.campaign?.category || item?.campaignCategory || (service.source === "route" ? "route" : "general")).toLowerCase(),
      seasonId: item?.campaign?.seasonId ?? null,
      completedAt: service.completedAt ?? item?.completedAt ?? null,
    };
  });
}

/** Compact category tiles from in-contract rows only, so extra billable is never double counted. */
export function categorySummary(rows: Row[]) {
  const map = new Map<string, { done: number; total: number }>();
  for (const r of rows) {
    if (!r.service.inContract) continue;
    const cur = map.get(r.category) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (r.service.state === "done") cur.done += 1;
    map.set(r.category, cur);
  }
  return Array.from(map.entries()).map(([category, v]) => ({ category, ...v }));
}

function StateIcon({ state }: { state: ServiceState }) {
  if (state === "done") return <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))]" aria-hidden="true" />;
  if (state === "skipped") return <MinusCircle className="w-4 h-4 text-muted-foreground" aria-hidden="true" />;
  if (state === "overdue") return <AlertCircle className="w-4 h-4 text-destructive" aria-hidden="true" />;
  if (state === "in_window") return <Clock className="w-4 h-4 text-[hsl(var(--est-warn))]" aria-hidden="true" />;
  return <CalendarClock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />;
}

export default function ServicesPage({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { services, items, isLoading, error } = useCustomerServices(customerId);
  const [groupBy, setGroupBy] = useState<"status" | "season">("status");
  const [selected, setSelected] = useState<Row | null>(null);
  const scope = useCustomerScope();
  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["/api/seasons", ...scope.scope], enabled: scope.enabled && groupBy === "season",
    queryFn: ({ signal }) => scope.getJson<Season[]>("/api/seasons", signal),
  });

  const rows = useMemo(() => buildServiceRows(services, items), [services, items]);
  const inContract = rows.filter(r => r.service.inContract);
  const extra = rows.filter(r => !r.service.inContract);
  const summary = categorySummary(rows);
  const categoryLabel = (c: string) => t(`cp1.categories.${c}`, { defaultValue: t(`customerPages.services.categoryFallback.${c}`, { defaultValue: c }) });

  const groups = useMemo(() => {
    if (groupBy === "status") {
      return SERVICE_GROUP_ORDER.map(g => ({
        key: g, label: t(`customerPages.services.groups.${g}`),
        rows: inContract.filter(r => groupOf(r.service.state) === g),
      })).filter(g => g.rows.length > 0);
    }
    const keys: string[] = [];
    const map: Record<string, Row[]> = {};
    for (const r of inContract) {
      const k = r.seasonId ?? "none";
      if (!map[k]) { map[k] = []; keys.push(k); }
      map[k].push(r);
    }
    return keys.map(k => ({
      key: k,
      label: k === "none" ? t("customerPages.services.noSeason") : seasons.find(s => s.id === k)?.name ?? t("customerPages.services.season"),
      rows: map[k],
    }));
  }, [groupBy, inContract, seasons, t]);

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }
  if (error) {
    return <p role="alert" className="text-sm text-destructive" data-testid="services-error">{t("cp1.loadFailed")}</p>;
  }

  const statusPill = (r: Row) => {
    const s = r.service.state;
    if (s === "done") return r.completedAt ? t("customerPages.services.doneOn", { date: fmtDay(r.completedAt) }) : t("customerPages.services.groups.done");
    if (s === "skipped") return t("cp1.serviceStates.skipped");
    return t(`customerPages.services.groups.${s}`);
  };
  const pillVariant = (s: ServiceState): "destructive" | "secondary" | "outline" | "default" =>
    s === "overdue" ? "destructive" : s === "done" ? "default" : s === "in_window" ? "secondary" : "outline";

  const renderRow = (r: Row) => (
    <button
      type="button"
      key={r.service.id}
      onClick={() => setSelected(r)}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover-elevate border-b last:border-b-0"
      data-testid={`row-service-${r.service.id}`}
    >
      <StateIcon state={r.service.state} />
      <span className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center md:gap-3">
        <span className="text-sm font-medium md:flex-1 md:min-w-0 md:truncate">{r.service.title || t("customerPages.services.untitled")}</span>
        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span className="md:w-28 md:truncate" data-testid={`text-service-category-${r.service.id}`}>{categoryLabel(r.category)}</span>
          <span className="md:w-32 tabular-nums" data-testid={`text-service-window-${r.service.id}`}>
            {r.service.start === r.service.end ? fmtDay(r.service.start) : `${fmtDay(r.service.start)} – ${fmtDay(r.service.end)}`}
          </span>
        </span>
      </span>
      <Badge variant={pillVariant(r.service.state)} className="text-xs whitespace-nowrap" data-testid={`status-service-${r.service.id}`}>
        {statusPill(r)}
      </Badge>
    </button>
  );

  return (
    <div className="space-y-5" data-testid="services-page">
      {summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" data-testid="services-summary">
          {summary.map(s => (
            <div key={s.category} className="rounded-md border bg-card px-3 py-2" data-testid={`tile-category-${s.category}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground truncate">{categoryLabel(s.category)}</span>
                <span className="text-sm font-semibold tabular-nums">{s.done} / {s.total}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">{t("customerPages.services.groupBy")}</span>
        <Select value={groupBy} onValueChange={v => setGroupBy(v as "status" | "season")}>
          <SelectTrigger className="w-36 h-8" data-testid="select-services-group-by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="status">{t("customerPages.services.byStatus")}</SelectItem>
            <SelectItem value="season">{t("customerPages.services.bySeason")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" data-testid="services-empty">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {t("customerPages.services.empty")}
        </CardContent></Card>
      ) : (
        <>
          {groups.map(g => (
            <section key={g.key} data-testid={`services-group-${g.key}`}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {g.label} <span className="tabular-nums">({g.rows.length})</span>
              </h3>
              <div className="rounded-md border bg-card">{g.rows.map(renderRow)}</div>
            </section>
          ))}
          {extra.length > 0 && (
            <section data-testid="services-not-in-contract">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {t("customerPages.services.notInContract")} <span className="tabular-nums">({extra.length})</span>
              </h3>
              <p className="text-xs text-muted-foreground mb-1.5">{t("customerPages.services.notInContractHint")}</p>
              <div className="rounded-md border bg-card">{extra.map(renderRow)}</div>
            </section>
          )}
        </>
      )}

      <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle data-testid="drawer-title">{selected.service.title || t("customerPages.services.untitled")}</SheetTitle>
                <SheetDescription>{t("customerPages.services.detailReadOnly")}</SheetDescription>
              </SheetHeader>
              {selected.item ? <ChecklistItemDetailPanel item={{
                ...selected.item,
                campaignTitle: selected.item.campaignTitle ?? selected.item.campaign?.title ?? "",
                campaignWindowStart: selected.item.campaignWindowStart ?? selected.item.campaign?.windowStart ?? selected.service.start,
                campaignWindowEnd: selected.item.campaignWindowEnd ?? selected.item.campaign?.windowEnd ?? selected.service.end,
                campaignCategory: selected.category,
              }} onClose={() => setSelected(null)} /> : <div className="space-y-4 text-sm">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={pillVariant(selected.service.state)} data-testid="drawer-status">{statusPill(selected)}</Badge>
                  <Badge variant="outline" data-testid="drawer-category">{categoryLabel(selected.category)}</Badge>
                  {!selected.service.inContract && <Badge variant="secondary">{t("customerPages.services.notInContract")}</Badge>}
                </div>
                <p className="text-muted-foreground" data-testid="drawer-window">
                  {t("customerPages.services.window")}: {fmtDay(selected.service.start, "MMM d, yyyy")}
                  {selected.service.end !== selected.service.start && ` – ${fmtDay(selected.service.end, "MMM d, yyyy")}`}
                </p>
                {selected.service.source === "route" && (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/routes" data-testid="link-route-visit">{t("customerPages.services.openRoutes")}</Link>
                  </Button>
                )}
              </div>}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
