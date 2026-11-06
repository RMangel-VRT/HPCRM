import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Read-only detail pages (Contracts, Billing, Notes, Snow) cap at 960px; tables and lists use full width. */
export const NARROW_PAGES = ["contracts", "billing", "notes", "snow"] as const;
export function PageWidth({ narrow, children }: { narrow: boolean; children: ReactNode }) {
  return <div className={cn("w-full space-y-4", narrow && "max-w-[960px]")} data-width={narrow ? "narrow" : "full"} data-testid="customer-page-body">{children}</div>;
}

/** Content-shaped skeleton: table rows (~44px) with a header bar. */
export function TableSkeleton({ rows = 6, cols = 4, testId = "table-skeleton" }: { rows?: number; cols?: number; testId?: string }) {
  return (
    <div className="overflow-hidden rounded-[10px] border" data-testid={testId} aria-busy="true">
      <div className="h-9 border-b bg-[hsl(var(--table-header))]" />
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-11 items-center gap-4 border-b px-3 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className={cn("h-3.5", c === 0 ? "w-1/3" : "w-1/6")} />)}
        </div>
      ))}
    </div>
  );
}
export function CardListSkeleton({ count = 3, testId = "card-skeleton" }: { count?: number; testId?: string }) {
  return (
    <div className="space-y-3" data-testid={testId} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2 rounded-[10px] border p-4"><Skeleton className="h-3.5 w-48" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
      ))}
    </div>
  );
}

/** Shared compact row classes: ~44px, hover, focus ring. */
export const ROW_CLASS = "h-11 cursor-pointer hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";
/** Keyboard open for a clickable row; ignores events from nested interactive controls. */
export function rowKeyOpen(open: () => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  };
}
/** True when a click came from a nested control (checkbox, link, button, menu) and must not open the row. */
export function fromNestedControl(e: React.MouseEvent<HTMLElement>) {
  const el = e.target as HTMLElement | null;
  const hit = el?.closest("a,button,input,select,label,[role=menuitem],[role=checkbox],[data-row-ignore]");
  return !!hit && hit !== e.currentTarget && e.currentTarget.contains(hit);
}
