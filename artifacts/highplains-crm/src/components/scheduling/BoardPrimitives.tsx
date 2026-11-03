import { useRef, type CSSProperties, type HTMLAttributes, type ReactNode, type RefCallback, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";
import { TONE_CLASS } from "@/components/scheduling/CrewDaySheet";
import { useSchedulingDragScroll } from "@/hooks/use-scheduling-drag-scroll";
import { capacityTone } from "@/lib/scheduling";
import { boardKeyboardCoordinates, capacityBarColor, capacityPct, keepOverlayInViewport, prefersReducedMotion } from "@/lib/schedulingBoard";

/**
 * Shared P3 board primitives used by dated Scheduling and weekday Routes:
 * sensors (pointer + keyboard path), pointer-tracking collision, bounded pane auto-scroll,
 * the floating overlay, the crew lane header and the capacity meter.
 */
export function useBoardDnd(active: boolean, panes: readonly RefObject<HTMLElement | null>[], collision: CollisionDetection) {
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  useSchedulingDragScroll(active, pointerRef, panes);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );
  const boardCollision: CollisionDetection = args => { pointerRef.current = args.pointerCoordinates; return collision(args); };
  const resetPointer = () => { pointerRef.current = null; };
  return { sensors, boardCollision, resetPointer };
}

export function BoardOverlay({ width, children }: { width: number; children: ReactNode }) {
  const reduced = prefersReducedMotion();
  const overlay = (
    <DragOverlay style={{ width, height: "auto" }} modifiers={[keepOverlayInViewport]} transition={reduced ? "none" : undefined} dropAnimation={reduced ? null : { duration: 160, easing: "ease-out" }} zIndex={1000}>
      {children}
    </DragOverlay>
  );
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}

/** Shared day-cell surface; callers supply dated or weekday droppable identities. */
export function BoardDayCell({ nodeRef, over, empty, dragging, hint, hintId, hintTestId, children, ...attrs }: HTMLAttributes<HTMLDivElement> & {
  nodeRef: RefCallback<HTMLDivElement>; over: boolean; empty: boolean; dragging: boolean;
  hint: ReactNode; hintId?: string; hintTestId?: string;
}) {
  return <div ref={nodeRef} className="sb-cell" data-over={over} aria-describedby={empty && dragging ? hintId : undefined} {...attrs}>
    {children}
    {empty && dragging && <div id={hintId} className="sb-empty" data-testid={hintTestId}>{hint}</div>}
  </div>;
}

export function CrewLaneHeader({ crew, summary, testId, summaryTestId, style }: {
  crew: { name: string; supervisorName?: string | null }; summary: ReactNode; testId?: string; summaryTestId: string; style?: CSSProperties;
}) {
  return (
    <div className="sb-crew" style={style} data-testid={testId}>
      <div className="truncate font-semibold">{crew.name}</div>
      {crew.supervisorName && <div className="truncate text-xs text-muted-foreground">{crew.supervisorName}</div>}
      <div className="mt-1 text-[11px] tabular-nums text-muted-foreground" data-testid={summaryTestId}>{summary}</div>
    </div>
  );
}

/** Crew-day capacity: count/hours line plus the tone bar. Renders a button when clickable. */
export function CapacityMeter({ left, hours, cap, crewColor, fmt, testId, barTestId, onClick, title }: {
  left: ReactNode; hours: number; cap: number; crewColor: string; fmt: (n: number) => string;
  testId: string; barTestId?: string; onClick?: () => void; title?: string;
}) {
  const tone = capacityTone(hours, cap);
  const body = (
    <>
      <span className="flex justify-between gap-2">
        <span>{left}</span>
        <span>{fmt(hours)} / {fmt(cap)} h</span>
      </span>
      <span className="sb-bar" aria-hidden>
        <span style={{ width: `${capacityPct(hours, cap)}%`, background: capacityBarColor(tone, crewColor) }} data-testid={barTestId} data-tone={tone} />
      </span>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`sb-cap ${TONE_CLASS[tone]}`} data-testid={testId} data-tone={tone} title={title}>{body}</button>
    : <div className={`sb-cap ${TONE_CLASS[tone]}`} data-testid={testId} data-tone={tone} title={title}>{body}</div>;
}
