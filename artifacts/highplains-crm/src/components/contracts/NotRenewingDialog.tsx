import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateContractQueries } from "./AttentionWidgets";
import { useAuth } from "@/hooks/use-auth";
import { NON_RENEWAL_LABELS, NON_RENEWAL_REASONS } from "@shared/contractCatalog";
import { coloradoDay, dateOnly, errorText } from "./contractFormat";
import type { ContractDetail, DetailTerm } from "./contractTypes";

type Target = { id: string; customerName: string };
type NonRenewalDetail = ContractDetail & {
  renewalSourceId?: string | null; otherOpenLines?: number; companyDay?: string;
  terms: (DetailTerm & { nonRenewalOn?: string | null })[];
};
type Reason = typeof NON_RENEWAL_REASONS[number];

export function NotRenewingDialog(props: { target: Target | null; onClose: () => void; onRecorded?: () => void }) {
  const { target, onClose } = props;
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto" data-testid="dialog-not-renewing"
        onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }}>
        {target && <Body key={target.id} target={target} onClose={onClose} onBusy={setBusy} onRecorded={props.onRecorded} />}
      </DialogContent>
    </Dialog>
  );
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function Body({ target, onClose, onBusy, onRecorded }: { target: Target; onClose: () => void; onBusy: (b: boolean) => void; onRecorded?: () => void }) {
  const companyId = useAuth().user?.activeCompanyId;
  const request = (method: string, url: string, body?: unknown) => apiRequest(method, url, body, { headers: { "X-Company-Id": companyId! } });
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const lang: "en" | "es" = i18n.language?.startsWith("es") ? "es" : "en";
  const q = useQuery<NonRenewalDetail>({
    queryKey: ["/api/contract-center/contracts", target.id, companyId],
    queryFn: async () => (await request("GET", `/api/contract-center/contracts/${target.id}`)).json(),
    retry: false,
    staleTime: 0, refetchOnMount: "always",
  });
  const d = q.data;
  const [decidedOn, setDecidedOn] = useState<string | null>(null);
  const [reason, setReason] = useState<Reason | "">("");
  const [competitor, setCompetitor] = useState("");
  const [note, setNote] = useState("");
  const [deactivate, setDeactivate] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const sourceId = d?.renewalSourceId ?? null;
  const source = d && sourceId ? d.terms.find(x => x.id === sourceId) : undefined;
  const pending = d?.renewalDraftId ? d.terms.find(x => x.id === d.renewalDraftId) : undefined;
  const other = (d?.otherOpenLines ?? 0) > 0;
  const day = decidedOn ?? d?.companyDay ?? coloradoDay(new Date());
  const deact = deactivate ?? (d ? d.otherOpenLines === 0 : false);
  const end = source ? dateOnly(source.endDate) : "";

  const errDate = !DAY_RE.test(day) || day > (d?.companyDay ?? coloradoDay(new Date())) ? t("nonRenewal.errDate") : null;
  const errReason = !reason ? t("nonRenewal.errReason") : null;
  const errComp = competitor.length > 120 ? t("nonRenewal.errLong", { max: 120 }) : null;
  const errNote = note.length > 1000 ? t("nonRenewal.errLong", { max: 1000 }) : null;
  const invalid = !!(errDate || errReason || errComp || errNote);

  async function submit() {
    setTried(true);
    if (!sourceId || invalid || saving) return;
    setSaving(true); onBusy(true); setError(null);
    try {
      await request("POST", `/api/contract-center/terms/${sourceId}/non-renewal`, {
        decidedOn: day, reason,
        competitor: reason === "competitor" && competitor.trim() ? competitor.trim() : null,
        note: note.trim() ? note.trim() : null,
        deactivateCustomer: deact,
      });
      await invalidateContractQueries(qc);
      toast({ title: t("nonRenewal.recorded") });
      onBusy(false); onClose(); onRecorded?.();
    } catch (e) {
      setError(errorText(e)); setSaving(false); onBusy(false);
    }
  }

  const fieldLabel = "text-xs font-medium text-muted-foreground";
  return (
    <>
      <DialogHeader>
        <DialogTitle data-testid="text-not-renewing-title">{t("nonRenewal.title", { customer: target.customerName })}</DialogTitle>
        {source && <DialogDescription>{t("nonRenewal.description", { end })}</DialogDescription>}
      </DialogHeader>

      {q.isLoading && <div className="space-y-3" data-testid="skeleton-not-renewing"><Skeleton className="h-9 w-1/2" /><Skeleton className="h-9 w-full" /><Skeleton className="h-16 w-full" /></div>}
      {q.isError && (
        <div className="rounded-md border border-destructive/40 p-3 text-sm" data-testid="error-not-renewing-load">
          {t("nonRenewal.loadError")}
          <Button size="sm" variant="outline" className="ml-3" onClick={() => q.refetch()} data-testid="button-retry-not-renewing">{t("nonRenewal.retry")}</Button>
        </div>
      )}
      {d && !source && <p className="text-sm text-muted-foreground" data-testid="text-not-renewing-no-source">{t("nonRenewal.noSource")}</p>}

      {d && source && (
        <div className="space-y-3 text-sm">
          {pending && (
            <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--est-warn-bg))] p-2 text-[hsl(var(--est-warn))]" data-testid="text-not-renewing-pending">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{t("nonRenewal.pending", { season: pending.seasonLabel })}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label className="space-y-1">
              <span className={fieldLabel}>{t("nonRenewal.date")}</span>
              <Input type="date" value={day} max={d.companyDay ?? coloradoDay(new Date())} disabled={saving} onChange={e => setDecidedOn(e.target.value)} aria-invalid={tried && !!errDate} data-testid="input-non-renewal-date" />
              {tried && errDate ? <span className="text-xs text-destructive">{errDate}</span> : <span className="text-[11px] text-muted-foreground">{t("nonRenewal.dateHint")}</span>}
            </label>
            <div className="space-y-1">
              <span className={fieldLabel}>{t("nonRenewal.reason")}</span>
              <Select value={reason} onValueChange={v => setReason(v as Reason)} disabled={saving}>
                <SelectTrigger aria-invalid={tried && !!errReason} data-testid="select-non-renewal-reason"><SelectValue placeholder={t("nonRenewal.reasonPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {NON_RENEWAL_REASONS.map(r => <SelectItem key={r} value={r} data-testid={`option-reason-${r}`}>{NON_RENEWAL_LABELS[lang][r]}</SelectItem>)}
                </SelectContent>
              </Select>
              {tried && errReason && <span className="text-xs text-destructive" data-testid="error-non-renewal-reason">{errReason}</span>}
            </div>
          </div>
          {reason === "competitor" && (
            <label className="block space-y-1">
              <span className={fieldLabel}>{t("nonRenewal.competitor")} <span className="font-normal">({t("nonRenewal.competitorOptional")})</span></span>
              <Input value={competitor} maxLength={120} disabled={saving} onChange={e => setCompetitor(e.target.value)} data-testid="input-non-renewal-competitor" />
              {errComp && <span className="text-xs text-destructive">{errComp}</span>}
            </label>
          )}
          <label className="block space-y-1">
            <span className={fieldLabel}>{t("nonRenewal.note")}</span>
            <Textarea rows={3} value={note} maxLength={1000} disabled={saving} placeholder={t("nonRenewal.notePlaceholder")} onChange={e => setNote(e.target.value)} data-testid="input-non-renewal-note" />
            <span className="flex justify-end text-[11px] tabular-nums text-muted-foreground">{note.length}/1000</span>
            {errNote && <span className="text-xs text-destructive">{errNote}</span>}
          </label>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox checked={deact} disabled={saving} onCheckedChange={v => setDeactivate(v === true)} className="mt-0.5" data-testid="checkbox-deactivate-customer" />
              <span>{t("nonRenewal.customer", { customer: d.customer?.name ?? target.customerName, end })}</span>
            </label>
            {other && <p className="mt-1 pl-6 text-xs text-muted-foreground" data-testid="text-other-open-lines">{t("nonRenewal.otherOpen")}</p>}
          </div>
        </div>
      )}

      {error && <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive" data-testid="error-not-renewing">{error}</div>}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving} data-testid="button-cancel-not-renewing">{t("nonRenewal.cancel")}</Button>
        <Button onClick={submit} disabled={!source || saving || (tried && invalid)} data-testid="button-confirm-not-renewing">
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {saving ? t("nonRenewal.saving") : t("nonRenewal.confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}
