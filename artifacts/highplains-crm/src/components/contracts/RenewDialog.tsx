import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { dateOnly, errorText, money } from "./contractFormat";
import { selectRenewalSource, termForm, termLine } from "./contractTypes";
import type { AgreementForm, AgreementLine, ContractDetail } from "./contractTypes";
import { PaymentEditor } from "./PaymentEditor";
import { linesFromPayments, startMonthOf } from "./paymentDraft";
import { parseDollarsToCents } from "./rateCardUtils";
import { FORM_NAME, LINE_NAME, changeNotes, createSequencer, parsePct, previewKey, renewBody, spanLabel, sumMonths, visibleRateChanges } from "./renewPreview";
import type { PriceMode, RenewPreview, RoundTo } from "./renewPreview";

export const RENEW_NOTE = "Change services, rates and payments on the new draft before sending.";
const rateText = (v: { priceCents: number | null; priceText: string | null }) => (v.priceCents != null ? money(v.priceCents) : v.priceText || "No price");

function Choice<T extends string>({ value, options, onChange, disabled, testId }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean; testId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([k, label]) => (
        <Button key={k} type="button" size="sm" variant={value === k ? "default" : "outline"} aria-pressed={value === k}
          disabled={disabled} onClick={() => onChange(k)} data-testid={`${testId}-${k}`}>{label}</Button>
      ))}
    </div>
  );
}
const Section = ({ title, children, testId }: { title: string; children: ReactNode; testId: string }) => (
  <section className="space-y-2 rounded-md border p-3" data-testid={testId}>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </section>
);

export function RenewDialog(props: { target: { id: string; customerName: string } | null; onClose: () => void; onCreated?: (termId: string) => void }) {
  const { target, onClose } = props;
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto" data-testid="dialog-renew"
        onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }}>
        {target && <RenewBody key={target.id} target={target} onClose={onClose} onBusy={setBusy} onCreated={props.onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function RenewBody({ target, onClose, onBusy, onCreated }: { target: { id: string; customerName: string }; onClose: () => void; onBusy: (b: boolean) => void; onCreated?: (termId: string) => void }) {
  const [mode, setMode] = useState<PriceMode>("pct");
  const [pctText, setPctText] = useState("3");
  const [targetText, setTargetText] = useState("");
  const [roundTo, setRoundTo] = useState<RoundTo>("dollar");
  const [length, setLength] = useState(1);
  const [laterText, setLaterText] = useState<(string | null)[]>([]); // null = follow the default
  const [line, setLine] = useState<AgreementLine | null>(null);
  const [form, setForm] = useState<AgreementForm | null>(null);
  const [rates, setRates] = useState<"carry" | "card" | null>(null);
  const [scope, setScope] = useState<"carry" | "standard">("carry");
  const [preview, setPreview] = useState<{ key: string; body: Record<string, unknown>; data: RenewPreview } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const committing = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const seq = useRef(createSequencer());
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const base = `/api/contract-center/contracts/${target.id}`;
  const url = `${base}/renew`;

  // Defaults come from the season Renew starts from (the last eligible one), not the displayed current season.
  const detailQ = useQuery<ContractDetail>({ queryKey: ["/api/contract-center/contracts", target.id], queryFn: async () => (await apiRequest("GET", base)).json(), retry: false });
  const srcTerm = detailQ.data ? selectRenewalSource(detailQ.data.terms) : undefined;
  // The server's explicit preview.source wins; the fetched detail fills in before the first preview arrives.
  const source: { line: AgreementLine; form: AgreementForm } | null = preview?.data.source
    ?? (detailQ.data ? { line: termLine(srcTerm, detailQ.data.line), form: termForm(srcTerm, detailQ.data.form) } : null);
  const effLine = line ?? source?.line ?? null;
  const effForm = form ?? source?.form ?? null;
  const effRates = rates ?? (source && effForm === "ours" && source.form !== "ours" ? "card" : "carry");

  const pct = parsePct(pctText);
  const targetCents = parseDollarsToCents(targetText);
  const laterDefault = mode === "pct" && pct !== null ? String(pct) : "3";
  const laterPcts = Array.from({ length: length - 1 }, (_, i) => parsePct(laterText[i] ?? laterDefault));
  const body = renewBody({
    mode, pct, targetCents: targetCents !== null && targetCents >= 0 ? targetCents : null, roundTo, laterPcts,
    line: line && source && line === source.line ? null : line, form: form && source && form === source.form ? null : form,
    rates, scope,
  });
  const currentKey = body ? previewKey(body) : null;

  useEffect(() => {
    if (!body) { seq.current.cancel(); setLoading(false); setError(null); return; }
    setLoading(true);
    const id = seq.current.next();
    const sent = body;
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest("POST", url, { ...sent, dryRun: true });
        const data = (await res.json()) as RenewPreview;
        if (!seq.current.isCurrent(id)) return;
        setPreview({ key: previewKey(sent), body: sent, data }); setError(null); setLoading(false);
      } catch (e) {
        if (!seq.current.isCurrent(id)) return;
        setError(errorText(e)); setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); seq.current.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, url, attempt]);

  const fresh = preview && preview.key === currentKey ? preview.data : null;
  const shown = fresh ?? preview?.data ?? null;
  const rc = shown ? visibleRateChanges(shown.rateChanges) : null;
  const years = shown?.years?.length ? shown.years : shown ? [{ seasonLabel: shown.seasonLabel, startDate: shown.startDate, endDate: shown.endDate, annualPriceCents: shown.annualPriceCents ?? null }] : [];
  const notes = source && effLine && effForm ? changeNotes(source, { line: effLine, form: effForm }) : [];
  const label = years.length > 1 ? `Create ${years.length}-year draft (${spanLabel(years[0].seasonLabel, years[years.length - 1].seasonLabel)})`
    : `Create ${shown?.seasonLabel ?? "next season"} draft`;

  const touch = () => seq.current.cancel();
  function pickForm(v: AgreementForm) { touch(); setForm(v); if (source && v === "ours" && source.form !== "ours") setRates("card"); else if (rates === "card" && source && v === source.form) setRates(null); }
  function pickLength(n: number) { touch(); setLength(n); setLaterText(t => t.slice(0, n - 1)); }

  async function create() {
    if (committing.current || !preview || preview.key !== currentKey || loading || error || creating) return;
    committing.current = true; onBusy(true);
    seq.current.cancel(); setCreating(true);
    const { body: sent, data } = preview;
    try {
      const res = await apiRequest("POST", url, sent);
      const detail = (await res.json()) as ContractDetail;
      await qc.invalidateQueries({ queryKey: ["/api/contract-center/contracts"] });
      const termId = detail.renewalDraftId ?? detail.terms[detail.terms.length - 1]?.id;
      const n = data.years?.length ?? 1;
      toast({ title: n > 1 ? `${n}-year renewal drafted` : `${data.seasonLabel} draft created` });
      onBusy(false); onClose();
      if (onCreated && termId) onCreated(termId);
      else navigate(`/dashboard/contracts/${target.id}${termId ? `#term-${termId}` : ""}`);
    } catch (e) {
      setError(errorText(e)); setCreating(false); onBusy(false); committing.current = false;
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Renew {target.customerName}</DialogTitle>
        <DialogDescription>Pick the price, term and coverage. Nothing is saved until you create the draft.</DialogDescription>
      </DialogHeader>

      <Section title="Price" testId="renew-section-price">
        <Choice value={mode} disabled={creating} testId="button-price-mode" onChange={v => { touch(); setMode(v); }}
          options={[["pct", "Increase by %"], ["target", "New annual price"]] as const} />
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === "pct" ? (
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Increase %</span>
              <Input inputMode="decimal" value={pctText} disabled={creating} onChange={e => { touch(); setPctText(e.target.value); }} aria-invalid={pct === null} data-testid="input-increase-pct" />
              {pct === null && <span className="text-xs text-destructive" data-testid="error-increase-pct">Enter a number from -50 to 100</span>}
            </label>
          ) : (
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">New annual price $</span>
              <Input inputMode="decimal" value={targetText} disabled={creating} placeholder="31,500" onChange={e => { touch(); setTargetText(e.target.value); }} aria-invalid={targetCents === null} data-testid="input-target-price" />
              {targetCents === null && <span className="text-xs text-destructive" data-testid="error-target-price">Enter the new yearly price</span>}
            </label>
          )}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Round to</span>
            <Choice value={roundTo} disabled={creating} testId="button-round" onChange={v => { touch(); setRoundTo(v); }}
              options={[["dollar", "Whole dollar"], ["twelve", "Divides evenly by 12"]] as const} />
          </div>
        </div>
      </Section>

      <Section title="Term" testId="renew-section-term">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Length</span>
          {[1, 2, 3, 4, 5].map(n => (
            <Button key={n} type="button" size="sm" variant={length === n ? "default" : "outline"} aria-pressed={length === n} disabled={creating}
              onClick={() => pickLength(n)} data-testid={`button-length-${n}`}>{n} {n === 1 ? "year" : "years"}</Button>
          ))}
        </div>
        {length > 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {laterPcts.map((p, i) => (
              <label key={i} className="space-y-1">
                <span className="text-xs text-muted-foreground">Increase for year {i + 2} %</span>
                <Input inputMode="decimal" disabled={creating} value={laterText[i] ?? laterDefault} aria-invalid={p === null} data-testid={`input-year-pct-${i + 2}`}
                  onChange={e => { touch(); const v = e.target.value; setLaterText(t => { const n = [...t]; while (n.length < i) n.push(null); n[i] = v; return n; }); }} />
                {p === null && <span className="text-xs text-destructive">Enter a number from -50 to 100</span>}
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section title="Contract" testId="renew-section-contract">
        {!source ? <Skeleton className="h-8 w-2/3" data-testid="skeleton-renew-source" /> : <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-xs text-muted-foreground">Form</span>
            <Choice value={effForm!} disabled={creating} testId="button-form" onChange={pickForm} options={[["ours", "Our form"], ["theirs", "Their form"]] as const} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-xs text-muted-foreground">Coverage</span>
            <Choice value={effLine!} disabled={creating} testId="button-line" onChange={v => { touch(); setLine(v); }}
              options={[["landscape", "Landscape"], ["snow", "Snow"], ["both", "Both"]] as const} />
          </div>
          {notes.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground" data-testid="renew-change-notes">{notes.map(n => <li key={n}>{n}</li>)}</ul>}
        </>}
      </Section>

      <Section title="Start from" testId="renew-section-start">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs text-muted-foreground">Rates</span>
          <Choice value={effRates} disabled={creating} testId="button-rates" onChange={v => { touch(); setRates(v); }}
            options={[["carry", "Carry forward this contract's rates"], ["card", "Reset to the rate card"]] as const} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-xs text-muted-foreground">Scope</span>
          <Choice value={scope} disabled={creating} testId="button-scope" onChange={v => { touch(); setScope(v); }}
            options={[["carry", "Carry forward last season's scope"], ["standard", "Standard scope"]] as const} />
        </div>
      </Section>

      {error && (
        <div className="rounded-md border border-destructive/40 p-3 text-sm" data-testid="error-renew">
          {error}
          {body && <Button size="sm" variant="outline" className="ml-3" onClick={() => { setError(null); setAttempt(a => a + 1); }} data-testid="button-retry-renew">Retry</Button>}
        </div>
      )}
      {loading && !shown && <div className="space-y-2" data-testid="skeleton-renew"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div>}
      {shown && (
        <div className={`space-y-4 text-sm ${loading ? "opacity-60" : ""}`} data-testid="renew-preview">
          {shown.changes && (shown.changes.form || shown.changes.line) && (
            <div className="flex flex-wrap gap-2" data-testid="renew-change-badges">
              {shown.changes.form && <span className="rounded-full border px-2 py-0.5 text-xs font-medium" data-testid="badge-change-form">{FORM_NAME[shown.changes.form[0]]} {"\u2192"} {FORM_NAME[shown.changes.form[1]]}</span>}
              {shown.changes.line && <span className="rounded-full border px-2 py-0.5 text-xs font-medium" data-testid="badge-change-line">{LINE_NAME[shown.changes.line[0]]} {"\u2192"} {LINE_NAME[shown.changes.line[1]]}</span>}
            </div>
          )}
          <div className="space-y-1" data-testid="renew-years">
            <span className="text-xs text-muted-foreground block">{years.length > 1 ? "New seasons" : "New season"}</span>
            {years.map((y, i) => (
              <div key={i} className="flex flex-wrap justify-between gap-2" data-testid={i === 0 ? "text-new-season" : `text-new-season-${i + 1}`}>
                <span><span className="font-medium">{y.seasonLabel}</span>, {dateOnly(y.startDate)} to {dateOnly(y.endDate)}</span>
                {y.annualPriceCents != null && <span className="tabular-nums" data-testid={`text-year-price-${i + 1}`}>{money(y.annualPriceCents)}</span>}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground block">Payment lines{years.length > 1 ? `, ${years[0].seasonLabel}` : ""}</span>
            {shown.payments.length === 0 && <p className="text-muted-foreground">No payment lines to renew.</p>}
            {shown.payments.map((p, i) => {
              const k = `${i}`;
              return (
                <div key={k} className="rounded-md border p-2" data-testid={`renew-line-${i}`}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={!!open[k]}
                    onClick={() => setOpen({ ...open, [k]: !open[k] })} data-testid={`button-expand-line-${i}`}>
                    <span className="flex items-center gap-1">{open[k] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}{p.component}</span>
                    <span className="tabular-nums" data-testid={`text-line-change-${i}`}>{money(sumMonths(p.before))} {"\u2192"} {money(sumMonths(p.after))}</span>
                  </button>
                  {open[k] && (
                    <div className="mt-2 space-y-2" data-testid={`renew-months-${i}`}>
                      <div className="text-xs text-muted-foreground">Last season</div>
                      <PaymentEditor readOnly lines={linesFromPayments([{ component: p.component, months: p.before }])} onChange={() => {}} startMonth={startMonthOf(shown.startDate)} />
                      <div className="text-xs text-muted-foreground">New season</div>
                      <PaymentEditor readOnly lines={linesFromPayments([{ component: p.component, months: p.after }])} onChange={() => {}} startMonth={startMonthOf(shown.startDate)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {shown.snowFlatPrice.before !== null && (
            <div data-testid="text-flat-snow"><span className="text-xs text-muted-foreground block">Flat snow price</span>
              <span className="tabular-nums">{money(shown.snowFlatPrice.before)} {"\u2192"} {money(shown.snowFlatPrice.after)}</span></div>
          )}
          {rc && (rc.card.length + rc.kept.length + rc.added.length + rc.removed.length > 0) && (
            <div className="space-y-1" data-testid="renew-rates">
              <span className="text-xs text-muted-foreground block">Rate changes</span>
              {rc.card.map(c => (
                <div key={c.rateKey} className="flex justify-between gap-2" data-testid={`rate-card-${c.rateKey}`}>
                  <span>{c.label} <span className="text-xs text-muted-foreground">Card changed</span></span>
                  <span className="tabular-nums">{rateText(c.old)} {"\u2192"} {rateText(c.new)}</span>
                </div>
              ))}
              {rc.kept.map(c => (
                <div key={c.rateKey} className="flex justify-between gap-2" data-testid={`rate-kept-${c.rateKey}`}>
                  <span>{c.label} <span className="text-xs text-muted-foreground">Kept this client's rate</span></span>
                  <span className="tabular-nums">{rateText(c.new)}</span>
                </div>
              ))}
              {rc.added.map(c => (
                <div key={c.rateKey} className="flex justify-between gap-2" data-testid={`rate-added-${c.rateKey}`}>
                  <span>{c.label} <span className="text-xs font-medium text-primary">Added</span></span>
                  <span className="tabular-nums">{rateText(c.new)}</span>
                </div>
              ))}
              {rc.removed.map(c => (
                <div key={c.rateKey} className="flex justify-between gap-2 text-muted-foreground" data-testid={`rate-removed-${c.rateKey}`}>
                  <span className="line-through">{c.label}</span><span className="text-xs text-destructive">Removed</span>
                </div>
              ))}
            </div>
          )}
          {shown.scopeChanges && (shown.scopeChanges.added.length > 0 || shown.scopeChanges.removed.length > 0) && (
            <div className="space-y-1" data-testid="renew-scope">
              <span className="text-xs text-muted-foreground block">Scope changes</span>
              {shown.scopeChanges.added.map(k => <div key={`a-${k}`} data-testid={`scope-added-${k}`}>{k} <span className="text-xs font-medium text-primary">Added</span></div>)}
              {shown.scopeChanges.removed.map(k => <div key={`r-${k}`} className="text-muted-foreground" data-testid={`scope-removed-${k}`}><span className="line-through">{k}</span> <span className="text-xs text-destructive">Removed</span></div>)}
            </div>
          )}
          <p className="text-xs text-muted-foreground" data-testid="text-renew-note">{RENEW_NOTE}</p>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={creating} data-testid="button-cancel-renew">Cancel</Button>
        <Button onClick={create} disabled={!fresh || loading || creating || !!error} data-testid="button-create-renewal">
          {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          {label}
        </Button>
      </DialogFooter>
    </>
  );
}
