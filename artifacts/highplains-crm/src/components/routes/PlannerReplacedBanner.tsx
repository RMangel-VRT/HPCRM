import { Link } from "wouter";
import { Archive } from "lucide-react";
import { PLANNER_REPLACED_MESSAGE } from "@/lib/routes";

/** Read-only notice for legacy planner surfaces once the company's route import is recorded. */
export function PlannerReplacedBanner({ message, showLink = true }: { message?: string; showLink?: boolean }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm" data-testid="banner-planner-replaced">
      <Archive className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="flex-1">{message || PLANNER_REPLACED_MESSAGE}</span>
      {showLink && <Link href="/dashboard/routes" className="font-medium text-primary hover:underline" data-testid="link-planner-routes">Open Routes</Link>}
    </div>
  );
}
