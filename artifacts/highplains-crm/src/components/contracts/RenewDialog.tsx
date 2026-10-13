import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { dateOnly, errorText, money } from "./contractFormat";
import type { ContractDetail } from "./contractTypes";
import { PaymentEditor } from "./PaymentEditor";
import { linesFromPayments, startMonthOf } from "./paymentDraft";
import { createSequencer, parsePct, previewKey, sumMonths, visibleRateChanges } from "./renewPreview";
import type { RenewPreview, RoundTo } from "./renewPreview";

export const RENEW_NOTE = "Scope is copied as is. Change services on the new draft before sending.";
const rateText = (v: { priceCents: number | null; priceText: string | null }) => (v.priceCents != null ? money(v.priceCents) : v.priceText || "No price");

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
  const [pctText, setPctText] = useState("3");
  const [roundTo, setRoundTo] = useState<RoundTo>("dollar");
  const [preview, setPreview] = useState<{ key: string; pct: number; roundTo: RoundTo; data: RenewPreview } | null>(null);
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
  const pct = parsePct(pctText);
  const url = `/api/contract-center/contracts/${target.id}/renew`;
  const currentKey = pct === null ? null : previewKey(pct, roundTo);

  useEffect(() => {
    if (pct === null) { seq.current.cancel(); setLoading(false); setError(null); return; }
    setLoading(true);
    const id = seq.current.next();
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest("POST", url, { increasePct: pct, roundTo, dryRun: true });
        const data = (await res.json()) as RenewPreview;
        if (!seq.current.isCurrent(id)) return;
        setPreview({ key: previewKey(pct, roundTo), pct, roundTo, data }); setError(null); setLoading(false);
      } catch (e) {
        if (!seq.current.isCurrent(id)) return;
        setError(errorText(e)); setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); seq.current.cancel(); };
  }, [pct, roundTo, url, attempt]);

  const fresh = preview && preview.key === currentKey ? preview.data : null;
  const shown = fresh ?? preview?.data ?? null;
  const rc = shown ? visibleRateChanges(shown.rateChanges) : null;

  async function create() {
    if (committing.current || !preview || preview.key !== currentKey || loading || error || creating) return;
    committing.current = true; onBusy(true);
    seq.current.cancel(); setCreating(true);
    const { pct: sentPct, roundTo: sentRound, data } = preview;
    try {
      const res = await apiRequest("POST", url, { increasePct: sentPct, roundTo: sentRound });
      const detail = (await res.json()) as ContractDetail;
      await qc.invalidateQueries({ queryKey: ["/api/contract-center/contracts"] });
      const termId = detail.renewalDraftId ?? detail.terms[detail.terms.length - 1]?.id;
      toast({ title: `${data.seasonLabel} draft created` });
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
        <DialogDescription>Pick the increase. Nothing is saved until you create the draft.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Increase %</span>
          <Input inputMode="decimal" value={pctText} disabled={creating} onChange={e => { seq.current.cancel(); setPctText(e.target.value); }} aria-invalid={pct === null} data-testid="input-increase-pct" />
          {pct === null && <span className="text-xs text-destructive" data-testid="error-increase-pct">Enter a number from -50 to 100</span>}
        </label>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Round to</span>
          <div className="flex gap-2">
            {([["dollar", "Whole dollar"], ["twelve", "Divides evenly by 12"]] as const).map(([k, label]) => (
              <Button key={k} type="button" size="sm" variant={roundTo === k ? "default" : "outline"} aria-pressed={roundTo === k}
                disabled={creating} onClick={() => { seq.current.cancel(); setRoundTo(k); }} data-testid={`button-round-${k}`}>{label}</Button>
            ))}
          </div>
        </div>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 p-3 text-sm" data-testid="error-renew">
          {error}
          {pct !== null && <Button size="sm" variant="outline" className="ml-3" onClick={() => { setError(null); setAttempt(a => a + 1); }} data-testid="button-retry-renew">Retry</Button>}
        </div>
      )}
      {loading && !shown && <div className="space-y-2" data-testid="skeleton-renew"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div>}
      {shown && (
        <div className={`space-y-4 text-sm ${loading ? "opacity-60" : ""}`} data-testid="renew-preview">
          <div data-testid="text-new-season">
            <span className="text-xs text-muted-foreground block">New season</span>
            <span className="font-medium">{shown.seasonLabel}</span>, {dateOnly(shown.startDate)} to {dateOnly(shown.endDate)}
          </div>
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground block">Payment lines</span>
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
          {rc && (rc.card.length > 0 || rc.kept.length > 0) && (
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
            </div>
          )}
          <p className="text-xs text-muted-foreground" data-testid="text-renew-note">{RENEW_NOTE}</p>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={creating} data-testid="button-cancel-renew">Cancel</Button>
        <Button onClick={create} disabled={!fresh || loading || creating || !!error} data-testid="button-create-renewal">
          {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Create {shown?.seasonLabel ?? "next season"} draft
        </Button>
      </DialogFooter>
    </>
  );
}
