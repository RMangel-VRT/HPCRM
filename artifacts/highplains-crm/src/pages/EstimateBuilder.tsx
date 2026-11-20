import { useEffect, useMemo, useRef, useState } from "react";
import { EXHIBITS_KEY } from "../../../../lib/db/src/plantExhibitContracts";
import { estimateCatalogReference, estimateHasMultipleVersions, type EstimateCatalogReference, type EstimateOrderInput } from "../../../../lib/db/src/estimateContracts";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCustomerActivation } from "@/components/customerWizard/CustomerActivationDialog";
import { Link, useLocation, useParams, useSearch } from "wouter";
import {
  ArrowLeft, Ban, Check, CheckCircle2, FileText, GitBranch, History, Lock, MoreHorizontal, Plus, Send, ThumbsDown, Trash2,
} from "lucide-react";
import type { EstimateTicketSummaryDto } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { TicketAdvanceNotice } from "@/components/estimates/TicketAdvanceNotice";
import { runEstimateLifecycle, estimateErrorText as errorText } from "@/lib/estimateLifecycleActions";
import { fetchJson, formatCents, HARDSCAPE_API } from "@/lib/hardscapeCatalog";
import { RATES_PREVIEW_API, scopeOf, QUICK_ITEMS_API, SERVICE_CATEGORIES_API } from "@/lib/estimateSettings";
import {
  ESTIMATES_API, ESTIMATE_BUILDER_PATH, UMBRELLAS, builderPath, distinctContexts,
   conflictOf, denverToday, errorStatus, formatCalendarDate, formatDate, isVersionLocked, sendEstimate,
  type EstimateDetailDto, type EstimateLineDto, type EstimateLineType, type EstimateSectionDto, type RatesPreviewWithContext,
} from "@/lib/estimateBuilder";
import { replayEstimateEdits, startEstimateEditRevision } from "@/lib/estimateRevision";
import { EstimateEditQueue, editResult, hasEstimateEdits, lineFrom, newTemporaryLineId, waitForEstimateEdits, type BuilderEdit } from "@/lib/estimateEditQueue";
import type { PickerLinePreview } from "@/lib/pickerSources";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import { EstimateSectionCard } from "@/components/estimates/EstimateSectionCard";
import { EstimateSorting, moveEstimateLine } from "@/components/estimates/EstimateSorting";
import { InlineInput } from "@/components/estimates/InlineEstimateInput";
import { ScopeOfWorkCard } from "@/components/estimates/ScopeOfWorkCard";
import { PdfPreviewDialog } from "@/components/estimates/PdfPreviewDialog";
import { EstimateProposalButton, proposalPath, useEstimateProposals } from "@/components/estimates/EstimateProposalAction";
import { DocumentBadge, EstimateStatePill, IdentityHeaderCard, MetadataCell, MetadataStrip } from "@/components/estimates/EstimateIdentityHeader";
import { EstimateWorkLocation } from "@/components/workLocation/EstimateWorkLocation";
import "@/components/estimates/estimateBuilder.css";
import { TicketStatusPill, type TicketStatusLike } from "@/components/TicketIdentity";
import { AddLineDialog, type AddLineBody, type AddLineInitial, type AddLineResult } from "@/components/estimates/AddLineDialog";
import type { SearchHandoff } from "@/components/estimates/SectionSearch";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
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

/** Optional display enrichment from the server (backend-owned); fields fall back to scoped reads. */
interface EstimateDisplay {
  companyName?: string | null; customerName?: string | null; customerAddress?: string | null; createdByName?: string | null;
  ticket?: { id: string; title: string | null; shortId: string; status: TicketStatusLike | null } | null;
}
type DetailWithDisplay = EstimateDetailDto & { display?: EstimateDisplay };

/** Max of container and version timestamps; ISO strings from the server. */
function freshness(d: EstimateDetailDto): number {
  return Math.max(Date.parse(d.updatedAt) || 0, Date.parse(d.version.updatedAt) || 0);
}

type LifeKind = "send" | "accept" | "decline" | "revise" | "discard" | "void";
type LifeDialog = Exclude<LifeKind, "revise"> | null;
type PendingRevision = { source: EstimateDetailDto; edit: BuilderEdit; focusAdded: boolean; resolve: (result: AddLineResult) => void };
const cancelledEdit: AddLineResult = { ok: false, error: null };
type ResetPrice = (id: string, reference: EstimateCatalogReference, preview?: PickerLinePreview) => void;
const openBuilderPriceActions = new Map<string, ResetPrice>();
const revisionQuantityFocus = new Map<string, string>();

export default function EstimateBuilder() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const search = useSearch();
  // Keyed by tenant scope + estimate: old-scope values never render in a new scope.
  return <BuilderContent key={`${scopeOf(user)}|${params.id ?? ""}|${search}`} id={params.id ?? ""} />;
}

function BuilderContent({ id }: { id: string }) {
  const activation = useCustomerActivation();
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
  const allowed = user?.accessRole === "admin" || user?.accessRole === "office";

  const scopePrefix = useMemo(() => [ESTIMATES_API, "detail", user?.activeCompanyId, user?.id, user?.activeRole, id] as const,
    [user?.activeCompanyId, user?.id, user?.activeRole, id]);
  const key = useMemo(() => [...scopePrefix, requestedVersion ?? "current"] as const, [scopePrefix, requestedVersion]);
  const editScope = JSON.stringify([companyId, id]);
  const edits = useMemo(() => new EstimateEditQueue(qc, key, companyId, editScope), [qc, key, companyId, editScope]);
  const viewTag = key.join("|");
  const identity = scopeOf(user);
  const editorScope = JSON.stringify([identity, id]);
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
    queryFn: async ({ signal }) => {
      if (edits.pending) await waitForEstimateEdits(editScope);
      signal.throwIfAborted();
      return fetchJson<EstimateDetailDto>(`${ESTIMATES_API}/${encodeURIComponent(id)}${requestedVersion ? `?version=${requestedVersion}` : ""}`, companyId, signal);
    },
    enabled: !!user && allowed && !!id,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const activeVersionRef = useRef(data?.version.id);
  activeVersionRef.current = data?.version.id;
  const contentEditableRef = useRef(false);
  contentEditableRef.current = false;
  const firstEditRef = useRef(false);
  firstEditRef.current = false;
  const pendingRef = useRef<PendingRevision | null>(null);
  const [pendingRevision, setPendingRevision] = useState<PendingRevision | null>(null);
  const revisionAbort = useRef<AbortController | null>(null);
  useEffect(() => () => {
    revisionAbort.current?.abort();
    pendingRef.current?.resolve(cancelledEdit);
    pendingRef.current = null;
  }, [viewTag]);

  const proposals = useEstimateProposals(id, !!data?.voidedAt);
  const customerId = data?.customerId;
  const rates = useQuery<RatesPreviewWithContext>({
    queryKey: [RATES_PREVIEW_API, user?.activeCompanyId, user?.id, user?.activeRole, customerId],
    queryFn: ({ signal }) => fetchJson<RatesPreviewWithContext>(`${RATES_PREVIEW_API}?customerId=${encodeURIComponent(customerId!)}`, companyId, signal),
    enabled: !!customerId,
  });
  const customer = useQuery<{ name?: string }>({
    queryKey: ["/api/customers", user?.activeCompanyId, user?.id, user?.activeRole, customerId],
    queryFn: ({ signal }) => fetchJson<{ name?: string }>(`/api/customers/${encodeURIComponent(customerId!)}`, companyId, signal),
    enabled: !!customerId && !(data as DetailWithDisplay | undefined)?.display?.customerName,
  });
  const ticketId = data?.ticketId;
  const ticket = useQuery<{ ticket: { id: string; title?: string; currentStatusId?: string }; statuses: { id: string; name: string }[] }>({
    queryKey: ["/api/tickets", user?.activeCompanyId, user?.id, user?.activeRole, ticketId, "details"],
    queryFn: ({ signal }) => fetchJson(`/api/tickets/${encodeURIComponent(ticketId!)}/details`, companyId, signal),
    enabled: !!ticketId && !(data as DetailWithDisplay | undefined)?.display?.ticket,
  });

  /** `inline` keeps the error envelope for custom saves instead of toasting it. */
  const runEdit = async (edit: BuilderEdit, inline = false, focusAdded = false): Promise<AddLineResult> => {
    if (!data || viewRef.current !== viewTag || activeVersionRef.current !== data.version.id
      || !contentEditableRef.current || pendingRef.current || busyRef.current) return cancelledEdit;
    if (firstEditRef.current) {
      return new Promise(resolve => {
        const pending = { source: data, edit, focusAdded, resolve };
        pendingRef.current = pending;
        setPendingRevision(pending);
      });
    }
    const view = viewTag;
    const sameIdentity = () => {
      const currentUser = qc.getQueryData<typeof user>(["/api/auth/me"]);
      return !!currentUser && scopeOf(currentUser) === identity;
    };
    try {
      // A route change must not discard earlier committed keystrokes. The
      // initiating identity is still checked before dispatch from a closed view.
      const result = await edits.enqueue(data, edit, () => viewRef.current === view
        ? activeVersionRef.current === data.version.id && contentEditableRef.current : sameIdentity());
      if (!result) return cancelledEdit;
      void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "list"] });
      void qc.invalidateQueries({ queryKey: [EXHIBITS_KEY, companyId] });
      return viewRef.current === view ? result : cancelledEdit;
    } catch (err) {
      if (viewRef.current !== view) {
        if (sameIdentity()) toast({ title: t("estimateBuilder.saveFailed"), description: errorText(err, t), variant: "destructive" });
        return cancelledEdit;
      }
      if (isVersionLocked(err)) {
        setLocked(true);
        contentEditableRef.current = false;
        activeVersionRef.current = undefined;
        void qc.invalidateQueries({ queryKey: key });
        toast({ title: t("estimateBuilder.saveFailed"), description: t("estimateBuilder.locked"), variant: "destructive" });
      } else {
        const c = conflictOf(err);
        const catalogError = inline && (c?.error === "CATALOG_ITEM_EXISTS" || c?.error === "UMBRELLA_MISMATCH" || errorStatus(err) === 422 || errorStatus(err) === 400);
        if (!inline) toast({ title: t("estimateBuilder.saveFailed"), description: errorText(err, t), variant: "destructive" });
        if (c?.error === "INVALID_ESTIMATE_ORDER" || (!catalogError && (errorStatus(err) === 409 || errorStatus(err) === 404))) void qc.invalidateQueries({ queryKey: key });
        // Catalog rows may have been reused/created elsewhere; refresh pickers and search.
        if (catalogError) void qc.invalidateQueries({ queryKey: ["estimate-picker"] });
      }
      return { ok: false, error: err };
    }
  };
  const run = async (method: string, url: string, body?: unknown) => (await runEdit({ method, url, body })).ok;
  const invalid = (msg: string) => toast({ title: t("estimateBuilder.saveFailed"), description: msg, variant: "destructive" });

  // ---- Lifecycle (send/accept/decline/revise/discard/void) ----
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
  const openDialog = (d: LifeDialog) => { if (busyRef.current || pendingRef.current || (d && !gateRef.current(d))) return; setDialogError(null); setNeedPrice(null); setDialog(d); };
  const closeDialog = () => { if (busyRef.current) return; setDialog(null); setDialogError(null); setNeedPrice(null); };
  const refreshScope = () => { void qc.invalidateQueries({ queryKey: [...scopePrefix] }); };

  /** Installs an authoritative full response (current version) without clobbering a newer cached payload. */
  async function installCurrent(d: EstimateDetailDto, view: string): Promise<boolean> {
    const panelKey = [ESTIMATES_API, "by-ticket", companyId, user?.id, user?.activeRole, d.ticketId];
    await Promise.all([
      qc.cancelQueries({ queryKey: [...currentKey] }),
      ...(d.ticketId ? [qc.cancelQueries({ queryKey: panelKey })] : []),
    ]);
    if (viewRef.current !== view) return false;
    const cached = qc.getQueryData<EstimateDetailDto>([...currentKey]);
    if (!cached || cached.id !== d.id || freshness(d) >= freshness(cached)) qc.setQueryData([...currentKey], d);
    void qc.invalidateQueries({ queryKey: [EXHIBITS_KEY, companyId] });
    if (d.ticketId) {
      // Navigation can happen before orchestration finishes. Do not briefly show
      // the previous document status while the ticket panel's mount refetch runs.
      const panelCached = qc.getQueryData<EstimateTicketSummaryDto | null>(panelKey);
      if (!panelCached || d.updatedAt >= panelCached.updatedAt) {
        qc.setQueryData<EstimateTicketSummaryDto | null>(panelKey, d.voidedAt ? null : {
          ...d, version: { id: d.version.id, versionNumber: d.version.versionNumber, status: d.version.status },
          subtotalCents: d.version.status === "draft" ? d.version.totals.subtotalCents : d.version.frozenSubtotalCents,
        });
      }
    }
    // Version-pinned views (and the old current-by-number view) refetch; the installed current view is kept.
    void qc.invalidateQueries({ queryKey: [...scopePrefix], predicate: (q) => q.queryKey[6] !== "current" });
    if (d.ticketId) void qc.invalidateQueries({ queryKey: ["/api/tickets", user?.activeCompanyId, user?.id, user?.activeRole, d.ticketId] });
    return true;
  }

  async function lifecycle(kind: LifeKind, method: string, url: string, body?: unknown): Promise<void> {
    if (viewRef.current !== viewTag || activeVersionRef.current !== data?.version.id || busyRef.current || pendingRef.current || !gateRef.current(kind)) return;
    const view = viewTag;
    const op = ++opRef.current;
    busyRef.current = true; setBusy(true); setDialogError(null);
    try {
      if (hasEstimateEdits(editScope)) await waitForEstimateEdits(editScope);
      const result = await runEstimateLifecycle({
        kind, method, url, body, companyId, queryClient: qc,
        isActive: () => viewRef.current === view && opRef.current === op,
        t, toast, offerActivation: activation.offer,
        customerName: customer.data?.name ?? t("estimateBuilder.customer"),
        install: d => installCurrent(d, view),
        onCommitted: () => { setDialog(null); setNeedPrice(null); },
      });
      if (result.kind === "stale") { refreshScope(); return; }
      if (result.kind === "success") {
        if (requestedVersion) setLocation(builderPath(result.data.id));
        return;
      }
      if (result.kind === "needsPrice") { setNeedPrice(result.lineIds); return; }
      const c = result.conflict;
      if (c?.error === "DRAFT_EXISTS") {
        setDialog(null);
        toast({ title: t("estimateBuilder.life.failed"), description: t("estimateBuilder.life.err.DRAFT_EXISTS") });
        refreshScope();
        const target = data?.versions.find((s) => s.id === c.versionId);
        setLocation(!target || target.id === data?.currentVersionId ? builderPath(id) : builderPath(id, target.versionNumber));
        return;
      }
      const msg = result.message;
      if (dialogRef.current) setDialogError(msg);
      else toast({ title: t("estimateBuilder.life.failed"), description: msg, variant: "destructive" });
      const st = result.status;
      if (st === 409 || st === 404) refreshScope();
    } finally {
      if (opRef.current === op) { busyRef.current = false; if (viewRef.current === view) setBusy(false); }
    }
  }
  const dialogRef = useRef<LifeDialog>(null);
  dialogRef.current = dialog;

  const [addFor, setAddFor] = useState<{ type: EstimateLineType; sectionId: string; initial?: AddLineInitial } | null>(null);
  const [focusQty, setFocusQty] = useState<string | null>(null);
  useEffect(() => {
    if (!focusQty || addFor || pendingRevision) return;
    const input = document.getElementById(`input-quantity-${focusQty}`);
    if (!(input instanceof HTMLInputElement) || input.disabled) return;
    input.focus();
    input.select();
    setFocusQty(null);
  }, [focusQty, data, addFor, pendingRevision]);
  const resetPriceRef = useRef<ResetPrice>(() => {});
  useEffect(() => {
    const action: ResetPrice = (...args) => resetPriceRef.current(...args);
    openBuilderPriceActions.set(editorScope, action);
    if (!requestedVersion) {
      const qtyId = revisionQuantityFocus.get(editorScope);
      if (qtyId) {
        revisionQuantityFocus.delete(editorScope);
        setFocusQty(qtyId);
      }
    }
    return () => { if (openBuilderPriceActions.get(editorScope) === action) openBuilderPriceActions.delete(editorScope); };
  }, [editorScope, requestedVersion]);
  useEffect(() => { setAddFor(null); }, [viewTag]);
  const [removeSection, setRemoveSection] = useState<EstimateSectionDto | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  useEffect(() => { setPdfOpen(false); }, [viewTag]);
  const keyboardDrop = useRef<{ lineId: string; from: string | undefined; to: string } | null>(null);
  useEffect(() => {
    const focus = keyboardDrop.current;
    if (!focus || (!data?.version.sections.some(s => s.id === focus.to && s.lines.some(l => l.id === focus.lineId)))) return;
    document.getElementById(`button-drag-line-${focus.lineId}`)?.focus();
  }, [data?.version.sections]);

  function finishRevision(result: AddLineResult) {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setPendingRevision(null);
    pending?.resolve(result);
  }

  async function confirmRevision() {
    const pending = pendingRef.current;
    if (!pending || busyRef.current || viewRef.current !== viewTag) return;
    const controller = new AbortController();
    revisionAbort.current = controller;
    const active = () => !controller.signal.aborted && viewRef.current === viewTag;
    busyRef.current = true;
    setBusy(true);
    let draft: EstimateDetailDto | undefined;
    let result: AddLineResult = cancelledEdit;
    try {
      const revision = await startEstimateEditRevision(companyId, pending.source, controller.signal);
      if (!active()) return;
      draft = revision.draft;
      const replay = replayEstimateEdits(pending.source, revision.from, draft, revision.idMap, [pending.edit]);
      if (!replay) {
        toast({ title: t("estimateBuilder.saveFailed"), description: t("estimateBuilder.life.firstEdit.missingTarget"), variant: "destructive" });
      } else {
        const edit = replay[0];
        if (!active()) return;
        const response = await sendEstimate(edit.method, edit.url, companyId, edit.body, controller.signal);
        result = editResult(response, edit);
        const { affectedLineId: _added, ...detail } = response;
        draft = detail;
      }
    } catch (err) {
      if (!active()) return;
      toast({ title: t("estimateBuilder.saveFailed"), description: errorText(err, t), variant: "destructive" });
      result = { ok: false, error: err };
    } finally {
      // A draft may have been created even if replay failed. Open it, but make
      // no edits against the frozen source and refetch any partial batch results.
      if (active()) {
        const installed = draft && await installCurrent(draft, viewTag);
        if (active()) {
          finishRevision(result);
          if (installed) {
            setAddFor(null);
            setRemoveSection(null);
            if (requestedVersion) {
              if (pending.focusAdded && result.ok && result.affectedLineId) revisionQuantityFocus.set(editorScope, result.affectedLineId);
              setLocation(builderPath(pending.source.id));
            }
          }
          if (!result.ok) refreshScope();
          busyRef.current = false;
          setBusy(false);
        }
      }
      void qc.invalidateQueries({ queryKey: [ESTIMATES_API, "list"] });
      if (!active()) refreshScope();
      if (revisionAbort.current === controller) revisionAbort.current = null;
    }
  }

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
  const revisable = !locked && !data.voidedAt && isCurrent && (v.status === "sent" || v.status === "declined");
  const editable = !locked && !data.voidedAt && isCurrent && (v.status === "draft" || revisable);
  contentEditableRef.current = editable;
  firstEditRef.current = revisable;
  const showVersion = estimateHasMultipleVersions(data.versions.length);
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
  const display = (data as DetailWithDisplay).display;
  const customerName = display?.customerName ?? customer.data?.name ?? null;
  const dTicket = display?.ticket ?? null;
  const ticketShort = dTicket?.shortId ?? (ticket.data?.ticket?.id ?? data.ticketId ?? "").slice(0, 8);
  const ticketTitle = dTicket?.title ?? ticket.data?.ticket?.title ?? null;
  const ticketStatusObj = dTicket?.status ?? null;
  const ticketStatusName = ticketStatus;
  const headerTotal = v.status === "draft" ? v.totals.subtotalCents : (v.frozenSubtotalCents ?? v.totals.subtotalCents);
  const isChangeOrder = v.status === "draft" && !!v.createdFromVersionId && !!acceptedSummary && acceptedSummary.id !== v.id;
  const canRevise = lifeOn && (v.status === "sent" || v.status === "accepted" || v.status === "declined");
  const canVoid = !data.voidedAt && !acceptedSummary && isCurrent;
  const pendingSource = pendingRevision?.source.version;
  const pendingNext = pendingRevision && Math.max(...pendingRevision.source.versions.map(s => s.versionNumber)) + 1;
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

  async function addLine(body: AddLineBody, preview?: PickerLinePreview) {
    const r = await runEdit({ method: "POST", url: `${vBase}/lines`, body, temporaryId: newTemporaryLineId(), preview }, false, true);
    if (r.ok) {
      if (r.affectedLineId) setFocusQty(r.affectedLineId);
      toast({ title: t("estimateBuilder.lineAdded") });
    }
    return r.ok;
  }
  /** Custom dialog path: errors keep their envelope so the dialog shows them inline and stays recoverable. */
  async function addLineDetailed(body: AddLineBody, preview?: PickerLinePreview): Promise<AddLineResult> {
    const r = await runEdit({ method: "POST", url: `${vBase}/lines`, body, temporaryId: newTemporaryLineId(), preview }, true);
    if (r.ok) {
      toast({ title: t("estimateBuilder.lineAdded") });
      if (body.saveToCatalog) {
        // The catalog is the owner. Refresh its management lists/counts as well
        // as builder projections, including a later reopen of the matches panel.
        for (const prefix of ["estimate-picker", "estimate-catalog-matches", HARDSCAPE_API, QUICK_ITEMS_API, SERVICE_CATEGORIES_API])
          void qc.invalidateQueries({ queryKey: [prefix] });
      }
    }
    return r;
  }
  function saveOrder(order: EstimateOrderInput, keyboardLineId?: string) {
    const target = keyboardLineId && !revisable && order.sections.find(s => s.lineIds.includes(keyboardLineId));
    const focus = target && keyboardLineId ? { lineId: keyboardLineId, from: data?.version.sections.find(s => s.lines.some(l => l.id === keyboardLineId))?.id, to: target.id } : null;
    if (focus && focus.from !== focus.to) keyboardDrop.current = focus;
    void run("PUT", `${vBase}/order`, order).then(ok => {
      if (!focus || keyboardDrop.current !== focus || viewRef.current !== viewTag) return;
      keyboardDrop.current = null;
      if (!ok) requestAnimationFrame(() => {
        if (viewRef.current === viewTag && document.activeElement === document.body) document.getElementById(`button-drag-line-${focus.lineId}`)?.focus();
      });
    });
  }
  function moveTo(line: EstimateLineDto, targetId: string) {
    const order = moveEstimateLine(qc.getQueryData<EstimateDetailDto>(key)?.version.sections ?? sections, line.id, targetId);
    if (order) saveOrder(order);
  }
  function searchAdd(sectionId: string, { type, row, ...initial }: SearchHandoff) {
    if (pendingRef.current) return;
    if (row?.body) void addLine({ ...row.body, lineType: type, sectionId, quantity: "1" }, row.preview);
    else setAddFor({ type, sectionId, initial });
  }
  async function replace(lineId: string, reference: EstimateCatalogReference, keepPrice: boolean, preview?: PickerLinePreview) {
    const result = await runEdit({ method: "POST", url: `${vBase}/lines/${encodeURIComponent(lineId)}/replace`,
      body: { ...reference, keepPrice, ...(!keepPrice && { priceOnly: true }) }, preview });
    if (!result.ok || !result.line) return;
    const line = result.line;
    const label = t("estimateBuilder.lineEdit.useCatalogPrice");
    toast({ title: t(keepPrice ? "estimateBuilder.lineEdit.changedTo" : "estimateBuilder.lineEdit.resetDone", { name: line.name }),
      action: keepPrice && line.priceSource === "manual" ? <ToastAction altText={label}
        onClick={() => openBuilderPriceActions.get(editorScope)?.(line.id, reference, preview)}>{label}</ToastAction> : undefined });
  }
  resetPriceRef.current = (lineId, reference, preview) => {
    const current = qc.getQueryData<EstimateDetailDto>(key);
    const line = current && lineFrom(current, lineId);
    if (!line || line.priceSource !== "manual" || JSON.stringify(estimateCatalogReference(line)) !== JSON.stringify(reference) || viewRef.current !== viewTag) return;
    void replace(lineId, reference, false, preview);
  };

  return (
    <SectionRailLayout rail={rail}>
      <div className="estimate-builder-container mx-auto w-full min-w-0 max-w-6xl" data-testid="page-estimate-builder" data-editable={editable ? "true" : "false"}>
        <IdentityHeaderCard testId="header-estimate-identity" footer={showVersion &&
          <nav className="flex flex-wrap items-end gap-1 border-t bg-muted/30 px-3 pt-1.5" aria-label={t("estimateBuilder.versions")} data-testid="strip-versions">
            {data.versions.map((s) => {
              const viewing = s.id === v.id;
              const cur = s.id === data.currentVersionId;
              return (
                <button key={s.id} type="button" aria-pressed={viewing} aria-label={t("estimateBuilder.viewVersion", { n: s.versionNumber })}
                  onClick={() => setLocation(cur ? builderPath(data.id) : builderPath(data.id, s.versionNumber))}
                  data-testid={`chip-version-${s.versionNumber}`} data-current={cur ? "true" : "false"}
                  className={cn("-mb-px h-8 rounded-t-md border border-b-0 px-3 text-[12px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--rail-active-icon))]",
                    viewing ? "border-border bg-card font-semibold text-foreground" : "border-transparent text-muted-foreground hover:bg-rail-hover hover:text-foreground",
                    cur && !viewing && "text-[hsl(var(--rail-active-icon))]")}>
                  {s.status === "accepted" && <Check className="-ml-0.5 mr-1 inline h-3 w-3" aria-label={t("estimateBuilder.life.acceptedMark")} />}
                  {versionLabel(s)}{cur ? ` · ${t("estimateBuilder.current")}` : ""}
                </button>
              );
            })}
          </nav>
        }>
          <div className="flex flex-wrap items-start gap-2">
            <Button variant="ghost" size="icon" aria-label={t("estimateBuilder.back")} onClick={() => setLocation(ESTIMATE_BUILDER_PATH)} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1 basis-[260px]">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <DocumentBadge label={t("estimateBuilder.header.badge", { number: data.estimateNumber })} testId="badge-estimate" />
                <span className="sr-only" data-testid="text-estimate-number">{data.estimateNumber}</span>
                <EstimateStatePill status={v.status} voided={false} testId={`pill-status-${v.status}`}
                  label={showVersion ? t("estimateBuilder.versionPill", { n: v.versionNumber, status: statusLabel(v.status) }) : statusLabel(v.status)} />
                {data.voidedAt && <EstimateStatePill status="void" voided testId="pill-status-void" label={t("estimateBuilder.voided")} />}
                {isChangeOrder && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-700/30 bg-emerald-700/5 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-800 dark:text-emerald-300" data-testid="chip-change-order">
                    <GitBranch className="h-3 w-3" />{t("estimateBuilder.header.changeOrder")}
                  </span>
                )}
              </div>
              {editable && v.status === "draft" ? (
                <InlineInput value={data.title} disabled={false} label={t("estimateBuilder.editTitle")} testId="input-estimate-title"
                  className="h-auto -ml-1 border-transparent bg-transparent px-1 text-xl font-semibold tracking-tight shadow-none hover:border-input focus-visible:border-input md:text-2xl"
                  validate={(raw) => raw.trim() ? { value: raw.trim(), same: raw.trim() === data.title } : { error: t("estimateBuilder.errTitle") }}
                  onCommit={(title) => run("PATCH", base, { title })} onInvalid={invalid} />
              ) : (
                <h1 className="line-clamp-2 text-xl font-semibold tracking-tight md:text-2xl" data-testid="text-estimate-title">{data.title}</h1>
              )}
            </div>
            <div role="toolbar" aria-label={t("estimateBuilder.life.actions")} className="flex flex-wrap items-center gap-1.5" data-testid="bar-lifecycle">
              <Button size="sm" variant="outline" onClick={() => {
                if (!pendingRef.current) {
                  if (!hasEstimateEdits(editScope)) setPdfOpen(true);
                  else void waitForEstimateEdits(editScope).then(() => { if (viewRef.current === viewTag) setPdfOpen(true); });
                }
              }} data-testid="button-preview-pdf"><FileText className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.pdf.preview")}</Button>
              {!data.voidedAt && <EstimateProposalButton estimateId={data.id} state={proposals} />}
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
                v.status === "accepted" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void lifecycle("revise", "POST", `${vBase}/revise`, {})} data-testid="button-revise">
                  <GitBranch className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.life.changeOrder", { n: nextN })}</Button>
              ))}
              {lifeOn && v.status === "draft" && isCurrent && v.versionNumber > 1 && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => openDialog("discard")} data-testid="button-discard-draft">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />{t("estimateBuilder.life.discard")}</Button>
              )}
              {!data.voidedAt && (isCurrent || proposals.older.length > 0) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("estimateBuilder.life.more")} disabled={busy} data-testid="button-overflow"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {proposals.older.length > 0 && (<>
                      <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground" data-testid="label-older-proposals">{t("proposalP1.otherProposals")}</DropdownMenuLabel>
                      {proposals.older.map((p) => (
                        <DropdownMenuItem key={p.id} onSelect={() => setLocation(proposalPath(p.id))} data-testid={`menu-open-proposal-${p.id}`}>
                          <FileText className="mr-2 h-4 w-4" />{t("proposalP1.openProposal", { number: p.proposalNumber ?? p.title })}
                        </DropdownMenuItem>
                      ))}
                    </>)}
                    {isCurrent && <>
                    {revisable && !draftSummary && <DropdownMenuItem onSelect={() => void lifecycle("revise", "POST", `${vBase}/revise`, {})} data-testid="menu-start-version">
                      <GitBranch className="mr-2 h-4 w-4" />{t("estimateBuilder.life.firstEdit.start", { n: nextN })}
                    </DropdownMenuItem>}
                    <DropdownMenuItem disabled={!canVoid || locked} onSelect={() => openDialog("void")} className="text-destructive focus:text-destructive" data-testid="menu-void">
                      <Ban className="mr-2 h-4 w-4" />{t("estimateBuilder.life.void")}
                    </DropdownMenuItem>
                    {!canVoid && <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground" data-testid="text-void-blocked">{t("estimateBuilder.life.voidBlocked")}</DropdownMenuLabel>}
                    </>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <MetadataStrip testId="strip-metadata">
            <MetadataCell label={t("estimateBuilder.header.customer")} testId="cell-customer">
              <Link href={`/dashboard/customers/${data.customerId}`} className="font-medium hover:underline" data-testid="link-customer">
                {customerName ?? t("estimateBuilder.customer")}
              </Link>
              {display?.customerAddress && <div className="truncate text-xs text-muted-foreground" data-testid="text-customer-address">{display.customerAddress}</div>}
            </MetadataCell>
            <MetadataCell label={t("estimateBuilder.header.ticket")} testId="cell-ticket" wide>
              {data.ticketId ? (
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Link href={`/dashboard/tickets/${data.ticketId}`} className="min-w-0 max-w-full truncate hover:underline" data-testid="link-ticket">
                    <span className="font-mono text-xs font-semibold">#{ticketShort}</span>
                    {ticketTitle && <span className="ml-1.5" data-testid="text-ticket-title">{ticketTitle}</span>}
                  </Link>
                  {ticketStatusObj ? <TicketStatusPill status={ticketStatusObj} testId="text-ticket-status" />
                    : ticketStatusName && <span className="rounded-full border bg-muted px-2 text-[11px] font-medium" aria-label={t("estimateBuilder.ticketStatus")} data-testid="text-ticket-status">{ticketStatusName}</span>}
                </span>
              ) : <span className="text-muted-foreground" data-testid="text-ticket-unlinked">{t("estimateBuilder.header.notLinked")}</span>}
            </MetadataCell>
            <MetadataCell label={t("workLocation.title")} testId="cell-work-location">
              <EstimateWorkLocation estimate={data} companyId={companyId} canEdit={allowed && !locked} />
            </MetadataCell>
            <MetadataCell label={t("estimateBuilder.header.rates")} testId="cell-rates"><RatesChip q={rates} /></MetadataCell>
            <MetadataCell label={t("estimateBuilder.header.total")} testId="cell-total">
              <span className="font-semibold tabular-nums" data-testid="text-header-total">{formatCents(headerTotal, lang)}</span>
              {v.status !== "draft" && <span className="ml-1 text-xs text-muted-foreground" data-testid="text-total-frozen">{t("estimateBuilder.header.frozen")}</span>}
            </MetadataCell>
            {v.sentAt && (
              <MetadataCell label={t("estimateBuilder.header.sent")} testId="cell-sent">
                {formatDate(v.sentAt, lang)}{v.sentMethod && <span className="text-muted-foreground"> · {t(`estimateBuilder.life.sentMethod.${v.sentMethod}`)}</span>}
              </MetadataCell>
            )}
            {v.acceptedAt && (
              <MetadataCell label={t("estimateBuilder.header.accepted")} testId="cell-accepted">
                {formatCalendarDate(v.acceptedOn, lang) || formatDate(v.acceptedAt, lang)}
                {v.acceptanceMethod && <span className="text-muted-foreground"> · {t(`estimateBuilder.life.acceptMethod.${v.acceptanceMethod}`)}</span>}
                {v.poNumber && <span className="text-muted-foreground"> · {t("estimateBuilder.header.po", { po: v.poNumber })}</span>}
              </MetadataCell>
            )}
            <MetadataCell label={t("estimateBuilder.header.created")} testId="cell-created">
              {formatDate(data.createdAt, lang)}{display?.createdByName && <span className="text-muted-foreground"> · {t("estimateBuilder.header.by", { name: display.createdByName })}</span>}
            </MetadataCell>
          </MetadataStrip>
        </IdentityHeaderCard>

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
        {(!editable || revisable) && !locked && (
          <LifecycleBanner data={data} lang={lang} notCurrent={!isCurrent} nextEditVersion={revisable ? nextN : undefined} />
        )}
        <TicketAdvanceNotice key={`${companyId}|${user?.id}|${user?.activeRole}|${id}`} estimate={data} />
        {v.status === "draft" && acceptedSummary && acceptedSummary.id !== v.id && !data.voidedAt && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-700/30 bg-emerald-700/5 p-3 text-sm text-emerald-900 dark:text-emerald-200" data-testid="banner-contract">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{t("estimateBuilder.life.banner.contract", { n: acceptedSummary.versionNumber })}
          </div>
        )}

        <div className="estimate-builder-grid mt-5 items-start gap-6" data-testid="layout-builder">
          <div className="estimate-builder-sections min-w-0 space-y-4">
            <ScopeOfWorkCard key={v.id} value={v.scopeOfWork} editable={editable} restoreOnFailure={revisable}
              onSave={async (scopeOfWork) => {
                if (!await run("PATCH", vBase, { scopeOfWork })) return null;
                const detail = qc.getQueryData<EstimateDetailDto>(key);
                return detail?.version.id === v.id ? { scopeOfWork: detail.version.scopeOfWork } : null;
              }} />
            <EstimateSorting sections={sections} onOrder={saveOrder}>
              {sections.map(s => (
                <EstimateSectionCard key={s.id} section={s} sections={sections} paletteDefaults={v.plantPaletteDefaults}
                  subtotal={v.totals.bySection[s.id] ?? 0} editable={editable} lang={lang} vBase={vBase} run={run} invalid={invalid}
                  customerId={data.customerId} companyId={companyId} onRemove={() => { if (!pendingRef.current) setRemoveSection(s); }}
                  onAdd={selection => searchAdd(s.id, selection)} onMoveTo={moveTo}
                  onSwap={(line, reference, preview) => void replace(line.id, reference, true, preview)}
                  onReset={(line, reference) => resetPriceRef.current(line.id, reference)}
                  onDuplicate={line => void runEdit({ method: "POST", url: `${vBase}/lines/${encodeURIComponent(line.id)}/duplicate`, temporaryId: newTemporaryLineId() })} />
              ))}
            </EstimateSorting>
            {editable && (
              <button type="button" onClick={() => void run("POST", `${vBase}/sections`, { name: t("estimateBuilder.section.newName") })}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-5 text-sm font-medium text-muted-foreground transition-colors hover:border-[hsl(var(--rail-active-icon))]/50 hover:text-foreground"
                data-testid="button-add-section">
                <Plus className="h-4 w-4" />{t("estimateBuilder.section.add")}
              </button>
            )}
          </div>
          <TotalsRail data={data} lang={lang} sticky={false} />
        </div>
      </div>

      {editable && (
        <AddLineDialog type={addFor && sections.some((x) => x.id === addFor.sectionId) ? addFor.type : null} sectionId={addFor?.sectionId ?? ""}
          customerId={data.customerId} companyId={companyId} initial={addFor?.initial}
          onClose={() => setAddFor(null)} onSubmit={addLine} onSubmitCustom={addLineDetailed} />
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
      <AlertDialog open={!!pendingRevision} onOpenChange={(open) => { if (!open && !busyRef.current) finishRevision(cancelledEdit); }}>
        <AlertDialogContent data-testid="dialog-first-edit-revision">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("estimateBuilder.life.firstEdit.title", { n: pendingNext })}</AlertDialogTitle>
            <AlertDialogDescription>{t(pendingSource?.status === "declined" ? "estimateBuilder.life.firstEdit.declined" : "estimateBuilder.life.firstEdit.sent", { source: pendingSource?.versionNumber, n: pendingNext })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("estimateBuilder.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void confirmRevision(); }} data-testid="button-confirm-first-edit">
              {t(busy ? "estimateBuilder.life.working" : "estimateBuilder.life.firstEdit.start", { n: pendingNext })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PdfPreviewDialog open={pdfOpen} onClose={() => setPdfOpen(false)} companyId={companyId} estimateId={data.id} versionId={v.id}
        estimateNumber={data.estimateNumber} versionNumber={v.versionNumber} showVersion={showVersion} workLocation={display?.workLocation} />
      <SendDialog open={dialog === "send"} busy={busy} error={dialogError} versionNumber={v.versionNumber} onClose={closeDialog} needPrice={needPriceLines}
        onSubmit={(b) => void lifecycle("send", "POST", `${vBase}/send`, b)} />
      {activation.dialog}
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

/** Tone and copy follow the viewed version; history never offers first-edit revision. */
function LifecycleBanner({ data, lang, notCurrent, nextEditVersion }: { data: EstimateDetailDto; lang: string; notCurrent: boolean; nextEditVersion?: number }) {
  const { t } = useTranslation();
  const v = data.version;
  const box = "mt-3 flex items-start gap-2 rounded-md border p-3 text-sm";
  if (nextEditVersion !== undefined) {
    const date = v.sentAt ? formatCalendarDate(denverToday(new Date(v.sentAt)), lang) : "";
    const method = v.sentMethod ? t(`estimateBuilder.life.sentMethod.${v.sentMethod}`) : "";
    const sent = date
      ? t(method ? "estimateBuilder.life.banner.sentMeta" : "estimateBuilder.life.banner.sentDate", { date, method })
      : t("estimateBuilder.life.banner.sentHistory");
    return (
      <div className={cn(box, "border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn-bg))] text-[hsl(var(--est-warn))]")} data-testid="banner-edit-revision" data-tone={v.status}>
        <GitBranch className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{v.status === "sent" ? sent : <span data-testid="text-decline-reason">{t("estimateBuilder.life.banner.declined", { reason: v.declineReason || "—" })}</span>}{" "}
          {t("estimateBuilder.life.banner.firstEdit", { n: nextEditVersion })}
        </span>
      </div>
    );
  }
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
        <span>{t("estimateBuilder.life.banner.sentHistory")}
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

function RailCard({ title, children, className, testId }: { title: string; children: ReactNode; className?: string; testId: string }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)} data-testid={testId}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function TotalsRail({ data, lang, sticky }: { data: EstimateDetailDto; lang: string; sticky: boolean }) {
  const { t } = useTranslation();
  const v = data.version;
  const tot = v.totals;
  const buckets = UMBRELLAS.filter((u) => (tot.byUmbrella[u] ?? 0) !== 0);
  const flow = ["draft", "sent", "accepted", "invoiced"] as const;
  const inFlow = (flow as readonly string[]).includes(v.status);
  return (
    <aside className={cn("min-w-0 space-y-3", sticky && "sticky top-4")} data-testid="rail-totals">
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
