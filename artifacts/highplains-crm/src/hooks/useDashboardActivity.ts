import { useQuery } from "@tanstack/react-query";
import { useCustomerScope } from "@/lib/customerScope";

export interface DashboardCommunication {
  id: string; title: string | null; at: string; person: string | null; channel: string | null; direction: string | null;
}
export interface DashboardTicketChange { id: string; ticketId: string; title: string; at: string }
export interface DashboardActivity { communications?: DashboardCommunication[]; ticketChanges: DashboardTicketChange[] }

/**
 * CP3: latest contacts and ticket changes for one customer. The server scopes by company + viewer
 * (and the viewer's permitted mailboxes); `mailboxIds` optionally narrows further. There is no
 * app-wide mailbox selection today, so the dashboard passes none and gets every permitted mailbox.
 */
export function useDashboardActivity(customerId?: string, mailboxIds: string[] = []) {
  const scope = useCustomerScope();
  const mailboxKey = [...mailboxIds].sort().join(",");
  return useQuery<DashboardActivity>({
    queryKey: ["/api/customers", customerId ?? "", "dashboard-activity", ...scope.scope, mailboxKey || "all-permitted"],
    enabled: !!customerId && scope.enabled,
    staleTime: 30_000, refetchInterval: 60_000,
    queryFn: ({ signal }) => scope.getJson<DashboardActivity>(
      `/api/customers/${customerId}/dashboard-activity${mailboxKey ? `?mailboxIds=${encodeURIComponent(mailboxKey)}` : ""}`, signal),
  });
}
