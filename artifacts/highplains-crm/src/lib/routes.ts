import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { addDaysYmd, companyToday, parseCalendarDate } from "@/lib/schedulingStatus";
import type { EnrichedVisit } from "@/lib/scheduling";

/* ---------- services ---------- */
export const ROUTE_SERVICES = [
  { key: "mowing", label: "Mowing", token: "--svc-mowing" },
  { key: "pet_station", label: "Pet stations", token: "--svc-pet" },
  { key: "winter_visits", label: "Winter visits", token: "--svc-winter" },
  { key: "irrigation_inspection", label: "Irrigation checks", token: "--svc-irrigation" },
] as const;
export type RouteServiceKey = typeof ROUTE_SERVICES[number]["key"];
export const isRouteService = (k: string | null | undefined): k is RouteServiceKey => ROUTE_SERVICES.some(s => s.key === k);
export const routeServiceLabel = (k: string | null | undefined) => ROUTE_SERVICES.find(s => s.key === k)?.label ?? (k ?? "").replace(/_/g, " ");
export const serviceColorVar = (k: string | null | undefined) => `var(${ROUTE_SERVICES.find(s => s.key === k)?.token ?? "--svc-mowing"})`;

export const PLANNER_REPLACED_MESSAGE = "The Maintenance planner was replaced by Routes. This is a read-only record of the 2026 planner.";
export const WEEKDAYS = [
  { n: 1, short: "Mon", long: "Monday" }, { n: 2, short: "Tue", long: "Tuesday" }, { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" }, { n: 5, short: "Fri", long: "Friday" }, { n: 6, short: "Sat", long: "Saturday" },
] as const;
export const weekdayName = (n: number) => WEEKDAYS.find(w => w.n === n)?.long ?? "";

/* ---------- types (contracts owned by the API) ---------- */
export interface RouteContract {
  agreementId: string; termId: string; seasonLabel: string; sourceDescription: string;
  quantity: number | null; monthSpread: number[] | null; startDate: string; endDate: string;
  window?: { start: string; end: string } | null;
}
export interface RouteStop {
  id: string; customerId: string | null; serviceKey: RouteServiceKey; crewId: string; weekday: number; everyWeeks: number;
  anchorDate: string; sortOrder: number; minutes: number; seasonStart: string | null; seasonEnd: string | null;
  pausedUntil: string | null; isActive: boolean; notes: string | null; updatedAt: string;
  property: { id: string; name: string } | null;
  crew: { id: string; name: string; color: string | null; isActive: boolean } | null;
  season: { start: string; end: string; contractStatus: "covered" | "override"; months?: number[] } | null;
  contractStatus: string;
  contract?: RouteContract | null;
  reportYear?: number;
}
export interface RouteNeed {
  customerId: string; name: string; serviceKey: RouteServiceKey; season: number; reason: string; stopId?: string;
  contract?: RouteContract | null; minutes?: number | null;
}
export interface RouteStatus {
  imported: boolean; plannerReadOnly: boolean; latestVisitDate: string | null;
  season: { year: number; start: string; end: string } | null; plannerMessage: string;
}
export interface RouteDecision {
  id: string; customerId: string | null; propertyName: string; crewId: string | null; crewName: string | null;
  weekday: number; serviceKey: string; minutes: number | null; reason: string;
}
export interface RouteProgress {
  customerId: string; serviceKey: string; season: number; quantity: number | null; contractStatus: string; termId: string | null;
  done: number; planned: number; skipped: number; inProgress: number; cancelled: number;
  contract?: RouteContract | null;
}
export interface RouteSummary { imported: boolean; stops: { id: string; serviceKey: string; crew: { id: string; name: string } | null; weekday: number; everyWeeks: number; minutes: number }[] }
export interface FillResult { created: number; from?: string; through?: string; byService?: Record<string, number>; byCrew?: Record<string, number>; skipped?: unknown[] }
export interface SlideResult { moved: number; byCrew?: Record<string, number> }
export interface ApplyCalendarResult { moved: number; cancelled: number; unchanged: number }

/* ---------- keys (company-scoped) ---------- */
export const routeKeys = {
  all: ["/api/routes"] as const,
  status: (c: string | null | undefined, service: string) => ["/api/routes", "status", c ?? "none", service] as const,
  stops: (c: string | null | undefined) => ["/api/routes", "stops", c ?? "none"] as const,
  needs: (c: string | null | undefined, service: string) => ["/api/routes", "needs", c ?? "none", service] as const,
  decisions: (c: string | null | undefined) => ["/api/routes", "decisions", c ?? "none"] as const,
  progress: (c: string | null | undefined, customerId: string, service: string, season?: number) => ["/api/routes", "progress", c ?? "none", customerId, service, season ?? "current"] as const,
  readiness: (c: string | null | undefined) => ["/api/planner/readiness", c ?? "none"] as const,
  summary: (c: string | null | undefined, customerId: string) => ["/api/customers", customerId, "route-summary", c ?? "none"] as const,
};

async function getJson<T>(url: string, companyId?: string): Promise<T> {
  return (await (await apiRequest("GET", url, undefined, { headers: companyId ? { "X-Company-Id": companyId } : {} })).json()) as T;
}
export const fetchRouteStatus = (service: string, companyId?: string) => getJson<RouteStatus>(`/api/routes/status?service=${encodeURIComponent(service)}`, companyId);
export interface PlannerReadiness { imported: boolean; plannerReadOnly: boolean; plannerMessage: string }
export const fetchPlannerReadiness = (companyId?: string) => getJson<PlannerReadiness>("/api/planner/readiness", companyId);
export const fetchRouteStops = (companyId?: string) => getJson<RouteStop[]>("/api/routes/stops", companyId);
export const fetchRouteNeeds = (service: string, companyId?: string) => getJson<RouteNeed[]>(`/api/routes/needs?service=${encodeURIComponent(service)}`, companyId);
export const fetchRouteDecisions = (companyId?: string) => getJson<RouteDecision[]>("/api/routes/decisions", companyId);
export const fetchRouteProgress = (customerId: string, service: string, season?: number, companyId?: string) =>
  getJson<RouteProgress>(`/api/routes/progress?customerId=${encodeURIComponent(customerId)}&service=${encodeURIComponent(service)}${season ? `&season=${season}` : ""}`, companyId);
export const fetchRouteSummary = (customerId: string, companyId?: string) => getJson<RouteSummary>(`/api/customers/${encodeURIComponent(customerId)}/route-summary`, companyId);
export interface RoutePreview { imported: boolean; stops: (RouteSummary["stops"][number] & { customerId: string; name: string })[] }
export const fetchRoutePreview = (companyId?: string) => getJson<RoutePreview>("/api/planner/route-preview", companyId);

export function invalidateRoutes(qc: QueryClient) {
  for (const queryKey of [["/api/routes"], ["/api/visits"], ["/api/visits/summary"], ["/api/scheduling/queue"], ["/api/planner/route-preview"], ["/api/customers"]]) void qc.invalidateQueries({ queryKey });
}

/* ---------- formatting ---------- */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
export function fmtShortDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const d = parseCalendarDate(ymd.slice(0, 10));
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
export function seasonChip(season: RouteStatus["season"]): string | null {
  if (!season) return null;
  return `${season.year} season ${fmtShortDate(season.start)} – ${fmtShortDate(season.end)}`;
}
export function fmtMinutes(min: number | null | undefined): string {
  if (min == null) return "";
  if (min < 60) return `${min} min`;
  const h = Math.round((min / 60) * 10) / 10;
  return `${h} h`;
}
export const fmtH = (hours: number) => (Math.round(hours * 10) / 10).toFixed(1);

/* ---------- pause / capacity rules ----------
   A stop paused until a date later than today is excluded from capacity and weekly totals
   (R1 fill skips occurrences before pausedUntil). Every-2-weeks stops count their full minutes
   on the day (the worst week) but half toward the weekly average, so totals match fill output over time. */
export function isPaused(stop: Pick<RouteStop, "pausedUntil">, today: string = companyToday()): boolean {
  return !!stop.pausedUntil && stop.pausedUntil > today;
}
export function dayLoadHours(stops: readonly RouteStop[], crewId: string, weekday: number, today?: string): number {
  return stops.filter(s => s.isActive && s.crewId === crewId && s.weekday === weekday && !isPaused(s, today)).reduce((n, s) => n + s.minutes, 0) / 60;
}
export function weeklyTotals(stops: readonly RouteStop[], crewId: string, today?: string): { stops: number; hours: number } {
  const mine = stops.filter(s => s.isActive && s.crewId === crewId);
  const live = mine.filter(s => !isPaused(s, today));
  return { stops: mine.length, hours: live.reduce((n, s) => n + s.minutes / (s.everyWeeks === 2 ? 2 : 1), 0) / 60 };
}
export function cellStops(stops: readonly RouteStop[], crewId: string, weekday: number, service: string): RouteStop[] {
  return stops.filter(s => s.isActive && s.crewId === crewId && s.weekday === weekday && s.serviceKey === service)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Next calendar date on/after today that falls on the given route weekday (1 = Monday). */
export function nextWeekdayDate(weekday: number, today: string = companyToday()): string {
  const dow = parseCalendarDate(today).getDay(); // 0 Sun
  const cur = dow === 0 ? 7 : dow;
  return addDaysYmd(today, (weekday - cur + 7) % 7);
}

/* ---------- board route blocks ---------- */
export interface RouteBlock { key: string; crewId: string; date: string; serviceKey: string; visits: EnrichedVisit[]; hours: number; slid: boolean }
export const isRouteVisit = (v: Pick<EnrichedVisit, "sourceType">) => v.sourceType === "route";
type RouteVisit = EnrichedVisit & { routeOccurrenceDate?: string | null; routeStopId?: string | null };
export function isSlid(v: RouteVisit): boolean {
  return !!v.routeOccurrenceDate && v.routeOccurrenceDate.slice(0, 10) !== v.visitDate.slice(0, 10);
}
/** One block per crew, date and service, in route order. Closed visits (cancelled) are excluded by the caller. */
export function groupRouteBlocks(list: readonly EnrichedVisit[]): RouteBlock[] {
  const m = new Map<string, EnrichedVisit[]>();
  for (const v of list) {
    if (!isRouteVisit(v) || !v.crewId) continue;
    const k = `${v.crewId}|${v.visitDate.slice(0, 10)}|${v.serviceKey ?? ""}`;
    m.set(k, [...(m.get(k) ?? []), v]);
  }
  const order = (k: string) => { const i = ROUTE_SERVICES.findIndex(s => s.key === k); return i < 0 ? 99 : i; };
  return [...m.entries()].map(([key, vs]) => {
    const sorted = [...vs].sort((a, b) => (a.routeOrder ?? 1e9) - (b.routeOrder ?? 1e9) || a.id.localeCompare(b.id));
    return { key, crewId: sorted[0].crewId as string, date: sorted[0].visitDate.slice(0, 10), serviceKey: sorted[0].serviceKey ?? "",
      visits: sorted, hours: sorted.reduce((n, v) => n + (v.estimatedHours ?? 0), 0), slid: sorted.some(isSlid) };
  }).sort((a, b) => order(a.serviceKey) - order(b.serviceKey));
}

/* ---------- hide routes per viewer ---------- */
export const hideRoutesKey = (userId: string | null | undefined, companyId: string | null | undefined) => `hp.scheduling.hideRoutes.${userId ?? "anon"}.${companyId ?? "none"}`;
export function readHideRoutes(key: string): boolean {
  try { return typeof window !== "undefined" && window.localStorage.getItem(key) === "1"; } catch { return false; }
}
export function writeHideRoutes(key: string, value: boolean) {
  try { window.localStorage.setItem(key, value ? "1" : "0"); } catch { /* storage unavailable: session-only */ }
}

/* ---------- Rain day ---------- */
export type RainMode = "week" | "day";
export function rainDayBody(date: string, crew: string, mode: RainMode) {
  return { date, crewIds: crew === "all" ? "all" as const : [crew], mode };
}

/* ---------- errors ---------- */
export function errorMessage(err: unknown): { status: number | null; code: string | null; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const m = /^(\d{3}):\s*([\s\S]*)$/.exec(raw);
  if (!m) return { status: null, code: null, message: raw };
  try {
    const body = JSON.parse(m[2]) as { error?: string; message?: string };
    return { status: Number(m[1]), code: body.error ?? null, message: body.message ?? body.error ?? m[2] };
  } catch { return { status: Number(m[1]), code: null, message: m[2] }; }
}

/* ---------- weekly-pattern drop planning (pure; the page executes the result) ---------- */
export type RouteDragData =
  | { kind: "need"; need: RouteNeed }
  | { kind: "stop"; stop: RouteStop }
  | { kind: "cell"; crewId: string; weekday: number };
export type RouteDropPlan =
  | { kind: "none" }
  | { kind: "create"; need: RouteNeed; crewId: string; weekday: number }
  | { kind: "move"; stopId: string; crewId: string; weekday: number }
  | { kind: "reorder"; crewId: string; weekday: number; serviceKey: string; stopIds: string[] };
export function planRouteDrop(a: RouteDragData | undefined, o: RouteDragData | undefined, stops: readonly RouteStop[]): RouteDropPlan {
  if (!a || !o) return { kind: "none" };
  const target = o.kind === "cell" ? { crewId: o.crewId, weekday: o.weekday } : o.kind === "stop" ? { crewId: o.stop.crewId, weekday: o.stop.weekday } : null;
  if (!target) return { kind: "none" };
  if (a.kind === "need") return { kind: "create", need: a.need, ...target };
  if (a.kind !== "stop") return { kind: "none" };
  const s = a.stop;
  if (s.crewId === target.crewId && s.weekday === target.weekday) {
    if (o.kind !== "stop" || o.stop.id === s.id || o.stop.serviceKey !== s.serviceKey) return { kind: "none" };
    const ids = cellStops(stops, s.crewId, s.weekday, s.serviceKey).map(x => x.id);
    const from = ids.indexOf(s.id), to = ids.indexOf(o.stop.id);
    if (from < 0 || to < 0) return { kind: "none" };
    ids.splice(to, 0, ...ids.splice(from, 1));
    return { kind: "reorder", crewId: s.crewId, weekday: s.weekday, serviceKey: s.serviceKey, stopIds: ids };
  }
  return { kind: "move", stopId: s.id, ...target };
}
