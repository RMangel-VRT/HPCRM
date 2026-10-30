import { useRef, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { advanceLinkedTicket, linkedTicketEvent, loadLinkedTicket, planLinkedTicket, ticketRequest, type RecoveryReason, type EstimateState } from "@/lib/advanceLinkedTicket";

export const RECOVERY_KEY = "estimate-ticket-recovery";

/** No persisted failure bit: missing status OR missing expected field values is recovery.
 * Remount by identity/company in both callers so late responses cannot affect a new scope. */
export function TicketAdvanceNotice({ estimate }: { estimate: EstimateState & { updatedAt: string } }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const companyId = user?.activeCompanyId ?? "";
  const request = ticketRequest(companyId, () => mounted.current);
  const enabled = !!companyId && ["admin", "office"].includes(user?.activeRole ?? "") && !!linkedTicketEvent(estimate);
  const query = useQuery({
    queryKey: [RECOVERY_KEY, companyId, user?.id, user?.activeRole, estimate.id, estimate.updatedAt],
    queryFn: async () => planLinkedTicket(estimate, await loadLinkedTicket(estimate.ticketId!, request)),
    enabled, retry: false, staleTime: 0, refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
  const reason: RecoveryReason | null = query.isError ? "loadFailed" : query.data?.reason ?? null;
  if (!enabled || !reason) return null;
  async function retry() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await advanceLinkedTicket(estimate, request);
      if (!mounted.current) return;
      if (result.moved && !result.reason) toast({ title: t("estimateTicket.moved", { number: result.ticketNumber, status: result.statusName }) });
      await Promise.all([
        qc.invalidateQueries({ queryKey: [RECOVERY_KEY] }),
        qc.invalidateQueries({ queryKey: ["/api/estimates"] }),
        qc.invalidateQueries({ queryKey: ["/api/estimates/board"] }),
        qc.invalidateQueries({ queryKey: ["/api/tickets"] }),
      ]);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <div role="status" className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="ticket-advance-notice">
    <p>{t("estimateTicket.notAdvanced", { reason: t(`estimateTicket.reason.${reason}`) })}</p>
    <Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={() => void retry()}>{t("estimateTicket.advance")}</Button>
  </div>;
}
