import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { addDaysYmd, calendarDateString, companyToday, parseCalendarDate } from "@/lib/schedulingStatus";

export const SERVICE_OPTIONS = [
  { key: "mowing", label: "Mowing" },
  { key: "pet_station", label: "Pet stations" },
  { key: "chemical", label: "Chemical" },
  { key: "shrub_trimming", label: "Shrub trimming" },
  { key: "ornamental_grass", label: "Ornamental grass" },
  { key: "aeration", label: "Aeration" },
  { key: "cleanups", label: "Cleanups" },
  { key: "tree_pruning", label: "Tree pruning" },
] as const;

export type Tr = (key: string, fallback: string) => string;
export function serviceLabel(key: string | null | undefined, tr?: Tr): string {
  if (!key) return "";
  const base = SERVICE_OPTIONS.find(s => s.key === key)?.label ?? key.replace(/_/g, " ");
  if (tr) return tr(`scheduling.services.${key}`, base);
  return SERVICE_OPTIONS.find(s => s.key === key)?.label ?? key.replace(/_/g, " ");
}

export type VisitStatus = "planned" | "in_progress" | "done" | "skipped" | "cancelled";
export const OPEN_STATUSES: readonly string[] = ["planned", "in_progress"];
export const isOpenVisit = (v: { status: string }) => OPEN_STATUSES.includes(v.status);

export interface VisitCustomer { id: string; name: string; street?: string | null; city?: string | null; state?: string | null; zip?: string | null }
export interface EnrichedVisit {
  id: string;
  crewId: string | null;
  visitDate: string;
  sourceType: string;
  ticketId: string | null;
  customerId: string | null;
  title: string | null;
  routeOrder: number | null;
  startTime: string | null;
  estimatedHours: number | null;
  status: VisitStatus;
  notes: string | null;
  serviceKey?: string | null;
  ticket: { id: string; title: string; typeKey: string | null; typeName: string | null; statusKey: string | null; statusName: string | null; priority: string; scheduleBy: string | null } | null;
  customer: VisitCustomer | null;
  crew: { id: string; name: string; color: string | null } | null;
}
export interface VisitDaySummary { crewId: string | null; date: string; visitCount: number; plannedHours: number; capacityHours: number }
export interface TicketSync { statusChanged: boolean; newStatusKey: string | null }
export type VisitMutationResult = EnrichedVisit & { ticketSync?: TicketSync };
export interface BoardCrew { id: string; name: string; color: string; defaultHoursPerDay: number; supervisorName?: string | null; displayOrder?: number | null }

export interface QueueItem {
  id: string;
  title: string;
  typeKey: string | null;
  typeName: string | null;
  priority: string;
  scheduleBy: string | null;
  serviceType: string | null;
  customer: { id: string; name: string; city: string | null } | null;
  followUpDate: string | null;
  createdAt: string;
  visit?: { id: string; visitDate: string; crewId: string | null; crewName?: string | null };
}
export interface SchedulingQueue { needsScheduling: QueueItem[]; slipped: QueueItem[] }

export const STALE_MS = 30_000;

/* ---------- keys: always company-scoped ---------- */
export const schedulingKeys = {
  queue: (companyId: string | null | undefined) => ["/api/scheduling/queue", companyId ?? "none"] as const,
  crews: (companyId: string | null | undefined) => ["/api/crews/board", companyId ?? "none"] as const,
  visits: (companyId: string | null | undefined, from: string, to: string, service: string) =>
    ["/api/visits", companyId ?? "none", from, to, service || "all"] as const,
  summary: (companyId: string | null | undefined, from: string, to: string, service: string) =>
    ["/api/visits/summary", companyId ?? "none", from, to, service || "all"] as const,
  ticketVisits: (companyId: string | null | undefined, ticketId: string | undefined) =>
    ["/api/tickets", ticketId ?? "none", "visits", companyId ?? "none"] as const,
};

/* ---------- explicit fetchers (default query fn would join keys into the URL) ---------- */
async function getJson<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  return (await res.json()) as T;
}
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  return p.toString();
};
export const fetchQueue = () => getJson<SchedulingQueue>("/api/scheduling/queue");
export const fetchBoardCrews = () => getJson<BoardCrew[]>("/api/crews/board");
export const fetchVisits = (from: string, to: string, service?: string, crewId?: string) =>
  getJson<EnrichedVisit[]>(`/api/visits?${qs({ from, to, service, crewId })}`);
export const fetchVisitSummary = (from: string, to: string, service?: string) =>
  getJson<VisitDaySummary[]>(`/api/visits/summary?${qs({ from, to, service })}`);
export const fetchTicketVisits = (ticketId: string) => getJson<EnrichedVisit[]>(`/api/tickets/${ticketId}/visits`);

/* ---------- week / URL ---------- */
export function mondayOf(ymd: string): string {
  const d = parseCalendarDate(ymd);
  const dow = d.getDay(); // 0 Sun
  return addDaysYmd(ymd, dow === 0 ? -6 : 1 - dow);
}
const YMD = /^\d{4}-\d{2}-\d{2}$/;
export function isValidYmd(s: string | null | undefined): s is string {
  if (!s || !YMD.test(s)) return false;
  return calendarDateString(parseCalendarDate(s)) === s;
}
export function weekFromSearch(search: string, today: string = companyToday()): string {
  const w = new URLSearchParams(search).get("week");
  return mondayOf(isValidYmd(w) ? w : today);
}
export function weekToSearch(monday: string): string {
  return `?week=${monday}`;
}
export function weekDays(monday: string, includeSunday: boolean): string[] {
  return Array.from({ length: includeSunday ? 7 : 6 }, (_, i) => addDaysYmd(monday, i));
}

/* ---------- capacity ---------- */
export type CapacityTone = "ok" | "amber" | "red";
export function capacityTone(hours: number, capacity: number): CapacityTone {
  if (capacity <= 0) return hours > 0 ? "red" : "ok";
  const pct = (hours / capacity) * 100;
  if (pct > 100) return "red";
  if (pct >= 90) return "amber";
  return "ok";
}
export const fmtHours = (n: number) => (Math.round(n * 10) / 10).toString();

/* ---------- reorder ---------- */
/** Hidden (filtered-out) open visits keep their slots; visible ones fill the remaining slots in the new order. */
export function mergeReorder(fullOpenIds: string[], visibleNewOrder: string[]): string[] {
  const visible = new Set(visibleNewOrder);
  let i = 0;
  return fullOpenIds.map(id => (visible.has(id) ? visibleNewOrder[i++] : id));
}
export function sortRoute<T extends { routeOrder: number | null }>(list: T[]): T[] {
  return list
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v.routeOrder ?? Infinity) - (b.v.routeOrder ?? Infinity) || a.i - b.i)
    .map(x => x.v);
}
export function moveInList<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/* ---------- errors ---------- */
export interface ParsedError { message: string; code?: string }
export function parseServerError(err: unknown): ParsedError {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d{3}:\s*/, "");
  try {
    const j = JSON.parse(body);
    if (j && typeof j === "object") {
      return { message: String(j.message ?? j.error ?? body), code: typeof j.error === "string" ? j.error : j.code };
    }
  } catch { /* plain text */ }
  return { message: body || "Request failed" };
}

/* ---------- formatting ---------- */
export function fmtDay(ymd: string): string {
  return parseCalendarDate(ymd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
const STATUS_LABELS: Record<string, string> = { scheduled: "Scheduled", ready_to_schedule: "Needs scheduling", in_progress: "In progress", planned: "Planned", done: "Done", skipped: "Skipped", cancelled: "Cancelled" };
export function statusLabel(key: string | null, tr?: Tr): string {
  if (!key) return "";
  const base = STATUS_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
  return tr && STATUS_LABELS[key] ? tr(`scheduling.status.${key}`, base) : base;
}
export function syncMessage(
  sync: TicketSync | undefined,
  ctx: { title?: string; crewName?: string | null; date?: string; removed?: boolean },
  tr?: Tr,
): { title: string } | null {
  const f = (k: string, d: string, v: Record<string, string> = {}) => {
    const raw = tr ? tr(`scheduling.${k}`, d) : d;
    return raw.replace(/\{\{(\w+)\}\}/g, (_, n) => v[n] ?? "");
  };
  if (!sync?.statusChanged) return null;
  if (ctx.removed) {
    return sync.newStatusKey === "ready_to_schedule" ? { title: f("backToNeeds", "Back to Needs scheduling") } : { title: f("statusOnly", "Status → {{status}}", { status: statusLabel(sync.newStatusKey, tr) }) };
  }
  const where = [ctx.crewName, ctx.date ? fmtDay(ctx.date) : null].filter(Boolean).join(", ");
  return { title: f("statusArrow", "{{title}} → {{status}}{{where}}", { title: ctx.title ?? "Ticket", status: statusLabel(sync.newStatusKey, tr), where: where ? ` (${where})` : "" }) };
}

/* ---------- invalidation ---------- */
export function invalidateSchedulingEverywhere(client: QueryClient, opts: { ticketId?: string | null; customerId?: string | null } = {}) {
  const keys: unknown[][] = [
    ["/api/visits"],
    ["/api/visits/summary"],
    ["/api/scheduling/queue"],
    ["/api/tickets"],
    ["/api/tickets/my"],
    ["/api/dashboard/action-queue"],
    ["/api/dashboard/pulse"],
    ["/api/scheduling-status"],
  ];
  for (const queryKey of keys) client.invalidateQueries({ queryKey });
  if (opts.ticketId) {
    client.invalidateQueries({ queryKey: ["/api/tickets", opts.ticketId, "visits"] });
    client.invalidateQueries({ queryKey: ["/api/tickets", opts.ticketId, "details"] });
  }
  if (opts.customerId) client.invalidateQueries({ queryKey: ["/api/customers", opts.customerId, "tickets"] });
  else client.invalidateQueries({ queryKey: ["/api/customers"] });
}

export const VISITS_CARD_ID = "ticket-visits-card";
export function focusVisitsCard(delay = 80): void {
  setTimeout(() => {
    const el = document.getElementById(VISITS_CARD_ID);
    if (!el) return;
    el.scrollIntoView?.({ behavior: "smooth", block: "start" });
    el.focus?.({ preventScroll: true });
  }, delay);
}
