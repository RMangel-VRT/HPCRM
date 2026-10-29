import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { laneHeight } from "@/lib/schedulingBoard";

/** Only pane/header dimensions drive the minimum; growing lane content never feeds back. */
export function useBoardLaneHeight(
  paneRef: RefObject<HTMLDivElement | null>, crews: number, ready: boolean, frozen: boolean,
) {
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(120);

  useLayoutEffect(() => {
    const pane = paneRef.current, header = headerRef.current, grid = gridRef.current;
    if (!ready || !pane || !header || !grid || crews <= 0) return;
    const measure = () => {
      // Do not publish ANY dimension change during drag or pending presentation.
      // On settlement the effect measures the latest DOM, even if no resize fires.
      if (frozen || pane.clientHeight <= 0) return;
      const style = getComputedStyle(grid);
      const px = (s: string) => Number.parseFloat(s) || 0;
      const gaps = px(style.rowGap) * crews + px(style.paddingBottom);
      const next = laneHeight(pane.clientHeight, header.getBoundingClientRect().height, gaps, crews);
      setHeight(previous => previous === next ? previous : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(header);
    return () => observer.disconnect();
  }, [paneRef, crews, ready, frozen]);

  return { headerRef, gridRef, height };
}
