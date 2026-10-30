import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams, useSearch } from "wouter";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Ban, Check, CheckCircle2, Droplets, FileText, GitBranch, Hammer, History, Leaf, Lock, MoreHorizontal,
  Mountain, Palette, PenLine, Plus, Receipt, Send, ThumbsDown, Tractor, Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { centsToInput, fetchJson, formatCents, parseDollarsToCents } from "@/lib/hardscapeCatalog";
import { RATES_PREVIEW_API, scopeOf } from "@/lib/estimateSettings";
import {
  ESTIMATES_API, ESTIMATE_BUILDER_PATH, FREE_UNITS, FREE_UNIT_TYPES, LINE_TINT, LINE_TYPES, UMBRELLAS, builderPath, distinctContexts,
  conflictOf, errorStatus, formatCalendarDate, formatDate, isVersionLocked, sendEstimate, validQuantity,
  type EstimateDetailDto, type EstimateLineDto, type EstimateLineType, type EstimateSectionDto, type RatesPreviewWithContext,
} from "@/lib/estimateBuilder";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import { StatusPill } from "@/components/estimates/StatusPill";
import { AddLineDialog, type AddLineBody } from "@/components/estimates/AddLineDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AcceptDialog, DeclineDialog, DiscardDialog, SendDialog, VoidDialog } from "@/components/estimates/LifecycleDialogs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<EstimateLineType, LucideIcon> = {
  plant: Leaf, hardscape: Mountain, irrigation: Droplets, labor: Hammer, equipment: Tractor, fee: Receipt, custom: PenLine,
};

/** Max of container and version timestamps; ISO strings from the server. */
function freshness(d: EstimateDetailDto): number {
  return Math.max(Date.parse(d.updatedAt) || 0, Date.parse(d.version.updatedAt) || 0);
}
function errorText(err: unknown, t: (k: string) => string): string {
  const s = errorStatus(err);
  if (s === 404) return t("estimateBuilder.notFound");
  if (s === 409) return /void/i.test(String(err)) ? t("estimateBuilder.voidedError") : t("estimateBuilder.conflict");
  if (s === 422) return t("estimateBuilder.err.unprocessable");
  if (s === 400) return t("estimateBuilder.err.invalid");
  return t("estimateBuilder.err.generic");
}

type Run = (method: string, url: string, body?: unknown) => Promise<boolean>;
type LifeKind = "send" | "accept" | "decline" | "revise" | "discard" | "void";
type LifeDialog = Exclude<LifeKind, "revise"> | null;

export default function EstimateBuilder() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const search = useSearch();
  // Keyed by tenant scope + estimate: old-scope values never render in a new scope.
  return <BuilderContent key={`${scopeOf(user)}|${params.id ?? ""}|${search}`} id={params.id ?? ""} />;
}

/** Commits once on blur (Enter blurs); restores the authoritative value on invalid input or failure. */
function InlineInput(props: {
  value: string; disabled: boolean; label: string; testId: string; className?: string; inputMode?: "decimal" | "text";
  validate: (raw: string) => { value: unknown; same: boolean } | { error: string };
  onCommit: (v: unknown) => Promise<boolean>; onInvalid: (msg: string) => void;
}) {
  const { value, disabled } = props;
  const [draft, setDraft] = useState(value);
  const inflight = useRef<string | null>(null);
  useEffect(() => { setDraft(value); }, [value]);
  async function commit() {
    const raw = draft;
    if (disabled || raw === value || inflight.current === raw) return;
    const v = props.validate(raw);
    if ("error" in v) { setDraft(value); props.onInvalid(v.error); return; }
    if (v.same) { setDraft(value); return; }
    inflight.current = raw;
    const ok = await props.onCommit(v.value);
    inflight.current = null;
    if (!ok) setDraft(value);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
    else if (e.key === "Escape") { setDraft(value); }
  }
  return (
    <Input value={draft} readOnly={disabled} disabled={disabled} aria-label={props.label} inputMode={props.inputMode}
      onChange={(e) => setDraft(e.target.value)} onBlur={() => void commit()} onKeyDown={onKey}
      className={cn("h-8 disabled:cursor-default disabled:opacity-100", props.className)} data-testid={props.testId} />
  );
}

function BuilderContent({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const vParam = new URLSearchParams(search).get("version");
  const requestedVersion = vParam && /^[1-9]\d*$/.test(vParam) ? Number(vParam) : undefined;
  const [companyId] = useState(() => user?.activeCompanyId ?? "");
  const allowed = user?.activeRole === "admin" || user?.activeRole === "office";

  const key = [ESTIMATES_API, "detail", user?.activeCompanyId, user?.id, user?.activeRole, id, requestedVersion ?? "current"] as const;
  const viewTag = key.join("|");
  const viewRef = useRef(viewTag);
  // Synchronous re-arm on every render: callbacks from a previous version/scope are dropped immediately.
  viewRef.current = viewTag;
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    viewRef.current = viewTag; setLocked(false); // re-arm after StrictMode cleanup replay
    return () => { viewRef.current = ""; };
  }, [viewTag]);

  const { data, isLoading, isError, error, refetch } = useQuery<EstimateDetailDto>({
    queryKey: key,
    queryFn: ({ signal }) => fetchJson<EstimateDetailDto>(`${ESTIMATES_API}/${encodeURIComponent(id)}${requestedVersion ? `?version=${requestedVersion}` : ""}`, companyId, signal),
    enabled: !!user && allowed && !!id,
    retry: false,
  });
  const activeVersionRef = useRef(data?.version.id);
  activeVersionRef.current = data?.version.id;
  const contentEditableRef = useRef(false);
  contentEditableRef.current = false;

  const customerId = data?.customerId;
  const rates = useQuery<RatesPreviewWithContext>({
    queryKey: [RATES_PREVIEW_API, user?.activeCompanyId, user?.id, user?.activeRole, customerId],
    queryFn: ({ signal }) => fetchJson<RatesPreviewWithContext>(`${RATES_PREVIEW_API}?customerId=${encodeURIComponent(customerId!)}`, companyId, signal),
    enabled: !!customerId,
  });
  const customer = useQuery<{ name?: string }>({
    queryKey: ["/api/customers", user?.activeCompanyId, user?.id, user?.activeRole, customerId],
    queryFn: ({ signal }) => fetchJson<{ name?: string }>(`/api/customers/${encodeURIComponent(customerId!)}`, companyId, signal),
    enabled: !!customerId,
  });
  const ticketId = data?.ticketId;
  const ticket = useQuery<{ ticket: { ticketNumber?: string; currentStatusId?: string }; statuses: { id: string; name: string }[] }>({
    queryKey: ["/api/tickets", user?.activeCompanyId, user?.id, user?.activeRole, ticketId, "details"],
    queryFn: ({ signal }) => fetchJson(`/api/tickets/${encodeURIComponent(ticketId!)}/details`, companyId, signal),
    enabled: !!ticketId,
  });

  /** Single mutation path: scoped header, stale-view drop, newest-response-wins install. */
  const run: Run = async (method, url, body) => {
    if (viewRef.current !== viewTag || activeVersionRef.current !== data?.version.id || !contentEditableRef.current) return false;
    const view = viewTag;
    try {
      const d = await sendEstimate(method, url, companyId, body);
      if (viewRef.current !== view) return false;
      qc.invalidateQueries({ queryKey: [ESTIMATES_API, "list"] });
      await qc.cancelQueries({ queryKey: key });
      if (viewRef.current !== view) return false;
      // Server order, not request order: never replace a newer authoritative payload.
      const cached = qc.getQueryData<EstimateDetailDto>(key);
      if (!cached || freshness(d) >= freshness(cached)) qc.setQueryData(key, d);
      return true;
    } catch (err) {
      if (viewRef.current !== view) return false;
      if (isVersionLocked(err)) {
        setLocked(true);
        void qc.invalidateQueries({ queryKey: key });
        toast({ title: t("estimateBuilder.saveFailed"), description: t("estimateBuilder.locked"), variant: "destructive" });
      } else {
        toast({ title: t("estimateBuilder.saveFailed"), description: errorText(err, t), variant: "destructive" });
        if (errorStatus(err) === 409 || errorStatus(err) === 404) void qc.invalidateQueries({ queryKey: key });
      }
      return false;
    }
  };
  const invalid = (msg: string) => toast({ title: t("estimateBuilder.saveFailed"), description: msg, variant: "destructive" });

  // ---- Lifecycle (send/accept/decline/revise/discard/void) ----
  const scopePrefix = [ESTIMATES_API, "detail", user?.activeCompanyId, user?.id, user?.activeRole, id] as const;
  const currentKey = [...scopePrefix, "current"] as const;
  const [dialog, setDialog] = useState<LifeDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [needPrice, setNeedPrice] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const opRef = useRef(0);
  // Defensive gate (set each render from the viewed state): hidden buttons are not the only barrier.
  const gateRef = useRef<(k: LifeKind) => boolean>(() => false);
  gateRef.current = () => false; // Loading/error renders must not retain the previous view's permissions.
  useEffect(() => {
    // New view: invalidate any in-flight operation identity and drop old dialog state.
    opRef.current++; busyRef.current = false;
    setBusy(false); setDialog(null); setDialogError(null); setNeedPrice(null);
  }, [viewTag]);
  const openDialog = (d: LifeDialog) => { if (busyRef.current || (d && !gateRef.current(d))) return; setDialogError(null); setNeedPrice(null); setDialog(d); };
  const closeDialog = () => { if (busyRef.current) return; setDialog(null); setDialogError(null); setNeedPrice(null); };
  const refreshScope = () => { void qc.invalidateQueries({ queryKey: [...scopePrefix] }); };

  /** Installs an authoritative full response (current version) without clobbering a newer cached payload. */
  async function installCurrent(d: EstimateDetailDto, view: string): Promise<boolean> {
    await qc.cancelQueries({ queryKey: [...currentKey] });
    if (viewRef.current !== view) return false;
    const cached = qc.getQueryData<EstimateDetailDto>([...currentKey]);
    if (!cached || cached.id !== d.id || freshness(d) >= freshness(cached)) qc.setQueryData([...currentKey], d);
    // Version-pinned views (and the old current-by-number view) refetch; the installed current view is kept.
    void qc.invalidateQueries({ queryKey: [...scopePrefix], predicate: (q) => q.queryKey[6] !== "current" });
    if (d.ticketId) void qc.invalidateQueries({ queryKey: ["/api/tickets", user?.activeCompanyId, user?.id, user?.activeRole, d.ticketId] });
    return true;
  }

  async function lifecycle(kind: LifeKind, method: string, url: string, body?: unknown): Promise<void> {
    if (viewRef.current !== viewTag || activeVersionRef.current !== data?.version.id || busyRef.current || !gateRef.current(kind)) return;
    const view = viewTag;
    const op = ++opRef.current;
    busyRef.current = true; setBusy(true); setDialogError(null);
    try {
      const d = await sendEstimate(method, url, companyId, body);
      void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "list"] });
      if (viewRef.current !== view) { refreshScope(); return; }
      if (!(await installCurrent(d, view))) return;
      setDialog(null); setNeedPrice(null);
      toast({ title: t(`estimateBuilder.life.done.${kind}`) });
      if (requestedVersion) setLocation(builderPath(d.id));
    } catch (err) {
      if (viewRef.current !== view) return;
      const c = conflictOf(err);
      if (kind === "send" && c?.error === "LINES_NEED_PRICE" && c.lineIds?.length) { setNeedPrice(c.lineIds); return; }
      if (c?.error === "DRAFT_EXISTS") {
        setDialog(null);
        toast({ title: t("estimateBuilder.life.failed"), description: t("estimateBuilder.life.err.DRAFT_EXISTS") });
        refreshScope();
        const target = data?.versions.find((s) => s.id === c.versionId);
        setLocation(!target || target.id === data?.currentVersionId ? builderPath(id) : builderPath(id, target.versionNumber));
        return;
      }
      const known = c && ["INVALID_TRANSITION", "NO_LINES", "HAS_ACCEPTED_VERSION", "ESTIMATE_VOIDED", "CONFLICT", "LINES_NEED_PRICE"].includes(c.error);
      const msg = known ? t(`estimateBuilder.life.err.${c!.error}`) : errorText(err, t);
      if (dialogRef.current) setDialogError(msg);
      else toast({ title: t("estimateBuilder.life.failed"), description: msg, variant: "destructive" });
      const st = errorStatus(err);
      if (st === 409 || st === 404) refreshScope();
    } finally {
      if (opRef.current === op) { busyRef.current = false; if (viewRef.current === view) setBusy(false); }
    }
  }
  const dialogRef = useRef<LifeDialog>(null);
  dialogRef.current = dialog;

  const [addFor, setAddFor] = useState<{ type: EstimateLineType; sectionId: string } | null>(null);
  const [removeSection, setRemoveSection] = useState<EstimateSectionDto | null>(null);

  const rail = <EstimatesRail activeKey="builder" />;
  const back = (
    <Link href={ESTIMATE_BUILDER_PATH} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" data-testid="link-back-list">
      <ArrowLeft className="h-3.5 w-3.5" />{t("estimateBuilder.back")}
    </Link>
  );

  if (isError || (!isLoading && !data)) {
    const notFound = errorStatus(error) === 404;
    return (
      <SectionRailLayout rail={rail}>
        <div className="mx-auto max-w-6xl" data-testid="page-estimate-builder">
          {back}
          <div role="alert" className="mt-4 flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-5" data-testid="builder-error">
            <p className="text-sm">{notFound ? t("estimateBuilder.notFound") : t("estimateBuilder.loadErrorOne")}</p>
            {!notFound && <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">{t("estimateBuilder.retry")}</Button>}
          </div>
        </div>
      </SectionRailLayout>
    );
  }
  if (isLoading || !data) {
    return (
      <SectionRailLayout rail={rail}>
        <div className="mx-auto max-w-6xl" role="status" aria-label={t("estimateBuilder.loadingOne")} data-testid="builder-loading">
          <Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-8 w-80" /><Skeleton className="mt-2 h-5 w-64" />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4"><Skeleton className="h-56 w-full" /><Skeleton className="h-40 w-full" /></div>
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </SectionRailLayout>
    );
  }

  const v = data.version;
  const isCurrent = v.id === data.currentVersionId;
  const editable = !locked && !data.voidedAt && v.status === "draft" && isCurrent;
  contentEditableRef.current = editable;
  const base = `${ESTIMATES_API}/${encodeURIComponent(data.id)}`;
  const vBase = `${base}/versions/${encodeURIComponent(v.id)}`;
  const statusLabel = (s: string) => t(`estimateBuilder.status.${s}`);
  const sections = v.sections;
  const ticketStatus = (() => {
    const tk = ticket.data; if (!tk) return null;
    return tk.statuses?.find(status => status.id === tk.ticket?.currentStatusId)?.name ?? null;
  })();

  const nextN = Math.max(0, ...data.versions.map((s) => s.versionNumber)) + 1;
  const draftSummary = data.versions.find((s) => s.status === "draft");
  const acceptedSummary = data.versions.find((s) => s.status === "accepted");
  const lifeOn = !data.voidedAt && !locked && isCurrent;
  const versionLabel = (s: EstimateDetailDto["versions"][number]) => {
    if (s.status === "superseded" && s.sentAt) {
      const original = s.acceptedAt ? "accepted" : "sent";
      return `${t("estimateBuilder.versionPill", { n: s.versionNumber, status: statusLabel(original) })} · ${statusLabel("superseded")}`;
    }
    const base = t("estimateBuilder.versionPill", { n: s.versionNumber, status: statusLabel(s.status) });
    if (s.status === "draft" && s.createdFromVersionId) return `${base} (${acceptedSummary ? t("estimateBuilder.life.changeOrderTag") : t("estimateBuilder.life.revisionTag")})`;
    return base;
  };
  const needPriceLines = needPrice?.map((lid) => ({ id: lid, name: sections.flatMap((s) => s.lines).find((l) => l.id === lid)?.name ?? null })) ?? null;
  const reviseLabel = v.status === "accepted" ? "changeOrder" : v.status === "declined" ? "revise" : "edit";
  const canRevise = lifeOn && (v.status === "sent" || v.status === "accepted" || v.status === "declined");
  const canVoid = !data.voidedAt && !acceptedSummary && isCurrent;
  gateRef.current = (k) => {
    if (!lifeOn) return false;
    switch (k) {
      case "send": return v.status === "draft" && isCurrent;
      case "discard": return v.status === "draft" && isCurrent && v.versionNumber > 1;
      case "accept": case "decline": return v.status === "sent";
      case "revise": return canRevise && !draftSummary;
      case "void": return canVoid;
    }
  };

  async function addLine(body: AddLineBody) {
    const ok = await run("POST", `${vBase}/lines`, body);
    if (ok) toast({ title: t("estimateBuilder.lineAdded") });
    return ok;
  }
  async function reorder(section: EstimateSectionDto, from: number, to: number) {
    const list = [...section.lines];
    const [m] = list.splice(from, 1); list.splice(to, 0, m);
    for (let i = 0; i < list.length; i++) {
      if (list[i].sortOrder === i) continue;
      if (!(await run("PATCH", `${vBase}/lines/${encodeURIComponent(list[i].id)}`, { sortOrder: i }))) return;
    }
  }
  function moveTo(line: EstimateLineDto, targetId: string) {
    const target = sections.find((s) => s.id === targetId);
    if (!target) return;
    const next = target.lines.length ? Math.max(...target.lines.map((l) => l.sortOrder)) + 1 : 0;
    void run("PATCH", `${vBase}/lines/${encodeURIComponent(line.id)}`, { sectionId: targetId, sortOrder: next });
  }

  return (
    <SectionRailLayout rail={rail}>
      <div className="mx-auto max-w-6xl" data-testid="page-estimate-builder" data-editable={editable ? "true" : "false"}>
        {back}
        <header className="mt-3 border-b pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-wide text-[hsl(var(--rail-active-icon))]" data-testid="text-estimate-number">{data.estimateNumber}</span>
            <StatusPill status={v.status} label={t("estimateBuilder.versionPill", { n: v.versionNumber, status: statusLabel(v.status) })} />
            {data.voidedAt && <StatusPill status="void" label={t("estimateBuilder.voided")} />}
            <RatesChip q={rates} />
          </div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
          {editable ? (
            <InlineInput value={data.title} disabled={false} label={t("estimateBuilder.editTitle")} testId="input-estimate-title"
              className="mt-2 h-auto border-transparent bg-transparent px-1 -ml-1 text-2xl font-bold tracking-tight shadow-none hover:border-input focus-visible:border-input"
              validate={(raw) => raw.trim() ? { value: raw.trim(), same: raw.trim() === data.title } : { error: t("estimateBuilder.errTitle") }}
              onCommit={(title) => run("PATCH", base, { title })} onInvalid={invalid} />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-estimate-title">{data.title}</h1>
          )}
          </div>
          <div role="toolbar" aria-label={t("estimateBuilder.life.actions")} className="flex flex-wrap items-center gap-1.5" data-testid="bar-lifecycle">
            {lifeOn && v.status === "draft" && isCurrent && (
              <Button size="sm" disabled={busy} onClick={() => openDialog("send")} data-testid="button-mark-sent"><Send className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.life.markSent")}</Button>
            )}
            {lifeOn && v.status === "sent" && (<>
              <Button size="sm" disabled={busy} onClick={() => openDialog("accept")} data-testid="button-record-accept"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.life.recordAccept")}</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => openDialog("decline")} data-testid="button-record-decline"><ThumbsDown className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.life.recordDecline")}</Button>
            </>)}
            {v.status === "accepted" && (
              <span className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-700/30 bg-emerald-700/5 px-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
                aria-disabled="true" title={t("estimateBuilder.life.lockedHint")} data-testid="indicator-locked"><Lock className="h-3.5 w-3.5" />{t("estimateBuilder.life.locked")}</span>
            )}
            {canRevise && (draftSummary ? (
              <Button size="sm" variant="outline" onClick={() => setLocation(draftSummary.id === data.currentVersionId ? builderPath(data.id) : builderPath(data.id, draftSummary.versionNumber))}
                data-testid="button-open-draft"><GitBranch className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.life.openDraft", { n: draftSummary.versionNumber })}</Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void lifecycle("revise", "POST", `${vBase}/revise`, {})} data-testid="button-revise">
                <GitBranch className="mr-1.5 h-3.5 w-3.5" />{t(`estimateBuilder.life.${reviseLabel}`, { n: nextN })}</Button>
            ))}
            {lifeOn && v.status === "draft" && isCurrent && v.versionNumber > 1 && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => openDialog("discard")} data-testid="button-discard-draft">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.life.discard")}</Button>
            )}
            {!data.voidedAt && isCurrent && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("estimateBuilder.life.more")} disabled={busy} data-testid="button-overflow"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem disabled={!canVoid || locked} onSelect={() => openDialog("void")} className="text-destructive focus:text-destructive" data-testid="menu-void">
                    <Ban className="mr-2 h-4 w-4" />{t("estimateBuilder.life.void")}
                  </DropdownMenuItem>
                  {!canVoid && <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground" data-testid="text-void-blocked">{t("estimateBuilder.life.voidBlocked")}</DropdownMenuLabel>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <Link href={`/dashboard/customers/${data.customerId}`} className="font-medium text-foreground hover:underline" data-testid="link-customer">
              {customer.data?.name ?? t("estimateBuilder.customer")}
            </Link>
            {data.ticketId && (
              <span className="inline-flex items-center gap-1.5">
                <Link href={`/dashboard/tickets/${data.ticketId}`} className="hover:underline" data-testid="link-ticket">
                  {t("estimateBuilder.ticket")}{ticket.data?.ticket?.ticketNumber ? ` ${ticket.data.ticket.ticketNumber}` : ""}
                </Link>
                {ticketStatus && <span className="rounded-full border bg-muted px-2 text-[11px] font-medium" aria-label={t("estimateBuilder.ticketStatus")} data-testid="text-ticket-status">{ticketStatus}</span>}
              </span>
            )}
          </div>
          <nav className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={t("estimateBuilder.versions")} data-testid="strip-versions">
            {data.versions.map((s) => {
              const viewing = s.id === v.id;
              const cur = s.id === data.currentVersionId;
              return (
                <button key={s.id} type="button" aria-pressed={viewing} aria-label={t("estimateBuilder.viewVersion", { n: s.versionNumber })}
                  onClick={() => setLocation(cur ? builderPath(data.id) : builderPath(data.id, s.versionNumber))}
                  data-testid={`chip-version-${s.versionNumber}`} data-current={cur ? "true" : "false"}
                  className={cn("h-7 rounded-full border px-3 text-[12px] tabular-nums transition-colors",
                    viewing ? "border-transparent bg-rail-active font-semibold text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover",
                    cur && !viewing && "border-[hsl(var(--rail-active-icon))]/50")}>
                  {s.status === "accepted" && <Check className="-ml-0.5 mr-1 inline h-3 w-3" aria-label={t("estimateBuilder.life.acceptedMark")} />}
                  {versionLabel(s)}{cur ? ` · ${t("estimateBuilder.current")}` : ""}
                </button>
              );
            })}
          </nav>
        </header>

        {locked && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn-bg))] p-3 text-sm text-[hsl(var(--est-warn))]" data-testid="banner-locked">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />{t("estimateBuilder.locked")}
          </div>
        )}
        {!isCurrent && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[hsl(var(--rail-active-icon))]/50 bg-[hsl(var(--rail-active-icon))]/5 p-3 text-sm" data-testid="bar-not-current">
            <span className="inline-flex items-center gap-2 font-medium"><History className="h-4 w-4 text-[hsl(var(--rail-active-icon))]" />{t("estimateBuilder.life.notCurrent", { n: v.versionNumber })}</span>
            <Button size="sm" variant="outline" onClick={() => setLocation(builderPath(data.id))} data-testid="button-view-current">{t("estimateBuilder.life.backToCurrent")}</Button>
          </div>
        )}
        {!editable && !locked && (
          <LifecycleBanner data={data} lang={lang} notCurrent={!isCurrent} />
        )}
        {v.status === "draft" && acceptedSummary && acceptedSummary.id !== v.id && !data.voidedAt && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-700/30 bg-emerald-700/5 p-3 text-sm text-emerald-900 dark:text-emerald-200" data-testid="banner-contract">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{t("estimateBuilder.life.banner.contract", { n: acceptedSummary.versionNumber })}
          </div>
        )}

        <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            {sections.map((s) => (
              <SectionCard key={s.id} section={s} sections={sections} subtotal={v.totals.bySection[s.id] ?? 0} editable={editable} lang={lang}
                vBase={vBase} run={run} invalid={invalid} canRemove={sections.length > 1}
                onRemove={() => setRemoveSection(s)} onAdd={(type) => setAddFor({ type, sectionId: s.id })}
                onReorder={(from, to) => void reorder(s, from, to)} onMoveTo={moveTo} />
            ))}
            {editable && (
              <button type="button" onClick={() => void run("POST", `${vBase}/sections`, { name: t("estimateBuilder.section.newName") })}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-5 text-sm font-medium text-muted-foreground transition-colors hover:border-[hsl(var(--rail-active-icon))]/50 hover:text-foreground"
                data-testid="button-add-section">
                <Plus className="h-4 w-4" />{t("estimateBuilder.section.add")}
              </button>
            )}
          </div>
          <TotalsRail data={data} lang={lang} />
        </div>
      </div>

      {editable && (
        <AddLineDialog type={addFor?.type ?? null} sectionId={addFor?.sectionId ?? ""} customerId={data.customerId} companyId={companyId}
          onClose={() => setAddFor(null)} onSubmit={addLine} />
      )}
      <AlertDialog open={!!removeSection && editable} onOpenChange={(o) => { if (!o) setRemoveSection(null); }}>
        <AlertDialogContent data-testid="dialog-remove-section">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("estimateBuilder.section.removeTitle", { name: removeSection?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("estimateBuilder.section.removeBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-section">{t("estimateBuilder.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-remove-section" onClick={() => {
              const s = removeSection; setRemoveSection(null);
              if (s && sections.length > 1) void run("DELETE", `${vBase}/sections/${encodeURIComponent(s.id)}`).then((ok) => { if (ok) toast({ title: t("estimateBuilder.sectionRemoved") }); });
            }}>{t("estimateBuilder.section.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SendDialog open={dialog === "send"} busy={busy} error={dialogError} versionNumber={v.versionNumber} onClose={closeDialog} needPrice={needPriceLines}
        onSubmit={(b) => void lifecycle("send", "POST", `${vBase}/send`, b)} />
      <AcceptDialog open={dialog === "accept"} busy={busy} error={dialogError} versionNumber={v.versionNumber} onClose={closeDialog}
        onSubmit={(b) => void lifecycle("accept", "POST", `${vBase}/accept`, b)} />
      <DeclineDialog open={dialog === "decline"} busy={busy} error={dialogError} versionNumber={v.versionNumber} onClose={closeDialog}
        onSubmit={(b) => void lifecycle("decline", "POST", `${vBase}/decline`, b)} />
      <DiscardDialog open={dialog === "discard"} busy={busy} error={dialogError} versionNumber={v.versionNumber} onClose={closeDialog}
        onSubmit={() => void lifecycle("discard", "DELETE", vBase)} />
      <VoidDialog open={dialog === "void"} busy={busy} error={dialogError} versionNumber={v.versionNumber} onClose={closeDialog}
        onSubmit={(b) => void lifecycle("void", "POST", `${base}/void`, b)} />
    </SectionRailLayout>
  );
}

/** Read-only banner for the viewed version: tone and copy follow its actual lifecycle state. */
function LifecycleBanner({ data, lang, notCurrent }: { data: EstimateDetailDto; lang: string; notCurrent: boolean }) {
  const { t } = useTranslation();
  const v = data.version;
  const box = "mt-3 flex items-start gap-2 rounded-md border p-3 text-sm";
  if (data.voidedAt) {
    return (
      <div className={cn(box, "bg-muted/40")} data-testid="banner-read-only" data-tone="void">
        <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{t("estimateBuilder.life.banner.void")}{data.voidReason && <> <span data-testid="text-void-reason">{t("estimateBuilder.life.banner.voidReason", { reason: data.voidReason })}</span></>}</span>
      </div>
    );
  }
  if (v.status === "sent") {
    return (
      <div className={cn(box, "border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn-bg))] text-[hsl(var(--est-warn))]")} data-testid="banner-read-only" data-tone="sent">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("estimateBuilder.life.banner.sent")}
          {v.sentAt && v.sentMethod && <> {t("estimateBuilder.life.banner.sentMeta", { date: formatDate(v.sentAt, lang), method: t(`estimateBuilder.life.sentMethod.${v.sentMethod}`) })}</>}
        </span>
      </div>
    );
  }
  if (v.status === "accepted") {
    const date = formatCalendarDate(v.acceptedOn, lang) || formatDate(v.acceptedAt, lang);
    return (
      <div className={cn(box, "border-emerald-700/30 bg-emerald-700/5 text-emerald-900 dark:text-emerald-200")} data-testid="banner-read-only" data-tone="accepted">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span data-testid="text-accepted-meta">
          {t("estimateBuilder.life.banner.accepted", { date, method: v.acceptanceMethod ? t(`estimateBuilder.life.acceptMethod.${v.acceptanceMethod}`) : "" })}
          {v.poNumber && <> {t("estimateBuilder.life.banner.po", { po: v.poNumber })}</>} <strong>{t("estimateBuilder.life.banner.frozen")}</strong>
        </span>
      </div>
    );
  }
  if (v.status === "declined") {
    return (
      <div className={cn(box, "bg-muted/40")} data-testid="banner-read-only" data-tone="declined">
        <ThumbsDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span data-testid="text-decline-reason">{t("estimateBuilder.life.banner.declined", { reason: v.declineReason ?? "" })}</span>
      </div>
    );
  }
  if (v.status === "superseded") {
    return (
      <div className={cn(box, "bg-muted/40 text-muted-foreground")} data-testid="banner-read-only" data-tone="superseded">
        <History className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("estimateBuilder.life.banner.superseded")}
          {v.acceptedAt && <> {t("estimateBuilder.life.banner.accepted", {
            date: formatCalendarDate(v.acceptedOn, lang) || formatDate(v.acceptedAt, lang),
            method: v.acceptanceMethod ? t(`estimateBuilder.life.acceptMethod.${v.acceptanceMethod}`) : "",
          })}{v.poNumber && <> {t("estimateBuilder.life.banner.po", { po: v.poNumber })}</>}</>}
          {v.sentAt && v.sentMethod && <> {t("estimateBuilder.life.banner.sentMeta", { date: formatDate(v.sentAt, lang), method: t(`estimateBuilder.life.sentMethod.${v.sentMethod}`) })}</>}
          {" "}{t("estimateBuilder.life.banner.frozen")}
        </span>
      </div>
    );
  }
  return (
    <div className={cn(box, "bg-muted/40")} data-testid="banner-read-only" data-tone={v.status}>
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      {notCurrent ? t("estimateBuilder.life.notCurrent", { n: v.versionNumber }) : t("estimateBuilder.life.banner.draft", { status: t(`estimateBuilder.status.${v.status}`) })}
    </div>
  );
}

function RatesChip({ q }: { q: { data?: RatesPreviewWithContext; isLoading: boolean; isError: boolean } }) {
  const { t } = useTranslation();
  const cls = "inline-flex h-5 items-center gap-1 rounded-full border border-dashed px-2 text-[11px] font-medium text-muted-foreground";
  if (q.isLoading) return <span className={cls} data-testid="chip-rates">{t("estimateBuilder.rates.loading")}</span>;
  const ctx = q.data?.governingContexts;
  if (q.isError || !ctx) return <span className={cls} data-testid="chip-rates">{t("estimateBuilder.rates.unavailable")}</span>;
  const groups = distinctContexts(ctx);
  const label = (g: (typeof groups)[number]) => g.termId == null ? t("estimateBuilder.rates.card")
    : g.seasonLabel ? t("estimateBuilder.rates.contract", { season: g.seasonLabel }) : t("estimateBuilder.rates.contractNoSeason");
  if (groups.length <= 1) return <span className={cls} data-testid="chip-rates">{groups[0] ? label(groups[0]) : t("estimateBuilder.rates.card")}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid="chip-rates">
      {groups.map((g) => (
        <span key={g.termId ?? "card"} className={cls} data-testid={`chip-rates-${g.termId ?? "card"}`}>{label(g)} ({g.lines.join(", ")})</span>
      ))}
    </span>
  );
}

function SectionCard(props: {
  section: EstimateSectionDto; sections: EstimateSectionDto[]; subtotal: number; editable: boolean; lang: string; vBase: string; run: Run;
  invalid: (m: string) => void; canRemove: boolean; onRemove: () => void; onAdd: (t: EstimateLineType) => void;
  onReorder: (from: number, to: number) => void; onMoveTo: (line: EstimateLineDto, sectionId: string) => void;
}) {
  const { section: s, editable, lang, run, vBase } = props;
  const { t } = useTranslation();
  return (
    <section className="overflow-hidden rounded-lg border bg-card" data-testid={`card-section-${s.id}`} aria-label={s.name}>
      <div className="flex flex-wrap items-center gap-3 border-b bg-[hsl(var(--table-header))] px-3 py-2">
        <div className="min-w-0 flex-1">
          {editable ? (
            <InlineInput value={s.name} disabled={false} label={t("estimateBuilder.section.name")} testId={`input-section-name-${s.id}`}
              className="border-transparent bg-transparent px-1 font-semibold shadow-none hover:border-input focus-visible:border-input"
              validate={(raw) => raw.trim() ? { value: raw.trim(), same: raw.trim() === s.name } : { error: t("estimateBuilder.err.required") }}
              onCommit={(name) => run("PATCH", `${vBase}/sections/${encodeURIComponent(s.id)}`, { name })} onInvalid={props.invalid} />
          ) : <h2 className="px-1 font-semibold" data-testid={`text-section-name-${s.id}`}>{s.name}</h2>}
        </div>
        <span className="text-xs text-muted-foreground" data-testid={`text-section-count-${s.id}`}>{t("estimateBuilder.section.lines", { count: s.lines.length })}</span>
        <span className="font-semibold tabular-nums" data-testid={`text-section-subtotal-${s.id}`}>{formatCents(props.subtotal, lang)}</span>
        {editable && props.canRemove && (
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("estimateBuilder.section.remove")} onClick={props.onRemove} data-testid={`button-remove-section-${s.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {s.lines.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground" data-testid={`text-section-empty-${s.id}`}>{t("estimateBuilder.section.empty")}</p>
      ) : (
        <ul className="divide-y">
          {s.lines.map((l, i) => (
            <LineRow key={l.id} line={l} index={i} count={s.lines.length} {...props} />
          ))}
        </ul>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-1 border-t bg-muted/30 px-3 py-2" data-testid={`bar-add-${s.id}`}>
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("estimateBuilder.addBar")}</span>
          {LINE_TYPES.map((type) => {
            const Icon = TYPE_ICON[type];
            return (
              <button key={type} type="button" onClick={() => props.onAdd(type)} data-testid={`button-add-${type}-${s.id}`}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors hover:bg-background"
                style={{ color: `hsl(${LINE_TINT[type]})` }}>
                <Icon className="h-3.5 w-3.5" />{t(`estimateBuilder.line.type.${type}`)}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LineRow(props: {
  line: EstimateLineDto; index: number; count: number; sections: EstimateSectionDto[]; editable: boolean; lang: string; vBase: string; run: Run;
  invalid: (m: string) => void; onReorder: (from: number, to: number) => void; onMoveTo: (line: EstimateLineDto, sectionId: string) => void;
}) {
  const { line: l, editable, lang, run, vBase, index } = props;
  const { t } = useTranslation();
  const Icon = TYPE_ICON[l.lineType];
  const url = `${vBase}/lines/${encodeURIComponent(l.id)}`;
  const patch = (body: Record<string, unknown>) => run("PATCH", url, body);
  const units = FREE_UNIT_TYPES.includes(l.lineType) ? (FREE_UNITS as readonly string[]).includes(l.unit) ? [...FREE_UNITS] : [l.unit, ...FREE_UNITS] : null;
  const others = props.sections.filter((s) => s.id !== l.sectionId);
  const tint = LINE_TINT[l.lineType];
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-2.5 md:grid-cols-[auto_minmax(0,1fr)_auto]" data-testid={`row-line-${l.id}`} data-line-type={l.lineType}>
      <span className="mt-0.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold"
        style={{ background: `hsl(${tint} / 0.12)`, color: `hsl(${tint})` }} data-testid={`chip-type-${l.id}`}>
        <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t(`estimateBuilder.line.type.${l.lineType}`)}</span>
      </span>
      <div className="min-w-0">
        <div className="font-bold leading-tight" data-testid={`text-line-name-${l.id}`}>{l.name}</div>
        {l.detail && <div className="truncate text-xs text-muted-foreground" data-testid={`text-line-detail-${l.id}`}>{l.detail}</div>}
        <span className="mt-1 inline-block rounded border px-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground" data-testid={`badge-source-${l.id}`}>
          {t(`estimateBuilder.line.source.${l.priceSource}`)}
        </span>
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 md:col-span-1">
        <div className="w-20">
          <InlineInput value={l.quantity} disabled={!editable} inputMode="decimal" label={t("estimateBuilder.line.quantity", { name: l.name })} testId={`input-quantity-${l.id}`}
            className="text-right tabular-nums"
            validate={(raw) => { const q = validQuantity(raw); return q ? { value: q, same: Number(q) === Number(l.quantity) } : { error: t("estimateBuilder.err.quantity") }; }}
            onCommit={(quantity) => patch({ quantity })} onInvalid={props.invalid} />
        </div>
        <span className="text-xs text-muted-foreground">×</span>
        <div className="relative w-24">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <InlineInput value={centsToInput(l.unitPriceCents)} disabled={!editable} inputMode="decimal" label={t("estimateBuilder.line.rate", { name: l.name })} testId={`input-rate-${l.id}`}
            className="pl-5 text-right tabular-nums"
            validate={(raw) => { const c = parseDollarsToCents(raw); return typeof c === "number" ? { value: c, same: c === l.unitPriceCents } : { error: c === "tooLarge" ? t("estimateBuilder.err.tooLarge") : t("estimateBuilder.err.rate") }; }}
            onCommit={(unitPriceCents) => patch({ unitPriceCents })} onInvalid={props.invalid} />
        </div>
        {units && editable ? (
          <select aria-label={t("estimateBuilder.line.unit", { name: l.name })} value={l.unit} onChange={(e) => void patch({ unit: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs" data-testid={`select-unit-${l.id}`}>
            {units.map((u) => <option key={u} value={u}>{t(`estimateBuilder.unit.${u}`, { defaultValue: u })}</option>)}
          </select>
        ) : <span className="w-12 text-xs text-muted-foreground" data-testid={`text-unit-${l.id}`}>/{t(`estimateBuilder.unit.${l.unit}`, { defaultValue: l.unit })}</span>}
        {l.needsPrice && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--est-warn))]" data-testid={`marker-needs-price-${l.id}`}>
            <AlertTriangle className="h-3 w-3" />{t("estimateBuilder.line.needsPrice")}
          </span>
        )}
        <span className="w-24 text-right font-semibold tabular-nums" aria-label={t("estimateBuilder.line.extended")} data-testid={`text-extended-${l.id}`}>{formatCents(l.extendedCents, lang)}</span>
        {l.lineType === "plant" && (
          <button type="button" disabled={!editable} aria-pressed={l.includeInPalette} aria-label={t("estimateBuilder.line.palette", { name: l.name })}
            onClick={() => editable && void patch({ includeInPalette: !l.includeInPalette })} data-testid={`toggle-palette-${l.id}`}
            className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-default",
              l.includeInPalette ? "bg-[hsl(var(--rail-active-icon))]/15 text-[hsl(var(--rail-active-icon))]" : "text-muted-foreground/50 hover:text-muted-foreground")}>
            <Palette className="h-4 w-4" />
          </button>
        )}
        {editable && (
          <span className="inline-flex items-center">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} aria-label={t("estimateBuilder.line.moveUp", { name: l.name })}
              onClick={() => props.onReorder(index, index - 1)} data-testid={`button-move-up-${l.id}`}><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === props.count - 1} aria-label={t("estimateBuilder.line.moveDown", { name: l.name })}
              onClick={() => props.onReorder(index, index + 1)} data-testid={`button-move-down-${l.id}`}><ArrowDown className="h-3.5 w-3.5" /></Button>
            {others.length > 0 && (
              <select aria-label={t("estimateBuilder.line.moveTo", { name: l.name })} value="" onChange={(e) => { if (e.target.value) props.onMoveTo(l, e.target.value); }}
                className="ml-1 h-7 max-w-[8.5rem] rounded-md border border-input bg-background px-1 text-[11px]" data-testid={`select-move-${l.id}`}>
                <option value="">{t("estimateBuilder.line.moveToLabel")}</option>
                {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={t("estimateBuilder.line.remove", { name: l.name })}
              onClick={() => void run("DELETE", url)} data-testid={`button-remove-line-${l.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          </span>
        )}
      </div>
    </li>
  );
}

function RailCard({ title, children, className, testId }: { title: string; children: ReactNode; className?: string; testId: string }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)} data-testid={testId}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function TotalsRail({ data, lang }: { data: EstimateDetailDto; lang: string }) {
  const { t } = useTranslation();
  const v = data.version;
  const tot = v.totals;
  const buckets = UMBRELLAS.filter((u) => (tot.byUmbrella[u] ?? 0) !== 0);
  const flow = ["draft", "sent", "accepted", "invoiced"] as const;
  const inFlow = (flow as readonly string[]).includes(v.status);
  return (
    <aside className="space-y-3 lg:sticky lg:top-4" data-testid="rail-totals">
      <RailCard title={t("estimateBuilder.rail.totals")} testId="card-totals">
        <ul className="space-y-1 text-sm">
          {v.sections.map((s) => (
            <li key={s.id} className="flex justify-between gap-3"><span className="truncate text-muted-foreground">{s.name}</span>
              <span className="tabular-nums" data-testid={`text-rail-section-${s.id}`}>{formatCents(tot.bySection[s.id] ?? 0, lang)}</span></li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t pt-2">
          <span className="font-semibold">{t("estimateBuilder.rail.total")}</span>
          <span className="text-xl font-bold tabular-nums" data-testid="text-estimate-total">{formatCents(tot.subtotalCents, lang)}</span>
        </div>
      </RailCard>
      <section className="rounded-lg border border-[hsl(var(--est-warn))]/35 bg-[hsl(var(--est-warn-bg))]/60 p-4 text-sm" data-testid="card-internal-margin">
        <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--est-warn))]">{t("estimateBuilder.rail.internal")}</h3>
        <div className="flex justify-between"><span>{t("estimateBuilder.rail.knownCost")}</span><span className="tabular-nums" data-testid="text-known-cost">{formatCents(tot.costKnownCents, lang)}</span></div>
        <div className="flex justify-between"><span>{t("estimateBuilder.rail.margin")}</span>
          <span className="font-semibold tabular-nums" data-testid="text-margin">{tot.materialMarginPct == null ? t("estimateBuilder.rail.marginNone") : `${tot.materialMarginPct.toLocaleString(lang === "es" ? "es-US" : "en-US", { maximumFractionDigits: 1 })}%`}</span></div>
        {tot.costUnknownLines > 0 && <p className="mt-2 text-xs text-[hsl(var(--est-warn))]" data-testid="text-unknown-cost">{t("estimateBuilder.rail.unknown", { count: tot.costUnknownLines })}</p>}
      </section>
      <RailCard title={t("estimateBuilder.rail.qbo")} testId="card-qbo">
        {buckets.length === 0 ? <p className="text-sm text-muted-foreground">{t("estimateBuilder.rail.qboEmpty")}</p> : (
          <ul className="space-y-1 text-sm">
            {buckets.map((u) => (
              <li key={u} className="flex justify-between gap-3" data-testid={`row-umbrella-${u}`}><span>{t(`qboSetup.umbrella.${u}`)}</span>
                <span className="tabular-nums">{formatCents(tot.byUmbrella[u], lang)}</span></li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="h-3 w-3" />{t("estimateBuilder.rail.qboNote")}</p>
      </RailCard>
      <RailCard title={t("estimateBuilder.rail.status")} testId="card-status">
        <ol className="flex flex-wrap items-center gap-1" aria-label={t("estimateBuilder.rail.flow")}>
          {flow.map((f, i) => {
            const lit = f === v.status;
            return (
              <li key={f} className="flex items-center gap-1">
                <span aria-current={lit ? "step" : undefined} data-testid={`flow-${f}`} data-lit={lit ? "true" : "false"}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", lit ? "border-transparent bg-rail-active text-rail-active-foreground" : "text-muted-foreground")}>
                  {t(`estimateBuilder.status.${f}`)}
                </span>
                {i < flow.length - 1 && <span className="text-muted-foreground/60">›</span>}
              </li>
            );
          })}
        </ol>
        {!inFlow && <p className="mt-2 text-xs font-medium" data-testid="text-other-status">{t("estimateBuilder.rail.otherStatus", { status: t(`estimateBuilder.status.${v.status}`) })}</p>}
        <p className="mt-2 text-xs text-foreground/80" data-testid="text-next-step">{data.voidedAt ? t("estimateBuilder.life.next.void") : t(`estimateBuilder.life.next.${v.status}`)}</p>
        {v.status === "draft" && !data.voidedAt && <p className="mt-1 text-xs text-muted-foreground">{t("estimateBuilder.rail.lockNote")}</p>}
      </RailCard>
    </aside>
  );
}
