import type { JSX, ReactNode } from "react";
import { Fragment, useId, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export type RailItem = { key: string; label: string; href: string; badge?: number; testId?: string; indented?: boolean };
export type RailSection = { label?: string; items: RailItem[] };

const QUERY = "(max-width: 767px)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}
function useIsNarrow() {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(QUERY).matches : false),
    () => false,
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="ml-auto shrink-0 rounded-full bg-rail-border px-1.5 text-[11px] font-medium leading-[18px] text-rail-foreground">
      {n}
    </span>
  );
}

export function SectionRail(props: { title: string; sections: RailSection[]; activeKey: string; ariaLabel: string }): JSX.Element {
  const { title, activeKey, ariaLabel } = props;
  const narrow = useIsNarrow();
  const headingId = useId();
  const sections = props.sections.filter((s) => s.items.length > 0);

  if (narrow) {
    return (
      <nav aria-label={ariaLabel} className="border-b border-rail-border bg-rail" data-testid="section-rail-pills">
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5">
          {sections.map((s, i) => (
            <Fragment key={s.label ?? i}>
              {i > 0 && <span aria-hidden="true" className="w-px shrink-0 self-stretch bg-rail-border mx-1" data-testid="rail-group-divider" />}
              {s.items.map((it) => {
                const active = it.key === activeKey;
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    data-testid={it.testId ?? `rail-${it.key}`}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px]",
                      active
                        ? "bg-rail-active font-semibold text-rail-active-foreground"
                        : "text-rail-foreground hover:bg-rail-hover",
                    )}
                  >
                    {it.label}
                    {it.badge != null && <Badge n={it.badge} />}
                  </Link>
                );
              })}
            </Fragment>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label={ariaLabel}
      className="w-[236px] shrink-0 self-stretch overflow-y-auto border-r border-rail-border bg-rail px-3 py-5"
    >
      <h2 className="px-2 pb-3 text-[20px] font-bold text-rail-active-foreground">{title}</h2>
      {sections.map((s, i) => (
        <div key={s.label ?? i} className={s.label ? cn("pb-1.5", i > 0 ? "pt-3.5 border-t border-rail-border" : "pt-0.5") : i > 0 ? "mt-4" : undefined}>
          {s.label && (
            <h3 id={`${headingId}-${i}`} className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-rail-heading">
              {s.label}
            </h3>
          )}
          <ul className="space-y-0.5" aria-labelledby={s.label ? `${headingId}-${i}` : undefined}>
            {s.items.map((it) => {
              const active = it.key === activeKey;
              return (
                <li key={it.key}>
                  <Link
                    href={it.href}
                    title={it.label}
                    aria-current={active ? "page" : undefined}
                    data-testid={it.testId ?? `rail-${it.key}`}
                    className={cn(
                      "flex h-[34px] items-center gap-2 rounded-md px-2 text-[13.5px]",
                      it.indented && "pl-6",
                      active
                        ? "bg-rail-active font-semibold text-rail-active-foreground"
                        : "text-rail-foreground hover:bg-rail-hover",
                    )}
                  >
                    <span className="truncate">{it.label}</span>
                    {it.badge != null && <Badge n={it.badge} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SectionRailLayout(props: { rail: ReactNode; children: ReactNode; fullHeight?: boolean }): JSX.Element {
  return (
    <div className={cn("flex flex-col md:flex-row", props.fullHeight ? "h-full min-h-0 overflow-hidden" : "min-h-full")}>
      {props.rail}
      <div className={cn("min-w-0 flex-1 p-6 md:p-8", props.fullHeight && "relative min-h-0 overflow-y-auto")} data-testid={props.fullHeight ? "rail-full-height-content" : undefined}>{props.children}</div>
    </div>
  );
}
