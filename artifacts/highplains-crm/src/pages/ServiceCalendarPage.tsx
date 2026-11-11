import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, CalendarDays, CalendarRange, ClipboardCheck, Lock, Repeat, RotateCcw } from "lucide-react";
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
import { SCOPE_CATALOG, campaignServices, checklistServices } from "@shared/contractCatalog";
import type { ServiceCalendarResponse } from "../../../../lib/db/src/serviceCalendarContracts";
import {
  errorText, labelOf, readCalendar, rowsFromEntries, serviceCalendarKey, sig, toPayload, type DraftRow, type ServiceApi,
} from "./service-calendar/helpers";
import { Section } from "./service-calendar/parts";
import { RoundCard } from "./service-calendar/RoundCard";
import { ChecklistCard } from "./service-calendar/ChecklistCard";
import { RecurringTable } from "./service-calendar/RecurringTable";
import { EmptyPanel } from "./service-calendar/EmptyPanel";

export { rowsFromEntries, toPayload, rowProblem, serviceCalendarKey, type DraftRow } from "./service-calendar/helpers";

/* ------------------------------------------------------------------ */
/* Outer shell: owns scope. Company or role change remounts the body.  */
/* ------------------------------------------------------------------ */

export default function ServiceCalendarPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  useSetBreadcrumbs([{ label: t("settings.title"), href: "/dashboard/settings" }, { label: t("serviceCalendar.title") }], []);
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
        toast({ title: t("serviceCalendar.scopeChanged"), description: t("serviceCalendar.scopeChangedBody"), variant: "destructive" });
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
    <SettingsRailLayout activeKey="service-calendar">
      {user && companyId ? (
        <CalendarBody
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

function CalendarBody({ companyId, userId, role, canWrite, onDirty }: BodyProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const queryKey = useMemo(() => serviceCalendarKey(companyId, userId, role), [companyId, userId, role]);
  const headers = useMemo(() => ({ "X-Company-Id": companyId }), [companyId]);

  const query = useQuery<ServiceCalendarResponse>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", "/api/service-calendar", undefined, { headers })).json(),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const entries = useMemo(() => query.data?.entries ?? [], [query.data]);
  const usage = query.data?.usage ?? [];

  // Drafts live apart from server data so refetch never overwrites in-progress edits.
  const [drafts, setDrafts] = useState<Record<string, DraftRow[]>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [stdWarn, setStdWarn] = useState<string | null>(null);
  const [loadingStart, setLoadingStart] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const baseRows = useCallback((svc: string) => rowsFromEntries(entries, svc), [entries]);
  const dirtyKeys = canWrite ? Object.keys(drafts).filter(svc => sig(drafts[svc]) !== sig(baseRows(svc))) : [];
  const dirty = dirtyKeys.length > 0;

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
  const rows = (svc: string) => drafts[svc] ?? baseRows(svc);
  // A pending PUT owns the service's draft: edits made meanwhile would be dropped by the post-save discard.
  const busyRef = useRef<Record<string, boolean>>({});
  const edit = (svc: string, fn: (r: DraftRow[]) => DraftRow[]) => {
    if (!canWrite || busyRef.current[svc]) return;
    setDrafts(d => ({ ...d, [svc]: fn(d[svc] ?? baseRows(svc)) }));
    setErrors(e => { if (!e[svc]) return e; const n = { ...e }; delete n[svc]; return n; });
  };
  const discard = (svc: string) => {
    setDrafts(d => { const n = { ...d }; delete n[svc]; return n; });
    setErrors(e => { const n = { ...e }; delete n[svc]; return n; });
  };

  /* ---- Writes: header from the initiating company only ---- */
  const key = queryKey;
  const put = async (svc: string, allowEmptyStandard: boolean) => {
    const list = drafts[svc] ?? baseRows(svc);
    const body = { entries: toPayload(list), ...(allowEmptyStandard ? { allowEmptyStandard: true } : {}) };
    busyRef.current = { ...busyRef.current, [svc]: true };
    setBusy(b => ({ ...b, [svc]: true }));
    setErrors(e => { const n = { ...e }; delete n[svc]; return n; });
    try {
      const res = await apiRequest("PUT", `/api/service-calendar/${encodeURIComponent(svc)}`, body, { headers });
      const next = await readCalendar(res);
      qc.setQueryData<ServiceCalendarResponse>(key, next);
      void qc.invalidateQueries({ queryKey: key });
      if (!alive.current) return;
      discard(svc);
      setFlash(f => ({ ...f, [svc]: Date.now() }));
      toast({ title: t("serviceCalendar.saved"), description: t("serviceCalendar.savedBody", { service: labelOf(svc) }) });
    } catch (err) {
      if (!alive.current) return;
      const msg = errorText(err);
      setErrors(e => ({ ...e, [svc]: msg }));
      toast({ title: t("serviceCalendar.writeFailed"), description: msg, variant: "destructive" });
    } finally {
      const nb = { ...busyRef.current }; delete nb[svc]; busyRef.current = nb;
      if (alive.current) setBusy(b => { const n = { ...b }; delete n[svc]; return n; });
    }
  };
  const save = (svc: string) => {
    const list = rows(svc);
    if (busyRef.current[svc]) return;
    // Warn whenever the result leaves no standard round: unticked, or the last standard round removed.
    const hadRounds = baseRows(svc).some(r => r.kind === "round");
    const hasRounds = list.some(r => r.kind === "round");
    if ((hasRounds || hadRounds) && !list.some(r => r.kind === "round" && r.inStandard)) { setStdWarn(svc); return; }
    void put(svc, false);
  };
  const loadStarting = async () => {
    setLoadingStart(true);
    try {
      const res = await apiRequest("POST", "/api/service-calendar/load-starting", undefined, { headers });
      const next = await readCalendar(res);
      qc.setQueryData<ServiceCalendarResponse>(key, next);
      void qc.invalidateQueries({ queryKey: key });
      if (alive.current) toast({ title: t("serviceCalendar.loaded") });
    } catch (err) {
      if (!alive.current) return;
      toast({ title: t("serviceCalendar.writeFailed"), description: errorText(err), variant: "destructive" });
      void qc.invalidateQueries({ queryKey: key });
    } finally {
      if (alive.current) setLoadingStart(false);
    }
  };

  const api: ServiceApi = {
    rows, isDirty: svc => dirtyKeys.includes(svc), edit, discard, save, busy, errors, flash, canWrite,
  };
  const usageFor = (svc: string) => usage.find(u => u.serviceKey === svc);
  const isEmpty = !query.isLoading && !query.isError && entries.length === 0 && Object.keys(drafts).length === 0;
  const onRequest = SCOPE_CATALOG.filter(s => s.scheduling === "on_request");

  return (
    <div className="space-y-6 max-w-5xl pb-16" data-testid="page-service-calendar">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">{t("serviceCalendar.title")}</h1>
          {!canWrite && (
            <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid="badge-read-only">
              <Lock className="h-3 w-3" />{t("serviceCalendar.readOnly")}
            </span>
          )}
          {dirty && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[hsl(var(--warning))]" data-testid="text-unsaved-count">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
              {t("serviceCalendar.unsaved")} · {dirtyKeys.map(labelOf).join(", ")}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-explanation">{t("serviceCalendar.explanation")}</p>
        <div className="flex gap-3 rounded-md border border-primary/30 bg-primary/[0.07] px-4 py-3" data-testid="box-deadline-rule">
          <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--rail-heading))]" />
          <div className="text-sm">
            <p className="font-semibold text-[hsl(var(--rail-heading))]">{t("serviceCalendar.deadlineTitle")}</p>
            <p className="text-muted-foreground">{t("serviceCalendar.deadlineBody")}</p>
          </div>
        </div>
      </header>

      {query.isLoading ? (
        <div className="space-y-3" data-testid="state-loading">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3" data-testid="state-error">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium">{t("serviceCalendar.loadFailed")}</p>
            <p className="text-muted-foreground">{errorText(query.error)}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()} data-testid="button-retry">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />{t("serviceCalendar.retry")}
          </Button>
        </div>
      ) : isEmpty ? (
        <EmptyPanel canWrite={canWrite} loading={loadingStart} onLoad={() => void loadStarting()} />
      ) : (
        <>
          <Section icon={<CalendarRange className="h-4 w-4" />} title={t("serviceCalendar.rounds")} hint={t("serviceCalendar.roundsHint")} testId="section-rounds">
            {campaignServices().map(svc => (
              <RoundCard key={svc.key} serviceKey={svc.key} label={svc.label} usage={usageFor(svc.key)} api={api} />
            ))}
          </Section>

          <Section icon={<ClipboardCheck className="h-4 w-4" />} title={t("serviceCalendar.checklists")} hint={t("serviceCalendar.checklistsHint")} testId="section-checklists">
            {checklistServices().map(svc => (
              <ChecklistCard key={svc.key} serviceKey={svc.key} label={svc.label} usage={usageFor(svc.key)} api={api} />
            ))}
          </Section>

          <Section icon={<Repeat className="h-4 w-4" />} title={t("serviceCalendar.recurring")} hint={t("serviceCalendar.recurringHint")} testId="section-recurring">
            <RecurringTable api={api} />
          </Section>

          <section className="rounded-md border border-dashed px-4 py-3 text-sm" data-testid="section-on-request">
            <span className="font-semibold">{t("serviceCalendar.onRequest")}.</span>{" "}
            <span className="text-muted-foreground">{t("serviceCalendar.onRequestHint")} </span>
            <span data-testid="text-on-request-list">{onRequest.map(s => s.label.replace(/\s*\(on request\)/i, "")).join(", ")}</span>
          </section>
        </>
      )}

      <AlertDialog open={!!stdWarn} onOpenChange={o => { if (!o) setStdWarn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("serviceCalendar.stdWarnTitle")}</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-std-warning">{t("serviceCalendar.stdWarnBody", { service: stdWarn ? labelOf(stdWarn) : "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-std-warning">{t("serviceCalendar.stay")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-std-warning" onClick={() => { const s = stdWarn; setStdWarn(null); if (s) void put(s, true); }}>
              {t("serviceCalendar.stdWarnConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pending} onOpenChange={o => { if (!o) stay(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("serviceCalendar.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("serviceCalendar.leaveBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={stay} data-testid="button-stay">{t("serviceCalendar.stay")}</AlertDialogCancel>
            <AlertDialogAction onClick={leave} data-testid="button-leave">{t("serviceCalendar.leave")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
