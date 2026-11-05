import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  errorMessage, fetchRouteNeeds, fetchRouteProgress, fetchRouteStatus, fetchRouteStops, fetchRouteSummary, fetchRoutePreview,
  invalidateRoutes, routeKeys, type ApplyCalendarResult, type FillResult, type RouteStop, type SlideResult,
} from "@/lib/routes";

const STALE = 30_000;
export const ROUTE_ROLES = ["admin", "office", "field_manager", "irrigation_manager"] as const;
export const canUseRoutes = (role: string | null | undefined) => (ROUTE_ROLES as readonly string[]).includes(role ?? "");

export function useRouteStatus(service = "mowing", enabled = true) {
  const { user } = useAuth();
  const c = user ? `${user.activeCompanyId}:${user.id}` : null;
  return useQuery({ queryKey: routeKeys.status(c, service), queryFn: () => fetchRouteStatus(service, user?.activeCompanyId), enabled: enabled && !!c, staleTime: STALE, retry: false });
}
export function useRouteStops() {
  const { user } = useAuth();
  const c = user ? `${user.activeCompanyId}:${user.id}` : null;
  return useQuery({ queryKey: routeKeys.stops(c), queryFn: () => fetchRouteStops(user?.activeCompanyId), enabled: !!c, staleTime: STALE });
}
export function useRouteCrews(companyId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["/api/routes", "crews", companyId, user?.id],
    queryFn: async () => (await (await apiRequest("GET", "/api/routes/crews", undefined, {
      headers: companyId ? { "X-Company-Id": companyId } : {},
    })).json()) as import("@/lib/scheduling").BoardCrew[],
    enabled: !!companyId, staleTime: STALE,
  });
}
export function useRouteNeeds(service: string) {
  const { user } = useAuth();
  const c = user ? `${user.activeCompanyId}:${user.id}` : null;
  return useQuery({ queryKey: routeKeys.needs(c, service), queryFn: () => fetchRouteNeeds(service, user?.activeCompanyId), enabled: !!c, staleTime: STALE });
}
export function useRouteProgress(customerId: string | null | undefined, service: string, season?: number) {
  const { user } = useAuth();
  const c = user ? `${user.activeCompanyId}:${user.id}` : null;
  return useQuery({
    queryKey: routeKeys.progress(c, customerId ?? "none", service, season),
    queryFn: () => fetchRouteProgress(customerId as string, service, season, user?.activeCompanyId), enabled: !!c && !!customerId, staleTime: STALE,
  });
}
export function useCustomerRouteSummary(customerId: string | null | undefined) {
  const { user } = useAuth();
  const c = user ? `${user.activeCompanyId}:${user.id}` : null;
  return useQuery({ queryKey: routeKeys.summary(c, customerId ?? "none"), queryFn: () => fetchRouteSummary(customerId as string, user?.activeCompanyId), enabled: !!c && !!customerId, staleTime: STALE, retry: false });
}
export function useRoutePreview() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["/api/routes", "preview", user?.activeCompanyId, user?.id],
    queryFn: () => fetchRoutePreview(user?.activeCompanyId), enabled: !!user?.activeCompanyId, staleTime: STALE, retry: false });
}

export type StopInput = Partial<Pick<RouteStop, "crewId" | "weekday" | "everyWeeks" | "minutes" | "seasonStart" | "seasonEnd" | "pausedUntil" | "notes" | "anchorDate">>;

/** All Routes writes. Refuses when the company changed mid-flight; always reconciles from the server. */
export function useRouteActions() {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  // Latest company, read only to detect a switch. Writes bind the company of the render that initiated them.
  const companyRef = useRef(companyId);
  companyRef.current = companyId;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState(0);

  const run = useCallback(async <T,>(fn: (company: string) => Promise<T>, failTitle: string): Promise<T | null> => {
    const started = companyId;
    if (!started || started !== companyRef.current) {
      toast({ title: "Company changed. Reload Routes and try again.", variant: "destructive" });
      return null;
    }
    setPending(n => n + 1);
    try {
      const data = await fn(started);
      invalidateRoutes(qc);
      return started === companyRef.current ? data : null;
    } catch (err) {
      invalidateRoutes(qc);
      if (started === companyRef.current) toast({ title: failTitle, description: errorMessage(err).message, variant: "destructive" });
      return null;
    } finally { setPending(n => n - 1); }
  }, [qc, toast, companyId]);

  const call = <T,>(method: string, url: string, body?: unknown) => async (company: string) =>
    (await (await apiRequest(method, url, body, { headers: { "X-Company-Id": company } })).json()) as T;

  return {
    companyId, pending: pending > 0,
    createStop: (body: Record<string, unknown>) => run(call<RouteStop>("POST", "/api/routes/stops", body), "Couldn't add the stop"),
    patchStop: (id: string, body: StopInput) => run(call<RouteStop>("PATCH", `/api/routes/stops/${id}`, body), "Couldn't update the stop"),
    removeStop: (id: string) => run(call<{ cancelled: number }>("DELETE", `/api/routes/stops/${id}`), "Couldn't remove the stop"),
    reorder: (body: { crewId: string; weekday: number; serviceKey: string; stopIds: string[] }) =>
      run(call<{ ok: boolean }>("POST", "/api/routes/stops/reorder", body), "Couldn't reorder the route"),
    applyCalendar: (id: string, expectedUpdatedAt: string) =>
      run(call<ApplyCalendarResult>("POST", `/api/routes/stops/${id}/apply-calendar`, { expectedUpdatedAt }), "Calendar visits were not updated"),
    fill: () => run(call<FillResult>("POST", "/api/routes/fill", {}), "Couldn't fill the calendar"),
    slide: (body: { date: string; crewIds: "all" | string[]; mode: "day" | "week" }) =>
      run(call<SlideResult>("POST", "/api/routes/slide", body), "Rain day didn't apply"),
  };
}
