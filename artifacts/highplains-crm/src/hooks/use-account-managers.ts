import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { AccountManager } from "../../../../lib/db/src/accountManager";

export const ACCOUNT_MANAGERS_API = "/api/customer-account-managers";
export interface AccountManagersResponse {
  managers: AccountManager[];
  assignments: Record<string, AccountManager | null>;
}
export function useAccountManagers() {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  return useQuery<AccountManagersResponse>({
    queryKey: [ACCOUNT_MANAGERS_API, companyId, user?.id, user?.activeRole],
    enabled: !!companyId, staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000,
    queryFn: async () => (await apiRequest("GET", ACCOUNT_MANAGERS_API, undefined,
      { headers: { "X-Company-Id": companyId! } })).json(),
  });
}
