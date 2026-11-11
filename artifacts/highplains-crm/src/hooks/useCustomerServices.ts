import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";
import { addDaysYmd, companyToday } from "@/lib/schedulingStatus";

export type ServiceState = "done" | "skipped" | "overdue" | "in_window" | "upcoming";
export interface CustomerService {
  id: string; source: "campaign" | "route"; title: string; serviceKey: string | null;
  start: string; end: string; state: ServiceState;
  /** Real completion timestamp when the source provides one; never synthesized. */
  completedAt?: string | null;
}
export function classifyCustomerService(status: string, start: string, end: string, today = companyToday()): ServiceState {
  if (status === "completed" || status === "done") return "done";
  if (status === "skipped" || status === "cancelled") return "skipped";
  if (end && end < today) return "overdue";
  if (start && start > today) return "upcoming";
  return "in_window";
}
export function normalizeCampaignItem(item: any) {
  return { ...item, campaignTitle: item.campaignTitle ?? item.campaign?.title ?? "",
    campaignCategory: item.campaignCategory ?? item.campaign?.category ?? "",
    campaignWindowStart: item.campaignWindowStart ?? item.campaign?.windowStart ?? "",
    campaignWindowEnd: item.campaignWindowEnd ?? item.campaign?.windowEnd ?? "" };
}
export function useCustomerServices(customerId?: string) {
  const { user } = useAuth();
  const [today, setToday] = useState(companyToday);
  useEffect(() => {
    // A successful refetch with identical rows need not re-render. Drive the
    // Colorado day explicitly so pending work becomes overdue at midnight.
    const timer = setInterval(() => setToday(companyToday()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const companyId = user?.activeCompanyId;
  const campaigns = useQuery<any[]>({
    queryKey: ["/api/customers", customerId, "campaign-items", companyId, user?.id, user?.activeRole],
    enabled: !!customerId && !!companyId, staleTime: 0, refetchInterval: 60_000,
    queryFn: async ({ signal }) => (await apiRequest("GET", `/api/customers/${customerId}/campaign-items`, undefined,
      { headers: { "X-Company-Id": companyId! }, signal })).json(),
  });
  const canReadVisits = ["admin", "office", "field_manager"].includes(user?.accessRole ?? "");
  const visits = useQuery<any[]>({
    queryKey: ["/api/visits", "customer-services", customerId, companyId, user?.id, user?.activeRole, today],
    enabled: !!customerId && !!companyId && canReadVisits, staleTime: 0, refetchInterval: 60_000,
    queryFn: async ({ signal }) => (await apiRequest("GET",
      `/api/visits?customerId=${encodeURIComponent(customerId!)}&from=${addDaysYmd(today, -31)}&to=${addDaysYmd(today, 31)}`, undefined,
      { headers: { "X-Company-Id": companyId! }, signal })).json(),
  });
  const items = (campaigns.data ?? []).map(normalizeCampaignItem);
  const services: CustomerService[] = items.map(i => ({
    id: `campaign:${i.id}`, source: "campaign", title: i.campaignTitle,
    serviceKey: i.servicePlanCategory ?? i.campaign?.serviceKey ?? null,
    start: i.campaignWindowStart.slice(0, 10), end: i.campaignWindowEnd.slice(0, 10),
    state: classifyCustomerService(i.status, i.campaignWindowStart.slice(0, 10), i.campaignWindowEnd.slice(0, 10), today),
    completedAt: i.completedAt ?? null,
  }));
  // Campaign-linked or ticket trips are not separate service demand. Include
  // only route occurrences, preserving their own stable identity.
  for (const v of visits.data ?? []) if (v.sourceType === "route") services.push({
    id: `route:${v.id}`, source: "route", title: v.title ?? v.serviceKey ?? "",
    serviceKey: v.serviceKey ?? null, start: v.visitDate, end: v.visitDate,
    state: classifyCustomerService(v.status, v.visitDate, v.visitDate, today),
    completedAt: v.completedAt ?? null,
  });
  return { items, services,
    isLoading: campaigns.isLoading || (canReadVisits && visits.isLoading), error: campaigns.error ?? visits.error,
    routeWindow: { from: addDaysYmd(today, -31), to: addDaysYmd(today, 31) } };
}
