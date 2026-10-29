import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  draft: "border-[hsl(var(--rail-active-icon))]/40 bg-[hsl(var(--rail-active-icon))]/10 text-[hsl(var(--rail-active-icon))]",
  sent: "border-sky-700/30 bg-sky-700/10 text-sky-800 dark:text-sky-300",
  accepted: "border-emerald-700/30 bg-emerald-700/10 text-emerald-800 dark:text-emerald-300",
  declined: "border-destructive/30 bg-destructive/10 text-destructive",
  superseded: "border-border bg-muted text-muted-foreground",
  void: "border-destructive/30 bg-destructive/5 text-destructive line-through decoration-1",
};

export function StatusPill({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <span data-testid={`pill-status-${status}`}
      className={cn("inline-flex h-5 items-center whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold", TONE[status] ?? TONE.superseded, className)}>
      {label}
    </span>
  );
}
