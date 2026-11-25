import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { invalidateContractQueries } from "./AttentionWidgets";
import { dateOnly, errorText, money } from "./contractFormat";
import { selectRenewalSource, type ContractDetail, type MergeCandidate } from "./contractTypes";

export function MergeSeparateDialog({ target, onClose }: { target: ContractDetail | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return <Dialog open={!!target} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto" data-testid="dialog-merge-separate"
      onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }}>
      {target && <Body key={target.id} target={target} onClose={onClose} onBusy={setBusy} />}
    </DialogContent>
  </Dialog>;
}

function Body({ target, onClose, onBusy }: { target: ContractDetail; onClose: () => void; onBusy: (busy: boolean) => void }) {
  const { t } = useTranslation();
  const activeCompanyId = useAuth().user?.activeCompanyId;
  // A company switch must not retarget an already-open destructive operation.
  const [companyId] = useState(activeCompanyId);
  const changedCompany = companyId !== activeCompanyId;
  const qc = useQueryClient(), { toast } = useToast(), [, navigate] = useLocation();
  const request = (method: string, path: string, body?: unknown) => apiRequest(method, path, body,
    { headers: { "X-Company-Id": companyId! } });
  const q = useQuery<MergeCandidate[]>({
    queryKey: ["/api/contract-center/contracts", target.id, companyId, "merge-candidates"],
    queryFn: async () => (await request("GET", `/api/contract-center/contracts/${target.id}/merge-candidates`)).json(),
    retry: false, staleTime: 0, refetchOnMount: "always",
  });
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const candidate = q.data?.find(c => c.agreementId === selected);
  const predecessor = target.terms.find(s => s.id === target.renewalSourceId) ?? selectRenewalSource(target.terms);
  const line = (value: string) => t(`mergeSeparate.lines.${value}`);
  const status = (value: string) => t(`mergeSeparate.statuses.${value}`, { defaultValue: value });
  const seasonText = (s: { seasonLabel: string; startDate: string; endDate: string }) =>
    `${s.seasonLabel} (${dateOnly(s.startDate)} – ${dateOnly(s.endDate)})`;
  const first = candidate?.seasons.find(s => s.startDate === candidate.firstStartDate && !["cancelled", "lost"].includes(s.status));
  async function merge() {
    if (!candidate || candidate.blockedReason || !predecessor || saving || changedCompany) return;
    setSaving(true); onBusy(true); setError(null);
    try {
      await request("POST", `/api/contract-center/contracts/${target.id}/merge`, { sourceAgreementId: candidate.agreementId });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/contract-center/contracts"] }),
        qc.invalidateQueries({ queryKey: ["/api/contract-center/contracts", target.id] }),
        qc.invalidateQueries({ queryKey: ["/api/contract-center/contracts", candidate.agreementId] }),
        invalidateContractQueries(qc),
        qc.invalidateQueries({ predicate: query => String(query.queryKey[0]).includes("/api/revenue") }),
        qc.invalidateQueries({ queryKey: ["/api/bids/board"] }),
      ]);
      toast({ title: t("mergeSeparate.success", { first: candidate.firstSeasonLabel, source: predecessor.seasonLabel }) });
      onClose(); navigate(`/dashboard/contracts/${target.id}`);
    } catch (e) { setError(errorText(e)); }
    finally { setSaving(false); onBusy(false); }
  }
  return <>
    <DialogHeader>
      <DialogTitle>{t("mergeSeparate.title")}</DialogTitle>
      <DialogDescription>{t("mergeSeparate.choose")}</DialogDescription>
    </DialogHeader>
    {q.isLoading && <p role="status">{t("mergeSeparate.loading")}</p>}
    {q.isError && <div role="alert" className="text-destructive">{errorText(q.error)}
      <Button variant="outline" onClick={() => void q.refetch()}>{t("mergeSeparate.retry")}</Button></div>}
    {q.data?.length === 0 && <p>{t("mergeSeparate.empty")}</p>}
    <div role="radiogroup" aria-label={t("mergeSeparate.choose")} className="space-y-3">
      {q.data?.map(c => <label key={c.agreementId} className={`flex items-start gap-3 rounded-md border p-3 ${c.blockedReason ? "bg-muted/50 text-muted-foreground" : "cursor-pointer"}`}>
        <input type="radio" name="merge-candidate" value={c.agreementId} checked={selected === c.agreementId}
          disabled={!!c.blockedReason || saving || changedCompany} aria-label={c.firstSeasonLabel}
          onChange={() => { setSelected(c.agreementId); setError(null); }} className="mt-1" />
        <span className="min-w-0 space-y-2">
          <span className="block text-xs">{t("mergeSeparate.firstStart", { date: dateOnly(c.firstStartDate) })}</span>
          {c.seasons.map(s => <span key={s.id} className="block text-sm">
            <strong>{seasonText(s)}</strong>{" "}
            <span className="inline-flex rounded-full border px-2 py-0.5 text-xs">{status(s.status)}</span>
            <span className="block text-muted-foreground">{line(s.line)} · {t("mergeSeparate.annual", { price: money(s.annualPriceCents) })}</span>
          </span>)}
          {c.blockedReason && <span className="block text-sm text-destructive">{c.blockedReason}</span>}
        </span>
      </label>)}
    </div>
    {candidate && predecessor && first && <section className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm" data-testid="merge-preview">
      <h3 className="font-semibold">{t("mergeSeparate.before")}</h3>
      <p>{target.terms.map(seasonText).join(" · ")}</p>
      <h3 className="font-semibold">{t("mergeSeparate.after")}</h3>
      <p>{t(["signed", "active", "renewed"].includes(first.status) ? "mergeSeparate.linkPreview" : "mergeSeparate.pendingPreview",
        { source: seasonText(predecessor), first: seasonText(first), status: status(first.status) })}</p>
      <p>{[...target.terms, ...candidate.seasons].sort((a, b) => a.startDate.localeCompare(b.startDate)).map(seasonText).join(" · ")}</p>
      {predecessor.line !== first.line && <p>{t("mergeSeparate.lineChange", { from: line(predecessor.line ?? target.line), to: line(first.line) })}</p>}
      {candidate.propertyManagementCompanyId !== null && candidate.propertyManagementCompanyId !== candidate.targetPropertyManagementCompanyId &&
        <p>{t("mergeSeparate.managementChange", { from: candidate.targetManagementCompanyName ?? t("mergeSeparate.none"), to: candidate.managementCompanyName ?? t("mergeSeparate.none") })}</p>}
    </section>}
    <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">{t("mergeSeparate.warning")}</p>
    {(error || changedCompany) && <p role="alert" className="text-sm text-destructive">{changedCompany ? t("mergeSeparate.companyChanged") : error}</p>}
    <DialogFooter>
      <Button variant="outline" onClick={onClose} disabled={saving}>{t("mergeSeparate.cancel")}</Button>
      <Button onClick={() => void merge()} disabled={!candidate || !!candidate.blockedReason || !predecessor || saving || changedCompany}>
        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("mergeSeparate.confirm")}
      </Button>
    </DialogFooter>
  </>;
}
