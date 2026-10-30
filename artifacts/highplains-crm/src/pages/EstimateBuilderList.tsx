import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { FilePlus2, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { fetchJson, formatCents } from "@/lib/hardscapeCatalog";
import { scopeOf } from "@/lib/estimateSettings";
import {
  ESTIMATES_API, LIST_STATUSES, builderPath, formatDate, listUrl, sendEstimate, type EstimateListItemDto, type ListStatusFilter,
} from "@/lib/estimateBuilder";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import CustomerSearchInput from "@/components/CustomerSearchInput";
import { StatusPill } from "@/components/estimates/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export default function EstimateBuilderList() {
  const { user } = useAuth();
  return <ListContent key={scopeOf(user)} />;
}

function NewEstimateDialog({ open, onClose, companyId, scope }: { open: boolean; onClose: () => void; companyId: string; scope: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<{ customer?: string; title?: string; form?: string }>({});
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; return () => { scopeRef.current = ""; }; }, [scope]);
  useEffect(() => { if (open) { setCustomer(null); setTitle(""); setErrors({}); } }, [open]);

  const create = useMutation({
    mutationFn: (v: { customerId: string; title: string; scope: string }) => sendEstimate("POST", ESTIMATES_API, companyId, { customerId: v.customerId, title: v.title }),
    onSuccess: (d, v) => {
      qc.invalidateQueries({ queryKey: [ESTIMATES_API, "list"] });
      if (v.scope !== scopeRef.current) return;
      onClose();
      setLocation(builderPath(d.id));
    },
    onError: (err, v) => { if (v.scope === scopeRef.current) setErrors({ form: t("estimateBuilder.createFailed") }); },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!customer) errs.customer = t("estimateBuilder.errCustomer");
    if (!title.trim()) errs.title = t("estimateBuilder.errTitle");
    setErrors(errs);
    if (Object.keys(errs).length || !customer) return;
    create.mutate({ customerId: customer.id, title: title.trim(), scope });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-new-estimate">
        <DialogHeader>
          <DialogTitle>{t("estimateBuilder.newTitle")}</DialogTitle>
          <DialogDescription>{t("estimateBuilder.newBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t("estimateBuilder.customer")}</Label>
            <CustomerSearchInput onSelect={(c) => setCustomer({ id: c.id, name: c.name })} selectedId={customer?.id}
              selectedCustomerName={customer?.name ?? ""} placeholder={t("estimateBuilder.customerPlaceholder")} testId="input-estimate-customer"
              expectedCompanyId={companyId} requestScope={scope} />
            {errors.customer && <p className="text-xs font-medium text-destructive" data-testid="error-customer">{errors.customer}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="est-new-title">{t("estimateBuilder.title")}</Label>
            <Input id="est-new-title" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} data-testid="input-estimate-title" />
            {errors.title && <p className="text-xs font-medium text-destructive" data-testid="error-title">{errors.title}</p>}
          </div>
          {errors.form && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-form">{errors.form}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-new">{t("estimateBuilder.cancel")}</Button>
            <Button type="submit" disabled={create.isPending} data-testid="button-create-estimate">
              {create.isPending ? t("estimateBuilder.creating") : t("estimateBuilder.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ListContent() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const scope = scopeOf(user);
  const [companyId] = useState(() => user?.activeCompanyId ?? "");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), 300);
  const [includeVoid, setIncludeVoid] = useState(false);
  const [status, setStatus] = useState<ListStatusFilter | null>(null);
  const [creating, setCreating] = useState(false);
  const allowed = user?.activeRole === "admin" || user?.activeRole === "office";
  const url = listUrl(search, includeVoid, status);
  const { data, isLoading, isError, refetch, isFetching } = useQuery<EstimateListItemDto[]>({
    queryKey: [ESTIMATES_API, "list", user?.activeCompanyId, user?.id, user?.activeRole, search, includeVoid, status ?? "all"],
    queryFn: ({ signal }) => fetchJson<EstimateListItemDto[]>(url, companyId, signal),
    enabled: !!user && allowed,
  });
  const rows = data ?? [];
  const lang = i18n.language;

  return (
    <SectionRailLayout rail={<EstimatesRail activeKey="builder" />}>
      <div className="mx-auto max-w-6xl" data-testid="page-estimate-list">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--rail-active-icon))]">{t("estimateBuilder.eyebrow")}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight" data-testid="text-page-title">{t("estimateBuilder.listTitle")}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("estimateBuilder.listSubtitle")}</p>
          </div>
          <Button onClick={() => setCreating(true)} data-testid="button-new-estimate">
            <FilePlus2 className="mr-1.5 h-4 w-4" />{t("estimateBuilder.newEstimate")}
          </Button>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("estimateBuilder.searchPlaceholder")}
              aria-label={t("estimateBuilder.searchLabel")} className="pl-8" data-testid="input-search" />
          </div>
          <div role="radiogroup" aria-label={t("estimateBuilder.filter.label")} className="inline-flex flex-wrap items-center gap-1 rounded-full border bg-card p-0.5" data-testid="filter-status">
            {([null, ...LIST_STATUSES] as (ListStatusFilter | null)[]).map((f) => {
              const on = status === f;
              return (
                <button key={f ?? "all"} type="button" role="radio" aria-checked={on} onClick={() => setStatus(f)} data-testid={`filter-status-${f ?? "all"}`}
                  className={cn("h-7 rounded-full px-3 text-xs font-medium transition-colors", on ? "bg-rail-active text-rail-active-foreground" : "text-muted-foreground hover:bg-rail-hover hover:text-foreground")}>
                  {t(`estimateBuilder.filter.${f ?? "all"}`)}
                </button>
              );
            })}
          </div>
          <label className="ml-auto inline-flex items-center gap-2 text-sm" title={status === "void" ? t("estimateBuilder.filter.voidIncluded") : undefined}>
            <Switch checked={status === "void" || includeVoid} disabled={status === "void"} onCheckedChange={setIncludeVoid} data-testid="switch-show-void"
              aria-describedby={status === "void" ? "est-void-included" : undefined} />
            {t("estimateBuilder.showVoid")}
            {status === "void" && <span id="est-void-included" className="sr-only">{t("estimateBuilder.filter.voidIncluded")}</span>}
          </label>
        </div>

        <div className="mt-4">
          {isError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-5" data-testid="estimates-error">
              <p className="text-sm">{t("estimateBuilder.loadError")}</p>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">{t("estimateBuilder.retry")}</Button>
            </div>
          ) : isLoading ? (
            <div role="status" aria-label={t("estimateBuilder.loading")} className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/60 px-6 py-12 text-center" data-testid="estimates-empty">
              <p className="font-semibold">{search || status ? t("estimateBuilder.noMatches") : t("estimateBuilder.empty")}</p>
              {search || status ? (
                <Button variant="ghost" className="mt-2" onClick={() => { setSearchInput(""); setStatus(null); }} data-testid="button-clear-search">{t("estimateBuilder.clearFilters")}</Button>
              ) : <p className="mt-1 text-sm text-muted-foreground">{t("estimateBuilder.emptyHint")}</p>}
            </div>
          ) : (
            <div className={cn("overflow-x-auto rounded-md border bg-card transition-opacity", isFetching && "opacity-70")}>
              <Table data-testid="table-estimates">
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))]">
                    <TableHead>{t("estimateBuilder.col.number")}</TableHead>
                    <TableHead>{t("estimateBuilder.col.title")}</TableHead>
                    <TableHead>{t("estimateBuilder.col.customer")}</TableHead>
                    <TableHead>{t("estimateBuilder.col.ticket")}</TableHead>
                    <TableHead>{t("estimateBuilder.col.version")}</TableHead>
                    <TableHead className="text-right">{t("estimateBuilder.col.subtotal")}</TableHead>
                    <TableHead>{t("estimateBuilder.col.updated")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} data-testid={`row-estimate-${r.id}`} className={cn(r.voidedAt && "text-muted-foreground")}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        <Link href={builderPath(r.id)} className="font-semibold text-foreground underline-offset-2 hover:underline" data-testid={`link-estimate-${r.id}`}>{r.estimateNumber}</Link>
                      </TableCell>
                      <TableCell className="max-w-[280px] font-medium" data-testid={`text-title-${r.id}`}>{r.title}</TableCell>
                      <TableCell>
                        <Link href={`/dashboard/customers/${r.customerId}`} className="hover:underline" data-testid={`link-customer-${r.id}`}>{r.customerName}</Link>
                      </TableCell>
                      <TableCell>
                        {r.ticketId
                          ? <Link href={`/dashboard/tickets/${r.ticketId}`} className="text-xs underline-offset-2 hover:underline" data-testid={`link-ticket-${r.id}`}>{t("estimateBuilder.openTicket")}</Link>
                          : <span className="text-muted-foreground">{t("estimateBuilder.noTicket")}</span>}
                      </TableCell>
                      <TableCell data-testid={`text-version-${r.id}`}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {r.currentVersionNumber != null && r.currentVersionStatus &&
                            <StatusPill status={r.currentVersionStatus} label={t("estimateBuilder.versionPill", { n: r.currentVersionNumber, status: t(`estimateBuilder.status.${r.currentVersionStatus}`) })} />}
                          {r.voidedAt && <StatusPill status="void" label={t("estimateBuilder.voided")} />}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums" data-testid={`text-subtotal-${r.id}`}>{r.subtotalCents == null ? "—" : formatCents(r.subtotalCents, lang)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(r.updatedAt, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t px-3 py-2 text-xs tabular-nums text-muted-foreground" data-testid="text-estimate-count">{t("estimateBuilder.count", { count: rows.length })}</p>
            </div>
          )}
        </div>
      </div>
      <NewEstimateDialog open={creating} onClose={() => setCreating(false)} companyId={companyId} scope={scope} />
    </SectionRailLayout>
  );
}
