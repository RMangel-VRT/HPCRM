import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ColumnKey } from "./boardLogic";

/** Headings and footer stay outside the independently scrolling card list. */
export function BoardColumn({ column, title, count, children, footer }: {
  column: ColumnKey; title: string; count: number; children: ReactNode; footer?: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const measure = () => {
    const list = listRef.current;
    if (list) setMoreBelow(list.scrollHeight - list.clientHeight - list.scrollTop > 1);
  };
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    measure();
    // Observe both viewport and content: wrapping/fonts can change content height
    // without changing the capped list's own height.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(list);
    if (list.firstElementChild) observer?.observe(list.firstElementChild);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [children]);

  return (
    <section className="min-w-[17rem] flex-1 rounded-lg bg-muted/80 dark:bg-muted/40 border border-border/70 dark:border-transparent p-3"
      data-testid={`column-${column}`}>
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
        {title}<span className="rounded-full bg-background dark:bg-muted px-1.5 text-xs font-normal">{count}</span>
      </h2>
      <div className="relative">
        <div ref={listRef} onScroll={measure} className="max-h-[26rem] overflow-y-auto pr-1"
          data-testid={`list-${column}`} tabIndex={0} role="region" aria-label={`${title} contracts`}>
          <div className="space-y-2">{children}</div>
        </div>
        {moreBelow && <div aria-hidden="true" data-testid={`fade-${column}`}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-muted/80 dark:to-muted/40" />}
      </div>
      {footer}
    </section>
  );
}
