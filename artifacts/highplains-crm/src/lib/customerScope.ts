import { useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

/**
 * CP2: company/viewer-safe request helper for customer pages.
 * Query keys keep the existing prefix (e.g. ["/api/customers", id, "map-layers"]) so
 * prefix invalidation keeps working, and append company/user/role so no cache is
 * reused across tenants or roles. Every request carries X-Company-Id.
 */
export function useCustomerScope() {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId ?? null;
  const companyRef = useRef(companyId);
  companyRef.current = companyId;
  const scope = [companyId, user?.id ?? null, user?.activeRole ?? null] as const;
  const request = (method: string, url: string, body?: unknown, signal?: AbortSignal) =>
    apiRequest(method, url, body, { headers: companyId ? { "X-Company-Id": companyId } : {}, signal });
  const getJson = async <T,>(url: string, signal?: AbortSignal): Promise<T> => (await request("GET", url, undefined, signal)).json();
  /** Throws if the active company changed since `started` (stops old-company writes after awaits). */
  const assertSameCompany = (started: string | null) => {
    if (companyRef.current !== started) throw new Error("company-changed");
  };
  return { companyId, scope, enabled: !!companyId, request, getJson, assertSameCompany };
}
