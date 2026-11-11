import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { RoundCalendar, RoundListsResponse, StandingCrew } from "@/lib/roundLists";

const hdr = (companyId?: string | null) => ({ headers: { "X-Company-Id": companyId ?? "" } });

export function useRoundLists(campaignId: string | undefined, enabled = true) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  return useQuery<RoundListsResponse>({
    queryKey: ["/api/campaigns", campaignId, "round-lists", companyId],
    queryFn: async () => (await apiRequest("GET", `/api/campaigns/${campaignId}/round-lists`, undefined, hdr(companyId))).json(),
    enabled: !!campaignId && enabled,
    refetchInterval: 30_000,
  });
}

export function useStandingCrews(enabled: boolean) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  return useQuery<StandingCrew[]>({
    queryKey: ["/api/crews", companyId],
    queryFn: async () => (await apiRequest("GET", "/api/crews", undefined, hdr(companyId))).json(),
    enabled,
  });
}

export function useRoundCalendar(from: string, through: string) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  return useQuery<RoundCalendar>({
    queryKey: ["/api/campaign-rounds/calendar", companyId, from, through],
    queryFn: async () => (await apiRequest("GET", `/api/campaign-rounds/calendar?from=${from}&through=${through}`, undefined, hdr(companyId))).json(),
    enabled: !!companyId && !!from && !!through,
    refetchInterval: 30_000,
  });
}

export function useRoundActions(campaignId: string) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
    void queryClient.invalidateQueries({ queryKey: ["/api/campaign-rounds/calendar"] });
  };
  const call = (method: string, path: string, body: unknown) =>
    apiRequest(method, `/api/campaigns/${campaignId}${path}`, body, hdr(companyId)).then(r => r.json().catch(() => ({})));
  return {
    move: useMutation({ mutationFn: (b: { itemIds: string[]; assignedCampaignCrewId: string | null; beforeItemId?: string | null }) => call("PUT", "/round-order", b), onSuccess: done }),
    addCrew: useMutation({ mutationFn: (crewId: string) => call("POST", "/crews", { crewId }), onSuccess: done }),
    copySplit: useMutation({ mutationFn: () => call("POST", "/copy-previous-split", {}), onSuccess: done }),
    start: useMutation({ mutationFn: () => call("POST", "/start-round", { confirm: true }), onSuccess: done }),
    dates: useMutation({ mutationFn: (b: { itemId: string; targetDate: string | null; backupDate: string | null }) =>
      call("PATCH", `/items/${b.itemId}`, { targetDate: b.targetDate, backupDate: b.backupDate }), onSuccess: done }),
  };
}
