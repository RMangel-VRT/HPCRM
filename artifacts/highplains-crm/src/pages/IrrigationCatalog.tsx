import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ShieldAlert, ChevronDown, ChevronRight, FileSpreadsheet, Lock, Search, Upload } from "lucide-react";
import type { IrrigationSyncRun } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { apiErrorMessage, companyHeaders, fetchJson, formatCents } from "@/lib/hardscapeCatalog";
import {
  IRRIGATION_API, IRRIGATION_IMPORT_URL, IRRIGATION_RUNS_URL, MAX_IMPORT_BYTES, condensedSpec, formatRunTime,
  irrigationListUrl, newestRun, runFromError, translateServerReason, type IrrigationListResponse,
} from "@/lib/irrigationCatalog";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const STATUS_COLOR: Record<string, string> = {
  success: "var(--ts-done)", partial: "var(--ts-waiting)", error: "var(--ts-lost)", running: "var(--ts-active)",
};

function RunStatus({ run }: { run: IrrigationSyncRun }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" data-testid={`status-run-${run.id}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[run.status] ?? "var(--ts-open)" }} />
      {t(`irrigationCatalog.status.${run.status}`, { defaultValue: run.status })}
    </span>
  );
}

function SkippedRows({ run }: { run: IrrigationSyncRun }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (run.itemsSkipped <= 0) return null;
  const rows = run.skippedRows ?? [];
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--est-warn))]" data-testid={`button-toggle-skipped-${run.id}`}>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {open ? t("irrigationCatalog.skippedHide") : t("irrigationCatalog.skippedToggle", { count: run.itemsSkipped })}
      </button>
      {open && (rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("irrigationCatalog.skippedNotRetained")}</p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded bg-muted/50 p-2 text-sm" data-testid={`list-skipped-${run.id}`}>
          {rows.map((s, i) => (
            <li key={`${s.line}-${i}`} className="flex gap-3" data-testid={`row-skipped-${run.id}-${s.line}`}>
              <span className="w-16 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{t("irrigationCatalog.skippedLine", { line: s.line })}</span>
              <span title={s.reason}>{translateServerReason(s.reason, t)}</span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function LastRunCard({ run }: { run: IrrigationSyncRun }) {
  const { t, i18n } = useTranslation();
  const loud = run.status === "partial" || run.status === "error";
  return (
    <div
      className={cn("rounded-md border border-l-4 bg-card p-4",
        run.status === "error" ? "border-l-destructive bg-destructive/5" : run.status === "partial" ? "border-l-[hsl(var(--est-warn))] bg-[hsl(var(--est-warn-bg))]/40" : "border-l-primary")}
      role={loud ? "alert" : undefined} aria-live="polite" data-testid="panel-last-run">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("irrigationCatalog.lastImport")}</p>
        <RunStatus run={run} />
        <span className="font-mono text-xs text-muted-foreground" data-testid="text-last-run-file">{run.filename || t("irrigationCatalog.unknownFile")}</span>
        <span className="text-xs text-muted-foreground">{t("irrigationCatalog.startedAt", { time: formatRunTime(run.startedAt, i18n.language) })}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium tabular-nums" data-testid="text-last-run-counts">
        {t("irrigationCatalog.counts", { upserted: run.itemsUpserted, deactivated: run.itemsDeactivated, skipped: run.itemsSkipped })}
      </p>
      {run.status === "partial" && (
        <p className="mt-2 flex gap-2 text-sm font-semibold text-[hsl(var(--est-warn))]" data-testid="text-partial-banner">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{t("irrigationCatalog.partialBanner")}
        </p>
      )}
      {run.status === "error" && (
        <div className="mt-2 text-sm text-destructive" data-testid="text-error-banner">
          <p className="flex gap-2 font-semibold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{t("irrigationCatalog.errorBanner")}</p>
          {run.errorMessage && <p className="ml-6 mt-0.5" data-testid="text-run-error-message">{translateServerReason(run.errorMessage, t)}</p>}
        </div>
      )}
      {run.status === "running" && <p className="mt-2 text-sm text-muted-foreground">{t("irrigationCatalog.runningBanner")}</p>}
      <SkippedRows run={run} />
    </div>
  );
}

export default function IrrigationCatalog() {
  const { user } = useAuth();
  const scope = `${user?.id ?? ""}|${user?.activeCompanyId ?? ""}|${user?.activeRole ?? ""}`;
  // Keyed by scope: every bit of transient state resets synchronously on company/user/role switch.
  return <IrrigationCatalogContent key={scope} />;
}

function IrrigationCatalogContent() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const scope = `${user?.id ?? ""}|${user?.activeCompanyId ?? ""}|${user?.activeRole ?? ""}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [companyId] = useState(() => user?.activeCompanyId ?? "");

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), DEBOUNCE_MS);
  const [category, setCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [justRun, setJustRun] = useState<IrrigationSyncRun | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scopeRef.current = scope; // re-arm after StrictMode cleanup replay
    return () => { scopeRef.current = ""; };
  }, [scope]);

  const allowed = user?.activeRole === "admin" || user?.activeRole === "office";
  const scopeKey = [user?.activeCompanyId, user?.id, user?.activeRole] as const;
  const url = irrigationListUrl({ search, category, brand, includeInactive });
  const queryKey = [IRRIGATION_API, ...scopeKey, search, category, brand, includeInactive] as const;
  const { data, isLoading, isError, refetch, isFetching } = useQuery<IrrigationListResponse>({
    queryKey,
    queryFn: ({ signal }) => fetchJson<IrrigationListResponse>(url, companyId, signal),
    enabled: !!user && allowed,
    staleTime: 30_000,
    placeholderData: (prev, prevQuery) => {
      const k = prevQuery?.queryKey;
      return k && k[1] === queryKey[1] && k[2] === queryKey[2] && k[3] === queryKey[3] ? prev : undefined;
    },
  });
  const runsQuery = useQuery<IrrigationSyncRun[]>({
    queryKey: [IRRIGATION_RUNS_URL, ...scopeKey],
    queryFn: ({ signal }) => fetchJson<IrrigationSyncRun[]>(IRRIGATION_RUNS_URL, companyId, signal),
    enabled: !!user && allowed,
    staleTime: 30_000,
    // Keep polling while any run is still in flight so a reload never sticks on "running".
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : false),
  });
  const items = data?.items ?? [];
  const categories = data?.categories ?? [];
  const brands = data?.brands ?? [];
  const runs = runsQuery.data ?? [];
  // History wins once it knows the run (or anything newer); justRun only bridges the refetch gap or a failed refetch.
  const candidates = justRun && !runs.some((r) => r.id === justRun.id) ? [justRun, ...runs] : runs;
  const lastRun = candidates[newestRun(candidates)] ?? null;
  const olderRuns = runs.filter((r) => r.id !== lastRun?.id);

  async function onFile(file: File) {
    const started = scope;
    const startedCompany = companyId;
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        toast({ title: t("irrigationCatalog.importFailed"), description: t("irrigationCatalog.fileTooLarge"), variant: "destructive" });
        return;
      }
      setImporting(true);
      const formData = new FormData();
      formData.append("file", file);
      let run: IrrigationSyncRun | null = null;
      let failure: unknown = null;
      try {
        const res = await apiRequest("POST", IRRIGATION_IMPORT_URL, formData, { headers: companyHeaders(startedCompany) });
        run = (await res.json()) as IrrigationSyncRun;
      } catch (err) {
        failure = err;
        run = runFromError(err);
      }
      qc.invalidateQueries({ queryKey: [IRRIGATION_API] });
      qc.invalidateQueries({ queryKey: [IRRIGATION_RUNS_URL] });
      if (started !== scopeRef.current) return;
      if (run) setJustRun(run);
      if (failure || run?.status === "error") {
        toast({ title: t("irrigationCatalog.importFailed"), description: translateServerReason(run?.errorMessage || apiErrorMessage(failure), t), variant: "destructive" });
      } else if (run) {
        toast({
          title: run.status === "partial" ? t("irrigationCatalog.importPartial") : t("irrigationCatalog.importDone"),
          description: t("irrigationCatalog.counts", { upserted: run.itemsUpserted, deactivated: run.itemsDeactivated, skipped: run.itemsSkipped }),
          variant: run.status === "partial" ? "destructive" : undefined,
        });
      }
    } finally {
      if (started === scopeRef.current) setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!allowed) {
    return (
      <SectionRailLayout rail={<EstimatesRail activeKey="irrigation" />}>
        <div role="alert" className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-md border bg-card p-8 text-center" data-testid="irrigation-denied">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm">{t("irrigationCatalog.denied")}</p>
        </div>
      </SectionRailLayout>
    );
  }

  const filtered = !!search || !!category || !!brand;
  const lang = i18n.language;

  const chips = (values: string[], current: string | null, set: (v: string | null) => void, kind: "category" | "brand", label: string) => (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label} data-testid={`chips-${kind}`}>
      <span className="mr-1 w-[68px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t(`irrigationCatalog.${kind}`)}</span>
      {[null, ...values].map((c) => {
        const on = current === c;
        return (
          <button key={c ?? "__all"} type="button" aria-pressed={on} onClick={() => set(c)} data-testid={`chip-${kind}-${c ?? "all"}`}
            className={cn("h-7 rounded-full border px-3 text-[12.5px] transition-colors",
              on ? "border-transparent bg-rail-active font-semibold text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover")}>
            {c ?? t("irrigationCatalog.all")}
          </button>
        );
      })}
    </div>
  );

  return (
    <SectionRailLayout rail={<EstimatesRail activeKey="irrigation" />}>
      <div className="mx-auto max-w-6xl" data-testid="page-irrigation-catalog">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--rail-active-icon))]">{t("estimates.catalogs")}</p>
            <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-bold tracking-tight" data-testid="text-page-title">
              {t("irrigationCatalog.title")}
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground" data-testid="badge-read-only">
                <Lock className="h-3 w-3" />{t("irrigationCatalog.readOnly")}
              </span>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("irrigationCatalog.subtitle")}</p>
          </div>
        </header>

        <section className="mt-5 rounded-lg border bg-[hsl(var(--table-header))]/60 p-4 sm:p-5" data-testid="panel-import" aria-labelledby="irr-import-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 max-w-2xl gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--rail-active-icon))]" />
              <div>
                <h2 id="irr-import-title" className="text-sm font-semibold">{t("irrigationCatalog.importTitle")}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground" data-testid="text-import-helper">{t("irrigationCatalog.helper")}</p>
                <p className="mt-2 rounded border border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn-bg))]/50 px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--est-warn))]" data-testid="text-replace-warning">
                  {t("irrigationCatalog.replaceWarning")}
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{t("irrigationCatalog.headersHint")}</p>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} data-testid="input-import-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <Button onClick={() => fileRef.current?.click()} disabled={importing} data-testid="button-import-irrigopro">
              <Upload className="mr-1.5 h-4 w-4" />{importing ? t("irrigationCatalog.importing") : t("irrigationCatalog.importButton")}
            </Button>
          </div>

          <div className="mt-4">
            {runsQuery.isError && (
              <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 text-sm text-destructive" data-testid="runs-error">
                {t("irrigationCatalog.historyError")}
                <Button size="sm" variant="outline" onClick={() => runsQuery.refetch()} data-testid="button-runs-retry">{t("irrigationCatalog.retry")}</Button>
              </div>
            )}
            {runsQuery.isLoading && !lastRun ? (
              <Skeleton className="h-16 w-full" role="status" aria-label={t("irrigationCatalog.historyLoading")} />
            ) : lastRun ? (
              <LastRunCard key={lastRun.id} run={lastRun} />
            ) : runsQuery.isError ? null : (
              <p className="text-sm text-muted-foreground" data-testid="text-no-imports">{t("irrigationCatalog.noImports")}</p>
            )}
          </div>

          {olderRuns.length > 0 && (
            <details className="mt-3 group" data-testid="panel-history">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {t("irrigationCatalog.history")} ({olderRuns.length})
              </summary>
              <ul className="mt-2 divide-y rounded-md border bg-card">
                {olderRuns.map((r) => (
                  <li key={r.id} className="px-3 py-2" data-testid={`row-run-${r.id}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <RunStatus run={r} />
                      <span className="font-mono text-xs">{r.filename || t("irrigationCatalog.unknownFile")}</span>
                      <span className="text-xs text-muted-foreground">{formatRunTime(r.startedAt, lang)}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {t("irrigationCatalog.counts", { upserted: r.itemsUpserted, deactivated: r.itemsDeactivated, skipped: r.itemsSkipped })}
                      </span>
                    </div>
                    {r.errorMessage && <p className="mt-0.5 text-xs text-destructive">{translateServerReason(r.errorMessage, t)}</p>}
                    <SkippedRows run={r} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("irrigationCatalog.searchPlaceholder")}
              aria-label={t("irrigationCatalog.searchLabel")} className="pl-8" data-testid="input-search" />
          </div>
          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} data-testid="switch-include-inactive" />
            {t("irrigationCatalog.showInactive")}
          </label>
        </div>

        <div className="mt-3 space-y-2">
          {chips(categories, category, setCategory, "category", t("irrigationCatalog.categoriesLabel"))}
          {brands.length > 0 && chips(brands, brand, setBrand, "brand", t("irrigationCatalog.brandsLabel"))}
        </div>

        <div className="mt-4">
          {isError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-5" data-testid="irrigation-error">
              <p className="text-sm">{t("irrigationCatalog.loadError")}</p>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-irrigation-retry">{t("irrigationCatalog.retry")}</Button>
            </div>
          ) : isLoading ? (
            <div role="status" aria-label={t("irrigationCatalog.loading")} className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/60 px-6 py-12 text-center" data-testid="irrigation-empty">
              <p className="font-semibold">{filtered ? t("irrigationCatalog.noMatches") : t("irrigationCatalog.empty")}</p>
              {filtered ? (
                <Button variant="ghost" className="mt-2" onClick={() => { setSearchInput(""); setCategory(null); setBrand(null); }} data-testid="button-clear-filters">
                  {t("irrigationCatalog.clearFilters")}
                </Button>
              ) : <p className="mt-1 text-sm text-muted-foreground">{t("irrigationCatalog.emptyHint")}</p>}
            </div>
          ) : (
            <div className={cn("overflow-x-auto rounded-md border bg-card transition-opacity", isFetching && "opacity-70")}>
              <Table data-testid="table-irrigation">
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))]">
                    <TableHead>{t("irrigationCatalog.col.name")}</TableHead>
                    <TableHead>{t("irrigationCatalog.col.sku")}</TableHead>
                    <TableHead>{t("irrigationCatalog.col.category")}</TableHead>
                    <TableHead>{t("irrigationCatalog.col.spec")}</TableHead>
                    <TableHead>{t("irrigationCatalog.col.unit")}</TableHead>
                    <TableHead className="text-right">{t("irrigationCatalog.col.cost")}</TableHead>
                    <TableHead className="text-right">{t("irrigationCatalog.col.price")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id} data-testid={`row-item-${it.id}`} data-inactive={!it.isActive || undefined}
                      className={cn(!it.isActive && "bg-muted/40 text-muted-foreground opacity-70")}>
                      <TableCell className="max-w-[300px]">
                        <div className={cn("font-medium", it.isActive && "text-foreground")} data-testid={`text-name-${it.id}`}>{it.name}</div>
                        {!it.isActive && <span className="text-[11px] font-semibold uppercase tracking-wide" data-testid={`status-inactive-${it.id}`}>{t("irrigationCatalog.inactive")}</span>}
                        {it.description && <div className="line-clamp-2 text-xs text-muted-foreground">{it.description}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs" data-testid={`text-sku-${it.id}`}>{it.externalSku}</TableCell>
                      <TableCell><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{it.category}</span></TableCell>
                      <TableCell className="text-xs" data-testid={`text-spec-${it.id}`}>{condensedSpec(it)}</TableCell>
                      <TableCell className="text-xs">{it.unit}</TableCell>
                      <TableCell className="text-right tabular-nums" data-testid={`text-cost-${it.id}`}>{formatCents(it.wholesaleCostCents, lang)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums" data-testid={`text-price-${it.id}`}>{formatCents(it.retailPriceCents, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t px-3 py-2 text-xs tabular-nums text-muted-foreground" data-testid="text-item-count">{t("irrigationCatalog.itemCount", { count: items.length })}</p>
            </div>
          )}
        </div>
      </div>
    </SectionRailLayout>
  );
}
