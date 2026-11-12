import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { CheckCircle2, FilePen, Hammer, PhoneCall, Plus, Search, Send } from "lucide-react";
import type { EstimateActionTicket } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { companyHeaders, formatCents } from "@/lib/hardscapeCatalog";
import { builderPath, denverToday, sendEstimate } from "@/lib/estimateBuilder";
import { runEstimateLifecycle } from "@/lib/estimateLifecycleActions";
import {
  ACTION_BUCKETS, SCOPES, assigneesOf, compareRows, flattenBoard, inScope, isAction, matchesFilters, subtotal,
  type ActionBoardResponse, type ActionBucket, type Scope,
} from "@/lib/estimateActionList";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimateActionRow, type Member, type RowAction } from "@/components/estimates/EstimateActionRow";
import { FollowUpDialog } from "@/components/estimates/FollowUpDialog";
import { AcceptDialog, DeclineDialog, SendDialog } from "@/components/estimates/LifecycleDialogs";
import { PdfPreviewDialog } from "@/components/estimates/PdfPreviewDialog";
import { useCustomerActivation } from "@/components/customerWizard/CustomerActivationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const BOARD_URL = "/api/estimates/board";
const BUCKET_ICON: Record<ActionBucket, ComponentType<{ className?: string }>> = {
  follow_up: PhoneCall, decide: CheckCircle2, send: Send, finish: FilePen, start: Hammer,
};
const RED_DOT = "h-2 w-2 rounded-full bg-[hsl(var(--est-danger))]";

interface CompanyUserRow { companyUser?: { userId?: string; status?: string; isActive?: boolean | string | null } | null; user?: { id?: string; name?: string | null; email?: string | null } | null }
type Dialog = { kind: "send" | "accept" | "decline" | "followUp" | "pdf"; ticket: EstimateActionTicket } | null;

export default function EstimatesBoardPage() {
  const { user } = useAuth();
  if (!user || !["admin", "office"].includes(user.accessRole ?? "") || !user.activeCompanyId) return null;
  return <ActionList key={`${user.activeCompanyId}|${user.id}|${user.activeRole}`} />;
}

function ActionList() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const activation = useCustomerActivation();
  const companyId = user!.activeCompanyId!;
  const scopeId = `${companyId}|${user!.id}|${user!.activeRole}`;
  const lang = i18n.language;

  // Mount/session identity for every async follow-on; dialogs closing never invalidates it.
  const mounted = useRef(true);
  const sessionRef = useRef(scopeId); sessionRef.current = scopeId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const guard = (captured: string) => () => mounted.current && sessionRef.current === captured;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);

  const board = useQuery<ActionBoardResponse>({
    queryKey: [BOARD_URL, companyId, user!.id, user!.activeRole],
    queryFn: async ({ signal }) => (await apiRequest("GET", BOARD_URL, undefined, { headers: companyHeaders(companyId), signal })).json(),
    staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true,
  });
  const team = useQuery<CompanyUserRow[]>({
    queryKey: ["/api/companies/users", companyId, user!.id, user!.activeRole],
    queryFn: async ({ signal }) => (await apiRequest("GET", "/api/companies/users", undefined, { headers: companyHeaders(companyId), signal })).json(),
    staleTime: 5 * 60_000,
  });
  const members: Member[] = useMemo(() => {
    const seen = new Set<string>();
    return (Array.isArray(team.data) ? team.data : []).flatMap((row) => {
      const active = row.companyUser?.isActive;
      if (active === false || active === "false" || (row.companyUser?.status && row.companyUser.status !== "active")) return [];
      const id = row.user?.id ?? row.companyUser?.userId;
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: row.user?.name || row.user?.email || id }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [team.data]);

  const [scope, setScope] = useState<Scope>("urgent");
  const [bucket, setBucket] = useState<ActionBucket | null>(null);
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("everyone");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [needPrice, setNeedPrice] = useState<{ id: string; name: string | null }[] | null>(null);

  const today = denverToday();
  const all = useMemo(() => flattenBoard(board.data), [board.data]);
  const rowsRef = useRef(all); rowsRef.current = all;
  const people = useMemo(() => assigneesOf(all), [all]);
  const filtered = useMemo(() => all.filter((r) => matchesFilters(r, { search, assignee })).sort(compareRows), [all, search, assignee]);
  const scoped = filtered.filter((r) => inScope(r, scope, today));
  const visible = bucket ? scoped.filter((r) => r.nextAction.bucket === bucket) : scoped;
  const needs = filtered.filter((r) => isAction(r.nextAction.bucket));
  const urgentCount = needs.filter((r) => r.nextAction.urgency === "red").length;
  const outCents = filtered.filter((r) => r.estimate?.status === "sent").reduce((s, r) => s + subtotal(r), 0);

  function openDialog(kind: NonNullable<Dialog>["kind"], ticket: EstimateActionTicket) {
    if (lock.current) return;
    setError(null); setNeedPrice(null); setDialog({ kind, ticket });
  }
  function closeDialog() { if (!lock.current) { setDialog(null); setError(null); setNeedPrice(null); } }
  async function withLock(fn: (isActive: () => boolean) => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    const isActive = guard(sessionRef.current);
    try { await fn(isActive); } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const refreshBoard = () => qc.invalidateQueries({ queryKey: [BOARD_URL] });

  function lifecycle(kind: "send" | "accept" | "decline", body: unknown) {
    const d = dialog;
    const est = d?.ticket.estimate;
    if (!d || !est) return;
    // A polling refresh must not leave an open dialog writing a superseded
    // current-version ID. Keep the captured version, never silently retarget it.
    const current = rowsRef.current.find(r => r.id === d.ticket.id)?.estimate;
    if (!current || current.id !== est.id || current.versionId !== est.versionId || current.status !== est.status) {
      setError(t("estimateBuilder.conflict")); void refreshBoard(); return;
    }
    void withLock(async (isActive) => {
      const res = await runEstimateLifecycle({
        kind, method: "POST", body, companyId, queryClient: qc, isActive, t, toast,
        url: `/api/estimates/${encodeURIComponent(est.id)}/versions/${encodeURIComponent(est.versionId)}/${kind}`,
        offerActivation: activation.offer, customerName: d.ticket.customer?.name ?? d.ticket.title,
      });
      if (!isActive()) return;
      if (res.kind === "success") { setDialog(null); setError(null); setNeedPrice(null); }
      else if (res.kind === "needsPrice") { setError(null); setNeedPrice(res.lineIds.map((id) => ({ id, name: null }))); }
      else if (res.kind === "error") setError(res.message);
    });
  }

  function build(r: EstimateActionTicket) {
    if (r.estimate) { navigate(builderPath(r.estimate.id)); return; }
    if (!r.customer) { toast({ title: t("estimateActions.toast.noCustomer"), variant: "destructive" }); return; }
    void withLock(async (isActive) => {
      try {
        const created = await sendEstimate("POST", "/api/estimates", companyId, { ticketId: r.id, customerId: r.customer!.id, title: r.title });
        if (!isActive()) return;
        void qc.invalidateQueries({ queryKey: ["/api/estimates"] });
        void refreshBoard();
        navigate(builderPath(created.id));
      } catch (err) {
        if (!isActive()) return;
        const m = err instanceof Error ? err.message.match(/^409: ([\s\S]*)$/) : null;
        if (m) {
          try { const id = JSON.parse(m[1]).existingEstimateId; if (typeof id === "string" && id) { navigate(builderPath(id)); return; } } catch { /* not a duplicate */ }
        }
        toast({ title: t("estimateActions.toast.buildFailed"), variant: "destructive" });
      }
    });
  }

  function assign(r: EstimateActionTicket, m: Member) {
    void withLock(async (isActive) => {
      try {
        await apiRequest("PATCH", `/api/tickets/${encodeURIComponent(r.id)}`, { assignedToId: m.id }, { headers: companyHeaders(companyId) });
        if (!isActive()) return;
        toast({ title: t("estimateActions.toast.assigned", { name: m.name }) });
        void refreshBoard();
        void qc.invalidateQueries({ queryKey: ["/api/tickets"] });
      } catch {
        if (isActive()) toast({ title: t("estimateActions.toast.assignFailed"), variant: "destructive" });
      }
    });
  }

  function saveFollowUp(body: { followUpDate: string; followUpNote: string }) {
    const d = dialog;
    if (!d) return;
    void withLock(async (isActive) => {
      try {
        await apiRequest("PATCH", `/api/tickets/${encodeURIComponent(d.ticket.id)}`, body, { headers: companyHeaders(companyId) });
        if (!isActive()) return;
        setDialog(null); setError(null);
        toast({ title: t("estimateActions.toast.followUpSaved") });
        void refreshBoard();
        void qc.invalidateQueries({ queryKey: ["/api/tickets"] });
      } catch {
        if (isActive()) setError(t("estimateActions.toast.followUpFailed"));
      }
    });
  }

  function onAction(a: RowAction, r: EstimateActionTicket) {
    if (a === "build") build(r);
    else openDialog(a, r);
  }

  const scopeCount = (s: Scope) => filtered.filter((r) => inScope(r, s, today)).length;
  const est = dialog?.ticket.estimate;

  const content = (
    <div className="mx-auto max-w-[1180px] space-y-5 p-4 pb-10 md:p-6" data-testid="estimates-action-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("estimateActions.eyebrow")}</p>
          <h1 className="text-2xl font-semibold">{t("estimateActions.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground" data-testid="text-summary">
            {board.isLoading ? t("estimateActions.loading") : [
              t("estimateActions.summary.need", { count: needs.length }),
              t("estimateActions.summary.urgent", { count: urgentCount }),
              t("estimateActions.summary.out", { amount: formatCents(outCents, lang) }),
            ].join(" · ")}
          </p>
        </div>
        <Button asChild data-testid="button-new-estimate-request">
          <Link href="/dashboard/tickets/new?workType=estimate_request"><Plus className="mr-1.5 h-4 w-4" />{t("estimateActions.newRequest")}</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label={t("estimateActions.filterByAction")}>
        {ACTION_BUCKETS.map((b) => {
          const rows = scoped.filter((r) => r.nextAction.bucket === b);
          const red = rows.some((r) => r.nextAction.urgency === "red");
          const cents = rows.reduce((s, r) => s + subtotal(r), 0);
          const on = bucket === b;
          const Icon = BUCKET_ICON[b];
          return (
            <button key={b} type="button" aria-pressed={on} onClick={() => setBucket(on ? null : b)} data-testid={`card-bucket-${b}`}
              className={cn("rounded-lg border bg-card p-3 text-left transition-colors hover:bg-rail-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on && "border-[hsl(var(--rail-active-icon))] ring-2 ring-[hsl(var(--rail-active-icon))]/30", !rows.length && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{t(`estimateActions.bucket.${b}.label`)}</span>
                {red && <span className={RED_DOT} role="img" aria-label={t("estimateActions.hasUrgent")} data-testid={`dot-bucket-${b}`} />}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums" data-testid={`count-bucket-${b}`}>{board.isLoading ? "–" : rows.length}</div>
              <div className="text-[11px] text-muted-foreground">{rows.some(r => r.estimate?.subtotalCents != null) ? `${formatCents(cents, lang)} · ` : ""}{t(`estimateActions.bucket.${b}.hint`)}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2" role="toolbar" aria-label={t("estimateActions.toolbar")}>
        <div className="inline-flex flex-wrap rounded-md border bg-background p-0.5" role="group" aria-label={t("estimateActions.show")}>
          {SCOPES.map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} onClick={() => { setScope(s); setBucket(null); }} data-testid={`scope-${s}`}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                scope === s ? "bg-rail-active text-rail-active-foreground" : "text-muted-foreground hover:bg-rail-hover")}>
              {s === "urgent" && <span className={RED_DOT} aria-hidden />}
              {t(`estimateActions.scope.${s}`)}
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground" data-testid={`count-scope-${s}`}>{scopeCount(s)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" aria-label={t("estimateActions.search")} placeholder={t("estimateActions.searchPlaceholder")} value={search}
              onChange={(e) => setSearch(e.target.value)} className="h-9 w-[240px] bg-background pl-8 text-sm" data-testid="input-search-estimates" />
          </div>
          <label className="sr-only" htmlFor="est-assignee">{t("estimateActions.assignee")}</label>
          <select id="est-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} data-testid="select-assignee"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="everyone">{t("estimateActions.everyone")}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="unassigned">{t("estimateActions.unassigned")}</option>
          </select>
        </div>
      </div>
      {bucket && (
        <p className="-mt-2 text-xs text-muted-foreground" data-testid="text-bucket-filter">
          {t("estimateActions.showingOnly", { bucket: t(`estimateActions.bucket.${bucket}.label`) })} ·{" "}
          <button type="button" className="underline" onClick={() => setBucket(null)} data-testid="button-clear-bucket">{t("estimateActions.clear")}</button>
        </p>
      )}
      {team.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>{t("estimateActions.teamError")}</span>
        <Button variant="outline" size="sm" onClick={() => void team.refetch()}>{t("estimateActions.retry")}</Button>
      </div>}

      {board.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border bg-card p-6" data-testid="estimates-error">
          <p className="text-sm text-muted-foreground">{t("estimateActions.error")}</p>
          <Button variant="outline" onClick={() => void board.refetch()} data-testid="button-estimates-retry">{t("estimateActions.retry")}</Button>
        </div>
      ) : board.isLoading ? (
        <div role="status" aria-label={t("estimateActions.loading")} className="space-y-2 rounded-lg border bg-card p-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border" aria-label={t("estimateActions.listLabel")} data-testid="list-estimates" aria-busy={board.isFetching}>
          {visible.length ? visible.map((r) => (
            <EstimateActionRow key={r.id} ticket={r} busy={busy} members={members} meId={user!.id} onAction={onAction} onAssign={assign} />
          )) : (
            <li className="bg-card px-4 py-10 text-center text-sm text-muted-foreground" data-testid="empty-estimates">
              {scope === "urgent" && !bucket && !search.trim() && assignee === "everyone" ? <>
                {t("estimateActions.emptyUrgent")}{" "}
                <button type="button" className="font-medium text-foreground underline" onClick={() => setScope("action")} data-testid="button-see-needs-action">{t("estimateActions.emptyUrgentLink")}</button>
              </> : t("estimateActions.empty")}
            </li>
          )}
        </ul>
      )}

      {est && <>
        <SendDialog open={dialog?.kind === "send"} busy={busy} error={error} versionNumber={est.versionNumber} needPrice={needPrice}
          onClose={closeDialog} onSubmit={(b) => lifecycle("send", b)} />
        <AcceptDialog open={dialog?.kind === "accept"} busy={busy} error={error} versionNumber={est.versionNumber}
          onClose={closeDialog} onSubmit={(b) => lifecycle("accept", b)} />
        <DeclineDialog open={dialog?.kind === "decline"} busy={busy} error={error} versionNumber={est.versionNumber}
          onClose={closeDialog} onSubmit={(b) => lifecycle("decline", b)} />
        <PdfPreviewDialog open={dialog?.kind === "pdf"} onClose={closeDialog} companyId={companyId} estimateId={est.id} versionId={est.versionId}
          estimateNumber={est.number} versionNumber={est.versionNumber} draft={est.status === "draft"} />
      </>}
      <FollowUpDialog ticket={dialog?.kind === "followUp" ? dialog.ticket : null} busy={busy} error={error} onClose={closeDialog} onSave={saveFollowUp} />
      {activation.dialog}
    </div>
  );
  return (
    <TooltipProvider delayDuration={150}>
      <SectionRailLayout rail={<EstimatesRail activeKey="all" />}>{content}</SectionRailLayout>
    </TooltipProvider>
  );
}
