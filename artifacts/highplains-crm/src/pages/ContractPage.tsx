import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SeasonDocuments } from "@/components/contracts/SeasonDocuments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { guardLinkClick, unsavedGuard } from "@/lib/unsavedGuard";
import { LineBadge, RenewalChip, ReviewChip, StatusPill, amberBox } from "@/components/contracts/ContractBadges";
import { ContractUploadButton, TERM_UPLOAD_OPTIONS } from "@/components/contracts/ContractUploadButton";
import { RatesEditor, ratesFingerprint, ratesPayload, rateProblems, toRateRows } from "@/components/contracts/RatesEditor";
import type { RateRow } from "@/components/contracts/RatesEditor";
import { ScopeEditor, buildScopeRows, scopePayload, scopeProblems } from "@/components/contracts/ScopeEditor";
import type { ScopeRow } from "@/components/contracts/ScopeEditor";
import { centsToInput } from "@/components/contracts/rateCardUtils";
import { buildFieldPatch, saveSections } from "@/components/contracts/contractSave";
import type { FieldDraft } from "@/components/contracts/contractSave";
import { PaymentEditor } from "@/components/contracts/PaymentEditor";
import { RenewDialog } from "@/components/contracts/RenewDialog";
import { SNOW_LINE, lineProblems, lineSum, linesFromBilling, paymentsFingerprint, paymentsPayload, startMonthOf } from "@/components/contracts/paymentDraft";
import type { PaymentLine } from "@/components/contracts/paymentDraft";
import { dateOnly, errorStatus, errorText, money } from "@/components/contracts/contractFormat";
import { isLaterYear, termForm, termLine } from "@/components/contracts/contractTypes";
import type { ContractDetail, DetailTerm } from "@/components/contracts/contractTypes";
import {
  BillingSummary, DetailsList, HistoryList, PANEL_LABEL, Panel, PanelEditBar, RatesSummary, ScopeSummary, Tile,
  coverageContext, daysUntil, differingRates, monthlyOf, paymentPattern, resolveTermHash, signedInfo, statusWords,
} from "@/components/contracts/ContractWidgets";
import type { EditPanel } from "@/components/contracts/ContractWidgets";

const LIST_KEY = "/api/contract-center/contracts";
const MOVE_LABEL: Record<string, string> = { draft: "Back to draft", sent: "Mark sent", signed: "Mark signed", lost: "Mark lost", cancelled: "Cancel contract" };
const FIELD_INPUTS: { key: keyof FieldDraft; label: string }[] = [
  { key: "seasonLabel", label: "Season" }, { key: "startDate", label: "Start date" }, { key: "endDate", label: "End date" },
  { key: "legalName", label: "Legal name" }, { key: "managingAgentName", label: "Managing agent" }, { key: "projectContact", label: "Project contact" },
  { key: "contactPhone", label: "Contact phone" }, { key: "contactEmail", label: "Contact email" }, { key: "projectAddress", label: "Project address" },
  { key: "po", label: "PO" }, { key: "notes", label: "Notes" },
];
/** Keys each panel may write through PATCH; anything else in the draft is never sent from that panel. */
const PANEL_FIELD_KEYS: Record<"billing" | "details", (keyof FieldDraft)[]> = {
  billing: ["snowPricing", "flatInput"],
  details: [...FIELD_INPUTS.map(i => i.key), "snowTriggers"],
};
type Pending = { kind: "term"; id: string } | { kind: "leave"; href: string } | { kind: "panel"; to: EditPanel } | { kind: "renew" } | { kind: "cancel" } | null;

const priceText = (d: ContractDetail, t: DetailTerm) =>
  termLine(t, d.line) === "snow" ? (t.snowPricing === "flat_rate" ? `Flat snow ${money(t.snowFlatPriceCents)}` : "T&M")
    : t.annualPriceCents != null ? money(t.annualPriceCents) : "T&M";
const pick = (f: FieldDraft, keys: (keyof FieldDraft)[]) =>
  Object.fromEntries(Object.entries(f).filter(([k]) => keys.includes(k as keyof FieldDraft))) as FieldDraft;

export function ContractView({ detail, initialHash }: { detail: ContractDetail; initialHash: string }) {
  const { t: translate } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const termIds = detail.terms.map(t => t.id);
  const defaultId = detail.currentTermId ?? detail.terms[detail.terms.length - 1]?.id;
  const [selectedId, setSelectedId] = useState(() => resolveTermHash(initialHash, termIds) ?? defaultId);
  const term = detail.terms.find(t => t.id === selectedId) ?? detail.terms[detail.terms.length - 1];
  const editable = !!term && term.editable === true;
  const [editingPanel, setEditingPanel] = useState<EditPanel | null>(null);
  const [fields, setFields] = useState<FieldDraft | null>(null);
  const [scope, setScope] = useState<ScopeRow[] | null>(null);
  const [rates, setRates] = useState<RateRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentLine[] | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmMove, setConfirmMove] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [signPrompt, setSignPrompt] = useState(false);
  const [ratesAll, setRatesAll] = useState(false);

  const seasonLine = termLine(term, detail.line);
  const seasonForm = termForm(term, detail.form);
  const scopeBase = useMemo(() => (term ? buildScopeRows(term.scope, seasonLine) : []), [term, seasonLine]);
  const ratesBase = useMemo(() => (term ? toRateRows(term.rates) : []), [term]);
  const paymentsBase = useMemo(() => (term ? linesFromBilling(term.billingMonths) : []), [term]);
  const paymentRows = payments ?? paymentsBase;
  const scopeRows = scope ?? scopeBase;
  const rateRows = rates ?? ratesBase;
  const paymentsDirty = editingPanel === "billing" && !!payments && paymentsFingerprint(payments) !== paymentsFingerprint(paymentsBase);
  const scopeDirty = editingPanel === "scope" && !!scope && JSON.stringify(scope) !== JSON.stringify(scopeBase);
  const ratesDirty = editingPanel === "rates" && !!rates && ratesFingerprint(rates) !== ratesFingerprint(ratesBase);
  // Only the open panel's own field keys are ever patched.
  const panelFields = useMemo(() => (fields && (editingPanel === "billing" || editingPanel === "details") ? pick(fields, PANEL_FIELD_KEYS[editingPanel]) : null), [fields, editingPanel]);
  const fieldBuild = useMemo(() => {
    if (!term || !panelFields) return { patch: {} as Record<string, unknown>, problems: [] as string[] };
    const b = buildFieldPatch(panelFields, term);
    // Details never touches snow pricing; drop the implicit flat-price clear it may add.
    if (editingPanel === "details") { delete b.patch.snowPricing; delete b.patch.snowFlatPriceCents; }
    return b;
  }, [panelFields, term, editingPanel]);
  const fieldPatch = fieldBuild.patch;
  const fieldsDirty = Object.keys(fieldPatch).length > 0 || fieldBuild.problems.length > 0;
  const dirty = !!editingPanel && (scopeDirty || ratesDirty || fieldsDirty || paymentsDirty);

  const termKey = term?.id;
  useEffect(() => {
    setEditingPanel(null); setFields(null); setScope(null); setRates(null); setPayments(null); setErrors({});
    setSignPrompt(false); setConfirmMove(null); setMenuOpen(false); setRatesAll(false);
  }, [termKey]);
  useEffect(() => {
    if (!dirty) return;
    document.addEventListener("click", guardLinkClick as never, true);
    return () => document.removeEventListener("click", guardLinkClick as never, true);
  }, [dirty]);
  useEffect(() => { unsavedGuard.setDirty(dirty); }, [dirty]);
  useEffect(() => () => unsavedGuard.setDirty(false), []);
  const sidebarPending = useSyncExternalStore(unsavedGuard.subscribe, unsavedGuard.getPending, () => null);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const selectedRef = useRef(term?.id); selectedRef.current = term?.id;
  const detailRef = useRef(detail); detailRef.current = detail;
  const path = useRef(typeof window !== "undefined" ? window.location.pathname : "");
  useEffect(() => {
    const onHash = () => {
      const id = resolveTermHash(window.location.hash, detailRef.current.terms.map(t => t.id));
      if (!id || id === selectedRef.current) return;
      if (dirtyRef.current) {
        history.replaceState(null, "", `#term-${selectedRef.current}`);
        setPending({ kind: "term", id });
      } else setSelectedId(id);
    };
    const onPop = () => {
      if (window.location.pathname !== path.current && dirtyRef.current) {
        const target = window.location.pathname;
        history.pushState(null, "", path.current + `#term-${selectedRef.current}`);
        setPending({ kind: "leave", href: target });
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onPop); };
  }, []);
  // Keep the URL hash exact for the displayed term (legacy suffixes are normalised away).
  useEffect(() => {
    if (term && window.location.hash !== `#term-${term.id}`) history.replaceState(null, "", `#term-${term.id}`);
  }, [term]);

  function resetEdits() { setEditingPanel(null); setFields(null); setScope(null); setRates(null); setPayments(null); setErrors({}); }
  function openPanel(p: EditPanel) {
    if (editingPanel === p) return;
    if (dirty) return setPending({ kind: "panel", to: p });
    resetEdits(); setSignPrompt(false); setEditingPanel(p);
  }
  function selectTerm(id: string) {
    if (id === term?.id) return;
    if (dirty) return setPending({ kind: "term", id });
    resetEdits(); setSignPrompt(false); setConfirmMove(null); setMenuOpen(false);
    window.location.hash = `term-${id}`;
    setSelectedId(id);
  }
  const bar = pending ?? (sidebarPending ? { kind: "leave" as const, href: sidebarPending } : null);
  function proceed(p: Pending) {
    setPending(null); unsavedGuard.setDirty(false); unsavedGuard.clearPending();
    if (p?.kind === "term") { window.location.hash = `term-${p.id}`; setSelectedId(p.id); }
    if (p?.kind === "leave") navigate(p.href);
    if (p?.kind === "panel") setEditingPanel(p.to);
    if (p?.kind === "renew") setRenewOpen(true);
  }
  function discard() { const p = bar; resetEdits(); proceed(p); }
  async function saveThenProceed() {
    const p = bar;
    if (await save()) { resetEdits(); proceed(p); }
  }
  const keepEditing = () => { setPending(null); unsavedGuard.clearPending(); };

  const refresh = async () => { await qc.invalidateQueries({ queryKey: [LIST_KEY] }); };
  const api = async (method: string, url: string, body?: unknown) => (await apiRequest(method, url, body)).json();

  /** Saves the open panel only. Resolves true when everything it owned was saved. */
  async function save(): Promise<boolean> {
    if (!term || !editingPanel) return true;
    const panel = editingPanel;
    if (!dirty) { resetEdits(); return true; }
    const billing = panel === "billing";
    const effFlat = seasonLine !== "landscape" && (fields?.snowPricing ?? term.snowPricing) === "flat_rate";
    const problems = [
      ...(fieldsDirty ? fieldBuild.problems : []), ...(scopeDirty ? scopeProblems(scopeRows) : []),
      ...(ratesDirty ? rateProblems(rateRows) : []), ...(billing ? lineProblems(paymentRows, effFlat) : []),
    ];
    if (problems.length) { setErrors({ validation: problems.join("; ") }); return false; }
    setSaving(true); setErrors({});
    const base = `/api/contract-center/terms/${term.id}`;
    // Flat snow price follows the Snow payment line's yearly total, and only from the Billing panel.
    const snowLineNow = paymentRows.find(l => l.name.trim() === SNOW_LINE);
    const derivedPrice: Record<string, number> = billing && effFlat && snowLineNow
      && lineSum(snowLineNow) !== term.snowFlatPriceCents ? { snowFlatPriceCents: lineSum(snowLineNow) } : {};
    const sections = [
      ...(fieldsDirty ? [{ name: "fields", run: () => api("PATCH", base, { ...fieldPatch, ...derivedPrice }) }]
        : Object.keys(derivedPrice).length ? [{ name: "snowprice", run: () => api("PATCH", base, derivedPrice) }] : []),
      ...(scopeDirty ? [{ name: "scope", run: () => api("PUT", `${base}/scope`, scopePayload(scopeRows)) }] : []),
      ...(paymentsDirty ? [{ name: "payments", run: () => api("PUT", `${base}/payments`, paymentsPayload(paymentRows)) }] : []),
      ...(ratesDirty ? [{ name: "rates", run: () => api("PUT", `${base}/rates`, ratesPayload(rateRows)) }] : []),
    ];
    const { ok, failures } = await saveSections(sections);
    await refresh();
    if (ok.includes("fields")) setFields(null);
    if (ok.includes("scope")) setScope(null);
    if (ok.includes("rates")) setRates(null);
    if (ok.includes("payments")) setPayments(null);
    setSaving(false);
    if (Object.keys(failures).length) {
      setErrors(failures);
      toast({ title: "Some changes were not saved", description: Object.entries(failures).map(([k, v]) => `${k}: ${v}`).join("; "), variant: "destructive" });
      return false;
    }
    setEditingPanel(null); toast({ title: `${PANEL_LABEL[panel]} saved` });
    return true;
  }

  async function markReviewed() {
    if (!term) return;
    try { await api("PATCH", `/api/contract-center/terms/${term.id}`, { needsReview: false }); await refresh(); setErrors({}); }
    catch (e) { setErrors({ review: errorText(e) }); }
  }
  async function changeStatus(to: string) {
    if (!term) return;
    setMoveBusy(true);
    try {
      await api("POST", `/api/contract-center/terms/${term.id}/status`, { to });
      if (term.bidTicketId) {
        void qc.invalidateQueries({ queryKey: ["/api/tickets", term.bidTicketId] });
        void qc.invalidateQueries({ queryKey: ["/api/bids/board"] });
      }
      await refresh(); setErrors({}); setConfirmMove(null); setMenuOpen(false); setSignPrompt(false);
    }
    catch (e) { setErrors({ status: errorText(e) }); }
    finally { setMoveBusy(false); }
  }

  if (!term) return <div className="text-sm text-muted-foreground" data-testid="empty-terms">This contract has no seasons yet.</div>;
  const laterYear = isLaterYear(term);
  const set = term.renewalSet;
  const signedSetOwner = !laterYear && (set?.length ?? 0) > 1 && detail.terms.some(t =>
    t.renewalSet?.firstTermId === term.id && ["signed", "active"].includes(t.status));
  const moves = (editable || signedSetOwner) && !laterYear ? term.allowedMoves ?? [] : [];
  const coveredSigned = term.coveredBy?.find(d => d.kind === "signed");
  const showRenew = (detail.renewalDue || ["expired", "active"].includes(term.displayStatus)) && term.id === (detail.currentTermId ?? term.id);
  const reviewItems = (term.reviewNote ?? "").split(/\n+/).map(s => s.replace(/^\s*[-*\u2022]\s*/, "").trim()).filter(Boolean);
  const snow = seasonLine !== "landscape";
  const f = fields ?? {};
  const setF = (p: FieldDraft) => setFields({ ...f, ...p });
  const fieldValue = (k: keyof FieldDraft) => (f[k] !== undefined ? f[k] : (term[k as keyof DetailTerm] as string | null | undefined)) ?? "";
  const coverage = coverageContext(term, detail.terms);
  const panelErrors = (p: EditPanel) => editingPanel === p ? Object.entries(errors).filter(([k]) => !["status", "review"].includes(k))
    .map(([k, v]) => (k === "validation" ? v : `Could not save ${k}: ${v}`)) : [];

  // At-a-glance tiles: hidden when empty.
  const later = detail.terms.filter(t => t.startDate > term.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const next = later.find(t => !["lost", "cancelled"].includes(t.status));
  const monthly = monthlyOf(term);
  const daysLeft = daysUntil(term.endDate);
  const signed = signedInfo(term);
  const renewalSigned = later.some(t => ["signed", "active", "renewed"].includes(t.status));
  const tiles = [
    term.annualPriceCents != null && <Tile key="annual" id="annual-price" label="Annual price" value={<span data-testid="text-annual-price">{money(term.annualPriceCents)}</span>}
      sub={next?.annualPriceCents != null ? `${next.seasonLabel}: ${money(next.annualPriceCents)}${term.annualPriceCents > 0 ? ` (${(((next.annualPriceCents - term.annualPriceCents) / term.annualPriceCents) * 100).toFixed(1).replace("-", "\u2212")}%)` : ""}` : undefined} />,
    monthly != null && monthly > 0 && <Tile key="monthly" id="monthly" label="Monthly" value={<span data-testid="text-monthly">{money(monthly)}</span>} sub={paymentPattern(term) ?? undefined} />,
    term.endDate && <Tile key="ends" id="season-ends" label="Season ends" value={dateOnly(term.endDate)}
      sub={[daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "Ended",
        renewalSigned ? "renewal already signed" : detail.renewalDue && term.id === detail.currentTermId ? "up for renewal" : null].filter(Boolean).join(" \u00b7 ")} />,
    signed && <Tile key="signed" id="signed" label="Signed" value={signed.day} sub={signed.by ?? undefined} />,
    snow && (term.snowPricing !== "flat_rate" || term.snowFlatPriceCents != null) && <Tile key="snow" id="snow" label="Snow" value={term.snowPricing === "flat_rate" ? `Flat ${money(term.snowFlatPriceCents)}` : "T&M"} />,
  ].filter(Boolean);

  const editProps = (p: EditPanel) => ({ editable, editing: editingPanel === p, onEdit: () => openPanel(p), editDisabled: saving });
  const editBar = (p: EditPanel, canSave: boolean) => editingPanel === p && (
    <PanelEditBar id={p} saving={saving} canSave={canSave} problems={panelErrors(p)} onSave={() => void save()}
      onCancel={() => (dirty ? setPending({ kind: "cancel" }) : resetEdits())} />
  );
  const diffCount = differingRates(term.rates).length;
  const scopeCount = scopeBase.filter(r => r.included).length;

  return (
    <div className="space-y-5 min-w-0" data-testid="page-contract">
      <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb" data-testid="breadcrumb">
        <Link href="/dashboard/contracts" className="hover:text-foreground" data-testid="link-breadcrumb-contracts">Contracts</Link>
        <span className="mx-1.5">/</span><span className="text-foreground">{detail.customer.name}</span>
      </nav>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-contract-customer">
              <Link href={`/dashboard/customers/${detail.customer.id}`} onClick={guardLinkClick as never} data-testid="link-customer">{detail.customer.name}</Link>
            </h1>
            <LineBadge line={detail.line} />
            <span className="text-sm text-muted-foreground">{detail.form === "ours" ? "Our form" : "Their form"}</span>
            <StatusPill status={term.displayStatus} />
            {detail.renewalDue && term.id === detail.currentTermId && <RenewalChip />}
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-contract-people">
            {term.legalName ? `${term.legalName} \u00b7 ` : ""}Managing agent: {term.managingAgentName || "\u2014"} · Project contact: {term.projectContact || "\u2014"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {moves.length > 0 && (
            <div className="relative">
              <Button size="sm" variant="outline" disabled={dirty} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} data-testid="button-status-menu">Status</Button>
              {menuOpen && (
                <div className="absolute right-0 z-10 mt-1 flex flex-col gap-1 rounded-md border bg-popover p-2 shadow-md" data-testid="menu-status">
                  {moves.map(m => <Button key={m} size="sm" variant="ghost" className="justify-start" onClick={() => setConfirmMove(m)} data-testid={`button-move-${m}`}>{MOVE_LABEL[m] ?? m}</Button>)}
                </div>
              )}
            </div>
          )}
          {showRenew && (
            <span title={detail.renewalDraftId ? "A renewal draft already exists" : undefined}>
              <Button size="sm" variant="outline" disabled={!!detail.renewalDraftId || saving} onClick={() => dirty ? setPending({ kind: "renew" }) : setRenewOpen(true)} data-testid="button-renew-contract">
                <RefreshCw className="w-4 h-4 mr-1" />Renew for next season
              </Button>
            </span>
          )}
        </div>
      </header>

      {confirmMove && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm" role="alert" data-testid="bar-confirm-status">
          <span>Change this season to {confirmMove}?</span>
          <Button size="sm" disabled={moveBusy} onClick={() => changeStatus(confirmMove)} data-testid="button-confirm-status">Confirm</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmMove(null)} data-testid="button-cancel-status">Cancel</Button>
        </div>
      )}
      {errors.status && <p className="text-sm text-destructive" data-testid="error-status">{errors.status}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav className="flex gap-2 overflow-x-auto pb-1 max-w-full" aria-label="Seasons" data-testid="timeline">
          {detail.terms.map(t => (
            <button key={t.id} type="button" disabled={saving} onClick={() => selectTerm(t.id)} aria-current={t.id === term.id}
              className={`min-w-[10rem] shrink-0 rounded-md border p-2 text-left text-xs transition-colors ${t.id === term.id ? "border-primary bg-primary/10" : "bg-card hover:bg-muted/50"}`} data-testid={`chip-term-${t.id}`}>
              <div className="font-semibold text-sm">{t.seasonLabel}</div>
              <div className="text-muted-foreground">{dateOnly(t.startDate)} – {dateOnly(t.endDate)}</div>
              <div className="flex items-center justify-between gap-2 mt-1"><span className="tabular-nums">{priceText(detail, t)}</span><StatusPill status={t.displayStatus} /></div>
              <div className="mt-1 font-medium" data-testid={`text-term-status-words-${t.id}`}>{statusWords(t)}</div>
              <div className="flex flex-wrap items-center gap-1 mt-1" data-testid={`chip-term-badges-${t.id}`}>
                <LineBadge line={termLine(t, detail.line)} />
                <span className="text-muted-foreground">{termForm(t, detail.form) === "ours" ? "Our form" : "Their form"}</span>
                {t.renewalSet && t.renewalSet.length > 1 && <span className="text-muted-foreground">Year {t.renewalSet.year} of {t.renewalSet.length}</span>}
              </div>
            </button>
          ))}
        </nav>
        {coverage && <span className="text-sm text-muted-foreground" data-testid="text-coverage-context">{coverage}</span>}
      </div>

      {laterYear && set && (
        <p className="text-sm rounded-md border bg-muted/40 p-2" data-testid="note-status-follows">
          Year {set.year} of the {set.firstSeason}–{set.lastSeason} renewal. Status follows {set.firstSeason}.
        </p>
      )}
      {(seasonLine !== detail.line || seasonForm !== detail.form) && (
        <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2" data-testid="text-season-line-form">
          This season: <LineBadge line={seasonLine} /> {seasonForm === "ours" ? "Our form" : "Their form"}
        </p>
      )}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))]" data-testid="tiles-at-a-glance">
        <span className="hidden" data-testid="text-season">{term.seasonLabel}</span>
        {tiles}
      </div>

      {!editable && <p className="text-sm text-muted-foreground rounded-md bg-muted/50 p-2" data-testid={["lost", "cancelled"].includes(term.status) ? "note-closed-season" : "note-past-season"}>{translate(["lost", "cancelled"].includes(term.status) ? "contractDocuments.closedSeason" : "contractDocuments.pastSeason")}</p>}
      {editingPanel && ["signed", "active", "renewed"].includes(term.status) && <p className="text-sm rounded-md border p-2" style={amberBox} data-testid="note-signed-edit">Changes to a signed contract are recorded in History.</p>}
      {term.needsReview && (
        <div className="rounded-md border p-3 space-y-2" style={amberBox} data-testid="banner-needs-review">
          <div className="flex items-center gap-2"><ReviewChip /><span className="text-sm font-medium">This season needs review</span>
            {editable && <Button size="sm" className="ml-auto" onClick={markReviewed} data-testid="button-mark-reviewed">Mark reviewed</Button>}</div>
          {reviewItems.length > 0 && <ul className="list-disc pl-5 text-sm">{reviewItems.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          {errors.review && <p className="text-sm text-destructive">{errors.review}</p>}
        </div>
      )}

      {bar && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm shadow-sm" style={amberBox} role="alert" data-testid="bar-discard">
          <span>{editingPanel ? `${PANEL_LABEL[editingPanel]} has unsaved changes.` : "Unsaved changes."} Save or discard them first?</span>
          {bar.kind !== "cancel" && <Button size="sm" disabled={saving} onClick={() => void saveThenProceed()} data-testid="button-save-and-continue">{saving ? "Saving..." : "Save"}</Button>}
          <Button size="sm" variant="destructive" disabled={saving} onClick={discard} data-testid="button-discard">Discard</Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={keepEditing} data-testid="button-keep-editing">Keep editing</Button>
        </div>
      )}

      <RenewDialog target={renewOpen ? { id: detail.id, customerName: detail.customer.name } : null} onClose={() => setRenewOpen(false)}
        onCreated={termId => { resetEdits(); setSignPrompt(false); setConfirmMove(null); setMenuOpen(false); history.replaceState(null, "", `#term-${termId}`); setSelectedId(termId); }} />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start" data-testid="grid-panels">
        <Panel id="billing" title="Billing" {...editProps("billing")}>
          {editingPanel === "billing" ? (
            <div className="space-y-3 overflow-x-auto" data-testid="form-billing">
              {snow && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground space-y-1">Snow pricing
                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" data-testid="select-snow-pricing"
                      value={f.snowPricing ?? term.snowPricing ?? "time_and_materials"} onChange={e => setF({ snowPricing: e.target.value })}>
                      <option value="time_and_materials">Time and materials</option><option value="flat_rate">Flat rate</option>
                    </select>
                  </label>
                  {(f.snowPricing ?? term.snowPricing) === "flat_rate" && (
                    <label className="text-xs text-muted-foreground space-y-1">Flat snow price ($)
                      <Input inputMode="decimal" data-testid="input-field-flat" value={f.flatInput ?? (term.snowFlatPriceCents != null ? centsToInput(term.snowFlatPriceCents) : "")}
                        onChange={e => setF({ flatInput: e.target.value })} />
                    </label>
                  )}
                </div>
              )}
              <PaymentEditor lines={paymentRows} onChange={setPayments} startMonth={startMonthOf(term.startDate)} line={seasonLine}
                snowPricing={f.snowPricing ?? term.snowPricing} flatSnowAllowed={(f.snowPricing ?? term.snowPricing) === "flat_rate"} errors />
              {editBar("billing", paymentsDirty || fieldsDirty)}
            </div>
          ) : <BillingSummary term={term} snow={snow} snowLineOnly={seasonLine === "snow"} />}
        </Panel>

        <Panel id="documents" title="Documents" meta={`${term.documents.length + (term.coveredBy?.length ?? 0)} file${term.documents.length + (term.coveredBy?.length ?? 0) === 1 ? "" : "s"}`}>
          <div className="space-y-3 min-w-0" data-testid="tab-documents-body">
            {coveredSigned && <p className="text-sm rounded-md border bg-muted/40 p-2" data-testid="note-covered-signed">
              {translate("contractDocuments.coveredSigned", { season: coveredSigned.fromSeasonLabel })}
            </p>}
            {(editable || signedSetOwner) && (
              <div className="flex flex-wrap gap-2">
                {(["signed", "their_form", "other"] as const).map(kind => (
                  <ContractUploadButton key={kind} label={kind === "signed" ? "Signed copy" : kind === "their_form" ? "Their form" : "Other"} testId={`upload-${kind}`}
                    uploadUrlPath={`/api/contract-center/terms/${term.id}/documents/upload-url`} registerPath={`/api/contract-center/terms/${term.id}/documents`}
                    extraBody={{ kind }} options={TERM_UPLOAD_OPTIONS} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onError={setUploadError}
                    onUploaded={async () => { setUploadError(null); await refresh(); if (kind === "signed" && term.status === "sent") setSignPrompt(true); }} />
                ))}
              </div>
            )}
            {uploadError && <p className="text-sm text-destructive" role="alert" data-testid="error-upload">{uploadError}</p>}
            {signPrompt && term.status === "sent" && (
              <div className="flex items-center gap-2 rounded-md border p-3 text-sm" data-testid="prompt-mark-signed">
                <span>Mark this contract signed?</span>
                <Button size="sm" disabled={moveBusy} onClick={() => changeStatus("signed")} data-testid="button-prompt-signed-yes">Yes</Button>
                <Button size="sm" variant="ghost" onClick={() => setSignPrompt(false)} data-testid="button-prompt-signed-no">No</Button>
              </div>
            )}
            <SeasonDocuments key={term.id} term={term} terms={detail.terms} selectTerm={selectTerm} refresh={refresh} />
          </div>
        </Panel>

        <Panel id="details" title="Contract details" {...editProps("details")}>
          {editingPanel === "details" ? (
            <div className="space-y-3" data-testid="form-term-fields">
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELD_INPUTS.map(i => (
                  <label key={i.key} className="text-xs text-muted-foreground space-y-1">{i.label}
                    <Input type={i.key.endsWith("Date") ? "date" : "text"} value={String(fieldValue(i.key))} data-testid={`input-field-${i.key}`}
                      onChange={e => setF({ [i.key]: e.target.value } as FieldDraft)} />
                  </label>
                ))}
                {snow && (
                  <label className="text-xs text-muted-foreground space-y-1 sm:col-span-2">Snow triggers
                    <Input value={String(fieldValue("snowTriggers"))} data-testid="input-field-snowTriggers" onChange={e => setF({ snowTriggers: e.target.value })} />
                  </label>
                )}
              </div>
              {editBar("details", fieldsDirty)}
            </div>
          ) : (
            <DetailsList items={[
              { key: "seasonLabel", label: "Season", value: term.seasonLabel },
              { key: "startDate", label: "Start date", value: term.startDate ? dateOnly(term.startDate) : null },
              { key: "endDate", label: "End date", value: term.endDate ? dateOnly(term.endDate) : null },
              { key: "legalName", label: "Legal name", value: term.legalName || detail.customer.name },
              { key: "managingAgentName", label: "Managing agent", value: term.managingAgentName },
              { key: "projectContact", label: "Project contact", value: term.projectContact },
              { key: "contactPhone", label: "Phone", value: term.contactPhone },
              { key: "contactEmail", label: "Email", value: term.contactEmail },
              { key: "projectAddress", label: "Address", value: term.projectAddress },
              { key: "po", label: "PO", value: term.po },
              ...(snow ? [{ key: "snowTriggers", label: "Snow triggers", value: term.snowTriggers }] : []),
              { key: "notes", label: "Notes", value: term.notes },
            ]} />
          )}
        </Panel>

        <Panel id="scope" title="Scope" meta={`${scopeCount} service${scopeCount === 1 ? "" : "s"}`} {...editProps("scope")}>
          {editingPanel === "scope" ? (
            <div className="space-y-3 overflow-x-auto">
              {/* Snow triggers belong to Contract details; the scope panel shows them read-only. */}
              <ScopeEditor line={seasonLine} rows={scopeRows} editing onChange={setScope} snowTriggers={term.snowTriggers ?? null} onSnowTriggers={() => undefined} hideSnowTriggers />
              {editBar("scope", scopeDirty)}
            </div>
          ) : <ScopeSummary key={term.id} rows={scopeBase} />}
        </Panel>

        <Panel id="rates" title="Rates" meta={`${diffCount} differ${diffCount === 1 ? "s" : ""} from the card`} {...editProps("rates")}
          actions={editingPanel !== "rates" && term.rates.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 px-1 text-primary" aria-expanded={ratesAll} onClick={() => setRatesAll(!ratesAll)} data-testid="button-rates-show-all">
              {ratesAll ? "Show differences" : `Show all ${term.rates.length} rates`}
            </Button>
          )}>
          {editingPanel === "rates" ? (
            <div className="space-y-3 overflow-x-auto">
              <RatesEditor line={seasonLine} rows={rateRows} editing onChange={setRates} />
              {editBar("rates", ratesDirty)}
            </div>
          ) : ratesAll ? <div className="overflow-x-auto"><RatesEditor line={seasonLine} rows={ratesBase} editing={false} onChange={() => undefined} /></div>
            : <RatesSummary rates={term.rates} />}
        </Panel>

        <Panel id="history" title="History" meta={`${term.history.length} entr${term.history.length === 1 ? "y" : "ies"}`}>
          <HistoryList key={term.id} term={term} />
        </Panel>
      </div>
    </div>
  );
}

export default function ContractPage({ initialHash }: { initialHash?: string } = {}) {
  const { id } = useParams<{ id: string }>();
  const detailQ = useQuery<ContractDetail>({ queryKey: [LIST_KEY, id], retry: false });
  const notFound = detailQ.isError && errorStatus(detailQ.error) === 404;
  const legacyQ = useQuery<{ agreementId: string }>({ queryKey: [`${LIST_KEY}/by-legacy`, id], enabled: notFound, retry: false });

  if (detailQ.isLoading || (notFound && legacyQ.isLoading)) return <div className="space-y-3" data-testid="loading-contract"><Skeleton className="h-8 w-72" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (detailQ.data) return <ContractView key={detailQ.data.id} detail={detailQ.data} initialHash={initialHash ?? (typeof window !== "undefined" ? window.location.hash : "")} />;
  if (notFound && legacyQ.data?.agreementId) return <Redirect to={`/dashboard/contracts/${legacyQ.data.agreementId}`} replace />;
  const uncopied = notFound && legacyQ.isError && errorStatus(legacyQ.error) === 404;
  if (uncopied) {
    return (
      <div className="rounded-md border p-10 text-center space-y-3" data-testid="state-uncopied">
        <p className="font-medium">This contract hasn't been copied to the Contract Center yet</p>
        <Button variant="outline" asChild><Link href="/dashboard/contracts/old" data-testid="link-old-page">Open the old contracts page</Link></Button>
      </div>
    );
  }
  return (
    <div className="rounded-md border p-10 text-center space-y-3" data-testid="error-contract">
      <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
      <p className="text-sm">{errorText(legacyQ.error ?? detailQ.error)}</p>
      <Button variant="outline" onClick={() => { detailQ.refetch(); if (notFound) legacyQ.refetch(); }} data-testid="button-retry-contract">Try again</Button>
    </div>
  );
}
