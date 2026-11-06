import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * CP4 card convention (same as the CP3 Dashboard cards): icon + sentence-case title, optional right-side
 * link or action. Used by Dashboard, Billing, Snow, Property and Contracts. Existing tokens only.
 */
export function CustomerCardHeader({ icon: Icon, title, link, action, className, testId }: {
  icon: LucideIcon; title: string; link?: { href: string; label: string; testId: string }; action?: ReactNode; className?: string; testId?: string;
}) {
  return (
    <CardHeader className={cn("flex flex-row items-center gap-2 space-y-0 px-4 pt-3 pb-0", className)} data-testid={testId ?? "customer-card-header"}>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" data-testid="customer-card-icon" />
      <CardTitle className="text-[13.5px] font-semibold">{title}</CardTitle>
      {link && (
        <Link href={link.href} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground" data-testid={link.testId}>
          {link.label}<ArrowRight className="h-3 w-3" />
        </Link>
      )}
      {action && <div className={cn(!link && "ml-auto")}>{action}</div>}
    </CardHeader>
  );
}

export function CustomerCard({ icon, title, link, action, children, testId, className }: {
  icon: LucideIcon; title: string; link?: { href: string; label: string; testId: string }; action?: ReactNode; children: ReactNode; testId?: string; className?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)} data-testid={testId}>
      <CustomerCardHeader icon={icon} title={title} link={link} action={action} />
      <CardContent className="px-4 pt-2.5 pb-3.5">{children}</CardContent>
    </Card>
  );
}
