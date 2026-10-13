import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { uploadContractFile, validateContractFile } from "@/lib/contractUpload";
import { amberBox, LineBadge } from "@/components/contracts/ContractBadges";
import { ContractFileInput, TERM_UPLOAD_OPTIONS } from "@/components/contracts/ContractUploadButton";
import { RatesEditor } from "@/components/contracts/RatesEditor";
import { ScopeEditor } from "@/components/contracts/ScopeEditor";
import { PaymentEditor, TM_TEXT } from "@/components/contracts/PaymentEditor";
import { coloradoToday, dateOnly, errorText, money } from "@/components/contracts/contractFormat";
import type { AgreementLine, ContractDetail } from "@/components/contracts/contractTypes";
import type { RateCardItem } from "@/components/contracts/rateCardUtils";
import {
  applyScopePreset, blankPerContractRates, clearDraft, createBody, defaultDates, ensurePayments, hasLandscape, hasSnow, initialRates,
  initialScope, loadDraft, newDraft, needsPayments, reviewRows, saveDraft, sessionKey, setDates, setLine, stepProblems,
} from "@/components/contracts/newContractDraft";
import type { NewContractDraft, ScopePreset } from "@/components/contracts/newContractDraft";
import { startMonthOf } from "@/components/contracts/paymentDraft";

const STEPS = ["Customer and type", "Term and contacts", "Scope", "Rates", "Payments", "Review and create"];
interface CustomerLite {
  id: string; companyId?: string; name: string; isParent?: string | boolean | null; street?: string | null; city?: string | null; state?: string | null; zip?: string | null;
  managementCompany?: string | null; propertyManagementCompanyId?: string | null;
}
interface ContactLite { name: string; phones?: string[] | null; emails?: string[] | null; isPrimary?: string | boolean | null }
const isParentCustomer = (c: CustomerLite) => c.isParent === "true" || c.isParent === true;
const pick = (on: boolean) => `rounded-md border p-4 text-left transition-colors ${on ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`;

function Field(props: { label: string; value: string; onChange: (v: string) => void; id: string; type?: string }) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <Input type={props.type} value={props.value} onChange={e => props.onChange(e.target.value)} data-testid={`input-${props.id}`} />
    </label>
  );
}

export default function NewContractPage() {
  const { user } = useAuth();
  if (!user) return <div className="space-y-3" data-testid="loading-new-contract"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
  const key = sessionKey(user.activeCompanyId, user.id);
  // Keyed by company and login, so drafts, files and in-flight state never cross identities.
  return <NewContractBody key={key} companyId={user.activeCompanyId} userId={user.id} storageKey={key} />;
}

function NewContractBody({ companyId, userId, storageKey }: { companyId: string; userId: string; storageKey: string }) {
  const today = coloradoToday();
  const [d, setD] = useState<NewContractDraft>(() => { const s = loadDraft(storageKey); return s ? { ...s, step: s.created ? 6 : s.step } : newDraft(today); });
  const [errors, setErrors] = useState<string[]>([]);
  const [showLineErrors, setShowLineErrors] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadFailed, setUploadFailed] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaveAction, setLeaveAction] = useState<"reset" | "cancel" | "open" | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const scoped = ["/api/customers", companyId, userId] as const;

  useEffect(() => { saveDraft(storageKey, d); }, [storageKey, d]);
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    if (!file) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [file]);

  const prefillId = useMemo(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("customerId"), []);
  const fetchJson = async (url: string) => (await apiRequest("GET", url)).json();
  const results = useQuery<{ customers: CustomerLite[] }>({
    queryKey: [...scoped, "contract-new-search", debounced], enabled: debounced.length > 1, retry: false,
    queryFn: () => fetchJson(`/api/customers?limit=20&search=${encodeURIComponent(debounced)}`),
  });
  const pms = useQuery<{ id: string; name: string }[]>({ queryKey: [...scoped, "pm-companies"], retry: false,
    queryFn: () => fetchJson("/api/property-management-companies") });
  const rateCard = useQuery<RateCardItem[]>({ queryKey: ["/api/contract-center/rate-card", companyId, userId, "new-contract"], retry: false,
    queryFn: () => fetchJson("/api/contract-center/rate-card") });
  const prefill = useQuery<CustomerLite>({ queryKey: [...scoped, "contract-prefill", prefillId ?? "none"], enabled: !!prefillId && !d.customerId && !d.created, retry: false,
    queryFn: () => fetchJson(`/api/customers/${prefillId}`) });
  // A customer id from the draft is never trusted; it is re-read from the server.
  const customerQ = useQuery<CustomerLite>({ queryKey: [...scoped, "contract-verify", d.customerId], enabled: !!d.customerId && !d.created, retry: false,
    queryFn: () => fetchJson(`/api/customers/${d.customerId}`) });
  const customerOk = (c: CustomerLite | undefined): c is CustomerLite => !!c && c.companyId === companyId && !isParentCustomer(c);
  const verified = customerOk(customerQ.data) && customerQ.data.id === d.customerId ? customerQ.data : null;
  const contactsQ = useQuery<ContactLite[]>({ queryKey: [...scoped, d.customerId, "contacts"], enabled: !!verified && !d.created, retry: false,
    queryFn: () => fetchJson(`/api/customers/${d.customerId}/contacts`) });

  const patch = (p: Partial<NewContractDraft>) => setD(cur => ({ ...cur, ...p }));
  const applied = useRef<{ contacts: string | null; agent: string | null }>({ contacts: null, agent: null });
  function chooseCustomer(c: CustomerLite) {
    if (!customerOk(c)) { setErrors([isParentCustomer(c) ? "Parent customers can't be picked. Choose one of its child customers." : "That customer isn't in this company."]); return; }
    const address = [c.street, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ").trim();
    applied.current = { contacts: null, agent: null };
    setErrors([]); setSearch("");
    setD(cur => ({ ...cur, customerId: c.id, customerName: c.name, managingAgentName: c.managementCompany ?? "", propertyManagementCompanyId: c.propertyManagementCompanyId ?? null,
      legalName: c.name, projectAddress: address, projectContact: "", contactPhone: "", contactEmail: "" }));
  }
  // Late contact and management-company data only fills fields the user has left empty.
  useEffect(() => {
    if (!verified || !contactsQ.data || applied.current.contacts === verified.id) return;
    applied.current.contacts = verified.id;
    const primary = contactsQ.data.find(c => c.isPrimary === "true" || c.isPrimary === true);
    if (!primary) return;
    setD(cur => cur.customerId !== verified.id ? cur : ({ ...cur,
      projectContact: cur.projectContact || primary.name || "", contactPhone: cur.contactPhone || primary.phones?.[0] || "",
      contactEmail: cur.contactEmail || primary.emails?.[0] || "" }));
  }, [verified, contactsQ.data]);
  useEffect(() => {
    if (!verified || !pms.data || applied.current.agent === verified.id) return;
    applied.current.agent = verified.id;
    const name = pms.data.find(p => p.id === verified.propertyManagementCompanyId)?.name;
    if (name) setD(cur => cur.customerId !== verified.id || cur.managingAgentName ? cur : { ...cur, managingAgentName: name });
  }, [verified, pms.data]);
  useEffect(() => {
    if (customerQ.data && !customerOk(customerQ.data)) {
      setErrors([isParentCustomer(customerQ.data) ? "Parent customers can't be picked. Choose one of its child customers." : "That customer isn't in this company."]);
      setD(cur => ({ ...cur, customerId: "", customerName: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQ.data]);
  useEffect(() => {
    if (customerQ.isError && customerQ.error && /^404/.test(customerQ.error instanceof Error ? customerQ.error.message : "")) {
      setErrors(["That customer could not be found."]); setD(cur => ({ ...cur, customerId: "", customerName: "" }));
    }
  }, [customerQ.isError, customerQ.error]);
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefill.data && !prefilled.current && !d.customerId) { prefilled.current = true; chooseCustomer(prefill.data); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill.data]);

  const line = d.line as AgreementLine;
  const scopeRows = d.scope ?? (d.line ? initialScope(line) : []);
  const rateRows = d.rates ?? (d.line && rateCard.data ? initialRates(rateCard.data, line) : []);
  const payLines = d.payments ?? [];

  const ratesReady = !!d.rates || rateCard.isSuccess;
    function go(step: number) {
    setErrors([]); setShowLineErrors(false);
    setD(cur => {
      const next = { ...cur, step };
      if (step === 3 && !cur.scope && cur.line) next.scope = initialScope(cur.line);
      if (step === 4 && !cur.rates && cur.line && rateCard.data) next.rates = initialRates(rateCard.data, cur.line);
      if (step === 5) next.payments = ensurePayments(cur);
      return next;
    });
  }
  function gate(step: number): string[] {
    const problems = stepProblems(d, step);
    if (step === 1 && d.customerId) {
      if (customerQ.isLoading) problems.push("Checking the customer, try again in a moment");
      else if (customerQ.isError) problems.push("The customer could not be verified. Retry the check.");
      else if (!verified) problems.push("Choose a customer from this company");
    }
    if (step === 4 && !ratesReady) problems.push(rateCard.isError ? "The rate card did not load. Retry before continuing." : "The rate card is still loading");
    return problems;
  }
  function next() {
    const problems = gate(d.step);
    if (problems.length) { setErrors(problems); setShowLineErrors(d.step === 5); return; }
    go(d.step + 1);
  }

  async function create() {
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true); setSubmitError(null); setUploadFailed(null);
    try {
      let created = d.created;
      if (!created) {
        const problems = [1, 2, 3, 4, 5].flatMap(gate);
        if (problems.length) { setErrors(problems); return; }
        const res = await apiRequest("POST", "/api/contract-center/contracts", createBody({ ...d, scope: scopeRows, rates: rateRows }));
        const detail = (await res.json()) as ContractDetail;
        created = { agreementId: detail.id, termId: detail.terms[detail.terms.length - 1].id };
        // Persist the marker before anything else so a reload can never create a second contract.
        saveDraft(storageKey, { ...d, created, step: 6 });
        setD(cur => ({ ...cur, created, step: 6 }));
      }
      if (d.form === "theirs" && file) {
        try {
          await uploadContractFile({ file, uploadUrlPath: `/api/contract-center/terms/${created.termId}/documents/upload-url`,
            registerPath: `/api/contract-center/terms/${created.termId}/documents`, extraBody: { kind: "their_form" },
            options: { ...TERM_UPLOAD_OPTIONS, putContentType: file.type || "application/octet-stream" } });
        } catch (e) { setUploadFailed(errorText(e)); return; }
      }
      finish(created.agreementId);
    } catch (e) { setSubmitError(errorText(e)); }
    finally { lock.current = false; setSubmitting(false); }
  }
  function finish(agreementId: string) {
    clearDraft(storageKey);
    setFile(null);
    void qc.invalidateQueries({ queryKey: ["/api/contract-center/contracts"] });
    toast({ title: "Draft created" });
    navigate(`/dashboard/contracts/${agreementId}`);
  }
  function reset() {
    clearDraft(storageKey); setD(newDraft(today)); setErrors([]); setFile(null); setUploadFailed(null); setSubmitError(null);
    applied.current = { contacts: null, agent: null };
  }
  function leave(action: "reset" | "cancel" | "open", confirmed = false) {
    if (file && !confirmed) { setLeaveAction(action); return; }
    setLeaveAction(null);
    if (action === "reset") reset();
    if (action === "cancel") navigate("/dashboard/contracts");
    if (action === "open" && d.created) finish(d.created.agreementId);
  }

  const review = reviewRows(d);
  const flat = hasSnow(d.line) && d.snowPricing === "flat_rate";

  return (
    <div className="space-y-6 max-w-4xl" data-testid="page-new-contract">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">New contract</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => leave("reset")} disabled={submitting || !!d.created} data-testid="button-start-over">Start over</Button>
          <Button variant="outline" size="sm" asChild><Link href="/dashboard/contracts" onClick={e => { e.preventDefault(); if (!submitting) leave("cancel"); }} data-testid="link-cancel-new">Cancel</Link></Button>
        </div>
      </header>
      {leaveAction && (
        <div className="rounded-md border p-3 text-sm space-y-2" role="alert" style={amberBox} data-testid="confirm-file-leave">
          <p>The selected file has not been uploaded. Leave and lose the selected file?</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => leave(leaveAction, true)} data-testid="button-confirm-file-leave">Discard selected file</Button>
            <Button size="sm" variant="outline" onClick={() => setLeaveAction(null)}>Keep editing</Button>
          </div>
        </div>
      )}
      <ol className="flex flex-wrap gap-2 text-xs" data-testid="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full border px-3 py-1 ${d.step === i + 1 ? "bg-primary text-primary-foreground" : i + 1 < d.step ? "bg-muted" : "text-muted-foreground"}`}
            data-testid={`step-${i + 1}`} aria-current={d.step === i + 1 ? "step" : undefined}>{i + 1}. {s}</li>
        ))}
      </ol>
      {errors.length > 0 && (
        <ul className="rounded-md border border-destructive/40 p-3 text-sm space-y-1" data-testid="errors-step">
          {errors.map(e => <li key={e} className="text-destructive">{e}</li>)}
        </ul>
      )}

      {d.step === 1 && (
        <section className="space-y-5" data-testid="step-body-1">
          <div className="space-y-2">
            <h2 className="font-medium">Customer</h2>
            {d.customerId ? (
              <div className="flex items-center gap-3 text-sm" data-testid="selected-customer">
                <span className="font-medium" data-testid="text-selected-customer">{verified?.name ?? d.customerName}</span>
                {customerQ.isLoading && <span className="text-xs text-muted-foreground">Checking...</span>}
                {customerQ.isError && <span className="text-xs text-destructive" data-testid="error-verify-customer">Could not verify. <button type="button" className="underline" onClick={() => void customerQ.refetch()}>Retry</button></span>}
                <Button size="sm" variant="outline" disabled={!!d.created} onClick={() => patch({ customerId: "", customerName: "" })} data-testid="button-change-customer">Change</Button>
              </div>
            ) : (
              <>
                <Input placeholder="Search customers" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-customer-search" />
                {prefill.isLoading && !!prefillId && <p className="text-xs text-muted-foreground">Loading customer...</p>}
                {prefill.isError && !!prefillId && <p className="text-xs text-destructive" data-testid="error-prefill-customer">This customer is unavailable in this company. Choose another customer.</p>}
                {results.isLoading && <p className="text-xs text-muted-foreground" data-testid="loading-customers">Searching...</p>}
                {results.isError && <p className="text-xs text-destructive" data-testid="error-customers">Search failed. <button className="underline" onClick={() => void results.refetch()}>Retry</button></p>}
                {results.data && (
                  <ul className="rounded-md border divide-y max-h-60 overflow-y-auto" data-testid="list-customers">
                    {results.data.customers.filter(c => c.companyId === companyId).length === 0 && <li className="p-3 text-sm text-muted-foreground" data-testid="empty-customers">No customers match.</li>}
                    {results.data.customers.filter(c => c.companyId === companyId).map(c => (
                      <li key={c.id}>
                        <button type="button" className="w-full text-left p-2 text-sm hover:bg-muted/50 disabled:opacity-50" disabled={isParentCustomer(c)}
                          onClick={() => chooseCustomer(c)} data-testid={`option-customer-${c.id}`}>
                          {c.name}{isParentCustomer(c) && <span className="text-xs text-muted-foreground"> (parent, pick a child)</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="space-y-2">
            <h2 className="font-medium">Type</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {([["landscape", "Landscape", "Grounds, irrigation"], ["snow", "Snow", "Snow removal only"], ["both", "Both", "Landscape and snow"]] as const).map(([k, t, sub]) => (
                <button key={k} type="button" className={pick(d.line === k)} disabled={!!d.created} aria-pressed={d.line === k}
                  onClick={() => setD(cur => setLine(cur, k, today))} data-testid={`card-type-${k}`}>
                  <div className="font-medium">{t}</div><div className="text-xs text-muted-foreground">{sub}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="font-medium">Form</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {([["ours", "Our form", "Contract document generation arrives in the next phase"], ["theirs", "Their form", "Upload the management company's contract"]] as const).map(([k, t, sub]) => (
                <button key={k} type="button" className={pick(d.form === k)} disabled={!!d.created} aria-pressed={d.form === k}
                  onClick={() => patch({ form: k })} data-testid={`card-form-${k}`}>
                  <div className="font-medium">{t}</div><div className="text-xs text-muted-foreground">{sub}</div>
                </button>
              ))}
            </div>
          </div>
          {hasSnow(d.line) && (
            <div className="space-y-2" data-testid="snow-pricing">
              <h2 className="font-medium">Snow pricing</h2>
              <div className="flex flex-wrap gap-2">
                {([["time_and_materials", "Time and materials"], ["flat_rate", "Flat rate"]] as const).map(([k, t]) => (
                  <Button key={k} type="button" variant={d.snowPricing === k ? "default" : "outline"} aria-pressed={d.snowPricing === k}
                    onClick={() => patch({ snowPricing: k })} data-testid={`button-snow-${k}`}>{t}</Button>
                ))}
              </div>
              {d.snowPricing === "flat_rate" && (
                <label className="space-y-1 block max-w-xs">
                  <span className="text-xs text-muted-foreground">Flat snow price (dollars)</span>
                  <Input inputMode="decimal" value={d.flatPrice} onChange={e => patch({ flatPrice: e.target.value })} data-testid="input-flat-price" />
                </label>
              )}
            </div>
          )}
          <Field id="managing-agent" label="Managing agent" value={d.managingAgentName} onChange={v => patch({ managingAgentName: v })} />
        </section>
      )}

      {d.step === 2 && (
        <section className="space-y-4" data-testid="step-body-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="start-date" type="date" label="Start date" value={d.startDate} onChange={v => setD(cur => setDates(cur, { startDate: v }))} />
            <Field id="end-date" type="date" label="End date" value={d.endDate} onChange={v => setD(cur => setDates(cur, { endDate: v }))} />
            <Field id="season-label" label="Season label" value={d.seasonLabel} onChange={v => patch({ seasonLabel: v, seasonEdited: true })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="legal-name" label="Legal name" value={d.legalName} onChange={v => patch({ legalName: v })} />
            <Field id="project-contact" label="Project contact" value={d.projectContact} onChange={v => patch({ projectContact: v })} />
            <Field id="contact-phone" label="Phone" value={d.contactPhone} onChange={v => patch({ contactPhone: v })} />
            <Field id="contact-email" label="Email" value={d.contactEmail} onChange={v => patch({ contactEmail: v })} />
            <Field id="project-address" label="Address" value={d.projectAddress} onChange={v => patch({ projectAddress: v })} />
            <Field id="po" label="PO" value={d.po} onChange={v => patch({ po: v })} />
          </div>
          <label className="space-y-1 block"><span className="text-xs text-muted-foreground">Notes</span>
            <Textarea value={d.notes} onChange={e => patch({ notes: e.target.value })} data-testid="input-notes" /></label>
          {hasSnow(d.line) && (
            <label className="space-y-1 block"><span className="text-xs text-muted-foreground">Snow triggers</span>
              <Textarea value={d.snowTriggers} onChange={e => patch({ snowTriggers: e.target.value })} data-testid="input-snow-triggers" /></label>
          )}
          <Button type="button" variant="ghost" size="sm" data-testid="button-reset-dates"
            onClick={() => setD(cur => { const x = defaultDates(cur.line, today); return setDates(cur, x); })}>Use default dates</Button>
        </section>
      )}

      {d.step === 3 && (
        <section className="space-y-3" data-testid="step-body-3">
          <div className="flex flex-wrap gap-2">
            {([["hoa", "Full HOA landscape"], ["snow", "Standard snow"], ["clear", "Clear all"]] as [ScopePreset, string][]).map(([k, t]) => (
              <Button key={k} type="button" size="sm" variant="outline" data-testid={`button-scope-${k}`}
                disabled={(k === "hoa" && !hasLandscape(d.line)) || (k === "snow" && !hasSnow(d.line))}
                onClick={() => patch({ scope: applyScopePreset(scopeRows, k) })}>{t}</Button>
            ))}
          </div>
          <ScopeEditor line={line} rows={scopeRows} editing onChange={rows => patch({ scope: rows })}
            snowTriggers={d.snowTriggers} onSnowTriggers={v => patch({ snowTriggers: v })} />
        </section>
      )}

      {d.step === 4 && (
        <section className="space-y-3" data-testid="step-body-4">
          {rateCard.isLoading && <p className="text-sm text-muted-foreground" data-testid="loading-rates">Loading the rate card...</p>}
          {rateCard.isError && <p className="text-sm text-destructive" data-testid="error-rates">The rate card did not load. <button className="underline" onClick={() => void rateCard.refetch()}>Retry</button></p>}
          {blankPerContractRates(rateRows).length > 0 && (
            <div className="rounded-md p-3 text-sm space-y-1" style={amberBox} data-testid="note-blank-rates">
              {blankPerContractRates(rateRows).map(r => <div key={r.rateKey}>{r.label}: No standard; enter this client's rate or leave blank.</div>)}
            </div>
          )}
          <RatesEditor line={line} rows={rateRows} editing onChange={rows => patch({ rates: rows })} />
        </section>
      )}

      {d.step === 5 && (
        <section className="space-y-3" data-testid="step-body-5">
          {needsPayments(d)
            ? <PaymentEditor lines={payLines} onChange={l => patch({ payments: l })} startMonth={startMonthOf(d.startDate)} flatSnowAllowed={flat} errors={showLineErrors} />
            : <p className="text-sm rounded-md border p-3" data-testid="text-time-and-materials">{TM_TEXT}</p>}
        </section>
      )}

      {d.step === 6 && (
        <section className="space-y-4" data-testid="step-body-6">
          <table className="w-full text-sm" data-testid="table-review"><tbody className="divide-y">
            <tr><th className="text-left p-2 w-44">Customer</th><td data-testid="review-customer">{d.customerName}</td></tr>
            <tr><th className="text-left p-2">Type</th><td><LineBadge line={line} /></td></tr>
            <tr><th className="text-left p-2">Form</th><td>{d.form === "ours" ? "Our form" : "Their form"}</td></tr>
            <tr><th className="text-left p-2">Dates</th><td data-testid="review-dates">{d.seasonLabel}, {dateOnly(d.startDate)} to {dateOnly(d.endDate)}</td></tr>
            {review.annual !== null && (
              <tr><th className="text-left p-2">Annual price</th><td className="tabular-nums" data-testid="review-annual">{money(review.annual)}{review.monthly !== null && <span className="text-muted-foreground"> ({money(review.monthly)} a month)</span>}</td></tr>
            )}
            {hasSnow(d.line) && <tr><th className="text-left p-2">Snow pricing</th><td data-testid="review-snow">{flat ? `Flat rate, included in the annual price` : TM_TEXT}</td></tr>}
            <tr><th className="text-left p-2">Services on</th><td data-testid="review-services">{review.services.join(", ") || "None"}</td></tr>
            <tr><th className="text-left p-2">Changed or custom rates</th><td data-testid="review-rates">
              {review.changedRates.length ? review.changedRates.map(r => `${r.label}${r.custom ? " (custom)" : ""}${r.input ? ` $${r.input}` : ""}`).join(", ") : "None"}</td></tr>
          </tbody></table>
          {d.form === "theirs" && (
            <div className="rounded-md border p-3 space-y-2" data-testid="box-their-form">
              <div className="text-sm font-medium">Management company's contract</div>
              <ContractFileInput ref={fileInput} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" data-testid="input-their-form"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && validateContractFile(f, TERM_UPLOAD_OPTIONS)) { setSubmitError("That file type or size is not allowed"); setFile(null); return; }
                  setSubmitError(null); setFile(f);
                }} />
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()} data-testid="button-choose-their-form">Choose file</Button>
                <span className="text-xs text-muted-foreground" data-testid="text-their-form-file">{file ? file.name : "No file chosen. It uploads right after the contract is created."}</span>
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground" data-testid="note-generation">Contract document generation arrives in the next phase.</p>
          {submitError && <p className="text-sm text-destructive" data-testid="error-create">{submitError}</p>}
          {d.created && (
            <div className="rounded-md p-3 text-sm space-y-2" style={amberBox} data-testid="upload-recovery">
              <p>{uploadFailed ? `The contract was created, but the file did not upload: ${uploadFailed}` : "This contract was already created. It will not be created again."}</p>
              <div className="flex flex-wrap gap-2">
                {d.form === "theirs" && <Button size="sm" onClick={() => void create()} disabled={submitting || !file} data-testid="button-retry-upload">Upload file</Button>}
                <Button size="sm" variant="outline" disabled={submitting} onClick={() => leave("open")} data-testid="button-open-without-file">Open contract{d.form === "theirs" ? " without file" : ""}</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {!d.created && (
        <footer className="flex justify-between border-t pt-4">
          <Button variant="outline" disabled={d.step === 1 || submitting} onClick={() => go(d.step - 1)} data-testid="button-back">Back</Button>
          {d.step < 6
            ? <Button onClick={next} data-testid="button-next">Next</Button>
            : <Button onClick={() => void create()} disabled={submitting} data-testid="button-create-contract">
              {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Create contract</Button>}
        </footer>
      )}
    </div>
  );
}
