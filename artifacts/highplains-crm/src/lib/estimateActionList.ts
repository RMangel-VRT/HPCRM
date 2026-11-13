/** Pure list shaping for the Estimates action list. Classification is server-owned (nextAction). */
import { flattenActionBoard, isAction, type EstimateActionMessage, type EstimateActionTicket } from "@shared/schema";
export { ACTION_BUCKETS, isAction, compareRows, type ActionBucket } from "@shared/schema";
import { denverToday, formatCalendarDate, isCalendarDate } from "@/lib/estimateBuilder";
export { addDaysYmd } from "@/lib/schedulingStatus";

export interface ActionBoardResponse { stages: { key: string; tickets: EstimateActionTicket[] }[] }
export const SCOPES = ["urgent", "action", "waiting", "won", "all"] as const;
export type Scope = typeof SCOPES[number];
export const WON_WINDOW_DAYS = 30;

const ymdToUtc = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export function daysBetweenYmd(from: string, to: string): number {
  return Math.round((ymdToUtc(to) - ymdToUtc(from)) / 86_400_000);
}

export function flattenBoard(data: ActionBoardResponse | undefined): EstimateActionTicket[] {
  return flattenActionBoard(data);
}

/** Accepted within the last 30 Colorado calendar days (inclusive of today). */
export function isRecentlyWon(t: EstimateActionTicket, today: string = denverToday()): boolean {
  if (t.nextAction.bucket !== "won") return false;
  const at = t.estimate?.acceptedAt;
  if (!at) return false;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return false;
  const diff = daysBetweenYmd(denverToday(d), today);
  return diff >= 0 && diff < WON_WINDOW_DAYS;
}

export function inScope(t: EstimateActionTicket, scope: Scope, today?: string): boolean {
  const { bucket, urgency } = t.nextAction;
  switch (scope) {
    case "urgent": return isAction(bucket) && urgency === "red";
    case "action": return isAction(bucket);
    case "waiting": return bucket === "waiting";
    case "won": return isRecentlyWon(t, today);
    case "all": return true;
  }
}

export interface Filters { search: string; assignee: string }
export function matchesFilters(t: EstimateActionTicket, f: Filters): boolean {
  if (f.assignee === "unassigned" ? !!t.assignee : f.assignee !== "everyone" && t.assignee?.id !== f.assignee) return false;
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  return [t.customer?.name, t.title, t.estimate?.number, t.estimateNumber].some(v => !!v && v.toLowerCase().includes(q));
}

export function assigneesOf(rows: EstimateActionTicket[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const r of rows) if (r.assignee) map.set(r.assignee.id, r.assignee.name);
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export const subtotal = (t: EstimateActionTicket) => t.estimate?.subtotalCents ?? 0;

export function canQuickSend(t: EstimateActionTicket): boolean {
  const e = t.estimate;
  return t.nextAction.bucket === "finish" && !!e && e.status === "draft" && e.lineCount > 0 && e.linesNeedingPrice === 0 && (e.subtotalCents ?? 0) > 0;
}

/** Message params with calendar dates formatted client-side. */
export function messageParams(m: EstimateActionMessage, lang: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.params ?? {})) out[k] = k === "date" && typeof v === "string" && isCalendarDate(v) ? formatCalendarDate(v, lang) : v;
  return out;
}
