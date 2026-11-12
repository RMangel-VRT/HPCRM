import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";
import { readCalendar, serviceCalendarKey } from "@/pages/service-calendar/helpers";

/** No fallback package: an unavailable company calendar is an explicit form state. */
export function useScopeCalendar() {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId ?? "";
  const query = useQuery({
    queryKey: [...serviceCalendarKey(companyId, user?.id ?? "", user?.activeRole ?? ""), "scope"],
    enabled: !!companyId, retry: false, staleTime: 0,
    queryFn: async () => readCalendar(await apiRequest("GET", "/api/service-calendar", undefined,
      { headers: { "X-Company-Id": companyId } })),
  });
  return { ...query, entries: !query.isError && query.data ? query.data.entries : null };
}
