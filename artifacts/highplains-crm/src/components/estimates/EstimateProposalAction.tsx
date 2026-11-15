import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ClipboardList } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { companyHeaders, fetchJson } from "@/lib/hardscapeCatalog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

/** Narrow row from GET /api/proposals?estimateId= (newest first). */
export interface EstimateProposalRow { id: string; proposalNumber: string | null; createdAt: string; status: string | null; title: string }

export const proposalPath = (id: string) => `/dashboard/tools/proposals/${encodeURIComponent(id)}`;
export const PROPOSAL_ROLES = ["admin", "office"];

/** Company + viewer + role scoped proposals for one estimate. Disabled for voided estimates and non-proposal roles. */
export function useEstimateProposals(estimateId: string, voided: boolean) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId ?? "";
  const allowed = PROPOSAL_ROLES.includes(user?.accessRole ?? "");
  const enabled = allowed && !voided && !!estimateId && !!companyId;
  const key = ["/api/proposals", "by-estimate", companyId, user?.id, user?.activeRole, estimateId] as const;
  const q = useQuery<EstimateProposalRow[]>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const rows = await fetchJson<EstimateProposalRow[]>(`/api/proposals?estimateId=${encodeURIComponent(estimateId)}`, companyId, signal);
      return (Array.isArray(rows) ? rows : []).filter((r) => r.status !== "void");
    },
    enabled, retry: false, staleTime: 0,
  });
  const rows = q.data ?? [];
  return { enabled, key, companyId, query: q, latest: rows[0] ?? null, older: rows.slice(1) };
}

/** "Make proposal" / "Open proposal {number}" next to Preview PDF in the estimate builder. */
export function EstimateProposalButton({ estimateId, state }: { estimateId: string; state: ReturnType<typeof useEstimateProposals> }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  if (!state.enabled) return null;
  if (state.query.isLoading) {
    return <Button size="sm" variant="outline" disabled data-testid="button-proposal-loading"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />{t("proposalP1.makeProposal")}</Button>;
  }
  if (state.latest) {
    const n = state.latest.proposalNumber ?? state.latest.title;
    return (
      <Button size="sm" variant="outline" onClick={() => navigate(proposalPath(state.latest!.id))} data-testid="button-open-proposal">
        <ClipboardList className="mr-1.5 h-3.5 w-3.5" />{t("proposalP1.openProposal", { number: n })}
      </Button>
    );
  }
  async function make() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/proposals", { estimateId }, { headers: companyHeaders(state.companyId) });
      const created = await res.json() as { id: string };
      void qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      navigate(proposalPath(created.id));
    } catch {
      toast({ title: t("common.error"), description: t("proposalP1.makeFailed"), variant: "destructive" });
      void state.query.refetch();
    } finally { busyRef.current = false; setBusy(false); }
  }
  return (
    <Button size="sm" variant="outline" disabled={busy || state.query.isError} onClick={() => void make()} data-testid="button-make-proposal"
      title={state.query.isError ? t("proposalP1.lookupFailed") : undefined}>
      <ClipboardList className="mr-1.5 h-3.5 w-3.5" />{busy ? t("proposalP1.making") : t("proposalP1.makeProposal")}
    </Button>
  );
}
