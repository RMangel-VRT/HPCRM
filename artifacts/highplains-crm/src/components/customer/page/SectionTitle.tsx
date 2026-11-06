import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionAction { node: ReactNode; primary?: boolean }

/**
 * CP4 section title: rail-translated title, optional muted lead, right-aligned actions.
 * At most one primary action; extra primaries are a programming error (throws in dev/tests).
 */
export function SectionTitle({ title, lead, actions = [], count, id = "customer-page-heading", className }: {
  title: string; lead?: ReactNode; actions?: SectionAction[]; count?: number | null; id?: string; className?: string;
}) {
  const primaries = actions.filter(a => a.primary).length;
  if (primaries > 1) throw new Error("SectionTitle allows at most one primary action");
  const ordered = [...actions.filter(a => !a.primary), ...actions.filter(a => a.primary)];
  return (
    <div className={cn("flex flex-wrap items-end gap-x-3 gap-y-2", className)} data-testid="section-title">
      <div className="min-w-0">
        <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold tracking-tight" data-testid="text-customer-page-heading">
          {title}
          {count != null && <span className="text-sm font-normal tabular-nums text-muted-foreground" data-testid="text-section-count">{count}</span>}
        </h2>
        {lead && <p className="mt-0.5 text-[13px] text-muted-foreground" data-testid="text-section-lead">{lead}</p>}
      </div>
      {ordered.length > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-2" data-testid="section-title-actions">
          {ordered.map((a, i) => <span key={i} data-primary={a.primary ? "true" : undefined} className="contents">{a.node}</span>)}
        </div>
      )}
    </div>
  );
}
