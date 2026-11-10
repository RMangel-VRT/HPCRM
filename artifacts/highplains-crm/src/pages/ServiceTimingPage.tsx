import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertTriangle, CalendarRange, Lock, Plus, RotateCcw, Star, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { apiRequest } from "@/lib/queryClient";
import { guardLinkClick, unsavedGuard } from "@/lib/unsavedGuard";
import { SettingsRailLayout } from "@/components/nav/SettingsRailLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SCOPE_CATALOG, campaignServices } from "@shared/contractCatalog";
import {
  serviceProgramSchema,
  type ServiceProgramDto, type ServiceProgramsResponse, type ServiceUsage, type UsageProblem,
} from "../../../../lib/db/src/serviceProgramContracts";

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const COUNTS = Array.from({ length: 24 }, (_, i) => i + 1);
const BLANK: string[] = Array(12).fill("");
const programSchema = serviceProgramSchema(SCOPE_CATALOG);

export const serviceProgramsKey = (companyId: string, userId: string, role: string) =>
  ["/api/service-programs", companyId, userId, role] as const;

const rowId = (serviceKey: string, rounds: number) => `${serviceKey}:${rounds}`;
const toCells = (months: number[] | null | undefined) => months ? months.map(n => (n ? String(n) : "")) : BLANK;

/** Blank is 0. Anything else must be an integer 0..4. Returns null when any cell is invalid. */
export function parseCells(cells: string[]): number[] | null {
  const out: number[] = [];
  for (const c of cells) {
    const v = c.trim();
    if (v === "") { out.push(0); continue; }
    if (!/^\d+$/.test(v)) return null;
    const n = Number(v);
    if (n > 4) return null;
    out.push(n);
  }
  return out;
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d{3}:\s*/, "");
  try { const j = JSON.parse(body) as { message?: string; error?: string }; return j.message ?? j.error ?? body; } catch { return body; }
}

/* ------------------------------------------------------------------ */
/* Outer shell: owns scope. Company or role change remounts the body.  */
/* ------------------------------------------------------------------ */

export default function ServiceTimingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  useSetBreadcrumbs([{ label: t("settings.title"), href: "/dashboard/settings" }, { label: t("serviceTiming.title") }], []);
  const companyId = user?.activeCompanyId ?? "";
  const role = user?.activeRole ?? "";
  const scope = `${companyId}|${user?.id ?? ""}|${role}`;
  const dirtyRef = useRef(false);
  const prevScope = useRef(scope);
  // Captured during render: the new body's mount effects run before ours and report clean.
  const switching = useRef<{ scope: string; dirty: boolean } | null>(null);
  if (prevScope.current !== scope && switching.current?.scope !== scope) switching.current = { scope, dirty: dirtyRef.current };
  useEffect(() => {
    if (prevScope.current !== scope) {
      if (switching.current?.dirty) {
        toast({ title: t("serviceTiming.scopeChanged"), description: t("serviceTiming.scopeChangedBody"), variant: "destructive" });
      }
      dirtyRef.current = false;
      unsavedGuard.setDirty(false);
      unsavedGuard.clearPending();
      prevScope.current = scope;
      switching.current = null;
    }
  }, [scope, t, toast]);
  const onDirty = useCallback((d: boolean) => { dirtyRef.current = d; }, []);

  return (
    <SettingsRailLayout activeKey="service-timing">
      {user && companyId ? (
        <ServiceTimingBody
          key={scope}
          companyId={companyId}
          userId={user.id}
          role={role}
          canWrite={user.accessRole === "admin" || !!user.isSuperAdminBool}
          onDirty={onDirty}
        />
      ) : null}
    </SettingsRailLayout>
  );
}

/* ------------------------------------------------------------------ */

type BodyProps = { companyId: string; userId: string; role: string; canWrite: boolean; onDirty: (d: boolean) => void };
type Pending = { kind: "href" | "pop"; href: string } | null;

function ServiceTimingBody({ companyId, userId, role, canWrite, onDirty }: BodyProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const queryKey = useMemo(() => serviceProgramsKey(companyId, userId, role), [companyId, userId, role]);
  const headers = useMemo(() => ({ "X-Company-Id": companyId }), [companyId]);

  const query = useQuery<ServiceProgramsResponse>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", "/api/service-programs", undefined, { headers })).json(),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Transient state. Drafts live apart from server data so refetch/poll never overwrites them.
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [added, setAdded] = useState<Record<string, number[]>>({});
  const [stdPick, setStdPick] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<ServiceProgramDto | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const rows = query.data?.rows ?? [];
  const usage = query.data?.countsInUse ?? [];

  const dirty = canWrite && (
    Object.keys(drafts).some(id => {
      const [svc, r] = id.split(":");
      const saved = rows.find(x => x.serviceKey === svc && x.rounds === Number(r));
      return drafts[id].join(",") !== toCells(saved?.monthSpread).join(",");
    }) ||
    Object.values(added).some(a => a.length > 0) ||
    Object.entries(stdPick).some(([svc, r]) => !rows.some(x => x.serviceKey === svc && x.rounds === r && x.isStandard))
  );

  /* ---- Leave protection (existing unsavedGuard convention) ---- */
  useEffect(() => { onDirty(dirty); unsavedGuard.setDirty(dirty, { protectHistory: true }); }, [dirty, onDirty]);
  useEffect(() => () => unsavedGuard.setDirty(false), []);
  useEffect(() => {
    document.addEventListener("click", guardLinkClick as never, true);
    return () => document.removeEventListener("click", guardLinkClick as never, true);
  }, []);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (!dirtyRef.current) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  const guardPending = useSyncExternalStore(unsavedGuard.subscribe, unsavedGuard.getPending, () => null);
  const [pending, setPending] = useState<Pending>(null);
  useEffect(() => { if (guardPending) setPending({ kind: unsavedGuard.isHistoryPending() ? "pop" : "href", href: guardPending }); }, [guardPending]);
  function leave() {
    const to = pending;
    unsavedGuard.setDirty(false); unsavedGuard.clearPending(); dirtyRef.current = false; setPending(null);
    if (to) navigate(to.href, to.kind === "pop" ? { replace: true } : undefined);
  }
  function stay() { unsavedGuard.clearPending(); setPending(null); }

  /* ---- Local edits ---- */
  const clearRowState = (svc: string, rounds: number) => {
    const id = rowId(svc, rounds);
    setDrafts(d => { const n = { ...d }; delete n[id]; return n; });
    setAdded(a => ({ ...a, [svc]: (a[svc] ?? []).filter(r => r !== rounds) }));
    setStdPick(p => { if (p[svc] !== rounds) return p; const n = { ...p }; delete n[svc]; return n; });
    setRowErrors(e => { const n = { ...e }; delete n[id]; return n; });
  };
  const setCell = (svc: string, rounds: number, month: number, value: string, base: string[]) => {
    if (!canWrite) return;
    const id = rowId(svc, rounds);
    setDrafts(d => { const cur = [...(d[id] ?? base)]; cur[month] = value.replace(/[^\d]/g, "").slice(0, 2); return { ...d, [id]: cur }; });
  };
  const addCount = (svc: string, rounds: number) => {
    if (!canWrite) return;
    setAdded(a => (a[svc] ?? []).includes(rounds) ? a : { ...a, [svc]: [...(a[svc] ?? []), rounds] });
  };
  const pickStandard = (svc: string, rounds: number) => {
    if (!canWrite) return;
    setStdPick(p => ({ ...p, [svc]: rounds }));
    addCount(svc, rounds);
  };

  /* ---- Writes: header from initiating company; stale results never touch another company ---- */
  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(b => ({ ...b, [id]: true }));
    setRowErrors(e => { const n = { ...e }; delete n[id]; return n; });
    try { await fn(); }
    catch (err) {
      if (!alive.current) return;
      const msg = errorText(err);
      setRowErrors(e => ({ ...e, [id]: msg }));
      toast({ title: t("serviceTiming.writeFailed"), description: msg, variant: "destructive" });
    } finally {
      if (alive.current) setBusy(b => { const n = { ...b }; delete n[id]; return n; });
    }
  };
  const key = queryKey; // captured: belongs to the initiating company only
  const save = (svc: string, rounds: number, monthSpread: number[], isStandard: boolean) =>
    run(rowId(svc, rounds), async () => {
      const res = await apiRequest("PUT", `/api/service-programs/${encodeURIComponent(svc)}/${rounds}`, { monthSpread, isStandard }, { headers });
      const saved = (await res.json().catch(() => null)) as ServiceProgramDto | null;
      if (saved && saved.serviceKey === svc) {
        qc.setQueryData<ServiceProgramsResponse>(key, old => old ? {
          ...old,
          rows: [...old.rows.filter(r => !(r.serviceKey === svc && r.rounds === rounds))
            .map(r => (isStandard && r.serviceKey === svc ? { ...r, isStandard: false } : r)), saved],
        } : old);
      }
      void qc.invalidateQueries({ queryKey: key });
      if (!alive.current) return;
      clearRowState(svc, rounds);
      toast({ title: t("serviceTiming.saved") });
    });
  const remove = (row: ServiceProgramDto) =>
    run(rowId(row.serviceKey, row.rounds), async () => {
      await apiRequest("DELETE", `/api/service-programs/${encodeURIComponent(row.serviceKey)}/${row.rounds}`, undefined, { headers });
      qc.setQueryData<ServiceProgramsResponse>(key, old => old ? { ...old, rows: old.rows.filter(r => r.id !== row.id) } : old);
      void qc.invalidateQueries({ queryKey: key });
      if (!alive.current) return;
      clearRowState(row.serviceKey, row.rounds);
      toast({ title: t("serviceTiming.deleted") });
    });
  const clearStandard = (svc: string) =>
    run(`${svc}:standard`, async () => {
      await apiRequest("DELETE", `/api/service-programs/${encodeURIComponent(svc)}/standard`, undefined, { headers });
      qc.setQueryData<ServiceProgramsResponse>(key, old => old ? {
        ...old, rows: old.rows.map(r => (r.serviceKey === svc ? { ...r, isStandard: false } : r)),
      } : old);
      void qc.invalidateQueries({ queryKey: key });
      if (!alive.current) return;
      toast({ title: t("serviceTiming.standardCleared") });
    });

  /* ---- Render ---- */
  return (
    <div className="space-y-5 max-w-5xl" data-testid="page-service-timing">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">{t("serviceTiming.title")}</h1>
          {!canWrite && (
            <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid="badge-read-only">
              <Lock className="h-3 w-3" />{t("serviceTiming.readOnly")}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground border-l-2 border-primary/60 pl-3" data-testid="text-explanation">
          Used only where a contract is silent. A contract's own count and months always win. Changing timing here never changes a contract.
        </p>
      </header>

      {query.isLoading ? (
        <div className="space-y-3" data-testid="state-loading">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3" data-testid="state-error">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium">{t("serviceTiming.loadFailed")}</p>
            <p className="text-muted-foreground">{errorText(query.error)}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()} data-testid="button-retry">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />{t("serviceTiming.retry")}
          </Button>
        </div>
      ) : (
        campaignServices().map(svc => (
          <ServiceCard
            key={svc.key}
            serviceKey={svc.key}
            label={svc.label}
            rows={rows.filter(r => r.serviceKey === svc.key)}
            usage={usage.find(u => u.serviceKey === svc.key)}
            drafts={drafts}
            added={added[svc.key] ?? []}
            pick={stdPick[svc.key]}
            busy={busy}
            rowErrors={rowErrors}
            canWrite={canWrite}
            onCell={setCell}
            onAdd={r => addCount(svc.key, r)}
            onPick={r => pickStandard(svc.key, r)}
            onCancelPick={() => setStdPick(p => { const n = { ...p }; delete n[svc.key]; return n; })}
            onDiscard={r => clearRowState(svc.key, r)}
            onSave={(r, months, std) => void save(svc.key, r, months, std)}
            onDelete={row => setConfirmDelete(row)}
            onClearStandard={() => void clearStandard(svc.key)}
          />
        ))
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={o => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("serviceTiming.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("serviceTiming.deleteBody", { count: confirmDelete?.rounds ?? 0 })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete" onClick={() => { if (confirmDelete) void remove(confirmDelete); setConfirmDelete(null); }}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pending} onOpenChange={o => { if (!o) stay(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("serviceTiming.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("serviceTiming.leaveBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={stay} data-testid="button-stay">{t("serviceTiming.stay")}</AlertDialogCancel>
            <AlertDialogAction onClick={leave} data-testid="button-leave">{t("serviceTiming.leave")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type CardProps = {
  serviceKey: string; label: string; rows: ServiceProgramDto[]; usage: ServiceUsage | undefined;
  drafts: Record<string, string[]>; added: number[]; pick: number | undefined;
  busy: Record<string, boolean>; rowErrors: Record<string, string>; canWrite: boolean;
  onCell: (svc: string, rounds: number, month: number, value: string, base: string[]) => void;
  onAdd: (rounds: number) => void; onPick: (rounds: number) => void; onCancelPick: () => void;
  onDiscard: (rounds: number) => void; onSave: (rounds: number, months: number[], isStandard: boolean) => void;
  onDelete: (row: ServiceProgramDto) => void; onClearStandard: () => void;
};

function ServiceCard(p: CardProps) {
  const { t } = useTranslation();
  const [newCount, setNewCount] = useState("");
  const savedStd = p.rows.find(r => r.isStandard);
  const stdRounds = p.pick ?? savedStd?.rounds;
  const noCount = p.usage?.noCount ?? 0;
  const noCountNoMonths = p.usage?.noCountWithoutMonths ?? 0;

  const allCounts = Array.from(new Set([
    ...p.rows.map(r => r.rounds), ...(p.usage?.counts ?? []).map(c => c.rounds), ...p.added,
  ])).sort((a, b) => a - b);
  // The standard count's editor renders once, in the Standard block. Never duplicated below.
  const listCounts = allCounts.filter(r => r !== stdRounds);

  const editor = (rounds: number, asStandard: boolean) => (
    <TimingEditor
      key={rounds}
      serviceKey={p.serviceKey}
      rounds={rounds}
      saved={p.rows.find(r => r.rounds === rounds)}
      usage={p.usage?.counts.find(c => c.rounds === rounds)}
      draft={p.drafts[rowId(p.serviceKey, rounds)]}
      isStandardSlot={asStandard}
      standardPending={asStandard && p.pick !== undefined && !(savedStd && savedStd.rounds === p.pick)}
      unsavedNew={p.added.includes(rounds) && !p.rows.some(r => r.rounds === rounds)}
      busy={!!p.busy[rowId(p.serviceKey, rounds)]}
      error={p.rowErrors[rowId(p.serviceKey, rounds)]}
      canWrite={p.canWrite}
      onCell={p.onCell}
      onDiscard={() => p.onDiscard(rounds)}
      onSave={(months, std) => p.onSave(rounds, months, std)}
      onDelete={p.onDelete}
    />
  );

  const problems = p.usage?.problems ?? [];
  const flagged = (["zero", "invalid", "duplicate"] as const).filter(k => (p.usage?.[k] ?? 0) > 0);
  const addValue = Number(newCount);
  const addValid = Number.isInteger(addValue) && addValue >= 1 && addValue <= 24 && !allCounts.includes(addValue);

  return (
    <section className="rounded-lg border bg-card" data-testid={`card-service-${p.serviceKey}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{p.label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums" data-testid={`text-seasons-${p.serviceKey}`}>
          {t("serviceTiming.seasonsTotal", { count: p.usage?.seasons ?? 0 })}
        </span>
      </div>

      {/* Standard */}
      <div className="px-4 py-3 bg-[hsl(var(--rail))] border-b space-y-2" data-testid={`standard-${p.serviceKey}`}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Star className={`h-3.5 w-3.5 ${stdRounds ? "text-primary fill-primary" : "text-muted-foreground"}`} />
          <span>{t("serviceTiming.standardLead", { service: p.label.toLowerCase() })}</span>
          <select
            className="h-7 rounded border bg-background px-1.5 text-sm font-semibold tabular-nums disabled:opacity-70"
            value={stdRounds ?? ""}
            disabled={!p.canWrite}
            onChange={e => { if (e.target.value) p.onPick(Number(e.target.value)); }}
            aria-label={t("serviceTiming.standardCount")}
            data-testid={`select-standard-${p.serviceKey}`}
          >
            <option value="">{t("serviceTiming.none")}</option>
            {COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="font-semibold">{t("serviceTiming.roundsWord")}</span>
          {p.canWrite && p.pick !== undefined && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={p.onCancelPick} data-testid={`button-cancel-standard-${p.serviceKey}`}>
              <X className="h-3.5 w-3.5 mr-1" />{t("serviceTiming.cancelChoice")}
            </Button>
          )}
          {p.canWrite && savedStd && p.pick === undefined && (
            <Button size="sm" variant="outline" className="h-7 px-2" disabled={!!p.busy[`${p.serviceKey}:standard`]}
              onClick={p.onClearStandard} data-testid={`button-clear-standard-${p.serviceKey}`}>
              {t("serviceTiming.clearStandard")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground" data-testid={`text-nocount-${p.serviceKey}`}>
          {stdRounds
            ? t("serviceTiming.standardUsedBy", { count: noCount, missing: noCountNoMonths })
            : noCount > 0
              ? <span className="text-[hsl(var(--warning))] font-medium">{t("serviceTiming.noStandard", { count: noCount })}</span>
              : t("serviceTiming.noStandardIdle")}
          {!stdRounds && noCount > 0 && noCountNoMonths > 0 && <> · {t("serviceTiming.noCountNoMonths", { count: noCountNoMonths })}</>}
        </p>
        {p.rowErrors[`${p.serviceKey}:standard`] && (
          <p className="text-xs text-destructive" data-testid={`error-standard-${p.serviceKey}`}>{p.rowErrors[`${p.serviceKey}:standard`]}</p>
        )}
        {stdRounds !== undefined && editor(stdRounds, true)}
      </div>

      {/* Count rows */}
      <div className="divide-y">
        {listCounts.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground" data-testid={`empty-${p.serviceKey}`}>{t("serviceTiming.noRows")}</p>
        )}
        {listCounts.map(r => <div key={r} className="px-4 py-3">{editor(r, false)}</div>)}
      </div>

      {p.canWrite && (
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
          <input
            inputMode="numeric"
            className="h-7 w-16 rounded border bg-background px-2 text-sm tabular-nums"
            placeholder="1-24"
            value={newCount}
            onChange={e => setNewCount(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            aria-label={t("serviceTiming.addCount")}
            data-testid={`input-add-count-${p.serviceKey}`}
          />
          <Button size="sm" variant="outline" className="h-7" disabled={!addValid}
            onClick={() => { p.onAdd(addValue); setNewCount(""); }} data-testid={`button-add-count-${p.serviceKey}`}>
            <Plus className="h-3.5 w-3.5 mr-1" />{t("serviceTiming.addCount")}
          </Button>
        </div>
      )}

      {(flagged.length > 0 || problems.length > 0) && (
        <div className="border-t px-4 py-2.5 space-y-1.5 bg-[hsl(var(--est-warn-bg))]/40" data-testid={`problems-${p.serviceKey}`}>
          <div className="flex flex-wrap gap-1.5">
            {flagged.map(k => (
              <span key={k} className="inline-flex items-center gap-1 rounded border border-[hsl(var(--warning))]/40 px-1.5 py-0.5 text-[11px] font-medium text-[hsl(var(--warning))]"
                data-testid={`chip-${k}-${p.serviceKey}`}>
                <AlertTriangle className="h-3 w-3" />{t(`serviceTiming.flag.${k}`, { count: p.usage?.[k] ?? 0 })}
              </span>
            ))}
          </div>
          {problems.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">{t("serviceTiming.problemsList", { count: problems.length })}</summary>
              <ul className="mt-1 space-y-0.5 text-xs">
                {problems.map((pr: UsageProblem) => (
                  <li key={`${pr.termId}-${pr.reason}`} className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted-foreground">{t(`serviceTiming.reason.${pr.reason}`)}</span>
                    <Link href={`/dashboard/contracts/${pr.agreementId}#term-${pr.termId}`} className="text-primary hover:underline"
                      data-testid={`link-problem-${pr.termId}-${pr.reason}`}>
                      {pr.customerName}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

type EditorProps = {
  serviceKey: string; rounds: number; saved: ServiceProgramDto | undefined;
  usage: { rounds: number; seasons: number; withoutMonths: number } | undefined;
  draft: string[] | undefined; isStandardSlot: boolean; standardPending: boolean; unsavedNew: boolean;
  busy: boolean; error: string | undefined; canWrite: boolean;
  onCell: CardProps["onCell"]; onDiscard: () => void;
  onSave: (months: number[], isStandard: boolean) => void; onDelete: (row: ServiceProgramDto) => void;
};

function TimingEditor(p: EditorProps) {
  const { t } = useTranslation();
  const base = toCells(p.saved?.monthSpread);
  const cells = p.draft ?? base;
  const parsed = parseCells(cells);
  const placed = parsed ? parsed.reduce((a, b) => a + b, 0) : null;
  // A pending choice is not persisted yet. Editing the saved standard's months
  // must not clear it before the replacement row is valid and saved.
  const wantStandard = p.isStandardSlot || !!p.saved?.isStandard;
  const valid = !!parsed && programSchema.safeParse({ serviceKey: p.serviceKey, rounds: p.rounds, monthSpread: parsed, isStandard: wantStandard }).success;
  const edited = cells.join(",") !== base.join(",");
  const changed = edited || !p.saved || (p.saved.isStandard !== wantStandard && p.standardPending);
  const seasons = p.usage?.seasons ?? 0;
  const missing = p.usage?.withoutMonths ?? 0;
  const deletable = !!p.saved && !p.saved.isStandard && seasons === 0 && !p.isStandardSlot;
  const muted = !!p.saved && seasons === 0 && !p.saved.isStandard && !p.isStandardSlot;
  const id = `${p.serviceKey}-${p.rounds}`;

  return (
    <div className={`space-y-1.5 ${muted && !edited ? "opacity-60" : ""}`} data-testid={`editor-${id}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold tabular-nums" data-testid={`text-rounds-${id}`}>{t("serviceTiming.rounds", { count: p.rounds })}</span>
        {seasons > 0 && (
          <span className="text-xs text-muted-foreground" data-testid={`text-usage-${id}`}>
            · {t("serviceTiming.usedBy", { count: seasons })}{missing > 0 && <> · {t("serviceTiming.withoutMonths", { count: missing })}</>}
          </span>
        )}
        {p.saved?.isStandard && <span className="rounded bg-primary/15 px-1.5 text-[11px] font-medium text-[hsl(var(--rail-heading))]">{t("serviceTiming.standard")}</span>}
        {p.standardPending && <span className="rounded border border-dashed px-1.5 text-[11px] text-muted-foreground" data-testid={`badge-standard-pending-${id}`}>{t("serviceTiming.standardPending")}</span>}
        {!p.saved && missing > 0 && (
          <span className="inline-flex items-center gap-1 rounded border border-[hsl(var(--warning))]/50 px-1.5 text-[11px] font-medium text-[hsl(var(--warning))]" data-testid={`chip-no-timing-${id}`}>
            <AlertTriangle className="h-3 w-3" />{t("serviceTiming.noTiming", { count: missing })}
          </span>
        )}
        <span className={`ml-auto text-xs tabular-nums ${placed === p.rounds ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"}`} data-testid={`text-placed-${id}`}>
          {placed === null ? t("serviceTiming.invalidCells") : t("serviceTiming.placed", { placed, rounds: p.rounds })}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-1" data-testid={`months-grid-${id}`}>
        {MONTH_KEYS.map((m, i) => {
          const v = cells[i];
          const bad = v.trim() !== "" && (!/^\d+$/.test(v) || Number(v) > 4);
          return (
            <label key={m} className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t(`months.${m}`)}</span>
              <input
                inputMode="numeric"
                value={v}
                disabled={!p.canWrite || p.busy}
                onChange={e => p.onCell(p.serviceKey, p.rounds, i, e.target.value, base)}
                aria-label={`${t(`months.${m}`)} ${t("serviceTiming.rounds", { count: p.rounds })}`}
                aria-invalid={bad || undefined}
                className={`h-8 w-full rounded border text-center text-sm tabular-nums bg-background disabled:bg-muted/50 disabled:cursor-not-allowed
                  ${bad ? "border-destructive text-destructive" : v && v !== "0" ? "border-primary/50 bg-primary/5 font-semibold" : ""}`}
                data-testid={`input-cell-${id}-${i}`}
              />
            </label>
          );
        })}
      </div>
      {p.error && <p className="text-xs text-destructive" data-testid={`error-${id}`}>{p.error}</p>}
      {p.canWrite && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" className="h-7" disabled={!valid || !changed || p.busy}
            onClick={() => parsed && p.onSave(parsed, wantStandard)} data-testid={`button-save-${id}`}>
            {p.busy ? t("common.saving") : wantStandard && p.standardPending ? t("serviceTiming.saveStandard") : t("serviceTiming.save")}
          </Button>
          {(edited || p.unsavedNew || p.standardPending) && (
            <Button size="sm" variant="ghost" className="h-7" disabled={p.busy} onClick={p.onDiscard} data-testid={`button-discard-${id}`}>
              {t("serviceTiming.discard")}
            </Button>
          )}
          {deletable && (
            <Button size="sm" variant="ghost" className="h-7 text-destructive" disabled={p.busy}
              onClick={() => p.saved && p.onDelete(p.saved)} data-testid={`button-delete-${id}`}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />{t("common.delete")}
            </Button>
          )}
          {p.saved && !deletable && (
            <span className="text-[11px] text-muted-foreground" data-testid={`text-delete-blocked-${id}`}>
              {p.saved.isStandard || p.isStandardSlot ? t("serviceTiming.deleteBlockedStandard") : t("serviceTiming.deleteBlockedUsed")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
