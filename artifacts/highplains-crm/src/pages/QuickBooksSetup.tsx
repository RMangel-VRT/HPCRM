import { useEffect, useRef, useState } from "react";
import type { FormEvent, MutableRefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, CircleDashed, Link2, Plus, RefreshCw, Search, Sparkles, Unlink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiErrorMessage, fetchJson } from "@/lib/hardscapeCatalog";
import {
  QBO_INCOME_ACCOUNTS_API, QBO_ITEM_CACHE_API, QBO_ITEM_PULL_API, QBO_UMBRELLAS_API, QBO_WRITE_SETTINGS_PATH,
  defaultQboType, isCacheStale, parseConflict, scopeOf, sendJson,
  type DuplicateConflict, type IncomeAccount, type ItemCacheResponse, type PullResult, type QboItemType, type Umbrella, type UmbrellasResponse,
} from "@/lib/estimateSettings";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function fmtDate(iso: string | null, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(lang === "es" ? "es-US" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

type Ctx = { companyId: string; scope: string; scopeRef: MutableRefObject<string> };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

/** Pull is shared by the link picker and the create-conflict "link instead" path. */
function usePull(ctx: Ctx) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => sendJson<PullResult>("POST", QBO_ITEM_PULL_API, ctx.companyId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [QBO_ITEM_CACHE_API] });
      qc.invalidateQueries({ queryKey: [QBO_UMBRELLAS_API] });
      if (ctx.scope !== ctx.scopeRef.current) return;
      const notes = [
        r.missingUmbrellas?.length ? t("qboSetup.pullMissing", { keys: r.missingUmbrellas.map((k) => t(`qboSetup.umbrella.${k}`)).join(", ") }) : "",
        r.inactiveUmbrellas?.length ? t("qboSetup.pullInactive", { keys: r.inactiveUmbrellas.map((k) => t(`qboSetup.umbrella.${k}`)).join(", ") }) : "",
      ].filter(Boolean).join(" ");
      toast({ title: t("qboSetup.pullDone"), description: notes || undefined, variant: notes ? "destructive" : undefined });
    },
    onError: (err) => {
      if (ctx.scope !== ctx.scopeRef.current) return;
      toast({ title: t("qboSetup.actionFailed"), description: apiErrorMessage(err), variant: "destructive" });
    },
  });
}

function LinkDialog({ umbrella, ctx, onClose }: { umbrella: Umbrella; ctx: Ctx; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), 250);
  const [picked, setPicked] = useState<string | null>(umbrella.qboItemId);
  const [error, setError] = useState<string | null>(null);
  const pull = usePull(ctx);
  const url = search ? `${QBO_ITEM_CACHE_API}?search=${encodeURIComponent(search)}` : QBO_ITEM_CACHE_API;
  const cache = useQuery<ItemCacheResponse>({
    queryKey: [QBO_ITEM_CACHE_API, user?.activeCompanyId, user?.id, user?.activeRole, search],
    queryFn: ({ signal }) => fetchJson<ItemCacheResponse>(url, ctx.companyId, signal),
    placeholderData: (prev) => prev,
  });
  const link = useMutation({
    mutationFn: (qboItemId: string) => sendJson("POST", `${QBO_UMBRELLAS_API}/link`, ctx.companyId, { key: umbrella.key, qboItemId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QBO_UMBRELLAS_API] });
      if (ctx.scope !== ctx.scopeRef.current) return;
      toast({ title: t("qboSetup.linkedToast"), description: t(`qboSetup.umbrella.${umbrella.key}`) });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const items = cache.data?.items ?? [];
  const lastPulledAt = cache.data?.lastPulledAt ?? null;
  const stale = cache.data ? isCacheStale(lastPulledAt) : false;
  const label = t(`qboSetup.umbrella.${umbrella.key}`);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-link-item">
        <DialogHeader>
          <DialogTitle>{t("qboSetup.linkTitle", { label })}</DialogTitle>
          <DialogDescription>{t("qboSetup.linkBody")}</DialogDescription>
        </DialogHeader>
        <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-xs", stale ? "bg-[hsl(var(--est-warn))]/10" : "bg-muted/60")}>
          <span data-testid="text-last-pulled">
            {lastPulledAt ? t("qboSetup.lastPulled", { date: fmtDate(lastPulledAt, i18n.language) }) : t("qboSetup.neverPulled")}
            {stale && lastPulledAt ? ` ${t("qboSetup.stale")}` : ""}
          </span>
          <Button size="sm" variant={stale ? "default" : "outline"} onClick={() => pull.mutate()} disabled={pull.isPending} data-testid="button-pull-items">
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", pull.isPending && "animate-spin")} />{pull.isPending ? t("qboSetup.pulling") : t("qboSetup.pull")}
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("qboSetup.searchPlaceholder")}
            aria-label={t("qboSetup.search")} className="pl-8" data-testid="input-item-search" />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border" role="listbox" aria-label={t("qboSetup.search")} data-testid="list-cached-items">
          {cache.isError ? (
            <div role="alert" className="flex items-center justify-between gap-2 p-3 text-sm">
              {t("qboSetup.cacheError")}<Button size="sm" variant="outline" onClick={() => cache.refetch()} data-testid="button-retry-cache">{t("qboSetup.retry")}</Button>
            </div>
          ) : cache.isLoading ? (
            <div className="space-y-1 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground" data-testid="text-cache-empty">{search ? t("qboSetup.noMatches") : t("qboSetup.cacheEmpty")}</p>
          ) : items.map((it) => (
            <button key={it.qboId} type="button" role="option" aria-selected={picked === it.qboId} disabled={!it.active || !["Service", "NonInventory"].includes(it.type)}
              onClick={() => setPicked(it.qboId)} data-testid={`option-item-${it.qboId}`}
              className={cn("flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 disabled:opacity-50",
                picked === it.qboId ? "bg-primary/10" : "hover:bg-rail-hover")}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{it.name}</span>
                {it.incomeAccountName && <span className="block truncate text-xs text-muted-foreground">{it.incomeAccountName}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                {umbrella.qboItemId === it.qboId && <span className="text-primary">{t("qboSetup.current")}</span>}
                {!it.active && <span className="text-muted-foreground">{t("qboSetup.inactiveTag")}</span>}
                <span className="rounded bg-muted px-1.5 py-0.5">{it.type}</span>
              </span>
            </button>
          ))}
        </div>
        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-link">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-link">{t("qboSetup.cancel")}</Button>
          <Button disabled={!picked || picked === umbrella.qboItemId || link.isPending} onClick={() => picked && link.mutate(picked)} data-testid="button-confirm-link">
            {link.isPending ? t("qboSetup.linking") : t("qboSetup.confirmLink")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ umbrella, ctx, onClose }: { umbrella: Umbrella; ctx: Ctx; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(umbrella.label);
  const [type, setType] = useState<QboItemType>(defaultQboType(umbrella.key));
  const [incomeAccountId, setIncomeAccountId] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<{ name?: string; account?: string; form?: string }>({});
  const [conflict, setConflict] = useState<DuplicateConflict | null>(null);
  const accounts = useQuery<IncomeAccount[]>({
    queryKey: [QBO_INCOME_ACCOUNTS_API, user?.activeCompanyId, user?.id, user?.activeRole],
    queryFn: ({ signal }) => fetchJson<IncomeAccount[]>(QBO_INCOME_ACCOUNTS_API, ctx.companyId, signal),
  });
  const done = (title: string) => {
    qc.invalidateQueries({ queryKey: [QBO_UMBRELLAS_API] });
    qc.invalidateQueries({ queryKey: [QBO_ITEM_CACHE_API] });
    if (ctx.scope !== ctx.scopeRef.current) return;
    toast({ title, description: t(`qboSetup.umbrella.${umbrella.key}`) });
    onClose();
  };
  const create = useMutation({
    mutationFn: (body: { key: string; name: string; type: QboItemType; incomeAccountId: string }) =>
      sendJson("POST", `${QBO_UMBRELLAS_API}/create-in-qbo`, ctx.companyId, body),
    onSuccess: () => done(t("qboSetup.createdToast")),
    onError: (err) => {
      const c = parseConflict(err);
      if (c) { setConflict(c); setErrors({}); return; }
      setErrors({ form: apiErrorMessage(err) });
    },
  });
  // Link the duplicate candidate; pull first when it is not in the cache yet.
  const linkInstead = useMutation({
    mutationFn: async (candidate: { qboId: string; name: string }) => {
      const cached = await fetchJson<ItemCacheResponse>(`${QBO_ITEM_CACHE_API}?search=${encodeURIComponent(candidate.name)}`, ctx.companyId);
      if (!cached.items.some((i) => i.qboId === candidate.qboId && i.active && ["Service", "NonInventory"].includes(i.type))) {
        await sendJson<PullResult>("POST", QBO_ITEM_PULL_API, ctx.companyId);
      }
      if (ctx.scope !== ctx.scopeRef.current) throw new Error(t("qboSetup.actionFailed"));
      return sendJson("POST", `${QBO_UMBRELLAS_API}/link`, ctx.companyId, { key: umbrella.key, qboItemId: candidate.qboId });
    },
    onSuccess: () => done(t("qboSetup.linkedToast")),
    onError: (err) => setErrors({ form: apiErrorMessage(err) }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = t("qboSetup.required");
    if (!incomeAccountId) errs.account = t("qboSetup.required");
    setErrors(errs); setConflict(null);
    if (Object.keys(errs).length || !incomeAccountId) return;
    create.mutate({ key: umbrella.key, name: name.trim(), type, incomeAccountId });
  }
  const label = t(`qboSetup.umbrella.${umbrella.key}`);
  const list = accounts.data ?? [];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-create-item">
        <DialogHeader>
          <DialogTitle>{t("qboSetup.createTitle", { label })}</DialogTitle>
          <DialogDescription>{t("qboSetup.createBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="qbo-name">{t("qboSetup.name")}</Label>
            <Input id="qbo-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} data-testid="input-qbo-name" />
            {errors.name && <p className="text-xs font-medium text-destructive" data-testid="error-qbo-name">{errors.name}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="qbo-type">{t("qboSetup.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as QboItemType)}>
                <SelectTrigger id="qbo-type" data-testid="select-qbo-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Service">{t("qboSetup.typeService")}</SelectItem>
                  <SelectItem value="NonInventory">{t("qboSetup.typeNonInventory")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qbo-account">{t("qboSetup.incomeAccount")}</Label>
              {accounts.isError ? (
                <div role="alert" className="flex items-center gap-2 text-xs text-destructive" data-testid="error-income-accounts">
                  {t("qboSetup.incomeError")}
                  <Button type="button" size="sm" variant="outline" onClick={() => accounts.refetch()} data-testid="button-retry-accounts">{t("qboSetup.retry")}</Button>
                </div>
              ) : accounts.isLoading ? (
                <Skeleton className="h-9 w-full" aria-label={t("qboSetup.incomeLoading")} />
              ) : list.length === 0 ? (
                <p className="text-xs text-muted-foreground" data-testid="text-income-empty">{t("qboSetup.incomeEmpty")}</p>
              ) : (
                <Select value={incomeAccountId} onValueChange={(v) => setIncomeAccountId(v || undefined)}>
                  <SelectTrigger id="qbo-account" aria-invalid={!!errors.account} data-testid="select-income-account"><SelectValue placeholder={t("qboSetup.incomeAccountPick")} /></SelectTrigger>
                  <SelectContent>{list.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {errors.account && <p className="text-xs font-medium text-destructive" data-testid="error-income-account">{errors.account}</p>}
            </div>
          </div>
          {conflict && (
            <div role="alert" className="rounded-md border border-[hsl(var(--est-warn))]/50 bg-[hsl(var(--est-warn))]/10 p-3 text-sm" data-testid="panel-duplicate">
              <p className="font-medium">{conflict.message || t("qboSetup.duplicate")}</p>
              {conflict.candidate && (
                <p className="mt-1 text-xs text-muted-foreground">{conflict.candidate.name} · {conflict.candidate.type}{conflict.candidate.active ? "" : ` · ${t("qboSetup.inactiveTag")}`}</p>
              )}
              {conflict.canLink && conflict.candidate && (
                <Button type="button" size="sm" className="mt-2" disabled={linkInstead.isPending}
                  onClick={() => conflict.candidate && linkInstead.mutate(conflict.candidate)} data-testid="button-link-instead">
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />{linkInstead.isPending ? t("qboSetup.linking") : t("qboSetup.linkInstead", { name: conflict.candidate.name })}
                </Button>
              )}
            </div>
          )}
          {errors.form && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-form">{errors.form}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-create">{t("qboSetup.cancel")}</Button>
            <Button type="submit" disabled={create.isPending} data-testid="button-confirm-create">{create.isPending ? t("qboSetup.creating") : t("qboSetup.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function QuickBooksSetup() {
  const { user } = useAuth();
  return <QuickBooksSetupContent key={scopeOf(user)} />;
}

function QuickBooksSetupContent() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const scope = scopeOf(user);
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; return () => { scopeRef.current = ""; }; }, [scope]);
  const [companyId] = useState(() => user?.activeCompanyId ?? "");
  const ctx: Ctx = { companyId, scope, scopeRef };
  const [dialog, setDialog] = useState<{ mode: "link" | "create"; umbrella: Umbrella; n: number } | null>(null);
  const isAdmin = user?.activeRole === "admin";

  const { data, isLoading, isError, refetch } = useQuery<UmbrellasResponse>({
    queryKey: [QBO_UMBRELLAS_API, user?.activeCompanyId, user?.id, user?.activeRole],
    queryFn: ({ signal }) => fetchJson<UmbrellasResponse>(QBO_UMBRELLAS_API, companyId, signal),
    enabled: !!user,
  });
  const unlink = useMutation({
    mutationFn: (u: Umbrella) => sendJson("POST", `${QBO_UMBRELLAS_API}/unlink`, companyId, { key: u.key }),
    onSuccess: (_d, u) => {
      qc.invalidateQueries({ queryKey: [QBO_UMBRELLAS_API] });
      if (scope !== scopeRef.current) return;
      toast({ title: t("qboSetup.unlinked"), description: t(`qboSetup.umbrella.${u.key}`) });
    },
    onError: (err) => {
      if (scope !== scopeRef.current) return;
      toast({ title: t("qboSetup.actionFailed"), description: apiErrorMessage(err), variant: "destructive" });
    },
  });

  const umbrellas = [...(data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const writeEnabled = !!data?.qboWriteEnabled;
  const linkedCount = umbrellas.filter((u) => u.bindingStatus === "active").length;
  const lang = i18n.language;
  const open = (mode: "link" | "create", umbrella: Umbrella) => setDialog({ mode, umbrella, n: Date.now() });

  const createButton = (u: Umbrella) => {
    const btn = (
      <Button size="sm" disabled={!writeEnabled} onClick={() => open("create", u)} data-testid={`button-create-${u.key}`}>
        <Plus className="mr-1 h-3.5 w-3.5" />{t("qboSetup.create")}
      </Button>
    );
    if (writeEnabled) return btn;
    return (
      <Tooltip>
        <TooltipTrigger asChild><span tabIndex={0} data-testid={`wrap-create-${u.key}`}>{btn}</span></TooltipTrigger>
        <TooltipContent className="max-w-xs">{isAdmin ? t("qboSetup.writeDisabledAdmin") : t("qboSetup.writeDisabledOffice")}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <SectionRailLayout rail={<EstimatesRail activeKey="quickbooks" />}>
        <div className="mx-auto max-w-5xl" data-testid="page-quickbooks-setup">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--rail-active-icon))]">{t("estimates.settings")}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight" data-testid="text-page-title">{t("qboSetup.title")}</h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("qboSetup.subtitle")}</p>
            </div>
            {data && <p className="text-sm font-semibold tabular-nums" data-testid="text-progress">{t("qboSetup.progress", { done: linkedCount })}</p>}
          </header>

          {data && !writeEnabled && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn))]/5 px-4 py-3 text-sm" data-testid="banner-write-disabled">
              <span>{isAdmin ? t("qboSetup.writeDisabledAdmin") : t("qboSetup.writeDisabledOffice")}</span>
              {isAdmin && <Link href={QBO_WRITE_SETTINGS_PATH} className="font-semibold text-primary hover:underline" data-testid="link-qbo-settings">{t("qboSetup.openSettings")}</Link>}
            </div>
          )}

          <section className="mt-5 overflow-hidden rounded-md border bg-card" data-testid="card-umbrellas">
            {isError ? (
              <div role="alert" className="flex flex-col items-start gap-3 bg-destructive/5 p-5" data-testid="umbrellas-error">
                <p className="text-sm">{t("qboSetup.loadError")}</p>
                <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">{t("qboSetup.retry")}</Button>
              </div>
            ) : isLoading ? (
              <div role="status" aria-label={t("qboSetup.loading")} className="space-y-2 p-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : (
              <ul>
                {umbrellas.map((u) => {
                  const linked = u.bindingStatus !== "unlinked" && !!u.qboItemId;
                  const warn = u.bindingStatus === "missing" || u.bindingStatus === "inactive";
                  return (
                    <li key={u.key} className="grid gap-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center" data-testid={`row-umbrella-${u.key}`}>
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-0.5 shrink-0">
                          {warn ? <AlertTriangle className="h-5 w-5 text-[hsl(var(--est-warn))]" />
                            : linked ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <CircleDashed className="h-5 w-5 text-muted-foreground" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold">{t(`qboSetup.umbrella.${u.key}`)}</p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-umbrella-desc-${u.key}`}>{t(`qboSetup.umbrellaDesc.${u.key}`)}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" data-testid={`status-umbrella-${u.key}`}>
                            {linked ? (
                              <>
                                <span className="font-medium">{u.qboItemName}</span>
                                {u.qboItemType && <span className="rounded-full border px-2 py-0.5 text-[11px]">{u.qboItemType}</span>}
                                {warn && <span className="font-medium text-[hsl(var(--est-warn))]">{u.bindingStatus === "missing" ? t("qboSetup.missing") : t("qboSetup.inactiveItem")}</span>}
                                {u.qboSyncedAt && <span className="text-muted-foreground">{t("qboSetup.synced", { date: fmtDate(u.qboSyncedAt, lang) })}</span>}
                              </>
                            ) : <span className="italic text-muted-foreground">{t("qboSetup.notLinked")}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {linked ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => open("link", u)} data-testid={`button-change-${u.key}`}>{t("qboSetup.change")}</Button>
                            <Button size="sm" variant="ghost" disabled={unlink.isPending} onClick={() => unlink.mutate(u)} data-testid={`button-unlink-${u.key}`}>
                              <Unlink className="mr-1 h-3.5 w-3.5" />{t("qboSetup.unlink")}
                            </Button>
                          </>
                        ) : (
                          <>
                            {createButton(u)}
                            <Button size="sm" variant="outline" onClick={() => open("link", u)} data-testid={`button-link-${u.key}`}>
                              <Link2 className="mr-1 h-3.5 w-3.5" />{t("qboSetup.link")}
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-6 rounded-md border border-dashed bg-muted/30 p-5 opacity-70" aria-disabled="true" data-testid="panel-cleanup-teaser">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl">
                <p className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" />{t("qboSetup.cleanupTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("qboSetup.cleanupBody")}</p>
              </div>
              <Button variant="outline" size="sm" disabled data-testid="button-cleanup">{t("qboSetup.cleanupButton")}</Button>
            </div>
          </section>
        </div>

        {dialog?.mode === "link" && <LinkDialog key={`l-${dialog.umbrella.key}-${dialog.n}`} umbrella={dialog.umbrella} ctx={ctx} onClose={() => setDialog(null)} />}
        {dialog?.mode === "create" && <CreateDialog key={`c-${dialog.umbrella.key}-${dialog.n}`} umbrella={dialog.umbrella} ctx={ctx} onClose={() => setDialog(null)} />}
      </SectionRailLayout>
    </TooltipProvider>
  );
}
