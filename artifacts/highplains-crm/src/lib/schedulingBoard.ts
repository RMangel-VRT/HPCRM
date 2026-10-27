import { addDaysYmd, parseCalendarDate } from "@/lib/schedulingStatus";
import { mondayOf, type CapacityTone, type QueueItem } from "@/lib/scheduling";
import type { KeyboardCoordinateGetter, Modifier } from "@dnd-kit/core";

export type QueueGroupKey = "past" | "week" | "later";
export const QUEUE_GROUP_ORDER: readonly QueueGroupKey[] = ["past", "week", "later"];

/** Calendar-day difference b - a (both YYYY-MM-DD, company calendar). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseCalendarDate(b).getTime() - parseCalendarDate(a).getTime()) / 86_400_000);
}

export function queueGroupOf(scheduleBy: string | null | undefined, today: string): QueueGroupKey {
  if (!scheduleBy) return "later";
  const d = scheduleBy.slice(0, 10);
  if (d < today) return "past";
  if (d <= addDaysYmd(mondayOf(today), 6)) return "week";
  return "later";
}

/** Groups queue items; server order is preserved within each group. */
export function groupQueue<T extends Pick<QueueItem, "scheduleBy">>(items: readonly T[], today: string): Record<QueueGroupKey, T[]> {
  const out: Record<QueueGroupKey, T[]> = { past: [], week: [], later: [] };
  for (const i of items) out[queueGroupOf(i.scheduleBy, today)].push(i);
  return out;
}

export type Urgency = "late" | "soon" | "normal";
export function scheduleByUrgency(scheduleBy: string | null | undefined, today: string): Urgency {
  if (!scheduleBy) return "normal";
  const d = scheduleBy.slice(0, 10);
  if (d < today) return "late";
  if (d <= addDaysYmd(today, 2)) return "soon";
  return "normal";
}

export function daysLate(scheduleBy: string | null | undefined, today: string): number {
  if (!scheduleBy) return 0;
  return Math.max(0, daysBetween(scheduleBy.slice(0, 10), today));
}

export function isoWeekNumber(ymd: string): number {
  const d = parseCalendarDate(ymd);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}

/** Capacity bar fill; ok uses the crew color, thresholds unchanged (capacityTone). */
export function capacityBarColor(tone: CapacityTone, crewColor: string): string {
  return tone === "red" ? "hsl(var(--destructive))" : tone === "amber" ? "hsl(var(--warning))" : crewColor;
}

export function capacityPct(hours: number, cap: number): number {
  if (cap <= 0) return hours > 0 ? 100 : 0;
  return Math.min(100, Math.round((hours / cap) * 100));
}

export const AUTOSCROLL_EDGE_PX = 48;
export const AUTOSCROLL_MAX_PX_PER_SECOND = 250;
export function paneScrollVelocity(
  point: { x: number; y: number },
  rect: { left: number; right: number; top: number; bottom: number },
): { x: number; y: number } {
  if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return { x: 0, y: 0 };
  const axis = (position: number, start: number, end: number) => {
    const edge = Math.min(AUTOSCROLL_EDGE_PX, (end - start) / 2);
    if (edge <= 0) return 0;
    const ratio = position < start + edge ? -(start + edge - position) / edge
      : position > end - edge ? (position - end + edge) / edge : 0;
    return Math.max(-1, Math.min(1, ratio)) * AUTOSCROLL_MAX_PX_PER_SECOND;
  };
  return { x: axis(point.x, rect.left, rect.right), y: axis(point.y, rect.top, rect.bottom) };
}

/** Keep the lifted copy visible even at the viewport edges (including rotation). */
export const keepOverlayInViewport: Modifier = ({ transform, overlayNodeRect, draggingNodeRect, windowRect }) => {
  const rect = overlayNodeRect ?? draggingNodeRect;
  if (!rect || !windowRect) return transform;
  const margin = 8;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
  return {
    ...transform,
    x: clamp(transform.x, margin - rect.left, windowRect.width - margin - rect.right),
    y: clamp(transform.y, margin - rect.top, windowRect.height - margin - rect.bottom),
  };
};
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Keyboard drag over the real board: arrows jump to the nearest droppable
 * (cell or open visit) in that direction, by center distance with axis bias.
 * Unknown keys fall through to dnd-kit's default handling (undefined).
 */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const dir = ({ ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] } as Record<string, [number, number]>)[event.code] ?? null;
  if (!dir) return undefined;
  event.preventDefault();
  const { active, collisionRect, droppableRects, droppableContainers } = context;
  const cx = collisionRect ? collisionRect.left + collisionRect.width / 2 : currentCoordinates.x;
  const cy = collisionRect ? collisionRect.top + collisionRect.height / 2 : currentCoordinates.y;
  let best: { x: number; y: number; score: number } | null = null;
  for (const c of droppableContainers.getEnabled()) {
    if (c.id === active?.id) continue;
    const id = String(c.id);
    if (!id.startsWith("cell:") && !id.startsWith("visit:")) continue;
    const r = droppableRects.get(c.id);
    if (!r) continue;
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const dx = tx - cx, dy = ty - cy;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 4) continue;
    const across = Math.abs(dir[0] ? dy : dx);
    const score = along + across * 3;
    if (!best || score < best.score) best = { x: tx, y: ty, score };
  }
  if (!best || !collisionRect) return currentCoordinates;
  return { x: currentCoordinates.x + (best.x - cx), y: currentCoordinates.y + (best.y - cy) };
};
