import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";

export interface ContractSummaryTerm {
  agreementId?: string; termId?: string; label: string; line: "landscape" | "snow" | "both";
  startDate: string; endDate: string; status?: string; form?: string;
  annualCents?: number | null; snowPricing?: string | null; snowTriggers?: string | null;
  parentCustomerId?: string | null;
  billingMonths?: { month: string; component: string | null; amountCents: number }[];
  rates?: { rateKey: string; label: string; unit: string; minimum: string | null; priceCents: number | null; priceText: string | null }[];
}
export interface CustomerContractSummary {
  asOf: string; current: ContractSummaryTerm[]; upcoming?: ContractSummaryTerm[]; previous?: ContractSummaryTerm[];
  coverage: { landscape: boolean; snow: boolean }; parentCustomerId?: string | null;
}
export const contractSummaryKey = (id: string) => ["/api/customers", id, "contract-summary"] as const;
export function useCustomerContractSummary(customerId?: string) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  return useQuery<CustomerContractSummary>({
    // Required shared prefix plus identity boundary: no role or tenant cache reuse.
    queryKey: [...contractSummaryKey(customerId ?? ""), companyId, user?.id, user?.activeRole],
    enabled: !!customerId && !!companyId, staleTime: 0, refetchOnMount: "always", refetchInterval: 60_000,
    queryFn: async ({ signal }) => (await apiRequest("GET", `/api/customers/${customerId}/contract-summary`, undefined,
      { headers: { "X-Company-Id": companyId! }, signal })).json(),
  });
}
export function useSnowCoveredCustomers() {
  const { user } = useAuth();
  return useQuery<{ customerIds: string[] }>({
    queryKey: ["/api/customers/snow-covered", user?.activeCompanyId, user?.id, user?.activeRole],
    enabled: !!user?.activeCompanyId, staleTime: 0, refetchInterval: 60_000,
    queryFn: async () => (await apiRequest("GET", "/api/customers/snow-covered", undefined,
      { headers: { "X-Company-Id": user!.activeCompanyId } })).json(),
  });
}
