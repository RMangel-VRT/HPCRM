import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";
import type { TicketNextStop, SchedulingSkipResult } from "@workspace/api-client-react";
import {
  STALE_MS,
  fetchBoardCrews,
  fetchQueue,
  fetchTicketVisits,
  fetchVisitSummary,
  fetchVisits,
  focusVisitsCard,
  fmtStopDay,
  invalidateSchedulingEverywhere,
  isOpenVisit,
  mergeReorder,
  parseServerError,
  schedulingKeys,
  sortRoute,
  syncMessage,
  type EnrichedVisit,
  type TicketSync,
  type VisitMutationResult,
} from "@/lib/scheduling";

export function useSchedulingQueue(companyId: string | null | undefined, enabled = true, _opts?: { badge?: boolean }) {
  return useQuery({
    queryKey: schedulingKeys.queue(companyId),
    queryFn: fetchQueue,
    enabled: enabled && !!companyId,
    staleTime: STALE_MS,
    refetchInterval: _opts?.badge ? 60_000 : false,
  });
}

export function useBoardCrews(companyId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: schedulingKeys.crews(companyId),
    queryFn: fetchBoardCrews,
    enabled: enabled && !!companyId,
    staleTime: STALE_MS,
  });
}

export function useWeekVisits(companyId: string | null | undefined, from: string, to: string, service: string) {
  return useQuery({
    queryKey: schedulingKeys.visits(companyId, from, to, service),
    queryFn: () => fetchVisits(from, to, service || undefined),
    enabled: !!companyId,
    staleTime: STALE_MS,
  });
}

export function useWeekSummary(companyId: string | null | undefined, from: string, to: string, service: string) {
  return useQuery({
    queryKey: schedulingKeys.summary(companyId, from, to, service),
    queryFn: () => fetchVisitSummary(from, to, service || undefined),
    enabled: !!companyId,
    staleTime: STALE_MS,
  });
}

export function useTicketVisits(companyId: string | null | undefined, ticketId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: schedulingKeys.ticketVisits(companyId, ticketId),
    queryFn: () => fetchTicketVisits(ticketId as string, companyId),
    enabled: enabled && !!companyId && !!ticketId,
    staleTime: STALE_MS,
  });
}

export type OfferedStop = TicketNextStop & { snapshot: string };
export function useTicketNextStop(companyId: string | null | undefined, ticketId: string, enabled: boolean) {
  return useQuery({
    queryKey: schedulingKeys.nextStop(companyId, ticketId),
    enabled: enabled && !!companyId,
    staleTime: STALE_MS,
    queryFn: async (): Promise<OfferedStop | null> => {
      const response = await apiRequest("GET", `/api/tickets/${ticketId}/next-stop`, undefined, { headers: { "X-Company-Id": companyId! } });
      const body: TicketNextStop | null = await response.json();
      if (!body) return null;
      const snapshot = response.headers.get("X-Next-Stop-Snapshot");
      if (!snapshot) throw new Error("Next stop could not be verified.");
      return { ...body, snapshot };
    },
  });
}

export type OpenVisitGuard =
  | { state: "unknown"; reason: "loading" | "error"; retry: () => void }
  | { state: "ready"; hasOpen: boolean; openCount: number };

/**
 * Whether a ticket has open visits. Pending/failed/disabled queries are NEVER a confirmed empty list.
 */
export function openVisitGuard(q: { data?: EnrichedVisit[]; isError: boolean; isFetching?: boolean; refetch: () => unknown }): OpenVisitGuard {
  if (q.isError) return { state: "unknown", reason: "error", retry: () => void q.refetch() };
  if (!q.data || q.isFetching) return { state: "unknown", reason: "loading", retry: () => void q.refetch() };
  const openCount = q.data.filter(isOpenVisit).length;
  return { state: "ready", hasOpen: openCount > 0, openCount };
}

export function useTicketOpenVisitGuard(companyId: string | null | undefined, ticketId: string | undefined, capable: boolean): OpenVisitGuard | null {
  const q = useTicketVisits(companyId, ticketId, capable);
  if (!capable) return null;
  return openVisitGuard(q);
}

export interface PlaceInput { ticketId?: string; crewId: string; visitDate: string; estimatedHours?: number | null; startTime?: string | null; notes?: string | null; title?: string | null }
export interface PatchInput { crewId?: string; visitDate?: string; estimatedHours?: number | null; startTime?: string | null; notes?: string | null; serviceKey?: string | null }
interface Ctx { companyId?: string | null; ticketTitle?: string; crewName?: string | null; ticketId?: string | null; ticketPage?: boolean }

export function useVisitActions() {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const companyRef = useRef(companyId);
  companyRef.current = companyId;
  const [pending, setPending] = useState(0);

  const fail = useCallback((err: unknown, ticketId?: string | null, ticketPage?: boolean) => {
    const { message, code } = parseServerError(err);
    toast({
      title: t("scheduling.errorTitle", "Couldn't update the schedule"),
      description: ticketPage && code === "VISIT_CLOSED" ? t("scheduling.ticket.closedStop", "This stop is no longer open.")
        : ticketPage && code === "NOT_FOUND" ? t("scheduling.ticket.missingStop", "This stop could not be found.")
        : code === "MULTIPLE_VISITS" ? t("scheduling.ticket.multiple", "This job is on the schedule more than once. Change it under On the schedule below.")
        : message,
      variant: "destructive",
      action: code === "MULTIPLE_VISITS" && ticketId ? (
        <ToastAction
          altText={t("scheduling.ticket.heading", "On the schedule")}
          onClick={() => {
            if (window.location.pathname.endsWith(`/dashboard/tickets/${ticketId}`)) focusVisitsCard(0);
            else { navigate(`/dashboard/tickets/${ticketId}`); focusVisitsCard(600); }
          }}
        >
          {t("scheduling.ticket.heading", "On the schedule")}
        </ToastAction>
      ) : undefined,
    });
  }, [toast, t, navigate]);

  /** Runs one write. Refuses when the active company changed; always reconciles from the server. */
  const run = useCallback(async <T,>(
    ctx: Ctx,
    fn: (started: string) => Promise<T>,
    after?: (data: T, sameCompany: boolean) => void,
  ): Promise<T | null> => {
    const started = ctx.companyId ?? companyRef.current;
    if (!started || started !== companyRef.current) {
      toast({ title: t("scheduling.companyChanged", "Company changed. Reload the schedule and try again."), variant: "destructive" });
      return null;
    }
    setPending(n => n + 1);
    try {
      const data = await fn(started);
      const same = started === companyRef.current;
      invalidateSchedulingEverywhere(qc, { ticketId: ctx.ticketId });
      after?.(data, same);
      return data;
    } catch (err) {
      invalidateSchedulingEverywhere(qc, { ticketId: ctx.ticketId });
      if (started === companyRef.current) fail(err, ctx.ticketId, ctx.ticketPage);
      return null;
    } finally {
      setPending(n => n - 1);
    }
  }, [qc, toast, t, fail]);

  const announce = (sync: TicketSync | undefined, c: Parameters<typeof syncMessage>[1]) => {
    const m = syncMessage(sync, c, (k, d) => t(k, d));
    if (m) toast({ title: m.title });
  };

  const createVisit = useCallback((input: PlaceInput, ctx: Ctx = {}) =>
    run<VisitMutationResult>({ ...ctx, ticketId: input.ticketId ?? ctx.ticketId },
      async started => (await apiRequest("POST", "/api/visits", input, { headers: { "X-Company-Id": started } })).json(),
      (v, same) => same && announce(v.ticketSync, { title: ctx.ticketTitle, crewName: ctx.crewName, date: input.visitDate })), [run]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchVisit = useCallback((id: string, input: PatchInput, ctx: Ctx = {}) =>
    run<VisitMutationResult>(ctx,
      async started => (await apiRequest("PATCH", `/api/visits/${id}`, input, { headers: { "X-Company-Id": started } })).json(),
      (v, same) => same && announce(v.ticketSync, { title: ctx.ticketTitle, crewName: ctx.crewName, date: input.visitDate ?? v.visitDate })), [run]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeVisit = useCallback((id: string, ctx: Ctx = {}) =>
    run<{ ticketSync?: TicketSync } | null>(ctx,
      async started => {
        const res = await apiRequest("DELETE", `/api/visits/${id}`, undefined, { headers: { "X-Company-Id": started } });
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      },
      (body, same) => {
        if (!same) return;
        if (body?.ticketSync) announce(body.ticketSync, { removed: true });
        else toast({ title: t("scheduling.removed", "Removed from schedule") });
      }), [run, toast, t]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Reorders a crew-day. `visibleIds` is the new order of the visible open visits. When the board is
   * filtered the full unfiltered open set is fetched so hidden visits keep their relative slots.
   */
  const reorderCrewDay = useCallback((args: { crewId: string; visitDate: string; visibleIds: string[]; filtered: boolean }, ctx: Ctx = {}) =>
    run<{ ok: boolean }>(ctx, async () => {
      let ids = args.visibleIds;
      if (args.filtered) {
        const all = await fetchVisits(args.visitDate, args.visitDate, undefined, args.crewId);
        const full = sortRoute(all.filter(v => v.crewId === args.crewId && isOpenVisit(v))).map(v => v.id);
        ids = mergeReorder(full, args.visibleIds);
      }
      return (await apiRequest("POST", "/api/visits/reorder", { crewId: args.crewId, visitDate: args.visitDate, visitIds: ids })).json();
    }), [run]);

  const placeAfterNextStop = (ticketId: string, next: OfferedStop, property: string) =>
    run<VisitMutationResult>({ companyId, ticketId },
      async started => (await apiRequest("POST", `/api/tickets/${ticketId}/schedule-next-stop`, undefined,
        { headers: { "X-Company-Id": started, "If-Match": next.snapshot } })).json(),
      (result, same) => {
        if (same) toast({ title: t("scheduling.ticket.addedNext", "Added to {{crew}}’s stop at {{property}}, {{date}}.", {
          crew: next.crew.name, property, date: fmtStopDay(result.visitDate, t("scheduling.dateLocale", "en-US")),
        }) });
      });
  const skipScheduling = (ticketId: string, reason: string, openedCompany: string | undefined) =>
    run<SchedulingSkipResult>({ companyId: openedCompany, ticketId },
      async started => (await apiRequest("POST", `/api/tickets/${ticketId}/skip-scheduling`, { reason },
        { headers: { "X-Company-Id": started } })).json(),
      (_, same) => { if (same) toast({ title: t("scheduling.ticket.skipped", "Scheduling skipped") }); });

  return { companyId, pending: pending > 0, createVisit, patchVisit, removeVisit, reorderCrewDay, placeAfterNextStop, skipScheduling };
}
