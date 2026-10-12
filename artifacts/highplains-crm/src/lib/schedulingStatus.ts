import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addCalendarDays, COMPANY_TIME_ZONE, computeScheduleBy, localDateString, type Priority } from "../shared/scheduleBy";

export interface SchedulingStatusResponse {
  schedulingStatusId: string | null;
  schedulingStatusIds?: string[];
}

export function schedulingStatusIds(data: SchedulingStatusResponse): ReadonlySet<string> {
  return new Set(data.schedulingStatusIds ?? (data.schedulingStatusId ? [data.schedulingStatusId] : []));
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/**
 * Server-owned set of every "Needs scheduling" status id (Task, Estimate Request,
 * Project). The singular schedulingStatusId is legacy and only covers one type,
 * so it is used solely as a fallback when the plural list is absent.
 */
export function useSchedulingStatusSet(): ReadonlySet<string> {
  const { data } = useQuery<SchedulingStatusResponse>({ queryKey: ["/api/scheduling-status"] });
  return useMemo(() => {
    if (!data) return EMPTY_SET;
    return schedulingStatusIds(data);
  }, [data]);
}

export function isNeedsSchedulingStatus(
  set: ReadonlySet<string> | undefined,
  statusId: string | null | undefined,
): boolean {
  return !!set && !!statusId && set.has(statusId);
}

/**
 * Company calendar day (YYYY-MM-DD) in Colorado. schedule_by and follow_up_date
 * are Colorado calendar dates; neither server nor browser uses its host zone.
 */
export { COMPANY_TIME_ZONE };

export function companyToday(now: Date = new Date()): string {
  return localDateString(now);
}

/** Parse YYYY-MM-DD as a local noon Date (never UTC midnight). */
export function parseCalendarDate(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

export function addDaysYmd(ymd: string, days: number): string {
  return addCalendarDays(ymd, days);
}

/** Date pickers encode calendar components in browser-local Dates, not instants. */
export function calendarDateString(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM-DD strings compare lexically. */
export function isBeforeCompanyToday(ymd: string | null | undefined): boolean {
  return !!ymd && ymd.slice(0, 10) < companyToday();
}

/** Preview of the server's schedule-by, based on the Colorado day. */
export function previewScheduleBy(priority: Priority | string | null | undefined): string {
  return computeScheduleBy(priority, new Date());
}

import type { QueryClient } from "@tanstack/react-query";

/**
 * Official refetch after anything that can change a ticket's scheduling state
 * (status, crew/date, schedule-by, follow-up, accept/send-back, assignee).
 * The server owns the resulting status, so never patch the cache by guessing.
 */
export function invalidateTicketScheduling(
  client: QueryClient,
  ticketId: string | undefined,
  customerId?: string | null,
): void {
  if (ticketId) client.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
  client.invalidateQueries({ queryKey: ["/api/tickets"] });
  client.invalidateQueries({ queryKey: ["/api/tickets/my"] });
  client.invalidateQueries({ queryKey: ["/api/dashboard/action-queue"] });
  client.invalidateQueries({ queryKey: ["/api/dashboard/pulse"] });
  client.invalidateQueries({ queryKey: ["/api/scheduling-status"] });
  client.invalidateQueries({ queryKey: ["/api/pending-invoices"] });
  if (customerId) client.invalidateQueries({ queryKey: ["/api/customers", customerId, "tickets"] });
}
