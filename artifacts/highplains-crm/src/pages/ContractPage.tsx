import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { AlertTriangle, Download, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { guardLinkClick, unsavedGuard } from "@/lib/unsavedGuard";
import { LineBadge, RenewalChip, ReviewChip, StatusPill, amberBox } from "@/components/contracts/ContractBadges";
import { ContractUploadButton, TERM_UPLOAD_OPTIONS } from "@/components/contracts/ContractUploadButton";
import { RatesEditor, ratesFingerprint, ratesPayload, rateProblems, toRateRows } from "@/components/contracts/RatesEditor";
import type { RateRow } from "@/components/contracts/RatesEditor";
import { ScopeEditor, buildScopeRows, scopePayload, scopeProblems } from "@/components/contracts/ScopeEditor";
import type { ScopeRow } from "@/components/contracts/ScopeEditor";
import { centsToInput, parseDollarsToCents } from "@/components/contracts/rateCardUtils";
import { buildFieldPatch, saveSections } from "@/components/contracts/contractSave";
import type { FieldDraft } from "@/components/contracts/contractSave";
import { PaymentEditor } from "@/components/contracts/PaymentEditor";
import { RenewDialog } from "@/components/contracts/RenewDialog";
import { SNOW_LINE, lineProblems, lineSum, linesFromBilling, paymentsFingerprint, paymentsPayload, startMonthOf } from "@/components/contracts/paymentDraft";
import type { PaymentLine } from "@/components/contracts/paymentDraft";
import { dateOnly, dateTime, errorStatus, errorText, monthName, money } from "@/components/contracts/contractFormat";
import { isLaterYear, termForm, termLine } from "@/components/contracts/contractTypes";
import type { ContractDetail, DetailTerm } from "@/components/contracts/contractTypes";

const LIST_KEY = "/api/contract-center/contracts";
const MOVE_LABEL: Record<string, string> = { draft: "Back to draft", sent: "Mark sent", signed: "Mark signed", lost: "Mark lost", cancelled: "Cancel contract" };
const KIND_LABEL: Record<string, string> = { signed: "Signed copy", their_form: "Their form", other: "Other", review: "Review", clean: "Clean", clarifications: "Clarifications" };
const FIELD_INPUTS: { key: keyof FieldDraft; label: string }[] = [
  { key: "seasonLabel", label: "Season" }, { key: "startDate", label: "Start date" }, { key: "endDate", label: "End date" },
  { key: "legalName", label: "Legal name" }, { key: "managingAgentName", label: "Managing agent" }, { key: "projectContact", label: "Project contact" },
  { key: "contactPhone", label: "Contact phone" }, { key: "contactEmail", label: "Contact email" }, { key: "projectAddress", label: "Project address" },
  { key: "po", label: "PO" }, { key: "notes", label: "Notes" },
];
type Pending = { kind: "term"; id: string } | { kind: "leave"; href: string } | { kind: "cancel" } | null;

const isEditableTerm = (d: ContractDetail, t: DetailTerm) =>
  t.editable ?? (!["renewed", "lost", "cancelled"].includes(t.status) && (t.id === (d.currentTermId ?? d.terms[d.terms.length - 1]?.id) || t.id === d.renewalDraftId));
const termHash = (h: string) => (h.startsWith("#term-") ? h.slice(6) : null);
const priceText = (d: ContractDetail, t: DetailTerm) =>
  termLine(t, d.line) === "snow" ? (t.snowPricing === "flat_rate" ? `Flat snow ${money(t.snowFlatPriceCents)}` : "T&M")
    : t.annualPriceCents != null ? money(t.annualPriceCents) : "T&M";

export function ContractView({ detail, initialHash }: { detail: ContractDetail; initialHash: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const defaultId = detail.currentTermId ?? detail.terms[detail.terms.length - 1]?.id;
  const [selectedId, setSelectedId] = useState(() => {
    const h = termHash(initialHash);
    return h && detail.terms.some(t => t.id === h) ? h : defaultId;
  });
  const term = detail.terms.find(t => t.id === selectedId) ?? detail.terms[detail.terms.length - 1];
  const editable = !!term && isEditableTerm(detail, term);
  const [editing, setEditing] = useState(false);
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
  const [tab, setTab] = useState("scope");

  // Editors follow the selected season's own line; the header shows the contract's (current season's) line.
  const seasonLine = termLine(term, detail.line);
  const seasonForm = termForm(term, detail.form);
  const scopeBase = useMemo(() => (term ? buildScopeRows(term.scope, seasonLine) : []), [term, seasonLine]);
  const ratesBase = useMemo(() => (term ? toRateRows(term.rates) : []), [term]);
  const paymentsBase = useMemo(() => (term ? linesFromBilling(term.billingMonths) : []), [term]);
  const paymentRows = payments ?? paymentsBase;
  const paymentsDirty = !!payments && paymentsFingerprint(payments) !== paymentsFingerprint(paymentsBase);
  const scopeRows = scope ?? scopeBase;
  const rateRows = rates ?? ratesBase;
  const scopeDirty = !!scope && JSON.stringify(scope) !== JSON.stringify(scopeBase);
  const ratesDirty = !!rates && ratesFingerprint(rates) !== ratesFingerprint(ratesBase);
  const fieldBuild = useMemo(() => (term && fields ? buildFieldPatch(fields, term) : { patch: {}, problems: [] as string[] }), [fields, term]);
  const fieldPatch = fieldBuild.patch;
  // Invalid raw input counts as a change so it can never be silently discarded.
  const fieldsDirty = Object.keys(fieldPatch).length > 0 || fieldBuild.problems.length > 0;
  const dirty = editing && (scopeDirty || ratesDirty || fieldsDirty || paymentsDirty);

  const termKey = term?.id;
  useEffect(() => {
    // Any term change (including hash/back navigation) starts from a clean, read-only view.
    setEditing(false); setFields(null); setScope(null); setRates(null); setPayments(null); setErrors({});
    setSignPrompt(false); setConfirmMove(null); setMenuOpen(false);
  }, [termKey]);
  useEffect(() => {
    if (!dirty) return;
    document.addEventListener("click", guardLinkClick as never, true);
    return () => document.removeEventListener("click", guardLinkClick as never, true);
  }, [dirty]);
  // Share dirtiness with the sidebar guard and the browser.
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
      const id = termHash(window.location.hash);
      if (!id || !detailRef.current.terms.some(t => t.id === id) || id === selectedRef.current) return;
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
  // Keep the URL hash valid for the displayed term.
  useEffect(() => {
    if (term && termHash(window.location.hash) !== term.id) history.replaceState(null, "", `#term-${term.id}`);
  }, [term]);

  function resetEdits() { setEditing(false); setFields(null); setScope(null); setRates(null); setPayments(null); setErrors({}); }
  function selectTerm(id: string) {
    if (id === term?.id) return;
    if (dirty) return setPending({ kind: "term", id });
    resetEdits(); setSignPrompt(false); setConfirmMove(null); setMenuOpen(false);
    window.location.hash = `term-${id}`;
    setSelectedId(id);
  }
  function discard() {
    const p = pending ?? (sidebarPending ? { kind: "leave" as const, href: sidebarPending } : null);
    resetEdits(); setPending(null); unsavedGuard.setDirty(false);
    if (p?.kind === "term") { window.location.hash = `term-${p.id}`; setSelectedId(p.id); }
    if (p?.kind === "leave") navigate(p.href);
  }
  const bar = pending ?? (sidebarPending ? { kind: "leave" as const, href: sidebarPending } : null);
  const keepEditing = () => { setPending(null); unsavedGuard.clearPending(); };

  const refresh = async () => { await qc.invalidateQueries({ queryKey: [LIST_KEY] }); };
  const api = async (method: string, url: string, body?: unknown) => (await apiRequest(method, url, body)).json();

  async function save(only?: string[]) {
    if (!term) return;
    const want = (n: string) => !only || only.includes(n);
    if (!dirty) return only ? undefined : resetEdits();
    const effFlat = seasonLine !== "landscape" && (fields?.snowPricing ?? term.snowPricing) === "flat_rate";
    const savingBilling = want("payments") || (want("fields") && fieldsDirty);
    const problems = [...(want("fields") && fieldsDirty ? fieldBuild.problems : []), ...(want("scope") && scopeDirty ? scopeProblems(scopeRows) : []),
      ...(want("rates") && ratesDirty ? rateProblems(rateRows) : []), ...(savingBilling ? lineProblems(paymentRows, effFlat) : [])];
    if (problems.length) return setErrors({ validation: problems.join("; ") });
    setSaving(true); setErrors({});
    const base = `/api/contract-center/terms/${term.id}`;
    // Flat snow price is always the Snow payment line's yearly total, saved with the payments.
    const snowLineNow = paymentRows.find(l => l.name.trim() === SNOW_LINE);
    const derivedPrice: Record<string, number> = savingBilling && effFlat && snowLineNow
      && lineSum(snowLineNow) !== term.snowFlatPriceCents ? { snowFlatPriceCents: lineSum(snowLineNow) } : {};
    const sections = [
      ...(want("fields") && fieldsDirty ? [{ name: "fields", run: () => api("PATCH", base, { ...fieldPatch, ...derivedPrice }) }]
        : Object.keys(derivedPrice).length ? [{ name: "snowprice", run: () => api("PATCH", base, derivedPrice) }] : []),
      ...(want("scope") && scopeDirty ? [{ name: "scope", run: () => api("PUT", `${base}/scope`, scopePayload(scopeRows)) }] : []),
      ...(want("payments") && paymentsDirty ? [{ name: "payments", run: () => api("PUT", `${base}/payments`, paymentsPayload(paymentRows)) }] : []),
      ...(want("rates") && ratesDirty ? [{ name: "rates", run: () => api("PUT", `${base}/rates`, ratesPayload(rateRows)) }] : []),
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
    } else if (!only) {
      setEditing(false); toast({ title: "Contract saved" });
    } else toast({ title: "Saved" });
  }
  const done = () => save();

  async function markReviewed() {
    if (!term) return;
    try { await api("PATCH", `/api/contract-center/terms/${term.id}`, { needsReview: false }); await refresh(); setErrors({}); }
    catch (e) { setErrors({ review: errorText(e) }); }
  }
  async function changeStatus(to: string) {
    if (!term) return;
    setMoveBusy(true);
    try { await api("POST", `/api/contract-center/terms/${term.id}/status`, { to }); await refresh(); setErrors({}); setConfirmMove(null); setMenuOpen(false); setSignPrompt(false); }
    catch (e) { setErrors({ status: errorText(e) }); }
    finally { setMoveBusy(false); }
  }

  if (!term) return <div className="text-sm text-muted-foreground" data-testid="empty-terms">This contract has no seasons yet.</div>;
  const laterYear = isLaterYear(term);
  const set = term.renewalSet;
  // Signing renews the intermediate years, but year 1 still owns the set's
  // status and signed document while its signed fields remain read-only.
  const signedSetOwner = !laterYear && (set?.length ?? 0) > 1 && detail.terms.some(t =>
    t.renewalSet?.firstTermId === term.id && ["signed", "active"].includes(t.status));
  const moves = (editable || signedSetOwner) && !laterYear ? term.allowedMoves ?? [] : [];
  const docTermId = term.signedDocumentTermId && term.signedDocumentTermId !== term.id ? term.signedDocumentTermId : laterYear ? set!.firstTermId : null;
  const docTerm = docTermId ? detail.terms.find(t => t.id === docTermId) : undefined;
  const showRenew = (detail.renewalDue || ["expired", "active"].includes(term.displayStatus)) && term.id === (detail.currentTermId ?? term.id);
  const reviewItems = (term.reviewNote ?? "").split(/\n+/).map(s => s.replace(/^\s*[-*\u2022]\s*/, "").trim()).filter(Boolean);
  const monthlyCents = term.billingType === "equal_monthly" ? monthlyOf(term) : null;
  const snow = seasonLine !== "landscape";
  const f = fields ?? {};
  const setF = (p: FieldDraft) => setFields({ ...f, ...p });
  const fieldValue = (k: keyof FieldDraft) => (f[k] !== undefined ? f[k] : (term[k as keyof DetailTerm] as string | null | undefined)) ?? "";

  return (
    <div className="space-y-5" data-testid="page-contract">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-contract-customer">
            <Link href={`/dashboard/customers/${detail.customer.id}`} onClick={guardLinkClick as never} data-testid="link-customer">{detail.customer.name}</Link>
          </h1>
          <LineBadge line={detail.line} />
          <span className="text-sm text-muted-foreground">{detail.form === "ours" ? "Our form" : "Their form"}</span>
          <StatusPill status={term.displayStatus} />
          {detail.renewalDue && term.id === detail.currentTermId && <RenewalChip />}
          {moves.length > 0 && (
            <div className="relative">
              <Button size="sm" variant="outline" disabled={dirty} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} data-testid="button-status-menu">Status</Button>
              {menuOpen && (
                <div className="absolute z-10 mt-1 flex flex-col gap-1 rounded-md border bg-popover p-2 shadow-md" data-testid="menu-status">
                  {moves.map(m => <Button key={m} size="sm" variant="ghost" className="justify-start" onClick={() => setConfirmMove(m)} data-testid={`button-move-${m}`}>{MOVE_LABEL[m] ?? m}</Button>)}
                </div>
              )}
            </div>
          )}
          <div className="ml-auto flex gap-2">
            {editable && !editing && <Button size="sm" onClick={() => { setEditing(true); setSignPrompt(false); }} data-testid="button-edit-contract"><Pencil className="w-4 h-4 mr-1" />Edit</Button>}
            {editing && <>
              <Button size="sm" onClick={done} disabled={saving} data-testid="button-done">{saving ? "Saving..." : "Done"}</Button>
              <Button size="sm" variant="outline" disabled={saving} onClick={() => (dirty ? setPending({ kind: "cancel" }) : resetEdits())} data-testid="button-cancel-edit">Cancel</Button>
            </>}
            {showRenew && (
              <span title={detail.renewalDraftId ? "A renewal draft already exists" : undefined}>
                <Button size="sm" variant="outline" disabled={!!detail.renewalDraftId} onClick={() => setRenewOpen(true)} data-testid="button-renew-contract">
                  <RefreshCw className="w-4 h-4 mr-1" />Renew for next season
                </Button>
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-contract-people">
          Managing agent: {term.managingAgentName || "\u2014"} · Project contact: {term.projectContact || "\u2014"}
        </p>
        <dl className="flex flex-wrap gap-8 text-sm">
          <div><dt className="text-xs text-muted-foreground">Season</dt><dd className="font-medium" data-testid="text-season">{term.seasonLabel}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Annual price</dt><dd className="font-medium tabular-nums" data-testid="text-annual-price">{priceText(detail, term)}</dd></div>
          {monthlyCents != null && <div><dt className="text-xs text-muted-foreground">Monthly</dt><dd className="font-medium tabular-nums" data-testid="text-monthly">{money(monthlyCents)}</dd></div>}
        </dl>
      </header>

      {laterYear && set && (
        <p className="text-sm rounded-md border bg-muted/40 p-2" data-testid="note-status-follows">
          Year {set.year} of the {set.firstSeason}–{set.lastSeason} renewal. Status follows {set.firstSeason}.
        </p>
      )}
      {confirmMove && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm" role="alert" data-testid="bar-confirm-status">
          <span>Change this season to {confirmMove}?</span>
          <Button size="sm" disabled={moveBusy} onClick={() => changeStatus(confirmMove)} data-testid="button-confirm-status">Confirm</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmMove(null)} data-testid="button-cancel-status">Cancel</Button>
        </div>
      )}
      {errors.status && <p className="text-sm text-destructive" data-testid="error-status">{errors.status}</p>}

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Seasons" data-testid="timeline">
        {detail.terms.map(t => (
          <button key={t.id} type="button" onClick={() => selectTerm(t.id)} aria-current={t.id === term.id}
            className={`min-w-[10rem] rounded-md border p-2 text-left text-xs ${t.id === term.id ? "border-primary bg-primary/10" : "bg-card"}`} data-testid={`chip-term-${t.id}`}>
            <div className="font-semibold text-sm">{t.seasonLabel}</div>
            <div className="text-muted-foreground">{dateOnly(t.startDate)} – {dateOnly(t.endDate)}</div>
            <div className="flex items-center justify-between mt-1"><span className="tabular-nums">{priceText(detail, t)}</span><StatusPill status={t.displayStatus} /></div>
            <div className="flex flex-wrap items-center gap-1 mt-1" data-testid={`chip-term-badges-${t.id}`}>
              <LineBadge line={termLine(t, detail.line)} />
              <span className="text-muted-foreground">{termForm(t, detail.form) === "ours" ? "Our form" : "Their form"}</span>
              {t.renewalSet && t.renewalSet.length > 1 && <span className="text-muted-foreground">Year {t.renewalSet.year} of {t.renewalSet.length}</span>}
            </div>
          </button>
        ))}
      </nav>

      {(termLine(term, detail.line) !== detail.line || seasonForm !== detail.form) && (
        <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2" data-testid="text-season-line-form">
          This season: <LineBadge line={seasonLine} /> {seasonForm === "ours" ? "Our form" : "Their form"}
        </p>
      )}
      {!editable && <p className="text-sm text-muted-foreground rounded-md bg-muted/50 p-2" data-testid="note-past-season">{signedSetOwner ? "Signed season fields are read only" : "Past season, read only"}</p>}
      {editing && ["signed", "active"].includes(term.status) && <p className="text-sm rounded-md border p-2" style={amberBox} data-testid="note-signed-edit">Changes to a signed contract are recorded in History.</p>}

      {bar && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm" style={amberBox} role="alert" data-testid="bar-discard">
          <span>Discard changes?</span>
          <Button size="sm" variant="destructive" onClick={discard} data-testid="button-discard">Discard</Button>
          <Button size="sm" variant="outline" onClick={keepEditing} data-testid="button-keep-editing">Keep editing</Button>
        </div>
      )}

      {term.needsReview && (
        <div className="rounded-md border p-3 space-y-2" style={amberBox} data-testid="banner-needs-review">
          <div className="flex items-center gap-2"><ReviewChip /><span className="text-sm font-medium">This season needs review</span>
            {editable && <Button size="sm" className="ml-auto" onClick={markReviewed} data-testid="button-mark-reviewed">Mark reviewed</Button>}</div>
          {reviewItems.length > 0 && <ul className="list-disc pl-5 text-sm">{reviewItems.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          {errors.review && <p className="text-sm text-destructive">{errors.review}</p>}
        </div>
      )}

      {Object.entries(errors).filter(([k]) => !["status", "review"].includes(k)).map(([k, v]) => (
        <p key={k} className="text-sm text-destructive" role="alert" data-testid={`error-save-${k}`}>{k === "validation" ? v : `Could not save ${k}: ${v}`}</p>
      ))}

      {editing && (
        <section className="rounded-md border p-3 grid gap-3 sm:grid-cols-3" data-testid="form-term-fields">
          {FIELD_INPUTS.map(i => (
            <label key={i.key} className="text-xs text-muted-foreground space-y-1">{i.label}
              <Input type={i.key.endsWith("Date") ? "date" : "text"} value={String(fieldValue(i.key))} data-testid={`input-field-${i.key}`}
                onChange={e => setF({ [i.key]: e.target.value } as FieldDraft)} />
            </label>
          ))}
          {snow && (
            <>
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
            </>
          )}
        </section>
      )}

      <RenewDialog target={renewOpen ? { id: detail.id, customerName: detail.customer.name } : null} onClose={() => setRenewOpen(false)}
        onCreated={termId => { resetEdits(); setSignPrompt(false); setConfirmMove(null); setMenuOpen(false); history.replaceState(null, "", `#term-${termId}`); setSelectedId(termId); }} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {["scope", "rates", "billing", "documents", "history"].map(t => <TabsTrigger key={t} value={t} data-testid={`tab-${t}`}>{t[0].toUpperCase() + t.slice(1)}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="scope">
          {editing && <div className="mb-3"><Button size="sm" disabled={saving || !(scopeDirty || fieldsDirty)} onClick={() => save(["fields", "scope"])} data-testid="button-save-scope">Save scope</Button></div>}
          <ScopeEditor line={seasonLine} rows={scopeRows} editing={editing} onChange={setScope}
            snowTriggers={f.snowTriggers !== undefined ? f.snowTriggers : term.snowTriggers ?? null} onSnowTriggers={v => setF({ snowTriggers: v })} />
        </TabsContent>
        <TabsContent value="rates">
          {editing && <div className="mb-3"><Button size="sm" disabled={saving || !ratesDirty} onClick={() => save(["rates"])} data-testid="button-save-rates">Save rates</Button></div>}
          <RatesEditor line={seasonLine} rows={rateRows} editing={editing} onChange={setRates} />
        </TabsContent>
        <TabsContent value="billing">
          {editing && <div className="mb-3"><Button size="sm" disabled={saving || !(paymentsDirty || fieldsDirty)} onClick={() => save(["fields", "payments"])} data-testid="button-save-payments">Save payments</Button></div>}
          {editing
            ? <PaymentEditor lines={paymentRows} onChange={setPayments} startMonth={startMonthOf(term.startDate)} line={seasonLine}
                snowPricing={fields?.snowPricing ?? term.snowPricing} flatSnowAllowed={(fields?.snowPricing ?? term.snowPricing) === "flat_rate"} errors />
            : <BillingTab term={term} snow={snow} />}
        </TabsContent>
        <TabsContent value="documents">
          <section className="space-y-3" data-testid="tab-documents-body">
            {docTerm && (
              <p className="text-sm rounded-md border bg-muted/40 p-2" data-testid="note-signed-document">
                Signed document: see{" "}
                <button type="button" className="underline font-medium" onClick={() => selectTerm(docTerm.id)} data-testid="link-signed-document-term">{docTerm.seasonLabel}</button>
              </p>
            )}
            {(editable || signedSetOwner) && (
              <div className="flex flex-wrap gap-2">
                {(docTerm ? (["their_form", "other"] as const) : (["signed", "their_form", "other"] as const)).map(kind => (
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
            {!term.documents.length ? <p className="text-sm text-muted-foreground" data-testid="empty-documents">No files for this season.</p> : (
              <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Kind</th><th>Version</th><th>File</th><th>Date</th><th>Uploaded by</th><th /></tr></thead>
                <tbody>
                  {[...term.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version).map(d => (
                    <tr key={d.id} className="border-t" data-testid={`row-document-${d.id}`}>
                      <td className="p-2">{KIND_LABEL[d.kind] ?? d.kind}</td><td>v{d.version}</td><td>{d.filename}</td><td>{dateTime(d.createdAt)}</td><td>{d.uploadedByName ?? "\u2014"}</td>
                      <td><Button size="sm" variant="ghost" asChild><a href={d.storageObjectPath} download={d.filename} data-testid={`link-download-${d.id}`}><Download className="w-4 h-4 mr-1" />Download</a></Button></td>
                    </tr>))}
                </tbody></table>
            )}
          </section>
        </TabsContent>
        <TabsContent value="history">
          {!term.history.length ? <p className="text-sm text-muted-foreground">No history yet.</p> : (
            <ul className="divide-y rounded-md border" data-testid="list-history">
              {[...term.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(h => (
                <li key={h.id} className="p-3 text-sm" data-testid={`history-${h.id}`}>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground"><span>{dateTime(h.createdAt)}</span><span>{h.changedByName ?? "System"}</span>
                    <span>{h.oldStatus && h.oldStatus !== h.newStatus ? `${h.oldStatus} → ${h.newStatus}` : h.newStatus}</span></div>
                  {h.note && <div>{h.note}</div>}
                </li>))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function monthlyOf(t: DetailTerm): number | null {
  if (!t.billingMonths.length) return t.annualPriceCents != null ? Math.round(t.annualPriceCents / 12) : null;
  const first = t.billingMonths.map(b => b.month).sort()[0];
  return t.billingMonths.filter(b => b.month === first).reduce((s, b) => s + b.amountCents, 0);
}

function BillingTab({ term, snow }: { term: DetailTerm; snow: boolean }) {
  const [sy, sm] = term.startDate.split("-").map(Number);
  const since = (m: string) => { const [y, mo] = m.split("-").map(Number); return (y - sy) * 12 + mo - sm; };
  const components = [...new Set(term.billingMonths.map(b => b.component))];
  const schedule = [...term.billingMonths].sort((a, b) => a.month.localeCompare(b.month) || a.component.localeCompare(b.component));
  return (
    <section className="space-y-4" data-testid="tab-billing-body">
            {snow && (
        <p className="text-sm" data-testid="text-snow-billing">
          {term.snowPricing === "flat_rate" ? `Flat rate ${money(term.snowFlatPriceCents)}, paid on the Snow line` : "Time and materials, invoiced monthly, net 30"}
        </p>
      )}
      {!components.length && <p className="text-sm text-muted-foreground" data-testid="empty-billing">No payment lines.</p>}
      {components.map(c => {
        const cells = Array.from({ length: 12 }, (_, i) => {
          const month = ((sm - 1 + i) % 12) + 1;
          const amount = term.billingMonths.filter(b => b.component === c && since(b.month) === i).reduce((s, b) => s + b.amountCents, 0);
          return { month, amount };
        });
        const total = cells.reduce((s, x) => s + x.amount, 0), max = Math.max(1, ...cells.map(x => x.amount));
        return (
          <div key={c} className="rounded-md border p-3" data-testid={`billing-line-${c}`}>
            <div className="flex justify-between text-sm font-medium"><span>{c}</span><span className="tabular-nums">{money(total)} per year</span></div>
            <div className="mt-2 grid grid-cols-12 gap-1 overflow-x-auto min-w-[36rem]">
              {cells.map((x, i) => (
                <div key={i} className="text-center text-[10px]">
                  <div className="h-10 flex items-end rounded-sm bg-muted overflow-hidden"><div className="w-full bg-primary" style={{ height: `${(x.amount / max) * 100}%` }} /></div>
                  <div className="text-muted-foreground">{monthName(x.month)}</div><div className="tabular-nums">{x.amount ? money(x.amount) : "\u2014"}</div>
                </div>))}
            </div>
          </div>
        );
      })}
      {schedule.length > 0 && (
        <table className="w-full text-sm" data-testid="table-schedule"><thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Month</th><th>Line</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{schedule.map((b, i) => <tr key={i} className="border-t"><td className="p-2">{monthName(Number(b.month.slice(5, 7)))} {b.month.slice(0, 4)}</td><td>{b.component}</td><td className="text-right tabular-nums">{money(b.amountCents)}</td></tr>)}</tbody></table>
      )}
    </section>
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
