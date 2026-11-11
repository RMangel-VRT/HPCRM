import { useState } from "react";
import { useGetCustomerServices } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

export function serviceDemandKey(customerId: string | undefined, companyId: string | null, viewer: string | null, role: string | null, accessRole: string | null, termId?: string) {
  return ["/api/customers", customerId, "services", companyId, viewer, role, accessRole, termId ?? "default"] as const;
}

export function serviceErrorStatus(error: unknown): number | undefined {
  return error && typeof error === "object" && "status" in error ? Number(error.status) : undefined;
}

/** CG5 owns every demand/outcome rule. This hook only scopes its generated reader. */
export function useContractCustomerServices(customerId?: string, termId?: string) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId ?? null;
  const query = useGetCustomerServices(customerId ?? "", termId ? { termId } : undefined, {
    query: {
      queryKey: serviceDemandKey(customerId, companyId, user?.id ?? null, user?.activeRole ?? null, user?.accessRole ?? null, termId),
      enabled: !!customerId && !!companyId && !!user?.id,
      staleTime: 0,
      refetchInterval: 60_000,
      placeholderData: undefined,
      retry: (attempt, error) => {
        const status = serviceErrorStatus(error);
        return !(status && status >= 400 && status < 500) && attempt < 2;
      },
    },
    request: { headers: companyId ? { "X-Company-Id": companyId } : {}, credentials: "include" },
  });
  // A failed refresh must not make revoked/denied scope look like current demand.
  return { ...query, data: query.error ? undefined : query.data, unavailable: serviceErrorStatus(query.error) === 403 };
}

/** Scope-tagged state prevents even the first render from requesting a prior property's season. */
export function useServiceSeason(customerId: string) {
  const { user } = useAuth();
  const scopeKey = JSON.stringify([customerId, user?.activeCompanyId, user?.id, user?.activeRole, user?.accessRole]);
  const [selection, setSelection] = useState<{ scopeKey: string; termId?: string }>({ scopeKey });
  if (selection.scopeKey !== scopeKey) setSelection({ scopeKey });
  return {
    scopeKey,
    termId: selection.scopeKey === scopeKey ? selection.termId : undefined,
    selectTerm: (termId: string) => setSelection({ scopeKey, termId }),
    resetTerm: () => setSelection({ scopeKey }),
  };
}
