import { Link } from "wouter";
import { RefreshCw } from "lucide-react";
import { reviewHref, useQboReviewCount } from "@/lib/qboReview";

/** "QuickBooks customer review (N)" — rendered only for a nonzero shared count. */
export default function QboReviewLink({ testId = "link-qbo-review" }: { testId?: string }) {
  const { count } = useQboReviewCount();
  if (count <= 0) return null;
  return (
    <Link href={reviewHref()} data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
      <RefreshCw className="w-3.5 h-3.5" aria-hidden />QuickBooks customer review ({count})
    </Link>
  );
}
