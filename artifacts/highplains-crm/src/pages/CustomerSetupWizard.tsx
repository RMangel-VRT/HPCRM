import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Link2, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { qboJson, reviewHref, useQboTerms, viewerScope } from "@/lib/qboReview";
import { extractApiErrorMessage } from "@/lib/apiError";
import {
  activationError, apSnapshotContact, buildBody, chipProblem, draftFromServer, effectiveBillingName, emailsRemaining,
  missingForActive, newWizardDraft, parentIsMaster, pmAddressComplete, rowKey, stepIssues, stepOfMissing, STEP_COUNT,
} from "@/components/customerWizard/wizardModel";
import type {
  DuplicateCandidate, MissingField, ParentLite, PmCompany, PmManager, QboOutcome, StepIssue, WizardDraft,
} from "@/components/customerWizard/wizardModel";

const STEP_KEYS = ["property", "billing", "contacts", "site", "review"] as const;
const selectCls = "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
const choice = (on: boolean) => `rounded-md border p-3 text-left transition-colors ${on ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"}`;

interface SetupResponse { customer: Record<string, unknown> & { id: string; name: string; updatedAt?: string; qboCustomerId?: string | null; status?: string }; contacts: Record<string, unknown>[]; missingFields: MissingField[] }
interface WizardOptions { writeEnabled: boolean; baselineAt: string | null; mostUsedTermId: string | null }
interface PrefillResponse { customer: Record<string, unknown>; qbo: { linkQboId: string }; linkedCustomerId?: string | null; parentQboId?: string | null }

export default function CustomerSetupWizard() {
  const { user } = useAuth();
  const params = useParams<{ id?: string }>();
  if (!user) return <WizardSkeleton />;
  const id = params.id && params.id !== "new" ? params.id : null;
  // Keyed by company + viewer + record: a company switch remounts and discards any draft or in-flight result.
  return <WizardBody key={`${viewerScope(user).join("|")}:${id ?? "new"}`} companyId={user.activeCompanyId} editId={id} />;
}

function WizardSkeleton() {
  return <div className="space-y-4 max-w-5xl" data-testid="loading-customer-wizard"><Skeleton className="h-8 w-56" /><Skeleton className="h-6 w-96" /><Skeleton className="h-72 w-full" /></div>;
}

function Field({ label, hint, children, req }: { label: string; hint?: ReactNode; children: ReactNode; req?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>{req && <span className="text-[10px] uppercase tracking-wider text-primary/80">{req}</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Section({ title, lead, children, testId }: { title: string; lead?: string; children: ReactNode; testId: string }) {
  return (
    <section className="space-y-5 animate-in fade-in slide-in-from-bottom-1 duration-300" data-testid={testId}>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {lead && <p className="text-sm text-muted-foreground">{lead}</p>}
      </header>
      {children}
    </section>
  );
}

function WizardBody({ companyId, editId }: { companyId: string; editId: string | null }) {
  const { t } = useTranslation();
  const tw = (k: string, o?: Record<string, unknown>) => t(`customerWizard.${k}`, o ?? {}) as string;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const edit = !!editId;
  const fromQbo = useMemo(() => (edit ? null : new URLSearchParams(window.location.search).get("fromQbo")), [edit]);
  const get = <T,>(url: string) => qboJson<T>("GET", url, companyId);
  const scope = [companyId];

  const [d, setD] = useState<WizardDraft>(newWizardDraft);
  const original = useRef<SetupResponse["customer"] | null>(null);
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

  useSetBreadcrumbs([{ label: t("customers.title"), href: "/dashboard/customers" }, { label: tw(edit ? "titleSetup" : "titleNew") }], [edit]);

  const setup = useQuery<SetupResponse>({ queryKey: ["/api/customers", editId, "setup", ...scope], enabled: edit, retry: false, queryFn: () => get(`/api/customers/${editId}/setup`) });
  const prefill = useQuery<PrefillResponse>({ queryKey: ["/api/customers/wizard/prefill", fromQbo, ...scope], enabled: !!fromQbo, retry: false, queryFn: () => get(`/api/customers/wizard/prefill/${encodeURIComponent(fromQbo!)}`) });
  const options = useQuery<WizardOptions>({ queryKey: ["/api/customers/wizard/options", ...scope], retry: false, queryFn: () => get("/api/customers/wizard/options") });
  // The list endpoint caps pages at 200, so walk every page to offer all top-level parents.
  const parents = useQuery<{ customers: ParentLite[] }>({ queryKey: ["/api/customers", "wizard-parents", ...scope], retry: false, queryFn: async () => {
    const out: ParentLite[] = [];
    for (let page = 1; page <= 50; page++) {
      const r = await get<{ customers: ParentLite[]; total?: number }>(`/api/customers?page=${page}&limit=200`);
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
    if (edit && setup.data) { hydrated.current = true; original.current = setup.data.customer; setD(draftFromServer(setup.data.customer, setup.data.contacts)); setServerMissing(setup.data.missingFields ?? []); }
    if (!edit && prefill.data) {
      hydrated.current = true;
      const base = draftFromServer(prefill.data.customer);
      setD({ ...base, status: prefill.data.customer.status === "active" ? "active" : "prospect", linkQboId: prefill.data.qbo.linkQboId,
        linkQboName: String(prefill.data.customer.billingName ?? prefill.data.customer.name ?? ""), billingNameTouched: true,
        billingName: String(prefill.data.customer.billingName ?? prefill.data.customer.name ?? "") });
    }
  }, [edit, setup.data, prefill.data]);

  // Most-used terms default: applied once, only to an untouched empty field on a new customer.
  const termApplied = useRef(false);
  useEffect(() => {
    if (termApplied.current || edit || !options.data || terms.isLoading) return;
    termApplied.current = true;
    const tid = options.data.mostUsedTermId;
    if (tid && terms.data?.some(term => term.id === tid) && !d.termTouched && !d.qboTermId) {
      setD(cur => (cur.termTouched || cur.qboTermId ? cur : { ...cur, qboTermId: tid }));
      setTermDefaulted(true);
    }
  }, [options.data, edit, terms.data, terms.isLoading, d.termTouched, d.qboTermId]);

  const allCustomers = (parents.data?.customers ?? []).filter(c => !c.companyId || c.companyId === companyId);
  const parentChoices = allCustomers.filter(c => !c.parentCustomerId && c.id !== editId);
  const parent = allCustomers.find(c => c.id === d.parentCustomerId) ?? null;
  const master = parentIsMaster(d, parent);
  const pm = (pmCompanies.data ?? []).find(p => p.id === d.propertyManagementCompanyId) ?? null;
  const manager = master && !edit ? null : (managers.data ?? []).find(m => m.id === d.propertyManagerId) ?? null;
  const billingName = effectiveBillingName(d);
  const alreadyLinked = edit && !!setup.data?.customer.qboCustomerId;

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
        ...(d.billingEmails[0] ? { billingEmail: d.billingEmails[0] } : {}), ...(editId ? { customerId: editId } : {}),
      }).then(r => { if (alive.current && my === dupSeq.current) setDup({ name, state: "done", candidates: r?.candidates ?? [] }); })
        .catch(() => { if (alive.current && my === dupSeq.current) setDup({ name, state: "error", candidates: [] }); });
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingName, dupEnabled, companyId, editId]);
  const exactHits = dup.state === "done" && dup.name === billingName.trim()
    ? dup.candidates.filter(c => c.matchType === "exact_display_name" || c.displayName.trim().toLowerCase() === billingName.trim().toLowerCase()) : [];
  const duplicateBlocking = exactHits.length > 0 && !exactHits.some(h => h.qboId === d.linkQboId) && (d.status === "active" || d.sendNow);

  const ctx = { master, pm, duplicateBlocking, requireActive: d.status === "active" && (!edit || original.current?.status !== "active") };
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
    const body = buildBody(d, { master, edit });
    try {
      const res = edit
        ? await qboJson<{ customer: { id: string }; qbo: QboOutcome }>("PATCH", `/api/customers/${editId}/setup`, companyId, { ...body, expectedUpdatedAt: original.current?.updatedAt })
        : await qboJson<{ customer: { id: string }; qbo: QboOutcome }>("POST", "/api/customers/wizard", companyId, body);
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
        title: tw(edit ? "result.saved" : "result.created"),
        description: <span data-testid="toast-qbo-result">{resultText(res.qbo)}{review?.kind === "name_taken" && <> <Link href={reviewHref(review.id)} className="underline font-medium" data-testid="link-toast-review">{tw("result.openReview")}</Link></>}</span>,
      });
      navigate(`/dashboard/customers/${custId}`);
    } catch (e) {
      if (!alive.current) return;
      const act = activationError(e);
      if (act) { setServerMissing(act.missingFields); setSubmitError(tw("result.activation")); }
      else if (/^409:/.test(e instanceof Error ? e.message : "")) setSubmitError(tw("result.conflict"));
      else setSubmitError(localizedError(e));
    } finally { lock.current = false; if (alive.current) setSubmitting(false); }
  }

  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(newWizardDraft()), [d]);
  const cancelHref = edit ? `/dashboard/customers/${editId}` : "/dashboard/customers";
  function cancel() { if (dirty && !edit && !confirmLeave) { setConfirmLeave(true); return; } navigate(cancelHref); }

  if (edit && setup.isLoading) return <WizardSkeleton />;
  if (edit && setup.isError) return <LoadFail text={tw("loadError")} retry={() => void setup.refetch()} label={tw("retry")} />;
  if (fromQbo && prefill.isLoading) return <div className="space-y-3 max-w-5xl"><p className="text-sm text-muted-foreground" data-testid="loading-prefill">{tw("prefill.loading")}</p><Skeleton className="h-72" /></div>;
  if (fromQbo && prefill.isError) return <LoadFail text={tw("prefill.error")} retry={() => void prefill.refetch()} label={tw("retry")} />;
  const linkedElsewhere = !edit && prefill.data?.linkedCustomerId;
  // Inactive customers are never silently reset to prospect; setup is blocked until reactivated elsewhere.
  if (edit && setup.data?.customer.status === "inactive") return (
    <div className="max-w-md space-y-3 rounded-md border p-6" role="alert" data-testid="notice-setup-inactive">
      <p className="font-medium">{tw("inactiveBlocked")}</p>
      <Button variant="outline" asChild><Link href={`/dashboard/customers/${editId}`} data-testid="link-back-customer">{tw("cancel")}</Link></Button>
    </div>
  );

  return (
    <div className="max-w-5xl space-y-6 pb-16" data-testid="page-customer-wizard">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-5">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{tw("stepOf", { n: step, total: STEP_COUNT })}</p>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-wizard-title">{tw(edit ? "titleSetup" : "titleNew")}</h1>
          <p className="text-sm text-muted-foreground">{edit ? tw("subtitleSetup", { name: setup.data?.customer.name ?? "" }) : tw("subtitleNew")}</p>
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

          {step === 1 && <PropertyStep d={d} patch={patch} tw={tw} parentChoices={parentChoices} parentsLoading={parents.isLoading} />}
          {step === 2 && !master && (
            <BillingStep d={d} setD={setD} patch={patch} tw={tw} pm={pm} pmCompanies={pmCompanies} managers={managers.data ?? []}
              dup={dup} exactHits={exactHits} billingName={billingName} alreadyLinked={alreadyLinked}
              terms={terms} termDefaulted={termDefaulted && !d.termTouched} options={options} />
          )}
          {step === 2 && master && <p data-testid="text-master-skip">{tw("billing.masterSkip", { parent: parent?.name ?? "" })}</p>}
          {step === 3 && <ContactsStep d={d} setD={setD} tw={tw} manager={manager} master={master} />}
          {step === 4 && <SiteStep d={d} setD={setD} tw={tw} />}
          {step === 5 && (
            <ReviewStep d={d} tw={tw} t={t} goto={goto} master={master} parent={parent} pm={pm} manager={manager} billingName={billingName}
              options={options} alreadyLinked={alreadyLinked} activeMissing={serverMissing.length ? serverMissing : activeMissing} patch={patch}
              termName={(terms.data ?? []).find(x => x.id === d.qboTermId)?.name ?? null} />
          )}

          {submitError && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2" data-testid="error-submit">
              <p className="font-medium text-destructive">{submitError}</p>
              {master && parent && serverMissing.some(f => ["billingName", "billingEmails", "billTo"].includes(f)) &&
                <Link className="underline" href={`/dashboard/customers/${parent.id}/setup`}>{tw("review.parentIncomplete", { parent: parent.name })}</Link>}
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
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitting ? tw("creating") : tw(edit ? "save" : "create")}
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

function PropertyStep({ d, patch, tw, parentChoices, parentsLoading }: { d: WizardDraft; patch: (p: Partial<WizardDraft>) => void; tw: TW; parentChoices: ParentLite[]; parentsLoading: boolean }) {
  const reqAddr = d.status === "active" ? tw("requiredActive") : tw("optional");
  return (
    <Section title={tw("property.heading")} lead={tw("property.lead")} testId="wizard-body-1">
      <Field label={tw("fields.name")} req={tw("required")}>
        <Input value={d.name} onChange={e => patch({ name: e.target.value })} data-testid="input-wizard-name" autoFocus />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">{tw("property.status")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["prospect", "active"] as const).map(s => (
            <button key={s} type="button" className={choice(d.status === s)} aria-pressed={d.status === s} onClick={() => patch({ status: s, sendNow: s === "active" ? false : d.sendNow })} data-testid={`button-status-${s}`}>
              <div className="font-medium">{tw(`property.${s}`)}</div><div className="text-xs text-muted-foreground">{tw(`property.${s}Sub`)}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="text-status-help">{tw("property.statusHelp")} {tw("property.activeNoBid")}</p>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">{tw("property.address")} <span className="ml-1 text-[10px] uppercase tracking-wider text-primary/80">{reqAddr}</span></legend>
        <Input placeholder={tw("fields.street")} aria-label={tw("fields.street")} value={d.street} onChange={e => patch({ street: e.target.value })} data-testid="input-wizard-street" />
        <div className="grid grid-cols-[1fr_80px_110px] gap-2">
          <Input placeholder={tw("fields.city")} aria-label={tw("fields.city")} value={d.city} onChange={e => patch({ city: e.target.value })} data-testid="input-wizard-city" />
          <Input placeholder={tw("fields.state")} aria-label={tw("fields.state")} value={d.state} onChange={e => patch({ state: e.target.value })} data-testid="input-wizard-state" />
          <Input placeholder={tw("fields.zip")} aria-label={tw("fields.zip")} value={d.zip} onChange={e => patch({ zip: e.target.value })} data-testid="input-wizard-zip" />
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">{tw("property.type")}</legend>
          <div className="flex gap-2">
            {(["commercial", "hoa"] as const).map(k => (
              <Button key={k} type="button" size="sm" variant={d.customerType === k ? "default" : "outline"} aria-pressed={d.customerType === k} onClick={() => patch({ customerType: k })} data-testid={`button-type-${k}`}>{tw(`property.${k}`)}</Button>
            ))}
          </div>
        </fieldset>
        <Field label={tw("property.parent")} hint={tw("property.parentHelp")}>
          <select className={selectCls} value={d.parentCustomerId ?? ""} disabled={parentsLoading || d.isParent}
            onChange={e => patch({ parentCustomerId: e.target.value || null })} data-testid="select-wizard-parent">
            <option value="">{tw("property.parentNone")}</option>
            {parentChoices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="rounded-md border p-4 space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          {tw("property.hasBranches")}
          <Switch checked={d.isParent} disabled={!!d.parentCustomerId} onCheckedChange={v => patch({ isParent: v })} data-testid="switch-has-branches" />
        </label>
        {d.isParent && (
          <div className="grid gap-2 sm:grid-cols-2" data-testid="branch-billing">
            {(["master", "separate"] as const).map(k => (
              <button key={k} type="button" className={choice(d.branchBillingMode === k)} aria-pressed={d.branchBillingMode === k} onClick={() => patch({ branchBillingMode: k })} data-testid={`button-branch-${k}`}>
                <div className="text-sm font-medium">{tw(`property.${k}`)}</div><div className="text-xs text-muted-foreground">{tw(`property.${k}Sub`)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium text-muted-foreground">{tw("property.extras")}</legend>
        <div className="grid gap-3 sm:grid-cols-3 items-end">
          <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={d.snowEnabled} onCheckedChange={v => patch({ snowEnabled: v })} data-testid="switch-snow" />{tw("property.snow")}</label>
          <Field label={tw("property.acres")}><Input inputMode="decimal" value={d.acres} onChange={e => patch({ acres: e.target.value })} data-testid="input-wizard-acres" /></Field>
          <Field label={tw("property.complexity")}>
            <select className={selectCls} value={d.complexityScore} onChange={e => patch({ complexityScore: e.target.value })} data-testid="select-wizard-complexity">
              <option value="">{tw("property.complexityNone")}</option>
              {["1", "2", "3", "4", "5"].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
      </fieldset>
    </Section>
  );
}

interface BillingProps {
  d: WizardDraft; setD: (f: (c: WizardDraft) => WizardDraft) => void; patch: (p: Partial<WizardDraft>) => void; tw: TW;
  pm: PmCompany | null; pmCompanies: { data?: PmCompany[]; isLoading: boolean; isError: boolean }; managers: PmManager[];
  dup: { state: string; name: string }; exactHits: DuplicateCandidate[]; billingName: string; alreadyLinked: boolean;
  terms: { data?: { id: string; name: string }[]; isLoading: boolean; isError: boolean }; termDefaulted: boolean;
  options: { data?: WizardOptions; isSuccess: boolean };
}

function BillingStep({ d, setD, patch, tw, pm, pmCompanies, managers, dup, exactHits, billingName, alreadyLinked, terms, termDefaulted, options }: BillingProps) {
  const req = d.status === "active" ? tw("requiredActive") : tw("optional");
  const [chip, setChip] = useState("");
  const [chipErr, setChipErr] = useState<string | null>(null);
  const remaining = emailsRemaining(d.billingEmails);
  const preview = remaining - (chip.trim() ? chip.trim().length + (d.billingEmails.length ? 1 : 0) : 0);
  function addChip() {
    if (!chip.trim()) return;
    const p = chipProblem(d.billingEmails, chip);
    if (p) { setChipErr(tw(p === "invalid" ? "billing.chipInvalid" : p === "duplicate" ? "billing.chipDuplicate" : "billing.chipTooLong")); return; }
    setD(c => ({ ...c, billingEmails: [...c.billingEmails, chip.trim()] })); setChip(""); setChipErr(null);
  }
  // Mirrors CQ1 resolveBillTo exactly: street = "c/o {company}", street2 = company street, then city/state/zip. Manager is not an address line.
  const careOf = pm ? [`c/o ${pm.name}`, pm.street, [[pm.city, pm.state].filter(Boolean).join(", "), pm.zip].filter(Boolean).join(" ")].filter(Boolean) as string[] : [];
  const termsEmptyFallback = options.isSuccess && !options.data?.mostUsedTermId && !d.qboTermId;
  return (
    <Section title={tw("billing.heading")} lead={tw("billing.lead")} testId="wizard-body-2">
      {d.status === "prospect" && <p className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground" data-testid="text-prospect-billing">{tw("billing.prospectNote")}</p>}
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">{tw("billing.billTo")} <span className="ml-1 text-[10px] uppercase tracking-wider text-primary/80">{req}</span></legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {([["property", "property"], ["management_company", "mgmt"], ["custom", "custom"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={choice(d.billToMode === k)} aria-pressed={d.billToMode === k} onClick={() => patch({ billToMode: k })} data-testid={`button-billto-${k}`}>
              <div className="text-sm font-medium">{tw(`billing.${l}`)}</div><div className="text-xs text-muted-foreground">{tw(`billing.${l}Sub`)}</div>
            </button>
          ))}
        </div>
        {d.billToMode === "property" && (
          <p className="rounded-md border border-dashed p-3 text-sm" data-testid="text-billto-property">
            {d.street.trim() ? <>{tw("billing.propertyAddr")}: <span className="font-medium">{[d.street, [d.city, d.state].filter(Boolean).join(", "), d.zip].filter(Boolean).join(" ")}</span></> : tw("billing.propertyAddrMissing")}
          </p>
        )}
        {d.billToMode === "management_company" && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={tw("billing.company")}>
                <select className={selectCls} value={d.propertyManagementCompanyId ?? ""} disabled={pmCompanies.isLoading}
                  onChange={e => patch({ propertyManagementCompanyId: e.target.value || null, propertyManagerId: null })} data-testid="select-pm-company">
                  <option value="">{pmCompanies.isLoading ? tw("billing.careOfLoading") : tw("billing.companyNone")}</option>
                  {(pmCompanies.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label={tw("billing.manager")}>
                <select className={selectCls} value={d.propertyManagerId ?? ""} disabled={!d.propertyManagementCompanyId}
                  onChange={e => patch({ propertyManagerId: e.target.value || null })} data-testid="select-pm-manager">
                  <option value="">{tw("billing.managerNone")}</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </div>
            {pmCompanies.isError && <p className="text-xs text-destructive">{tw("billing.careOfError")}</p>}
            {pm && (
              <div className="rounded bg-muted/50 p-3 text-sm" data-testid="text-care-of" aria-readonly>
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{tw("billing.careOf")}</div>
                {careOf.map((l, i) => <div key={i}>{l}</div>)}
                {!pmAddressComplete(pm) && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" data-testid="text-care-of-incomplete">{tw("billing.careOfIncomplete")}</p>}
              </div>
            )}
          </div>
        )}
        {d.billToMode === "custom" && (
          <div className="space-y-2 rounded-md border p-3">
            <Input placeholder={tw("billing.billStreet")} aria-label={tw("billing.billStreet")} value={d.billStreet} onChange={e => patch({ billStreet: e.target.value })} data-testid="input-bill-street" />
            <Input placeholder={tw("billing.billStreet2")} aria-label={tw("billing.billStreet2")} value={d.billStreet2} onChange={e => patch({ billStreet2: e.target.value })} data-testid="input-bill-street2" />
            <div className="grid grid-cols-[1fr_80px_110px] gap-2">
              <Input placeholder={tw("billing.billCity")} aria-label={tw("billing.billCity")} value={d.billCity} onChange={e => patch({ billCity: e.target.value })} data-testid="input-bill-city" />
              <Input placeholder={tw("billing.billState")} aria-label={tw("billing.billState")} value={d.billState} onChange={e => patch({ billState: e.target.value })} data-testid="input-bill-state" />
              <Input placeholder={tw("billing.billZip")} aria-label={tw("billing.billZip")} value={d.billZip} onChange={e => patch({ billZip: e.target.value })} data-testid="input-bill-zip" />
            </div>
          </div>
        )}
      </fieldset>

      <Field label={tw("billing.billingName")} req={req} hint={tw("billing.billingNameHelp")}>
        <Input value={billingName} onChange={e => patch({ billingName: e.target.value, billingNameTouched: true, linkQboId: null, linkQboName: null })} data-testid="input-billing-name" />
      </Field>
      {!alreadyLinked && (
        <div className="min-h-[1.5rem] text-sm" aria-live="polite" data-testid="dup-status">
          {d.linkQboId ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5" data-testid="text-linked-qbo">
              <Link2 className="h-4 w-4 text-primary" />{tw("billing.linked", { name: d.linkQboName ?? "" })}
              <Button size="sm" variant="ghost" onClick={() => patch({ linkQboId: null, linkQboName: null })} data-testid="button-unlink-qbo">{tw("billing.unlink")}</Button>
            </div>
          ) : dup.state === "checking" ? <span className="text-muted-foreground" data-testid="text-dup-checking">{tw("billing.checking")}</span>
            : dup.state === "error" ? <span className="text-muted-foreground" data-testid="text-dup-error">{tw("billing.checkFailed")}</span>
            : exactHits.length > 0 ? (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3" data-testid="dup-matches">
                {exactHits.map(h => (
                  <div key={h.qboId} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{tw("billing.match")} <strong data-testid={`text-dup-${h.qboId}`}>{h.displayName}</strong>{h.city ? <span className="text-muted-foreground"> · {h.city}</span> : null}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">{tw("billing.matchSame")}
                      <Button size="sm" variant="outline" onClick={() => patch({ linkQboId: h.qboId, linkQboName: h.displayName })} data-testid={`button-link-${h.qboId}`}>{tw("billing.link")}</Button>
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">{tw("billing.orChange")}</p>
              </div>
            ) : dup.state === "done" ? <span className="text-muted-foreground" data-testid="text-dup-none">{tw("billing.noMatch")}</span> : null}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tw("billing.companyName")}><Input value={d.billingCompanyName} onChange={e => patch({ billingCompanyName: e.target.value })} data-testid="input-billing-company" /></Field>
        <Field label={tw("billing.apName")}><Input value={d.billingContactName} onChange={e => patch({ billingContactName: e.target.value })} data-testid="input-billing-contact" /></Field>
      </div>

      <Field label={tw("billing.emails")} req={req}
        hint={<span className={preview < 0 ? "text-destructive" : ""} data-testid="text-email-remaining">{preview < 0 ? tw("billing.over", { n: -preview }) : tw("billing.remaining", { n: preview })}</span>}>
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
          {d.billingEmails.map(e => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary" data-testid={`chip-email-${e}`}>
              {e}<button type="button" aria-label={tw("billing.removeEmail", { email: e })} onClick={() => setD(c => ({ ...c, billingEmails: c.billingEmails.filter(x => x !== e) }))}><X className="h-3 w-3" /></button>
            </span>
          ))}
          <input className="min-w-[10rem] flex-1 bg-transparent text-sm outline-none" value={chip} placeholder={tw("billing.emailsPlaceholder")}
            onChange={e => { setChip(e.target.value); setChipErr(null); }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(); } }}
            onBlur={() => chip.trim() && addChip()} data-testid="input-billing-email" />
        </div>
      </Field>
      {chipErr && <p className="-mt-3 text-xs text-destructive" data-testid="error-email-chip">{chipErr}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={tw("billing.phone")}><Input value={d.billingPhone} onChange={e => patch({ billingPhone: e.target.value })} data-testid="input-billing-phone" /></Field>
        <Field label={tw("billing.mobile")}><Input value={d.billingMobile} onChange={e => patch({ billingMobile: e.target.value })} data-testid="input-billing-mobile" /></Field>
        <Field label={tw("billing.terms")}
          hint={terms.isError ? <span className="text-destructive">{tw("billing.termsError")}</span> : termDefaulted && d.qboTermId ? <span data-testid="text-terms-default">{tw("billing.termsDefault")}</span> : termsEmptyFallback ? <span data-testid="text-terms-no-default">{tw("billing.termsNoDefault")}</span> : null}>
          <select className={selectCls} value={d.qboTermId} disabled={terms.isLoading} onChange={e => patch({ qboTermId: e.target.value, termTouched: true })} data-testid="select-billing-terms">
            <option value="">{terms.isLoading ? tw("billing.termsLoading") : tw("billing.termsNone")}</option>
            {(terms.data ?? []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
      </div>
    </Section>
  );
}

function ContactsStep({ d, setD, tw, manager: mgr, master }: { d: WizardDraft; setD: (f: (c: WizardDraft) => WizardDraft) => void; tw: TW; manager: PmManager | null; master: boolean }) {
  const upd = (key: string, p: Partial<WizardDraft["contacts"][number]>) => setD(c => ({ ...c, contacts: c.contacts.map(r => (r.key === key ? { ...r, ...p } : p.isPrimary ? { ...r, isPrimary: false } : r)) }));
  const managerShown = !!mgr && !d.contacts.some(c => c.propertyManagerId === mgr.id);
  return (
    <Section title={tw("contacts.heading")} lead={tw("contacts.lead")} testId="wizard-body-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setD(c => ({ ...c, contacts: [...c.contacts, { key: rowKey(), name: "", role: "", emails: "", phones: "", isPrimary: c.contacts.length === 0 }] }))} data-testid="button-add-contact"><Plus className="mr-1 h-4 w-4" />{tw("contacts.add")}</Button>
        {/* One-time snapshot: copies AP details once into an ordinary contact row; never kept in sync. */}
        <Button type="button" size="sm" variant="outline" disabled={!d.billingContactName.trim() || master} title={!d.billingContactName.trim() ? tw("contacts.sameAsApNone") : tw("contacts.sameAsApHelp")}
          onClick={() => setD(c => ({ ...c, contacts: [...c.contacts, apSnapshotContact(c)] }))} data-testid="button-same-as-ap">{tw("contacts.sameAsAp")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{d.billingContactName.trim() ? tw("contacts.sameAsApHelp") : tw("contacts.sameAsApNone")}</p>
      {managerShown && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed bg-muted/40 p-3 text-sm" data-testid="row-manager-contact">
          <div><div className="font-medium">{mgr!.name}</div><div className="text-xs text-muted-foreground">{tw("contacts.managerAutoHelp", { name: mgr!.name })}</div></div>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{tw("contacts.managerAuto")}</span>
        </div>
      )}
      {d.contacts.length === 0 && !managerShown && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="empty-contacts">{tw("contacts.empty")}</p>}
      <ul className="space-y-3">
        {d.contacts.map((c, i) => (
          <li key={c.key} className="space-y-3 rounded-md border p-3" data-testid={`row-contact-${i}`}>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex gap-2">{c.id && <span className="rounded bg-muted px-1.5 py-0.5">{tw("contacts.existing")}</span>}{c.source === "ap" && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary" data-testid={`badge-ap-${i}`}>{tw("contacts.apSnapshot")}</span>}</span>
              <span className="flex items-center gap-3">
                <label className="flex items-center gap-1.5"><Checkbox checked={c.isPrimary} onCheckedChange={v => upd(c.key, { isPrimary: !!v })} data-testid={`checkbox-primary-${i}`} />{tw("contacts.primary")}</label>
                <Button type="button" size="icon" variant="ghost" aria-label={tw("contacts.remove")} data-testid={`button-remove-contact-${i}`}
                  onClick={() => setD(cur => ({ ...cur, contacts: cur.contacts.filter(r => r.key !== c.key), deletedContactIds: c.id ? [...cur.deletedContactIds, c.id] : cur.deletedContactIds }))}><Trash2 className="h-4 w-4" /></Button>
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label={tw("contacts.name")}><Input value={c.name} onChange={e => upd(c.key, { name: e.target.value })} data-testid={`input-contact-name-${i}`} /></Field>
              <Field label={tw("contacts.role")}><Input value={c.role} onChange={e => upd(c.key, { role: e.target.value })} data-testid={`input-contact-role-${i}`} /></Field>
              <Field label={tw("contacts.emails")} hint={tw("contacts.listHint")}><Input value={c.emails} onChange={e => upd(c.key, { emails: e.target.value })} data-testid={`input-contact-emails-${i}`} /></Field>
              <Field label={tw("contacts.phones")} hint={tw("contacts.listHint")}><Input value={c.phones} onChange={e => upd(c.key, { phones: e.target.value })} data-testid={`input-contact-phones-${i}`} /></Field>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SiteStep({ d, setD, tw }: { d: WizardDraft; setD: (f: (c: WizardDraft) => WizardDraft) => void; tw: TW }) {
  const set = (p: Partial<WizardDraft["site"]>) => setD(c => ({ ...c, site: { ...c.site, ...p } }));
  return (
    <Section title={tw("site.heading")} lead={tw("site.lead")} testId="wizard-body-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label={tw("site.gateCode")}><Input value={d.site.gateCode} onChange={e => set({ gateCode: e.target.value })} className="font-mono" data-testid="input-site-gate" /></Field>
        <Field label={tw("site.petStationCount")}><Input inputMode="numeric" value={d.site.petStationCount} onChange={e => set({ petStationCount: e.target.value })} data-testid="input-site-pet-count" /></Field>
      </div>
      <Field label={tw("site.accessNotes")}><Textarea rows={2} value={d.site.accessNotes} onChange={e => set({ accessNotes: e.target.value })} data-testid="input-site-access" /></Field>
      <Field label={tw("site.watchOutNotes")}><Textarea rows={2} value={d.site.watchOutNotes} onChange={e => set({ watchOutNotes: e.target.value })} data-testid="input-site-watch" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tw("site.petStationLocations")}><Textarea rows={2} value={d.site.petStationLocations} onChange={e => set({ petStationLocations: e.target.value })} data-testid="input-site-pet-locations" /></Field>
        <Field label={tw("site.controllerLocations")}><Textarea rows={2} value={d.site.irrigationControllerLocations} onChange={e => set({ irrigationControllerLocations: e.target.value })} data-testid="input-site-controllers" /></Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
        <span><span className="font-medium">{tw("site.includeInRoute")}</span><span className="block text-xs text-muted-foreground">{tw("site.includeInRouteHelp")}</span></span>
        <Switch checked={d.site.includeInRoute} onCheckedChange={v => set({ includeInRoute: v })} data-testid="switch-include-route" />
      </label>
    </Section>
  );
}

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
