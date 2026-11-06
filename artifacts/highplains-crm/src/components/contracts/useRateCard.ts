import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { rateCardQueryKey } from "./rateCardUtils";
import type { RateCardItem } from "./rateCardUtils";

/** The rate card GET allows admin and office (plus super admins) only. */
export function canReadRateCard(user: { activeRole?: string; isSuperAdminBool?: boolean } | null | undefined) {
  return !!user && (user.activeRole === "admin" || user.activeRole === "office" || !!user.isSuperAdminBool);
}

/** Company-scoped rate card, fetched only when `enabled` (lazy) and the role may read it. */
export function useScopedRateCard(enabled: boolean) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  const allowed = canReadRateCard(user) && !!companyId;
  const q = useQuery<RateCardItem[]>({
    queryKey: [...rateCardQueryKey(companyId)],
    enabled: enabled && allowed,
    retry: false,
    queryFn: async () => (await apiRequest("GET", "/api/contract-center/rate-card", undefined, { headers: { "X-Company-Id": companyId! } })).json(),
  });
  return { ...q, allowed };
}
