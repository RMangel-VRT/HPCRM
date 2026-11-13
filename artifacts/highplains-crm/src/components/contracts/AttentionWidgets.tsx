import { useState, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorText } from "./contractFormat";
import { SEGMENTS, segmentCounts } from "./contractAttention";
import type { ContractSegment, LineAttention } from "./contractAttention";
import type { BoardLine } from "./contractTypes";

/** Never render an inactive pre-mutation detail while its background refresh runs.
 * Active detail observers refetch below; inactive detail reads load fresh on revisit.
 * This avoids refetching every previously opened agreement across company scopes. */
export const invalidateContractQueries = (qc: QueryClient) => {
  qc.removeQueries({ queryKey: ["/api/contract-center/contracts"], type: "inactive",
    predicate: query => query.queryKey.length > 1 });
  return qc.invalidateQueries({ predicate: query => {
  const key = String(query.queryKey[0]);
  return key.includes("contract-center") || key.includes("customer") || key.includes("dashboard") || key.includes("section")
    || key.includes("action") || key.includes("tickets") || key.includes("rfp");
  } });
};

/** Six-segment accounting bar with an accessible legend and a reconciliation check. */
export function AccountingBar({ board, line, segment, onSegment, footer }: {
  board: BoardLine; line: LineAttention; segment: ContractSegment | null; onSegment: (s: ContractSegment | null) => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const counts = segmentCounts(line.counts);
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  const missing = line.total - sum;
  const pick = (s: ContractSegment) => onSegment(segment === s ? null : s);
  return (
    <section className="rounded-lg border bg-card/60 dark:bg-card px-3 py-2.5 space-y-2" aria-labelledby="accounting-title" data-testid="accounting-bar">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="accounting-title" className="text-sm font-semibold" data-testid="text-accounting-title">
          {t(board === "snow" ? "contractAttention.snowTitle" : "contractAttention.landscapeTitle", { count: line.total })}
        </h2>
      </div>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-muted" data-testid="status-bar">
        {SEGMENTS.map(s => counts[s.key] > 0 && (
          <button key={s.key} type="button" onClick={() => pick(s.key)} aria-pressed={segment === s.key}
            aria-label={`${t(`contractAttention.segment.${s.key}`)}: ${counts[s.key]}`} title={`${t(`contractAttention.segment.${s.key}`)}: ${counts[s.key]}`}
            className={`min-w-[6px] transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${segment && segment !== s.key ? "opacity-30" : ""}`}
            style={{ flex: counts[s.key], backgroundColor: s.color }} data-testid={`bar-segment-${s.key}`} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" role="group" aria-label={t("contractAttention.legend")}>
        {SEGMENTS.map(s => (
          <button key={s.key} type="button" onClick={() => pick(s.key)} aria-pressed={segment === s.key}
            className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted ${segment === s.key ? "bg-muted font-semibold" : ""}`}
            data-testid={`legend-${s.key}`}>
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
            {t(`contractAttention.segment.${s.key}`)} <b className="tabular-nums" data-testid={`count-segment-${s.key}`}>{counts[s.key]}</b>
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-3">
          {footer}
          {missing === 0
            ? <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--ts-done)" }} data-testid="text-accounted">
                <Check className="h-3.5 w-3.5" aria-hidden />{t("contractAttention.accounted", { sum, total: line.total })}</span>
            : <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--ts-lost)" }} role="status" data-testid="text-unaccounted">
                <X className="h-3.5 w-3.5" aria-hidden />{t("contractAttention.unaccounted", { count: Math.abs(missing) })}</span>}
        </span>
      </div>
    </section>
  );
}

/** Confirms the existing authorized status move (POST terms/:id/status {to:'signed'}) on the lifecycle owner term. */
export function MarkSignedDialog({ target, onClose }: { target: { termId: string; customerName: string; seasonLabel?: string } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { if (!busy) { setError(null); onClose(); } };
  const confirm = async () => {
    if (!target) return;
    setBusy(true); setError(null);
    try {
      await apiRequest("POST", `/api/contract-center/terms/${encodeURIComponent(target.termId)}/status`, { to: "signed" },
        user?.activeCompanyId ? { headers: { "X-Company-Id": String(user.activeCompanyId) } } : undefined);
      await invalidateContractQueries(qc);
      setBusy(false); onClose();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <AlertDialog open={!!target} onOpenChange={o => { if (!o) close(); }}>
      <AlertDialogContent data-testid="dialog-mark-signed">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("contractAttention.markSignedTitle", { customer: target?.customerName ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("contractAttention.markSignedBody", { season: target?.seasonLabel ?? "" })}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive" role="alert" data-testid="error-mark-signed">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} data-testid="button-cancel-mark-signed">{t("contractAttention.cancel")}</AlertDialogCancel>
          <Button disabled={busy} onClick={() => void confirm()} data-testid="button-confirm-mark-signed">
            {busy ? t("contractAttention.saving") : t("contractAttention.markSigned")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
