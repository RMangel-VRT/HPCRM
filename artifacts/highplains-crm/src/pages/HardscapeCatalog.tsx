import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Download, Pencil, Plus, Power, RotateCcw, Search, Upload, X } from "lucide-react";
import type { HardscapeCatalogItem } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  HARDSCAPE_API, SUGGESTED_CATEGORIES, SUGGESTED_UNITS, apiErrorMessage, catalogListUrl, centsToInput, fetchJson, companyHeaders,
  filenameFromDisposition, formatCents, parseDollarsToCents,
  type HardscapeEditable, type HardscapeImportResult, type HardscapeListResponse,
} from "@/lib/hardscapeCatalog";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type FormState = { sku: string; category: string; name: string; description: string; unit: string; cost: string; price: string; isActive: boolean };
type FormErrors = Partial<Record<"category" | "name" | "unit" | "cost" | "price" | "form", string>>;

function toForm(item: HardscapeCatalogItem | null): FormState {
  return item
    ? { sku: item.sku ?? "", category: item.category, name: item.name, description: item.description ?? "", unit: item.unit,
        cost: centsToInput(item.wholesaleCostCents), price: centsToInput(item.retailPriceCents), isActive: item.isActive }
    : { sku: "", category: "general", name: "", description: "", unit: "ea", cost: "", price: "", isActive: true };
}

function ItemDialog(props: {
  open: boolean; item: HardscapeCatalogItem | null; categories: string[]; scope: string; companyId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { open, item, categories, scope, companyId, onClose, onSaved } = props;
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(item));
  const [errors, setErrors] = useState<FormErrors>({});
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => { if (open) { setForm(toForm(item)); setErrors({}); } }, [open, item]);
  useEffect(() => {
    scopeRef.current = scope; // re-arm after StrictMode cleanup replay
    return () => { scopeRef.current = ""; };
  }, [scope]);

  const suggestions = useMemo(
    () => Array.from(new Set([...SUGGESTED_CATEGORIES, ...categories])).sort((a, b) => (a === "general" ? -1 : b === "general" ? 1 : a.localeCompare(b))),
    [categories],
  );

  const save = useMutation({
    mutationFn: async (vars: { body: Partial<HardscapeEditable>; scope: string; companyId: string }) => {
      const opts = { headers: companyHeaders(vars.companyId) };
      const res = item
        ? await apiRequest("PATCH", `${HARDSCAPE_API}/${item.id}`, vars.body, opts)
        : await apiRequest("POST", HARDSCAPE_API, vars.body, opts);
      return res.json() as Promise<HardscapeCatalogItem>;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [HARDSCAPE_API] });
      if (vars.scope !== scopeRef.current) return;
      onSaved();
    },
    onError: (err, vars) => {
      if (vars.scope !== scopeRef.current) return;
      setErrors({ form: apiErrorMessage(err) });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: FormErrors = {};
    const category = form.category.trim(), name = form.name.trim(), unit = form.unit.trim();
    if (!category) errs.category = t("hardscapeCatalog.err.required");
    if (!name) errs.name = t("hardscapeCatalog.err.required");
    if (!unit) errs.unit = t("hardscapeCatalog.err.required");
    const cost = parseDollarsToCents(form.cost), price = parseDollarsToCents(form.price);
    if (cost === "invalid") errs.cost = t("hardscapeCatalog.err.dollars");
    if (cost === "tooLarge") errs.cost = t("hardscapeCatalog.err.tooLarge");
    if (price === "invalid") errs.price = t("hardscapeCatalog.err.dollars");
    if (price === "tooLarge") errs.price = t("hardscapeCatalog.err.tooLarge");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const full: HardscapeEditable = {
      sku: form.sku.trim() || null, category, name, description: form.description === "" ? null : form.description, unit,
      wholesaleCostCents: cost as number | null, retailPriceCents: price as number | null, isActive: form.isActive,
    };
    let body: Partial<HardscapeEditable> = full;
    if (item) {
      body = {};
      (Object.keys(full) as (keyof HardscapeEditable)[]).forEach((k) => {
        if (full[k] !== item[k]) (body as Record<string, unknown>)[k] = full[k];
      });
      if (Object.keys(body).length === 0) { onSaved(); return; }
    }
    save.mutate({ body, scope, companyId });
  }

  const set = (k: keyof FormState) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const fieldErr = (k: keyof FormErrors) => errors[k] && (
    <p className="text-xs font-medium text-destructive" id={`err-${k}`} data-testid={`error-${k}`}>{errors[k]}</p>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-hardscape-item">
        <DialogHeader>
          <DialogTitle>{item ? t("hardscapeCatalog.edit") : t("hardscapeCatalog.add")}</DialogTitle>
          <DialogDescription>{t("hardscapeCatalog.subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="grid gap-1.5">
              <Label htmlFor="hc-name">{t("hardscapeCatalog.field.name")}</Label>
              <Input id="hc-name" value={form.name} onChange={(e) => set("name")(e.target.value)} aria-invalid={!!errors.name} data-testid="input-name" />
              {fieldErr("name")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hc-sku">{t("hardscapeCatalog.field.sku")}</Label>
              <Input id="hc-sku" value={form.sku} onChange={(e) => set("sku")(e.target.value)} className="font-mono" data-testid="input-sku" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="grid gap-1.5">
              <Label htmlFor="hc-category">{t("hardscapeCatalog.field.category")}</Label>
              <Input id="hc-category" role="combobox" list="hc-category-options" autoComplete="off" value={form.category}
                onChange={(e) => set("category")(e.target.value)} aria-invalid={!!errors.category} data-testid="input-category" />
              <datalist id="hc-category-options" data-testid="list-category-options">
                {suggestions.map((c) => <option key={c} value={c} />)}
              </datalist>
              <div className="flex flex-wrap gap-1" aria-hidden="false">
                {suggestions.slice(0, 9).map((c) => (
                  <button type="button" key={c} onClick={() => set("category")(c)} data-testid={`suggest-category-${c}`}
                    className={cn("rounded-full border px-2 py-0.5 text-[11px] hover-elevate",
                      form.category === c ? "border-primary bg-primary/15 font-semibold" : "text-muted-foreground")}>
                    {c}
                  </button>
                ))}
              </div>
              {errors.category ? fieldErr("category") : <p className="text-[11px] text-muted-foreground">{t("hardscapeCatalog.categoryHint")}</p>}
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="hc-unit">{t("hardscapeCatalog.field.unit")}</Label>
              <Input id="hc-unit" list="hc-unit-options" autoComplete="off" value={form.unit} onChange={(e) => set("unit")(e.target.value)} aria-invalid={!!errors.unit} data-testid="input-unit" />
              <datalist id="hc-unit-options">{SUGGESTED_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
              {fieldErr("unit")}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hc-description">{t("hardscapeCatalog.field.description")}</Label>
            <Textarea id="hc-description" rows={2} value={form.description} onChange={(e) => set("description")(e.target.value)} data-testid="input-description" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="hc-cost">{t("hardscapeCatalog.field.cost")}</Label>
              <Input id="hc-cost" inputMode="decimal" value={form.cost} onChange={(e) => set("cost")(e.target.value)} className="tabular-nums" aria-invalid={!!errors.cost} data-testid="input-cost" />
              {fieldErr("cost")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hc-price">{t("hardscapeCatalog.field.price")}</Label>
              <Input id="hc-price" inputMode="decimal" value={form.price} onChange={(e) => set("price")(e.target.value)} className="tabular-nums" aria-invalid={!!errors.price} data-testid="input-price" />
              {fieldErr("price")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="hc-active" checked={form.isActive} onCheckedChange={(v) => set("isActive")(v)} data-testid="switch-active" />
            <Label htmlFor="hc-active">{t("hardscapeCatalog.field.isActive")}</Label>
          </div>
          {errors.form && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-form">{errors.form}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-item">{t("hardscapeCatalog.cancel")}</Button>
            <Button type="submit" disabled={save.isPending} data-testid="button-save-item">
              {save.isPending ? t("hardscapeCatalog.saving") : item ? t("hardscapeCatalog.save") : t("hardscapeCatalog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function HardscapeCatalog() {
  const { user } = useAuth();
  const scope = `${user?.id ?? ""}|${user?.activeCompanyId ?? ""}|${user?.activeRole ?? ""}`;
  // Reset synchronously: old-company dialog prices must never render in a new scope.
  return <HardscapeCatalogContent key={scope} />;
}

function HardscapeCatalogContent() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const scope = `${user?.id ?? ""}|${user?.activeCompanyId ?? ""}|${user?.activeRole ?? ""}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // Captured at mount; this component is keyed by scope so it never changes for its lifetime.
  const [companyId] = useState(() => user?.activeCompanyId ?? "");

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), DEBOUNCE_MS);
  const [category, setCategory] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [dialog, setDialog] = useState<{ item: HardscapeCatalogItem | null } | null>(null);
  const [confirmItem, setConfirmItem] = useState<HardscapeCatalogItem | null>(null);
  const [importResult, setImportResult] = useState<HardscapeImportResult | null>(null);
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const exportAbort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Company / user / role switch: drop every piece of transient state from the previous scope.
  useEffect(() => {
    setSearchInput(""); setCategory(null); setIncludeInactive(false);
    setDialog(null); setConfirmItem(null); setImportResult(null); setSkippedOpen(false);
    setImporting(false);
    exportAbort.current?.abort(); exportAbort.current = null; setExporting(false);
    scopeRef.current = scope; // re-arm after StrictMode cleanup replay
    return () => { exportAbort.current?.abort(); scopeRef.current = ""; };
  }, [scope]);

  const allowed = user?.activeRole === "admin" || user?.activeRole === "office";
  const url = catalogListUrl({ search, category, includeInactive });
  const queryKey = [HARDSCAPE_API, user?.activeCompanyId, user?.id, user?.activeRole, search, category, includeInactive] as const;
  const { data, isLoading, isError, refetch, isFetching } = useQuery<HardscapeListResponse>({
    queryKey,
    queryFn: ({ signal }) => fetchJson<HardscapeListResponse>(url, companyId, signal),
    enabled: !!user && allowed,
    staleTime: 30_000,
    placeholderData: (prev, prevQuery) => {
      const k = prevQuery?.queryKey;
      return k && k[1] === queryKey[1] && k[2] === queryKey[2] && k[3] === queryKey[3] ? prev : undefined;
    },
  });
  const items = data?.items ?? [];
  const categories = data?.categories ?? [];

  const toggleActive = useMutation({
    mutationFn: async (vars: { item: HardscapeCatalogItem; next: boolean; scope: string; companyId: string }) =>
      vars.next
        ? apiRequest("PATCH", `${HARDSCAPE_API}/${vars.item.id}`, { isActive: true }, { headers: companyHeaders(vars.companyId) })
        : apiRequest("DELETE", `${HARDSCAPE_API}/${vars.item.id}`, undefined, { headers: companyHeaders(vars.companyId) }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: [HARDSCAPE_API] });
      if (vars.scope !== scopeRef.current) return;
      toast({ title: vars.next ? t("hardscapeCatalog.reactivated") : t("hardscapeCatalog.deactivated"), description: vars.item.name });
    },
    onError: (err, vars) => {
      if (vars.scope !== scopeRef.current) return;
      toast({ title: t("hardscapeCatalog.actionFailed"), description: apiErrorMessage(err), variant: "destructive" });
    },
  });

  async function onFile(file: File) {
    const started = scope;
    const startedCompany = companyId;
    setImporting(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error(t("hardscapeCatalog.fileTooLarge"));
      if (started !== scopeRef.current) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiRequest("POST", `${HARDSCAPE_API}/import-csv`, formData, { headers: companyHeaders(startedCompany) });
      const result = (await res.json()) as HardscapeImportResult;
      qc.invalidateQueries({ queryKey: [HARDSCAPE_API] });
      if (started !== scopeRef.current) return;
      setImportResult(result); setSkippedOpen(false);
      toast({
        title: t("hardscapeCatalog.importDone"),
        description: t("hardscapeCatalog.importSummary", { inserted: result.inserted, updated: result.updated, skipped: result.skipped.length }),
      });
    } catch (err) {
      if (started !== scopeRef.current) return;
      toast({ title: t("hardscapeCatalog.importFailed"), description: apiErrorMessage(err), variant: "destructive" });
    } finally {
      if (started === scopeRef.current) setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onExport() {
    const started = scope;
    const startedCompany = companyId;
    exportAbort.current?.abort();
    const ctrl = new AbortController();
    exportAbort.current = ctrl;
    setExporting(true);
    try {
      const res = await apiRequest("GET", `${HARDSCAPE_API}/export-csv`, undefined, { headers: companyHeaders(startedCompany), signal: ctrl.signal });
      const blob = await res.blob();
      if (ctrl.signal.aborted || started !== scopeRef.current) return;
      const name = filenameFromDisposition(res.headers.get("Content-Disposition"), "hardscape-catalog.csv");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 0);
    } catch (err) {
      if (ctrl.signal.aborted || started !== scopeRef.current) return;
      toast({ title: t("hardscapeCatalog.exportFailed"), description: apiErrorMessage(err), variant: "destructive" });
    } finally {
      if (exportAbort.current === ctrl) { exportAbort.current = null; setExporting(false); }
    }
  }

  const filtered = !!search || !!category;
  const lang = i18n.language;

  return (
    <SectionRailLayout rail={<EstimatesRail activeKey="hardscape" />}>
      <div className="mx-auto max-w-6xl" data-testid="page-hardscape-catalog">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--rail-active-icon))]">{t("estimates.catalogs")}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight" data-testid="text-page-title">{t("hardscapeCatalog.title")}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("hardscapeCatalog.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} data-testid="input-import-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} data-testid="button-import-csv">
              <Upload className="mr-1.5 h-4 w-4" />{importing ? t("hardscapeCatalog.importing") : t("hardscapeCatalog.importCsv")}
            </Button>
            <Button variant="outline" onClick={() => void onExport()} disabled={exporting} data-testid="button-export-csv">
              <Download className="mr-1.5 h-4 w-4" />{exporting ? t("hardscapeCatalog.exporting") : t("hardscapeCatalog.exportCsv")}
            </Button>
            <Button onClick={() => setDialog({ item: null })} data-testid="button-add-item">
              <Plus className="mr-1.5 h-4 w-4" />{t("hardscapeCatalog.add")}
            </Button>
          </div>
        </header>

        {importResult && (
          <section className="mt-5 rounded-md border border-l-4 border-l-primary bg-card p-4" data-testid="panel-import-result" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{t("hardscapeCatalog.importDone")}</p>
                <p className="text-sm tabular-nums text-muted-foreground" data-testid="text-import-summary">
                  {t("hardscapeCatalog.importSummary", { inserted: importResult.inserted, updated: importResult.updated, skipped: importResult.skipped.length })}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label={t("hardscapeCatalog.dismiss")} onClick={() => setImportResult(null)} data-testid="button-dismiss-import">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {importResult.skipped.length > 0 && (
              <div className="mt-2">
                <button type="button" onClick={() => setSkippedOpen((o) => !o)} aria-expanded={skippedOpen}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--est-warn))]" data-testid="button-toggle-skipped">
                  {skippedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {skippedOpen ? t("hardscapeCatalog.skippedHide") : t("hardscapeCatalog.skippedToggle", { count: importResult.skipped.length })}
                </button>
                {skippedOpen && (
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded bg-muted/50 p-2 text-sm" data-testid="list-skipped">
                    {importResult.skipped.map((s, i) => (
                      <li key={`${s.line}-${i}`} className="flex gap-3" data-testid={`row-skipped-${s.line}`}>
                        <span className="w-16 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{t("hardscapeCatalog.skippedLine", { line: s.line })}</span>
                        <span>{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("hardscapeCatalog.searchPlaceholder")}
              aria-label={t("hardscapeCatalog.searchLabel")} className="pl-8" data-testid="input-search" />
          </div>
          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} data-testid="switch-include-inactive" />
            {t("hardscapeCatalog.showInactive")}
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t("hardscapeCatalog.categoriesLabel")} data-testid="chips-category">
          {[null, ...categories].map((c) => {
            const on = category === c;
            return (
              <button key={c ?? "__all"} type="button" aria-pressed={on} onClick={() => setCategory(c)}
                data-testid={`chip-category-${c ?? "all"}`}
                className={cn("h-7 rounded-full border px-3 text-[12.5px] transition-colors",
                  on ? "border-transparent bg-rail-active font-semibold text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover")}>
                {c ?? t("hardscapeCatalog.allCategories")}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {isError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-5" data-testid="hardscape-error">
              <p className="text-sm">{t("hardscapeCatalog.loadError")}</p>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-hardscape-retry">{t("hardscapeCatalog.retry")}</Button>
            </div>
          ) : isLoading ? (
            <div role="status" aria-label={t("hardscapeCatalog.loading")} className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/60 px-6 py-12 text-center" data-testid="hardscape-empty">
              <p className="font-semibold">{filtered ? t("hardscapeCatalog.noMatches") : t("hardscapeCatalog.empty")}</p>
              {filtered ? (
                <Button variant="ghost" className="mt-2" onClick={() => { setSearchInput(""); setCategory(null); }} data-testid="button-clear-filters">
                  {t("hardscapeCatalog.clearFilters")}
                </Button>
              ) : <p className="mt-1 text-sm text-muted-foreground">{t("hardscapeCatalog.emptyHint")}</p>}
            </div>
          ) : (
            <div className={cn("overflow-x-auto rounded-md border bg-card transition-opacity", isFetching && "opacity-70")}>
              <Table data-testid="table-hardscape">
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))]">
                    <TableHead>{t("hardscapeCatalog.col.name")}</TableHead>
                    <TableHead>{t("hardscapeCatalog.col.sku")}</TableHead>
                    <TableHead>{t("hardscapeCatalog.col.category")}</TableHead>
                    <TableHead>{t("hardscapeCatalog.col.unit")}</TableHead>
                    <TableHead className="text-right">{t("hardscapeCatalog.col.cost")}</TableHead>
                    <TableHead className="text-right">{t("hardscapeCatalog.col.price")}</TableHead>
                    <TableHead>{t("hardscapeCatalog.col.active")}</TableHead>
                    <TableHead className="text-right"><span className="sr-only">{t("hardscapeCatalog.col.actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id} data-testid={`row-item-${it.id}`} className={cn(!it.isActive && "text-muted-foreground")}>
                      <TableCell className="max-w-[320px]">
                        <div className="font-medium text-foreground" data-testid={`text-name-${it.id}`}>{it.name}</div>
                        {it.description && <div className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{it.description}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{it.sku ?? ""}</TableCell>
                      <TableCell><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{it.category}</span></TableCell>
                      <TableCell className="text-xs">{it.unit}</TableCell>
                      <TableCell className="text-right tabular-nums" data-testid={`text-cost-${it.id}`}>{formatCents(it.wholesaleCostCents, lang)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums" data-testid={`text-price-${it.id}`}>{formatCents(it.retailPriceCents, lang)}</TableCell>
                      <TableCell>
                        <span data-testid={`status-active-${it.id}`} className={cn("inline-flex items-center gap-1.5 text-xs")}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.isActive ? "var(--ts-done)" : "var(--ts-open)" }} />
                          {it.isActive ? t("hardscapeCatalog.active") : t("hardscapeCatalog.inactive")}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button size="icon" variant="ghost" aria-label={`${t("hardscapeCatalog.edit")}: ${it.name}`} onClick={() => setDialog({ item: it })} data-testid={`button-edit-${it.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {it.isActive ? (
                          <Button size="icon" variant="ghost" aria-label={`${t("hardscapeCatalog.deactivate")}: ${it.name}`} onClick={() => setConfirmItem(it)} data-testid={`button-deactivate-${it.id}`}>
                            <Power className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" aria-label={`${t("hardscapeCatalog.reactivate")}: ${it.name}`} disabled={toggleActive.isPending}
                            onClick={() => toggleActive.mutate({ item: it, next: true, scope, companyId })} data-testid={`button-reactivate-${it.id}`}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t px-3 py-2 text-xs tabular-nums text-muted-foreground" data-testid="text-item-count">{t("hardscapeCatalog.itemCount", { count: items.length })}</p>
            </div>
          )}
        </div>
      </div>

      <ItemDialog open={!!dialog} item={dialog?.item ?? null} categories={categories} scope={scope} companyId={companyId}
        onClose={() => setDialog(null)}
        onSaved={() => { setDialog(null); toast({ title: t("hardscapeCatalog.saved") }); }} />

      <AlertDialog open={!!confirmItem} onOpenChange={(o) => { if (!o) setConfirmItem(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-deactivate">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hardscapeCatalog.deactivateTitle", { name: confirmItem?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("hardscapeCatalog.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">{t("hardscapeCatalog.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-deactivate"
              onClick={() => { if (confirmItem) toggleActive.mutate({ item: confirmItem, next: false, scope, companyId }); setConfirmItem(null); }}>
              {t("hardscapeCatalog.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionRailLayout>
  );
}
