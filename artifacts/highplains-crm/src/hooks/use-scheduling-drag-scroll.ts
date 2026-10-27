import { useEffect, type RefObject } from "react";
import { paneScrollVelocity } from "@/lib/schedulingBoard";

/**
 * Scroll only the two scheduling panes, independently of dnd-kit's changing
 * over-node ancestor list. That list can stall when an edge hover changes cells.
 */
export function useSchedulingDragScroll(
  active: boolean,
  pointer: RefObject<{ x: number; y: number } | null>,
  panes: readonly RefObject<HTMLElement | null>[],
) {
  const [queue, board] = panes;
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let previous = performance.now();
    const positions = new Map<HTMLElement, { x: number | null; y: number | null }>();
    const resetAfterWheel = (event: WheelEvent) => {
      if (event.currentTarget instanceof HTMLElement) positions.delete(event.currentTarget);
    };
    const elements = [queue?.current, board?.current].filter((el): el is HTMLElement => !!el);
    elements.forEach(el => el.addEventListener("wheel", resetAfterWheel, { passive: true }));
    const move = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    const tick = () => {
      // Use the same monotonic clock for every frame, not a supplied animation
      // timestamp (which browser tooling can fast-forward independently).
      const now = performance.now();
      const seconds = Math.max(0, Math.min(now - previous, 32)) / 1000;
      previous = now;
      const point = pointer.current;
      if (point) {
        for (const ref of [queue, board]) {
          const pane = ref?.current;
          if (!pane) continue;
          const speed = paneScrollVelocity(point, pane.getBoundingClientRect());
          const position = positions.get(pane) ?? { x: null, y: null };
          // Integrate floating-point positions, not the browser-rounded last
          // scrollTop. Rounding/anchoring must not amplify the rate each frame.
          if (speed.x) {
            position.x = Math.max(0, Math.min(pane.scrollWidth - pane.clientWidth, (position.x ?? pane.scrollLeft) + speed.x * seconds));
            pane.scrollLeft = position.x;
          } else position.x = null;
          if (speed.y) {
            position.y = Math.max(0, Math.min(pane.scrollHeight - pane.clientHeight, (position.y ?? pane.scrollTop) + speed.y * seconds));
            pane.scrollTop = position.y;
          } else position.y = null;
          positions.set(pane, position);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, true);
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", move, true);
      elements.forEach(el => el.removeEventListener("wheel", resetAfterWheel));
      cancelAnimationFrame(frame);
    };
  }, [active, pointer, queue, board]);
}
