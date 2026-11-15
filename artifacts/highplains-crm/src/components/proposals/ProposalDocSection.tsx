import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STORE = "hp.proposal.sections.v1";

function read(viewer: string): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(`${STORE}:${viewer}`) ?? "{}") ?? {}; } catch { return {}; }
}

/** Per-viewer collapsed state for the proposal document sections (localStorage, best effort). */
export function useCollapsedSections(viewer: string) {
  const [state, setState] = useState<Record<string, boolean>>(() => read(viewer));
  const toggle = useCallback((key: string) => {
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(`${STORE}:${viewer}`, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, [viewer]);
  return { collapsed: state, toggle };
}

/** Slim numbered strip in print order; the body is hidden (not unmounted state-wise) when collapsed. */
export function ProposalDocSection({ n, sectionKey, title, summary, collapsed, onToggle, children, className }: {
  n: number; sectionKey: string; title: string; summary?: ReactNode; collapsed: boolean; onToggle: () => void; children: ReactNode; className?: string;
}) {
  const { t } = useTranslation();
  const bodyId = `proposal-section-${sectionKey}`;
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card", className)} aria-labelledby={`${bodyId}-title`} data-testid={`section-doc-${sectionKey}`}>
      <div className={cn("flex items-center gap-3 px-3 py-2", !collapsed && "border-b")}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold tabular-nums text-primary" aria-hidden="true">{n}</span>
        <h2 id={`${bodyId}-title`} className="min-w-0 break-words text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">{title}</h2>
        {summary != null && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" data-testid={`text-section-summary-${sectionKey}`}>{summary}</span>}
        {summary == null && <span className="flex-1" />}
        <button type="button" aria-expanded={!collapsed} aria-controls={bodyId} onClick={onToggle}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`button-toggle-section-${sectionKey}`}>
          {collapsed ? t("proposalP3.expand") : t("proposalP3.collapse")}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} aria-hidden="true" />
        </button>
      </div>
      <div id={bodyId} hidden={collapsed} className="p-3">{children}</div>
    </section>
  );
}
