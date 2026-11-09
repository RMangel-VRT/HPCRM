import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";

export interface ContractSummaryTerm {
  agreementId?: string; termId?: string; label: string; line: "landscape" | "snow" | "both";
  startDate: string; endDate: string; status?: string; form?: string;
  annualCents?: number | null; snowPricing?: string | null; snowTriggers?: string | null;
  parentCustomerId?: string | null;
  /** CP3: server-projected Contract Center renewal rule (successor/non-renewal aware). */
  renewalDue?: boolean;
  billingMonths?: { month: string; component: string | null; amountCents: number; isFee?: boolean }[];
  /** CC2-18: computed on read; annualCents excludes fees. */
  feesAnnualCents?: number | null; contractTotalCents?: number | null; durationMonths?: number;
  /** CC2-17: active company standard (card) rates for the term's line that the contract does not state, card order. */
  standardRates?: { rateKey: string; line?: string | null; category?: string | null; sortOrder?: number; label: string; unit: string; minimum: string | null; priceCents: number | null; priceText: string | null }[];
  rates?: { rateKey: string; line?: "landscape" | "irrigation" | "snow" | "general" | null; category?: string | null; sortOrder?: number; label: string; unit: string; minimum: string | null; priceCents: number | null; priceText: string | null; cardPriceCents?: number | null; cardPriceText?: string | null }[];
}
export interface CustomerContractSummary {
  asOf: string; current: ContractSummaryTerm[]; upcoming?: ContractSummaryTerm[]; previous?: ContractSummaryTerm[];
  coverage: { landscape: boolean; snow: boolean }; parentCustomerId?: string | null;
  /** Admin/office/field manager only: latest snow-trigger flag status per effective snow term. */
  snowTriggerFlags?: { termId: string; status: string }[];
}
export const OPEN_SNOW_FLAG_STATUSES = ["new", "acknowledged", "in_progress"] as const;
export const openSnowTriggerFlagCount = (s?: CustomerContractSummary | null) =>
  !s?.coverage.snow ? 0 : (s.snowTriggerFlags ?? []).filter(f => (OPEN_SNOW_FLAG_STATUSES as readonly string[]).includes(f.status)).length;
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
