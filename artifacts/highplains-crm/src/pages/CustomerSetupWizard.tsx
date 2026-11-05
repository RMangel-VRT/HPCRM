import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { qboJson, reviewHref, useQboTerms, viewerScope } from "@/lib/qboReview";
import { extractApiErrorMessage } from "@/lib/apiError";
import {
  activationError, buildBody, draftFromServer, effectiveBillingName,
  missingForActive, newWizardDraft, parentIsMaster, stepIssues, stepOfMissing, STEP_COUNT,
} from "@/components/customerWizard/wizardModel";
import type {
  DuplicateCandidate, MissingField, ParentLite, PmCompany, PmManager, QboOutcome, StepIssue, WizardDraft,
} from "@/components/customerWizard/wizardModel";
import { BillingSection, ContactsSection, PropertySection, Section, SiteSection } from "@/components/customerWizard/sections";
import { useBillToPreview, type ParentRow } from "@/components/customerWizard/billToPreview";

const STEP_KEYS = ["property", "billing", "contacts", "site", "review"] as const;
interface WizardOptions { writeEnabled: boolean; baselineAt: string | null; mostUsedTermId: string | null }
interface PrefillResponse { customer: Record<string, unknown>; qbo: { linkQboId: string }; linkedCustomerId?: string | null; parentQboId?: string | null }

/** Creation only. Existing customers are edited on /dashboard/customers/:id/edit. */
export default function CustomerSetupWizard() {
  const { user } = useAuth();
  if (!user) return <WizardSkeleton />;
  // Keyed by company + viewer: a company switch remounts and discards any draft or in-flight result.
  return <WizardBody key={viewerScope(user).join("|")} companyId={user.activeCompanyId} />;
}

function WizardSkeleton() {
  return <div className="space-y-4 max-w-5xl" data-testid="loading-customer-wizard"><Skeleton className="h-8 w-56" /><Skeleton className="h-6 w-96" /><Skeleton className="h-72 w-full" /></div>;
}

function WizardBody({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const tw = (k: string, o?: Record<string, unknown>) => t(`customerWizard.${k}`, o ?? {}) as string;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const fromQbo = useMemo(() => new URLSearchParams(window.location.search).get("fromQbo"), []);
  const get = <T,>(url: string) => qboJson<T>("GET", url, companyId);
  const scope = [companyId];

  const [d, setD] = useState<WizardDraft>(newWizardDraft);
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [issues, setIssues] = useState<StepIssue[]>([]);
  const [serverMissing, setServerMissing] = useState<MissingField[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [termDefaulted, setTermDefaulted] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const patch = (p: Partial<WizardDraft>) => setD(cur => ({ ...cur, ...p }));

  useSetBreadcrumbs([{ label: t("customers.title"), href: "/dashboard/customers" }, { label: tw("titleNew") }], []);

  const prefill = useQuery<PrefillResponse>({ queryKey: ["/api/customers/wizard/prefill", fromQbo, ...scope], enabled: !!fromQbo, retry: false, queryFn: () => get(`/api/customers/wizard/prefill/${encodeURIComponent(fromQbo!)}`) });
  const options = useQuery<WizardOptions>({ queryKey: ["/api/customers/wizard/options", ...scope], retry: false, queryFn: () => get("/api/customers/wizard/options") });
  // The list endpoint caps pages at 200, so walk every page to offer all top-level parents.
  const parents = useQuery<{ customers: (ParentLite & ParentRow)[] }>({ queryKey: ["/api/customers", "wizard-parents", ...scope], retry: false, queryFn: async () => {
    const out: (ParentLite & ParentRow)[] = [];
    for (let page = 1; page <= 50; page++) {
      const r = await get<{ customers: (ParentLite & ParentRow)[]; total?: number }>(`/api/customers?page=${page}&limit=200`);
      const rows = r?.customers ?? [];
      out.push(...rows);
      if (rows.length < 200 || (r.total !== undefined && out.length >= r.total)) break;
    }
    return { customers: out };
  } });
  const pmCompanies = useQuery<PmCompany[]>({ queryKey: ["/api/property-management-companies", ...scope], retry: false, queryFn: () => get("/api/property-management-companies") });
  const managers = useQuery<PmManager[]>({
    queryKey: ["/api/property-managers", d.propertyManagementCompanyId, ...scope], enabled: !!d.propertyManagementCompanyId, retry: false,
    queryFn: () => get(`/api/property-managers?propertyManagementCompanyId=${encodeURIComponent(d.propertyManagementCompanyId!)}`),
  });
  const terms = useQboTerms();

  // Hydrate once per record; refetches never overwrite in-progress edits.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    if (prefill.data) {
      hydrated.current = true;
      const base = draftFromServer(prefill.data.customer);
      setD({ ...base, status: prefill.data.customer.status === "active" ? "active" : "prospect", linkQboId: prefill.data.qbo.linkQboId,
        linkQboName: String(prefill.data.customer.billingName ?? prefill.data.customer.name ?? ""), billingNameTouched: true,
        billingName: String(prefill.data.customer.billingName ?? prefill.data.customer.name ?? "") });
    }
  }, [prefill.data]);

  // Most-used terms default: applied once, only to an untouched empty field on a new customer.
  const termApplied = useRef(false);
  useEffect(() => {
    if (termApplied.current || !options.data || terms.isLoading) return;
    termApplied.current = true;
    const tid = options.data.mostUsedTermId;
    if (tid && terms.data?.some(term => term.id === tid) && !d.termTouched && !d.qboTermId) {
      setD(cur => (cur.termTouched || cur.qboTermId ? cur : { ...cur, qboTermId: tid }));
      setTermDefaulted(true);
    }
  }, [options.data, terms.data, terms.isLoading, d.termTouched, d.qboTermId]);

  const allCustomers = (parents.data?.customers ?? []).filter(c => !c.companyId || c.companyId === companyId);
  const parentChoices = allCustomers.filter(c => !c.parentCustomerId);
  const parent = allCustomers.find(c => c.id === d.parentCustomerId) ?? null;
  const master = parentIsMaster(d, parent);
  const pm = (pmCompanies.data ?? []).find(p => p.id === d.propertyManagementCompanyId) ?? null;
  const manager = master ? null : (managers.data ?? []).find(m => m.id === d.propertyManagerId) ?? null;
  const billingName = effectiveBillingName(d);
  const alreadyLinked = false;
  const preview = useBillToPreview({ draft: d, id: "", companyId, rawBillingName: null, parents: allCustomers,
    pmCompanies: pmCompanies.data ?? [], ready: !parents.isLoading && !pmCompanies.isLoading });

  /* Duplicate check: debounced, sequence-guarded so a stale response never shows or links the wrong record. */
  const [dup, setDup] = useState<{ name: string; state: "idle" | "checking" | "done" | "error"; candidates: DuplicateCandidate[] }>({ name: "", state: "idle", candidates: [] });
  const dupSeq = useRef(0);
  const dupEnabled = !master && !alreadyLinked && step === 2;
  useEffect(() => {
    const name = billingName.trim();
    const my = ++dupSeq.current;
    if (!dupEnabled || !name || name.includes(":") || name.length > 100) { setDup({ name, state: "idle", candidates: [] }); return; }
    setDup({ name, state: "checking", candidates: [] });
    const timer = setTimeout(() => {
      qboJson<{ candidates: DuplicateCandidate[] }>("POST", "/api/qbo/customers/duplicate-check", companyId, {
        billingName: name, ...(d.city.trim() ? { city: d.city.trim() } : {}), ...(d.zip.trim() ? { zip: d.zip.trim() } : {}),
        ...(d.billingEmails[0] ? { billingEmail: d.billingEmails[0] } : {}),
      }).then(r => { if (alive.current && my === dupSeq.current) setDup({ name, state: "done", candidates: r?.candidates ?? [] }); })
        .catch(() => { if (alive.current && my === dupSeq.current) setDup({ name, state: "error", candidates: [] }); });
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingName, dupEnabled, companyId]);
  const exactHits = dup.state === "done" && dup.name === billingName.trim()
    ? dup.candidates.filter(c => c.matchType === "exact_display_name" || c.displayName.trim().toLowerCase() === billingName.trim().toLowerCase()) : [];
  const duplicateBlocking = exactHits.length > 0 && !exactHits.some(h => h.qboId === d.linkQboId) && (d.status === "active" || d.sendNow);

  const ctx = { master, pm, duplicateBlocking, requireActive: d.status === "active" };
  const issuesFor = (n: number) => stepIssues(d, n, ctx);
  const activeMissing = d.status === "active" ? missingForActive(d, { master, pm }) : [];

  function goto(n: number) { setIssues([]); setStep(n); setMaxStep(m => Math.max(m, n)); window.scrollTo?.({ top: 0 }); }
  function next() {
    const p = issuesFor(step);
    if (p.length) { setIssues(p); return; }
    let n = step + 1;
    if (n === 2 && master) n = 3; // master-billed branch: parent owns billing
    goto(n);
  }
  function back() { let n = step - 1; if (n === 2 && master) n = 1; goto(Math.max(1, n)); }
  function jump(n: number) { if (n === 2 && master) n = 1; if (n <= maxStep) goto(n); }

  const fieldLabel = (f: string) => tw(`fields.${f}`);
  const issueText = (i: StepIssue) => {
    switch (i.kind) {
      case "required": return tw("issues.required", { field: fieldLabel(i.field) });
      case "missing": return tw("issues.missing", { field: fieldLabel(i.field) });
      case "billingName": return tw(i.problem === "colon" ? "issues.billingNameColon" : i.problem === "tooLong" ? "issues.billingNameTooLong" : "issues.billingNameRequired");
      case "emailsTooLong": return tw("issues.emailsTooLong");
      case "duplicate": return tw("issues.duplicate");
      case "parentIsSelf": return tw("issues.parentIsSelf");
      case "masterLink": return tw("issues.masterLink");
      case "contactName": return tw("issues.contactName", { n: i.index + 1 });
      case "petCount": return tw("issues.petCount");
    }
  };

  function resultText(q: QboOutcome | undefined) {
    if (!q) return tw("result.notLinked");
    if (q.review?.kind === "name_taken") return tw("result.nameTaken");
    const map: Record<string, string> = { in_sync: "inSync", pushed: "inSync", linked: "linked", pending_push: "pending", waiting: "pending", not_linked: "notLinked", via_parent: "viaParent", error: "error" };
    const base = tw(`result.${map[q.state] ?? "pending"}`);
    // Reason codes are machine values; render only localized text, never the raw code.
    const reason = q.reason ? t(`customerWizard.reasons.${q.reason}`, { defaultValue: "" }) : "";
    return reason ? `${base} ${reason}` : base;
  }

  function localizedError(e: unknown) {
    const raw = e instanceof Error ? e.message.replace(/^\d{3}:\s*/, "") : "";
    let code = "";
    try { const b = JSON.parse(raw); code = typeof b?.code === "string" ? b.code : ""; } catch { /* plain text */ }
    if (!code) { const m = extractApiErrorMessage(e); if (m && /^[A-Z][A-Z0-9_]+$/.test(m)) code = m; }
    return (code && t(`customerWizard.errors.${code}`, { defaultValue: "" })) || tw("result.failed");
  }

  async function submit() {
    if (lock.current) return;
    const all = [1, 2, 3, 4].flatMap(n => (n === 2 && master ? [] : issuesFor(n)));
    if (all.length) { setIssues(all); return; }
    lock.current = true; setSubmitting(true); setSubmitError(null); setServerMissing([]);
    const body = buildBody(d, { master, edit: false });
    try {
      const res = await qboJson<{ customer: { id: string }; qbo: QboOutcome }>("POST", "/api/customers/wizard", companyId, body);
      if (!alive.current) return;
      const custId = res.customer.id;
      // Legacy lists encode pagination in the first key string. Prefix matching
      // ["/api/customers"] alone does not invalidate those infinitely fresh rows.
      void qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] === "/api/customers" || q.queryKey[0].startsWith("/api/customers?")) });
      for (const k of ["/api/qbo/customer-reviews", "/api/qbo/customer-reviews/count", "/api/qbo/customer-review-options", "/api/qbo/customers/mapping", "/api/qbo/customers/cache", "/api/qbo/customers/unbound-count"])
        void qc.invalidateQueries({ queryKey: [k] });
      const review = res.qbo?.review;
      toast({
        title: tw("result.created"),
        description: <span data-testid="toast-qbo-result">{resultText(res.qbo)}{review?.kind === "name_taken" && <> <Link href={reviewHref(review.id)} className="underline font-medium" data-testid="link-toast-review">{tw("result.openReview")}</Link></>}</span>,
      });
      navigate(`/dashboard/customers/${custId}`);
    } catch (e) {
      if (!alive.current) return;
      const act = activationError(e);
      if (act) { setServerMissing(act.missingFields); setSubmitError(tw("result.activation")); }
      else setSubmitError(localizedError(e));
    } finally { lock.current = false; if (alive.current) setSubmitting(false); }
  }

  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(newWizardDraft()), [d]);
  const cancelHref = "/dashboard/customers";
  function cancel() { if (dirty && !confirmLeave) { setConfirmLeave(true); return; } navigate(cancelHref); }

  if (fromQbo && prefill.isLoading) return <div className="space-y-3 max-w-5xl"><p className="text-sm text-muted-foreground" data-testid="loading-prefill">{tw("prefill.loading")}</p><Skeleton className="h-72" /></div>;
  if (fromQbo && prefill.isError) return <LoadFail text={tw("prefill.error")} retry={() => void prefill.refetch()} label={tw("retry")} />;
  const linkedElsewhere = prefill.data?.linkedCustomerId;

  return (
    <div className="max-w-5xl space-y-6 pb-16" data-testid="page-customer-wizard">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-5">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{tw("stepOf", { n: step, total: STEP_COUNT })}</p>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-wizard-title">{tw("titleNew")}</h1>
          <p className="text-sm text-muted-foreground">{tw("subtitleNew")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={cancel} disabled={submitting} data-testid="button-cancel-wizard">{tw("cancel")}</Button>
      </header>

      {confirmLeave && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-testid="confirm-leave-wizard">
          <span>{tw("leave.confirm")}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => navigate(cancelHref)} data-testid="button-confirm-leave">{tw("leave.discard")}</Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmLeave(false)} data-testid="button-stay">{tw("leave.stay")}</Button>
          </span>
        </div>
      )}
      {d.linkQboId && fromQbo && !linkedElsewhere && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="banner-prefill"><Link2 className="h-4 w-4 text-primary" />{tw("prefill.banner", { name: d.linkQboName ?? "" })}</div>
      )}
      {linkedElsewhere && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1" data-testid="banner-already-linked">
          <p>{tw("prefill.alreadyLinked")}</p>
          <Link href={`/dashboard/customers/${prefill.data!.linkedCustomerId}`} className="underline font-medium" data-testid="link-linked-customer">{tw("prefill.openLinked")}</Link>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[200px_1fr]">
        <nav aria-label="steps" className="md:sticky md:top-4 self-start">
          <ol className="flex md:flex-col gap-1 overflow-x-auto" data-testid="wizard-stepper">
            {STEP_KEYS.map((k, i) => {
              const n = i + 1, on = step === n, done = n < step || (n <= maxStep && n !== step), skipped = n === 2 && master;
              return (
                <li key={k}>
                  <button type="button" onClick={() => jump(n)} disabled={n > maxStep || skipped} aria-current={on ? "step" : undefined} data-testid={`wizard-step-${n}`}
                    className={`group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors ${on ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"} disabled:cursor-default disabled:hover:bg-transparent`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums ${on ? "border-primary bg-primary text-primary-foreground" : done && !skipped ? "border-primary/50 text-primary" : ""}`}>
                      {done && !on && !skipped ? <Check className="h-3.5 w-3.5" /> : n}
                    </span>
                    <span className={`whitespace-nowrap ${skipped ? "line-through opacity-60" : ""}`}>{tw(`steps.${k}`)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          {issues.length > 0 && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="errors-step">
              <p className="mb-1 font-medium text-destructive">{tw("fixBelow")}</p>
              <ul className="list-disc space-y-0.5 pl-5">{issues.map((i, n) => <li key={n} data-testid={`issue-${i.kind}`}>{issueText(i)}</li>)}</ul>
            </div>
          )}

          {step === 1 && <PropertySection d={d} patch={patch} tw={tw} parentChoices={parentChoices} parentsLoading={parents.isLoading} />}
          {step === 2 && !master && (
            <BillingSection d={d} setD={setD} patch={patch} tw={tw} pm={pm} pmCompanies={pmCompanies} managers={managers.data ?? []}
              dupInfo={{ dup, exactHits }} billingName={billingName} alreadyLinked={alreadyLinked} preview={preview}
              terms={terms} termDefaulted={termDefaulted && !d.termTouched}
              termsEmptyFallback={options.isSuccess && !options.data?.mostUsedTermId && !d.qboTermId} />
          )}
          {step === 2 && master && <p data-testid="text-master-skip">{tw("billing.masterSkip", { parent: parent?.name ?? "" })}</p>}
          {step === 3 && <ContactsSection d={d} setD={setD} tw={tw} manager={manager} master={master} />}
          {step === 4 && <SiteSection d={d} setD={setD} tw={tw} />}
          {step === 5 && (
            <ReviewStep d={d} tw={tw} t={t} goto={goto} master={master} parent={parent} pm={pm} manager={manager} billingName={billingName}
              options={options} alreadyLinked={alreadyLinked} activeMissing={serverMissing.length ? serverMissing : activeMissing} patch={patch}
              termName={(terms.data ?? []).find(x => x.id === d.qboTermId)?.name ?? null} />
          )}

          {submitError && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2" data-testid="error-submit">
              <p className="font-medium text-destructive">{submitError}</p>
              {master && parent && serverMissing.some(f => ["billingName", "billingEmails", "billTo"].includes(f)) &&
                <Link className="underline" href={`/dashboard/customers/${parent.id}/edit#billing`}>{tw("review.parentIncomplete", { parent: parent.name })}</Link>}
              {serverMissing.length > 0 && (
                <ul className="flex flex-wrap gap-2" data-testid="list-server-missing">
                  {serverMissing.map(f => <li key={f}><button type="button" className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted" onClick={() => goto(stepOfMissing(f) === 2 && master ? 1 : stepOfMissing(f))} data-testid={`button-missing-${f}`}>{fieldLabel(f)}</button></li>)}
                </ul>
              )}
            </div>
          )}

          <footer className="flex items-center justify-between gap-2 border-t pt-4">
            <Button variant="ghost" onClick={back} disabled={step === 1 || submitting} data-testid="button-wizard-back">{tw("back")}</Button>
            {step < STEP_COUNT
              ? <Button onClick={next} data-testid="button-wizard-next">{tw("next")}</Button>
              : <Button onClick={submit} disabled={submitting || !!linkedElsewhere} data-testid="button-wizard-submit">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitting ? tw("creating") : tw("create")}
                </Button>}
          </footer>
        </div>
      </div>
    </div>
  );
}

function LoadFail({ text, retry, label }: { text: string; retry: () => void; label: string }) {
  return (
    <div className="max-w-md space-y-3 rounded-md border p-6" role="alert" data-testid="error-wizard-load">
      <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /><span className="font-medium">{text}</span></div>
      <Button variant="outline" onClick={retry} data-testid="button-wizard-retry">{label}</Button>
    </div>
  );
}

type TW = (k: string, o?: Record<string, unknown>) => string;

interface ReviewProps {
  d: WizardDraft; tw: TW; t: (k: string, o?: Record<string, unknown>) => string; goto: (n: number) => void; master: boolean; parent: ParentLite | null;
  pm: PmCompany | null; manager: PmManager | null; billingName: string; options: { data?: WizardOptions; isError: boolean };
  alreadyLinked: boolean; activeMissing: MissingField[]; patch: (p: Partial<WizardDraft>) => void; termName: string | null;
}

function ReviewStep({ d, tw, t, goto, master, parent, pm, manager: mgr, billingName, options, alreadyLinked, activeMissing, patch, termName }: ReviewProps) {
  const none = tw("review.none");
  const addr = [d.street, [d.city, d.state].filter(Boolean).join(", "), d.zip].filter(Boolean).join(" ") || none;
  const billTo = d.billToMode === "property" ? `${tw("billing.property")}: ${addr}`
    : d.billToMode === "custom" ? `${tw("billing.custom")}: ${[d.billStreet, d.billStreet2, [d.billCity, d.billState].filter(Boolean).join(", "), d.billZip].filter(Boolean).join(" ") || none}`
    : `${tw("billing.mgmt")}: ${[pm ? `c/o ${pm.name}` : null, pm?.street, [pm?.city, pm?.state].filter(Boolean).join(", "), pm?.zip].filter(Boolean).join(", ") || none}`;
  const block = (n: number, title: string, rows: [string, ReactNode][], skip = false) => (
    <div className="rounded-md border" data-testid={`review-section-${n}`}>
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-medium">{n}. {title}</span>
        {!skip && <Button size="sm" variant="ghost" className="h-7" onClick={() => goto(n)} data-testid={`button-review-edit-${n}`}>{tw("edit")}</Button>}
      </div>
      <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1.5 p-3 text-sm">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
      </dl>
    </div>
  );
  const w = options.data;
  const sends = !d.linkQboId && (d.status === "active" || d.sendNow);
  let qbo: ReactNode;
  if (alreadyLinked) qbo = <p data-testid="qbo-already-linked">{tw("review.qboAlreadyLinked")}</p>;
  else if (master) qbo = <p data-testid="qbo-master">{tw("review.qboMaster", { parent: parent?.name ?? "" })}</p>;
  else if (d.linkQboId) qbo = <p data-testid="qbo-link">{tw("review.qboLink")} <strong>{d.linkQboName}</strong></p>;
  else qbo = (
    <div className="space-y-2">
      {d.status === "active" ? <p data-testid="qbo-create">{tw("review.qboCreate")} <strong>{billingName}</strong></p> : <p data-testid="qbo-prospect">{tw("review.qboProspect")}</p>}
      {d.status === "prospect" && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={d.sendNow} onCheckedChange={v => patch({ sendNow: !!v })} data-testid="checkbox-send-now" />
          <span><span className="font-medium">{tw("review.sendNow")}</span><span className="block text-xs text-muted-foreground">{tw("review.sendNowHelp")}</span></span>
        </label>
      )}
      {d.status === "prospect" && d.sendNow && <p data-testid="qbo-create-early">{tw("review.qboCreate")} <strong>{billingName}</strong></p>}
    </div>
  );
  const gate = !alreadyLinked && !master && (sends || d.linkQboId)
    ? options.isError ? tw("review.qboOptionsError") : w && !w.writeEnabled ? tw("review.qboWriteOff") : w && !w.baselineAt ? tw("review.qboSyncWait") : null : null;
  return (
    <Section title={tw("review.heading")} lead={tw("review.lead")} testId="wizard-body-5">
      {block(1, tw("steps.property"), [
        [tw("fields.name"), <span data-testid="review-name">{d.name}</span>],
        [tw("property.status"), <span data-testid="review-status">{tw(`property.${d.status}`)}</span>],
        [tw("property.address"), addr],
        [tw("property.type"), tw(`property.${d.customerType}`)],
        [tw("property.parent"), parent?.name ?? tw("property.parentNone")],
        ...(d.isParent ? [[tw("review.branches"), tw(`property.${d.branchBillingMode}`)] as [string, ReactNode]] : []),
        [tw("property.snow"), d.snowEnabled ? t("common.yes") : t("common.no")],
        [tw("property.acres"), d.acres || none],
        [tw("property.complexity"), d.complexityScore || none],
      ])}
      {master ? block(2, tw("steps.billing"), [[tw("billing.billTo"), <span data-testid="review-billed-through">{tw("review.billedThrough", { parent: parent?.name ?? "" })}</span>]], true)
        : block(2, tw("steps.billing"), [
          [tw("billing.billTo"), <span data-testid="review-billto">{billTo}</span>],
          [tw("billing.billingName"), <span data-testid="review-billing-name">{billingName || none}</span>],
          [tw("billing.emails"), d.billingEmails.join(", ") || none],
          [tw("billing.apName"), d.billingContactName || none],
          [tw("billing.companyName"), d.billingCompanyName || none],
          [tw("billing.phone"), [d.billingPhone, d.billingMobile].filter(Boolean).join(" / ") || none],
          [tw("billing.terms"), termName ?? (d.qboTermId || tw("review.notSet"))],
        ])}
      {block(3, tw("steps.contacts"), [[tw("steps.contacts"), <div data-testid="review-contacts">
        {tw("review.contactsCount", { count: d.contacts.length + (mgr && !d.contacts.some(c => c.propertyManagerId === mgr.id) ? 1 : 0) })}
        {d.contacts.map(c => <div key={c.key} className="mt-2">
          <span className="font-medium">{c.name}</span>
          {c.isPrimary && <span className="ml-2 text-xs">{tw("contacts.primary")}</span>}
          <div className="text-xs text-muted-foreground">{[c.role, c.emails, c.phones].filter(Boolean).join(" · ")}</div>
        </div>)}
        {mgr && !d.contacts.some(c => c.propertyManagerId === mgr.id) &&
          <div className="mt-2">{mgr.name} <span className="text-xs text-muted-foreground">{tw("contacts.managerAuto")}</span></div>}
      </div>]])}
      {block(4, tw("steps.site"), [
        [tw("site.gateCode"), d.site.gateCode || none],
        [tw("site.accessNotes"), d.site.accessNotes || none],
        [tw("site.includeInRoute"), d.site.includeInRoute ? t("common.yes") : t("common.no")],
        [tw("site.watchOutNotes"), d.site.watchOutNotes || none],
        [tw("site.petStationCount"), d.site.petStationCount || none],
        [tw("site.petStationLocations"), d.site.petStationLocations || none],
        [tw("site.controllerLocations"), d.site.irrigationControllerLocations || none],
      ])}
      <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-4 space-y-2" data-testid="box-qbo">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{tw("review.qbo")}</div>
        {qbo}
        {gate && <p className="text-sm text-amber-800 dark:text-amber-300" data-testid="qbo-gate">{gate}</p>}
      </div>
      {d.status === "active" && activeMissing.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-testid="review-active-missing">
          {tw("review.activeMissing")} {activeMissing.map(f => tw(`fields.${f}`)).join(", ")}
        </div>
      )}
    </Section>
  );
}
