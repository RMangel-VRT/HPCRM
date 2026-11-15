import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { useAuth } from "@/hooks/use-auth";
import { ESTIMATES_API, type EstimateDetailDto } from "@/lib/estimateBuilder";

/**
 * The linked estimate read shared by the Estimate section and the "What goes out" checklist.
 * Same company/user/role-scoped key, so React Query dedupes it into one request.
 */
export function useProposalLinkedEstimate(proposal: { estimateId?: string | null; estimate?: { id: string } | null } | null | undefined, companyId: string) {
  const { user } = useAuth();
  const estimateId = proposal?.estimateId ?? proposal?.estimate?.id ?? null;
  const canRead = !!companyId && ["admin", "office"].includes(user?.accessRole ?? "");
  return useQuery<EstimateDetailDto>({
    queryKey: ["/api/estimates", "proposal-linked", companyId, user?.id, user?.activeRole, estimateId],
    queryFn: async ({ signal }) => (await apiRequest("GET", `${ESTIMATES_API}/${encodeURIComponent(estimateId!)}`, undefined,
      { headers: companyHeaders(companyId), signal })).json() as Promise<EstimateDetailDto>,
    enabled: canRead && !!estimateId, staleTime: 0, retry: false, refetchOnWindowFocus: true, refetchInterval: 30_000,
  });
}

/** Total the proposal prints: live draft totals, or the frozen subtotal once sent. */
export function linkedEstimateTotalCents(est: EstimateDetailDto | undefined): number | null {
  if (!est) return null;
  return est.version.status === "draft" ? est.version.totals.subtotalCents : est.version.frozenSubtotalCents;
}
