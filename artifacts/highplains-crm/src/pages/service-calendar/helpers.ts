import { SCOPE_CATALOG } from "@shared/contractCatalog";
import {
  validMonthDay, type CalendarKind, type ServiceCalendarEntry, type ServiceCalendarResponse,
} from "../../../../../lib/db/src/serviceCalendarContracts";

export type DraftRow = {
  uid: string; id?: string; kind: CalendarKind; name: string; opensMd: string; dueMd: string;
  inStandard: boolean; pattern: string | null; includes: string | null;
};
export const KIND_ORDER: CalendarKind[] = ["round", "checklist", "recurring"];
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const serviceCalendarKey = (companyId: string, userId: string, role: string) =>
  ["/api/service-calendar", companyId, userId, role] as const;
export const recurringServices = () => SCOPE_CATALOG.filter(s => s.scheduling === "route" || s.key === "native_areas");
export const labelOf = (key: string) => SCOPE_CATALOG.find(s => s.key === key)?.label ?? key;

export function rowsFromEntries(entries: ServiceCalendarEntry[], serviceKey: string): DraftRow[] {
  return entries.filter(e => e.serviceKey === serviceKey)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.position - b.position)
    .map(e => ({
      uid: e.id, id: e.id, kind: e.kind, name: e.name, opensMd: e.opensMd, dueMd: e.dueMd,
      inStandard: e.inStandard, pattern: e.pattern ?? null, includes: e.includes ?? null,
    }));
}
export const sig = (rows: DraftRow[]) => JSON.stringify(rows.map(({ uid: _u, ...r }) => r));

/** Full ordered list for one service. Positions restart at 1 inside each kind. */
export function toPayload(rows: DraftRow[]) {
  const seen: Record<string, number> = {};
  return rows.map(r => {
    seen[r.kind] = (seen[r.kind] ?? 0) + 1;
    return {
      ...(r.id ? { id: r.id } : {}), kind: r.kind, position: seen[r.kind], name: r.name.trim(),
      opensMd: r.opensMd, dueMd: r.dueMd, inStandard: r.kind === "round" && r.inStandard,
      pattern: r.kind === "recurring" ? (r.pattern?.trim() || null) : null,
      includes: r.kind === "recurring" ? (r.includes?.trim() || null) : null,
    };
  });
}
export function rowProblem(r: DraftRow): "errName" | "errSame" | null {
  const n = r.name.trim();
  if (n.length < 1 || n.length > 80) return "errName";
  if (!validMonthDay(r.opensMd) || !validMonthDay(r.dueMd) || r.opensMd === r.dueMd) return "errSame";
  return null;
}
export const crossesYear = (r: { opensMd: string; dueMd: string }) => r.dueMd < r.opensMd;

export function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d{3}:\s*/, "");
  try { const j = JSON.parse(body) as { message?: string; error?: string }; return j.message ?? j.error ?? body; } catch { return body; }
}
export let uidSeq = 0;
export const newUid = () => `new-${++uidSeq}`;

export type ServiceApi = {
  rows: (svc: string) => DraftRow[];
  isDirty: (svc: string) => boolean;
  edit: (svc: string, fn: (rows: DraftRow[]) => DraftRow[]) => void;
  discard: (svc: string) => void;
  save: (svc: string) => void;
  busy: Record<string, boolean>;
  errors: Record<string, string>;
  flash: Record<string, number>;
  canWrite: boolean;
};

export function fmtMd(md: string, t: (k: string) => string) {
  if (!validMonthDay(md)) return md;
  const [m, d] = md.split("-").map(Number);
  return `${t(`serviceCalendar.months.m${m}`)} ${d}`;
}

/** A PUT/load reply must be the full calendar. Anything else is a failure, never a silent success. */
export function assertCalendarResponse(value: unknown): ServiceCalendarResponse {
  const v = value as ServiceCalendarResponse | null;
  if (!v || !Array.isArray(v.entries) || !Array.isArray(v.usage)) throw new Error("The server sent an unexpected reply. Nothing was cleared; try saving again.");
  return v;
}
export async function readCalendar(res: Response): Promise<ServiceCalendarResponse> {
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return assertCalendarResponse(body);
}
