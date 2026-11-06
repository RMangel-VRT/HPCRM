import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, GitBranch, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { cardKey, qboJson, useQboTerms, viewerScope, type QuickBooksCard } from "@/lib/qboReview";
import { extractApiErrorMessage } from "@/lib/apiError";
import { guardLinkClick, unsavedGuard } from "@/lib/unsavedGuard";
import { cardState } from "@/components/qbo/QboCustomerCard";
import {
  activationError, buildEditPatch, draftFromServer, parentIsMaster, patchIsEmpty, qboRelevantChange, stepIssues,
} from "@/components/customerWizard/wizardModel";
import type { MissingField, ParentLite, PmCompany, PmManager, StepIssue, WizardDraft } from "@/components/customerWizard/wizardModel";
import { BillingSection, ContactsSection, PropertySection, SiteSection, ManagementFields } from "@/components/customerWizard/sections";
import { liveMissing, useBillToPreview, type ParentRow } from "@/components/customerWizard/billToPreview";

export const EDIT_SECTIONS = ["property", "billing", "contacts", "site"] as const;
type SectionKey = typeof EDIT_SECTIONS[number];
interface SetupResponse { customer: Record<string, unknown> & { id: string; name: string; updatedAt?: string; qboCustomerId?: string | null; status?: string; billingName?: string | null }; contacts: Record<string, unknown>[]; missingFields: MissingField[] }

/** Where Save returns to on the customer page, by the section the editor was opened on. */
export function returnHref(id: string, hash: string) {
  const base = `/dashboard/customers/${id}`;
  switch (hash.replace(/^#/, "")) {
    case "billing": return `${base}?tab=billing`;
    case "contacts": return `${base}?tab=contacts`;
    case "site": return `${base}?tab=property`;
    case "property": return `${base}?tab=property`;
    default: return base;
  }
}

/** Legacy /setup links (Finish setup, bookmarks) land on the editor, hash preserved. */
export function CustomerSetupRedirect() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  useEffect(() => { navigate(`/dashboard/customers/${params.id}/edit${window.location.hash}`, { replace: true }); }, [params.id, navigate]);
  return null;
}

export default function CustomerEdit() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  if (!user || !params.id) return <EditSkeleton />;
  // Keyed by company + viewer + customer: switching any of them discards the draft and ignores in-flight results.
  return <EditBody key={`${viewerScope(user).join("|")}:${params.id}`} id={params.id} companyId={user.activeCompanyId} />;
}

function EditSkeleton() {
  return <div className="mx-auto max-w-[1180px] space-y-4" data-testid="loading-customer-edit"><Skeleton className="h-9 w-72" /><Skeleton className="h-5 w-48" /><Skeleton className="h-80 w-full" /><Skeleton className="h-64 w-full" /></div>;
}

/** "pop" carries the exact history target captured at popstate time, so Back and Forward both land where the user aimed. */
type Pending = { kind: "href"; href: string } | { kind: "pop"; href: string } | null;

function EditBody({ id, companyId }: { id: string; companyId: string }) {
  const { t } = useTranslation();
  const tw = useCallback((k: string, o?: Record<string, unknown>) => t(`customerWizard.${k}`, o ?? {}) as string, [t]);
  const te = (k: string, o?: Record<string, unknown>) => t(`customerEdit.${k}`, o ?? {}) as string;
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const scope = viewerScope(user);
  const get = <T,>(url: string) => qboJson<T>("GET", url, companyId);
  const openedHash = useRef(typeof window !== "undefined" ? window.location.hash : "");

  const setup = useQuery<SetupResponse>({
    queryKey: ["/api/customers", id, "setup", companyId, ...scope], retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false,
    queryFn: () => get(`/api/customers/${encodeURIComponent(id)}/setup`),
  });
  const parents = useQuery<{ customers: (ParentLite & ParentRow)[] }>({ queryKey: ["/api/customers", "wizard-parents", companyId, ...scope], retry: false, queryFn: async () => {
    const out: (ParentLite & ParentRow)[] = [];
    for (let page = 1; page <= 50; page++) {
      const r = await get<{ customers: (ParentLite & ParentRow)[]; total?: number }>(`/api/customers?page=${page}&limit=200`);
      const rows = r?.customers ?? [];
      out.push(...rows);
      if (rows.length < 200 || (r.total !== undefined && out.length >= r.total)) break;
    }
    return { customers: out };
  } });
  const pmCompanies = useQuery<PmCompany[]>({ queryKey: ["/api/property-management-companies", companyId, ...scope], retry: false, queryFn: () => get("/api/property-management-companies") });
  const [d, setD] = useState<WizardDraft | null>(null);
  const [base, setBase] = useState<WizardDraft | null>(null);
  const original = useRef<SetupResponse["customer"] | null>(null);
  const managers = useQuery<PmManager[]>({
    queryKey: ["/api/property-managers", d?.propertyManagementCompanyId, companyId, ...scope], enabled: !!d?.propertyManagementCompanyId, retry: false,
    queryFn: () => get(`/api/property-managers?propertyManagementCompanyId=${encodeURIComponent(d!.propertyManagementCompanyId!)}`),
  });
  const terms = useQboTerms();
  const card = useQuery<QuickBooksCard>({ queryKey: cardKey(id, user), retry: false, staleTime: 15_000,
    queryFn: () => qboJson("GET", `/api/customers/${encodeURIComponent(id)}/quickbooks-card`, companyId) });

  // Hydrate once from a fresh read. Background refetches never overwrite edits.
  const hydrate = useCallback((data: SetupResponse) => {
    original.current = data.customer;
    const draft = draftFromServer(data.customer, data.contacts, { edit: true });
    setBase(draft); setD(draft);
  }, []);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !setup.data || setup.isFetching) return;
    hydrated.current = true;
    hydrate(setup.data);
  }, [setup.data, setup.isFetching, hydrate]);

  const name = (original.current?.name as string | undefined) ?? setup.data?.customer.name ?? "";
  useSetBreadcrumbs([{ label: t("customers.title"), href: "/dashboard/customers" }, { label: name || t("common.loading"), href: `/dashboard/customers/${id}` }, { label: te("crumb") }], [name, id]);

  const allCustomers = (parents.data?.customers ?? []).filter(c => !c.companyId || c.companyId === companyId);
  const parentChoices = allCustomers.filter(c => !c.parentCustomerId && c.id !== id);
  const parent = d ? allCustomers.find(c => c.id === d.parentCustomerId) ?? null : null;
  const master = d ? parentIsMaster(d, parent) : false;
  const pm = d ? (pmCompanies.data ?? []).find(p => p.id === d.propertyManagementCompanyId) ?? null : null;
  const manager = d ? (managers.data ?? []).find(m => m.id === d.propertyManagerId) ?? null : null;
  const rawBillingName = (original.current?.billingName as string | null | undefined) ?? null;
  const previewDraft = d ?? base;
  const preview = useBillToPreview({ draft: previewDraft ?? ({} as WizardDraft), id, companyId, rawBillingName, parents: allCustomers,
    pmCompanies: pmCompanies.data ?? [], ready: !!previewDraft && !parents.isLoading && !pmCompanies.isLoading });

  const patch = useMemo(() => (d && base ? buildEditPatch(base, d) : null), [d, base]);
  const dirty = !!patch && !patchIsEmpty(patch);
  const linked = !!original.current?.qboCustomerId;
  const qboNote = linked && !!patch && !!d && qboRelevantChange(patch.customer, d);
  const missing = d ? liveMissing(d, rawBillingName, preview) : [];
  const [serverMissing, setServerMissing] = useState<MissingField[]>([]);
  // Activation gate: any non-active -> active change. Already-active records are advisory only (CQ6).
  const activating = !!d && !!base && d.status === "active" && base.status !== "active";
  const advisory = !!d && !!base && d.status === "active" && base.status === "active";
  const shownMissing = serverMissing.length ? serverMissing : missing;
  const needed = useMemo(() => new Set<MissingField>(d?.status === "active" ? shownMissing : []), [d?.status, shownMissing.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const [issues, setIssues] = useState<StepIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const setDraft = useCallback((f: (c: WizardDraft) => WizardDraft) => setD(c => (c ? f(c) : c)), []);
  const patchDraft = useCallback((p: Partial<WizardDraft>) => setD(c => (c ? { ...c, ...p } : c)), []);

  /* ---- Leave protection: in-app links, sidebar, history and unload. Hash anchors never count as leaving. ---- */
  useEffect(() => { unsavedGuard.setDirty(dirty, { protectHistory: true }); }, [dirty]);
  useEffect(() => () => unsavedGuard.setDirty(false), []);
  useEffect(() => {
    document.addEventListener("click", guardLinkClick as never, true);
    return () => document.removeEventListener("click", guardLinkClick as never, true);
  }, []);
  const guardPending = useSyncExternalStore(unsavedGuard.subscribe, unsavedGuard.getPending, () => null);
  useEffect(() => { if (guardPending) setPending({ kind: unsavedGuard.isHistoryPending() ? "pop" : "href", href: guardPending }); }, [guardPending]);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (!dirtyRef.current) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  function leave(to: Pending) {
    unsavedGuard.setDirty(false); unsavedGuard.clearPending(); dirtyRef.current = false; setPending(null);
    if (!to) return;
    // A confirmed history move replaces the re-pushed editor entry instead of guessing a delta with history.go().
    navigate(to.href, to.kind === "pop" ? { replace: true } : undefined);
  }
  function stay() { unsavedGuard.clearPending(); setPending(null); }
  const detailHref = `/dashboard/customers/${id}`;
  function cancel() { if (dirty) setPending({ kind: "href", href: detailHref }); else navigate(detailHref); }
  function discard() { if (base) { setD(base); setIssues([]); setSubmitError(null); setServerMissing([]); } }

  /* ---- Section navigation + scroll-spy ---- */
  const [current, setCurrent] = useState<SectionKey>("property");
  const ready = !!d;
  useEffect(() => {
    if (!ready) return;
    const h = openedHash.current.replace(/^#/, "");
    if ((EDIT_SECTIONS as readonly string[]).includes(h)) {
      setCurrent(h as SectionKey);
      requestAnimationFrame?.(() => document.getElementById(h)?.scrollIntoView?.({ block: "start" }));
    }
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(entries => {
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setCurrent(top.target.id as SectionKey);
    }, { rootMargin: "-15% 0px -70% 0px" });
    for (const s of EDIT_SECTIONS) { const el = document.getElementById(s); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [ready]);
  function jump(s: SectionKey, e: { preventDefault(): void }) {
    e.preventDefault();
    setCurrent(s);
    document.getElementById(s)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${s}`);
  }

  /* ---- Save ---- */
  function localizedError(e: unknown) {
    const raw = e instanceof Error ? e.message.replace(/^\d{3}:\s*/, "") : "";
    let code = "";
    try { const b = JSON.parse(raw); code = typeof b?.code === "string" ? b.code : typeof b?.message === "string" ? b.message : ""; } catch { /* plain text */ }
    if (!code) { const m = extractApiErrorMessage(e); if (m && /^[A-Z][A-Z0-9_]+$/.test(m)) code = m; }
    return (code && t(`customerWizard.errors.${code}`, { defaultValue: "" })) || te("saveFailed");
  }
  const issueText = (i: StepIssue) => {
    const fl = (f: string) => tw(`fields.${f}`);
    switch (i.kind) {
      case "required": return tw("issues.required", { field: fl(i.field) });
      case "missing": return tw("issues.missing", { field: fl(i.field) });
      case "billingName": return tw(i.problem === "colon" ? "issues.billingNameColon" : i.problem === "tooLong" ? "issues.billingNameTooLong" : "issues.billingNameRequired");
      case "emailsTooLong": return tw("issues.emailsTooLong");
      case "duplicate": return tw("issues.duplicate");
      case "parentIsSelf": return tw("issues.parentIsSelf");
      case "masterLink": return tw("issues.masterLink");
      case "contactName": return tw("issues.contactName", { n: i.index + 1 });
      case "petCount": return tw("issues.petCount");
    }
  };

  function validate(): StepIssue[] {
    if (!d || !patch) return [];
    const c = patch.customer;
    const touched = (...k: string[]) => k.some(x => Object.hasOwn(c, x));
    const ctx = { master, pm, duplicateBlocking: false, requireActive: activating };
    // Only edited facts are validated, so a legacy value never blocks an unrelated save.
    return [1, 2, 3, 4].flatMap(n => (n === 2 && master ? [] : stepIssues(d, n, ctx))).filter(i => {
      if (activating) return i.kind !== "missing"; // shown as the activation list instead
      if (i.kind === "billingName") return touched("billingName");
      if (i.kind === "emailsTooLong") return touched("billingEmails");
      if (i.kind === "required" && i.field === "billTo") return touched("billToMode", "billStreet", "billStreet2", "billCity", "billState", "billZip");
      if (i.kind === "petCount") return Object.hasOwn(patch.siteNotes, "petStationCount");
      if (i.kind === "parentIsSelf") return touched("isParent", "parentCustomerId");
      return true;
    });
  }

  async function save() {
    if (lock.current || !d || !patch || !dirty) return;
    const found = validate();
    setIssues(found);
    if (found.length || (activating && missing.length)) {
      if (activating && missing.length) document.getElementById("property")?.scrollIntoView?.({ block: "start" });
      return;
    }
    lock.current = true; setSaving(true); setSubmitError(null); setConflict(false); setServerMissing([]);
    const body = { ...patch, expectedUpdatedAt: original.current?.updatedAt };
    try {
      await qboJson("PATCH", `/api/customers/${encodeURIComponent(id)}/setup`, companyId, body);
      if (!alive.current) return;
      void qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && ((q.queryKey[0] as string).startsWith("/api/customers") || q.queryKey[0] === "/api/customer-account-managers") });
      for (const k of ["/api/property-managers", "/api/qbo/customer-reviews", "/api/qbo/customer-reviews/count", "/api/qbo/customer-review-options", "/api/qbo/customers/mapping", "/api/qbo/customers/cache", "/api/qbo/customers/unbound-count"])
        void qc.invalidateQueries({ queryKey: [k] });
      toast({ title: te("saved"), description: qboNote ? te("savedQbo") : undefined });
      leave({ kind: "href", href: returnHref(id, openedHash.current) });
    } catch (e) {
      if (!alive.current) return;
      const act = activationError(e);
      if (act) { setServerMissing(act.missingFields); setSubmitError(tw("result.activation")); }
      else if (/^409:/.test(e instanceof Error ? e.message : "")) setConflict(true);
      else setSubmitError(localizedError(e));
    } finally { lock.current = false; if (alive.current) setSaving(false); }
  }
  async function reload() {
    const r = await setup.refetch();
    if (!alive.current || !r.data) return;
    hydrate(r.data); setConflict(false); setIssues([]); setServerMissing([]); setSubmitError(null);
  }

  if (setup.isError) return (
    <div className="mx-auto max-w-md space-y-3 rounded-md border bg-card p-6" role="alert" data-testid="error-edit-load">
      <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /><span className="font-medium">{tw("loadError")}</span></div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void setup.refetch()} data-testid="button-edit-retry">{tw("retry")}</Button>
        <Button variant="ghost" asChild><Link href={detailHref}>{te("back")}</Link></Button>
      </div>
    </div>
  );
  if (!d || !base) return <EditSkeleton />;

  const qState = card.data ? cardState(card.data) : null;
  const chip = qState ? QBO_CHIP[qState] : null;
  const ChipIcon = chip?.icon;
  const activationBox = d.status === "active" && shownMissing.length > 0 && (activating || advisory) ? (
    <div role={activating ? "alert" : "status"} data-testid={activating ? "notice-activation-blocked" : "notice-activation-advisory"}
      className={`rounded-md border p-3 text-sm ${activating ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/10"}`}>
      <p className={`font-medium ${activating ? "text-destructive" : "text-amber-800 dark:text-amber-300"}`}>{te(activating ? "activationBlocked" : "activationAdvisory")}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="list-activation-missing">
        {shownMissing.map(f => <li key={f} className="rounded-full border bg-background px-2 py-0.5 text-xs" data-testid={`missing-${f}`}>{tw(`fields.${f}`)}</li>)}
      </ul>
      {master && parent && shownMissing.some(f => f === "billingName" || f === "billingEmails" || f === "billTo") &&
        <Link className="mt-2 inline-block text-xs underline" href={`/dashboard/customers/${parent.id}/edit#billing`} data-testid="link-parent-billing">{tw("review.parentIncomplete", { parent: parent.name })}</Link>}
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-[1180px] pb-4" data-testid="page-customer-edit">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{te("eyebrow")}</p>
          <h1 className="truncate text-3xl font-semibold tracking-tight" data-testid="text-edit-title">{name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={(base.status) as "active"} />
            {chip && ChipIcon && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${chip.tone}`} data-testid="chip-qbo-state" data-state={qState ?? ""}>
                <ChipIcon className="h-3 w-3" />{te(`qbo.${qState}`)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cancel} disabled={saving} data-testid="button-cancel-edit">{te("cancel")}</Button>
          <Button onClick={() => void save()} disabled={saving || !dirty} data-testid="button-save-edit">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? te("saving") : te("save")}
          </Button>
        </div>
      </header>

      <nav aria-label={te("sections")} className="sticky top-0 z-10 -mx-1 mt-3 flex gap-2 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur md:hidden" data-testid="edit-nav-chips">
        {EDIT_SECTIONS.map(s => (
          <a key={s} href={`#${s}`} onClick={e => jump(s, e)} aria-current={current === s ? "true" : undefined} data-testid={`chip-section-${s}`}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${current === s ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground"}`}>{tw(`steps.${s}`)}</a>
        ))}
      </nav>

      <div className="mt-6 grid gap-8 md:grid-cols-[170px_minmax(0,960px)]">
        <nav aria-label={te("sections")} className="hidden self-start md:sticky md:top-4 md:block">
          <ol className="space-y-1" data-testid="edit-nav">
            {EDIT_SECTIONS.map(s => (
              <li key={s}>
                <a href={`#${s}`} onClick={e => jump(s, e)} aria-current={current === s ? "true" : undefined} data-testid={`link-section-${s}`}
                  className={`block rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${current === s ? "border-primary bg-primary/10 font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/60"}`}>{tw(`steps.${s}`)}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          {conflict && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="error-conflict">
              <span className="font-medium text-destructive">{tw("errors.STALE")}</span>
              <Button size="sm" variant="outline" onClick={() => void reload()} data-testid="button-reload"><RefreshCw className="mr-1 h-3.5 w-3.5" />{te("reload")}</Button>
            </div>
          )}
          {issues.length > 0 && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="errors-save">
              <p className="mb-1 font-medium text-destructive">{tw("fixBelow")}</p>
              <ul className="list-disc space-y-0.5 pl-5">{issues.map((i, n) => <li key={n} data-testid={`issue-${i.kind}`}>{issueText(i)}</li>)}</ul>
            </div>
          )}
          {submitError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive" data-testid="error-submit">{submitError}</p>}

          <PropertySection d={d} patch={patchDraft} tw={tw} parentChoices={parentChoices} parentsLoading={parents.isLoading}
            mode="edit" needed={needed} framed id="property" testId="edit-section-property" top={activationBox}
            managementFields={<ManagementFields d={d} patch={patchDraft} tw={tw} pmCompanies={pmCompanies} managers={managers.data ?? []} />} />
          {master ? (
            <section id="billing" className="scroll-mt-24 space-y-2 rounded-lg border bg-card p-5 shadow-sm md:p-6" data-testid="edit-section-billing">
              <h2 className="text-xl font-semibold tracking-tight">{tw("billing.heading")}</h2>
              <p className="text-sm" data-testid="text-master-billing">{tw("billing.masterSkip", { parent: parent?.name ?? "" })}</p>
              {parent && <Link href={`/dashboard/customers/${parent.id}/edit#billing`} className="text-sm underline" data-testid="link-edit-parent-billing">{te("editParentBilling", { parent: parent.name })}</Link>}
              {preview.state !== "loading" && <p className="text-sm text-muted-foreground" data-testid="text-billto-preview">{tw("billing.previewLabel")} {preview.state === "ok" ? preview.billTo.lines.join(", ") : tw("billing.previewParentIncomplete", { parent: parent?.name ?? "" })}</p>}
            </section>
          ) : (
            <BillingSection d={d} setD={setDraft} patch={patchDraft} tw={tw} pm={pm} pmCompanies={pmCompanies} managers={managers.data ?? []}
              billingName={d.billingNameTouched ? d.billingName : ""} billingNamePlaceholder={d.name} alreadyLinked={linked} dupInfo={null}
              terms={terms} termDefaulted={false} preview={preview} mode="edit" needed={needed} framed id="billing" testId="edit-section-billing" />
          )}
          <ContactsSection d={d} setD={setDraft} tw={tw} manager={manager} master={master} mode="edit" framed id="contacts" testId="edit-section-contacts" />
          <SiteSection d={d} setD={setDraft} tw={tw} framed id="site" testId="edit-section-site" />
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-0 z-20 mt-6 border-t bg-background/95 py-3 backdrop-blur animate-in slide-in-from-bottom-2 duration-200" data-testid="bar-unsaved">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium" data-testid="text-unsaved">{te("unsaved")}</p>
              {qboNote && <p className="text-xs text-muted-foreground" data-testid="text-qbo-send-note">{te("qboNote")}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={discard} disabled={saving} data-testid="button-discard">{te("discard")}</Button>
              <Button onClick={() => void save()} disabled={saving} data-testid="button-save-bar">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? te("saving") : te("save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={o => { if (!o) stay(); }}>
        <AlertDialogContent data-testid="dialog-confirm-leave">
          <AlertDialogHeader>
            <AlertDialogTitle>{te("leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{te("leaveBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={stay} data-testid="button-stay">{te("stay")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => leave(pending)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-leave">{te("leave")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const QBO_CHIP = {
  linked: { icon: CheckCircle2, tone: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400" },
  via_parent: { icon: GitBranch, tone: "border-sky-600/30 text-sky-700 dark:text-sky-400" },
  collision: { icon: AlertTriangle, tone: "border-amber-600/40 text-amber-700 dark:text-amber-400" },
  error: { icon: AlertTriangle, tone: "border-destructive/40 text-destructive" },
  waiting: { icon: Clock, tone: "border-amber-600/40 text-amber-700 dark:text-amber-400" },
  not_linked: { icon: CircleDashed, tone: "text-muted-foreground" },
} as const;
