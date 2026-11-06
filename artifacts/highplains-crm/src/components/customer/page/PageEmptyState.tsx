import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** CP4 empty state: icon, one sentence, optional action. Never paired with a duplicate page button. */
export function PageEmptyState({ icon: Icon, message, action, className, testId = "page-empty-state" }: {
  icon: LucideIcon; message: string; action?: ReactNode; className?: string; testId?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-[10px] border border-dashed px-6 py-8 text-center", className)} data-testid={testId}>
      <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground" data-testid={`${testId}-message`}>{message}</p>
      {action}
    </div>
  );
}
