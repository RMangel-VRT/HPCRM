/** Pure list shaping for the Estimates action list. Classification is server-owned (nextAction). */
import type { EstimateActionBucket, EstimateActionMessage, EstimateActionTicket } from "@shared/schema";
import { denverToday, formatCalendarDate, isCalendarDate } from "@/lib/estimateBuilder";
export { addDaysYmd } from "@/lib/schedulingStatus";

export interface ActionBoardResponse { stages: { key: string; tickets: EstimateActionTicket[] }[] }
export const ACTION_BUCKETS = ["follow_up", "decide", "send", "finish", "start"] as const;
export type ActionBucket = typeof ACTION_BUCKETS[number];
export const SCOPES = ["urgent", "action", "waiting", "won", "all"] as const;
export type Scope = typeof SCOPES[number];
export const WON_WINDOW_DAYS = 30;

const ymdToUtc = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export function daysBetweenYmd(from: string, to: string): number {
  return Math.round((ymdToUtc(to) - ymdToUtc(from)) / 86_400_000);
}
export const isAction = (b: EstimateActionBucket): b is ActionBucket => (ACTION_BUCKETS as readonly string[]).includes(b);

export function flattenBoard(data: ActionBoardResponse | undefined): EstimateActionTicket[] {
  const seen = new Set<string>();
  const out: EstimateActionTicket[] = [];
  for (const s of data?.stages ?? []) for (const t of s.tickets) {
    if (!t?.nextAction || seen.has(t.id)) continue;
    seen.add(t.id); out.push(t);
  }
  return out;
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

const urgRank = (u: "red" | "amber" | null) => u === "red" ? 0 : u === "amber" ? 1 : 2;
const groupRank = (b: EstimateActionBucket) => isAction(b) ? 0 : b === "waiting" ? 1 : 2;
const bucketRank = (b: EstimateActionBucket) => isAction(b) ? ACTION_BUCKETS.indexOf(b) : 9;
const acceptedMs = (t: EstimateActionTicket) => { const v = t.estimate?.acceptedAt ? Date.parse(t.estimate.acceptedAt) : NaN; return Number.isNaN(v) ? 0 : v; };

/** Red, amber, none; then bucket order; then oldest first. Waiting then won follow; won newest-first. */
export function compareRows(a: EstimateActionTicket, b: EstimateActionTicket): number {
  const ga = groupRank(a.nextAction.bucket), gb = groupRank(b.nextAction.bucket);
  if (ga !== gb) return ga - gb;
  if (ga === 2) return acceptedMs(b) - acceptedMs(a) || a.id.localeCompare(b.id);
  return urgRank(a.nextAction.urgency) - urgRank(b.nextAction.urgency)
    || bucketRank(a.nextAction.bucket) - bucketRank(b.nextAction.bucket)
    || b.daysInStage - a.daysInStage || a.id.localeCompare(b.id);
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
