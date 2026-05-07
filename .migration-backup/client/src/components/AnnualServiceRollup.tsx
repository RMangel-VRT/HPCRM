import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronRight, CheckCircle2, Clock, SkipForward, CalendarDays } from "lucide-react";

interface CampaignEntry {
  id: string;
  title: string;
  windowStart: string;
  windowEnd: string;
  itemId: string;
  itemStatus: string;
}

interface ServiceRollupRow {
  serviceType: string;
  label: string;
  scheduled: number;
  scheduledSource: "contract" | "campaigns";
  completed: number;
  remaining: number;
  campaigns: CampaignEntry[];
}

interface AnnualServiceRollupProps {
  customerId: string;
}

function formatWindowDate(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return format(d, "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function itemStatusIcon(status: string) {
  if (status === "completed") return <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />;
  if (status === "skipped") return <SkipForward className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

function itemStatusBadge(status: string) {
  if (status === "completed") return <Badge className="bg-green-600 text-xs">Completed</Badge>;
  if (status === "skipped") return <Badge variant="secondary" className="text-xs">Skipped</Badge>;
  return <Badge variant="outline" className="text-xs">Pending</Badge>;
}

function ServiceCard({ row }: { row: ServiceRollupRow }) {
  const [expanded, setExpanded] = useState(false);
  const progressPct = row.scheduled > 0 ? Math.round((row.completed / row.scheduled) * 100) : 0;
  const isFullyComplete = row.scheduled > 0 && row.completed >= row.scheduled;

  return (
    <Card
      className={`cursor-pointer hover-elevate transition-all ${isFullyComplete ? "border-green-500/40" : ""}`}
      onClick={() => setExpanded(!expanded)}
      data-testid={`card-service-rollup-${row.serviceType}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <h4 className="font-medium text-sm truncate" data-testid={`text-rollup-label-${row.serviceType}`}>
              {row.label}
            </h4>
          </div>
          {isFullyComplete && (
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" data-testid={`icon-fully-complete-${row.serviceType}`} />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Scheduled</p>
            <p className="text-lg font-bold" data-testid={`text-scheduled-${row.serviceType}`}>
              {row.scheduledSource === "contract" ? row.scheduled : (row.campaigns.length > 0 ? row.campaigns.length : "—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-lg font-bold text-green-600" data-testid={`text-completed-${row.serviceType}`}>
              {row.completed}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`text-lg font-bold ${row.remaining > 0 ? "text-amber-600" : "text-muted-foreground"}`} data-testid={`text-remaining-${row.serviceType}`}>
              {row.remaining}
            </p>
          </div>
        </div>

        {row.scheduled > 0 && (
          <Progress
            value={progressPct}
            className={`h-1.5 ${isFullyComplete ? "[&>div]:bg-green-600" : ""}`}
            data-testid={`progress-rollup-${row.serviceType}`}
          />
        )}

        {expanded && row.campaigns.length > 0 && (
          <div className="mt-4 space-y-2 border-t pt-3" onClick={(e) => e.stopPropagation()}>
            {row.campaigns.map((camp) => (
              <div
                key={camp.itemId}
                className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md bg-muted/40"
                data-testid={`row-campaign-instance-${camp.itemId}`}
              >
                {itemStatusIcon(camp.itemStatus)}
                <div className="flex-1 min-w-0">
                  <Link href={`/dashboard/campaigns/${camp.id}`}>
                    <span
                      className="font-medium hover:underline cursor-pointer truncate block"
                      data-testid={`link-campaign-${camp.id}`}
                    >
                      {camp.title}
                    </span>
                  </Link>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="w-3 h-3" />
                    {formatWindowDate(camp.windowStart)} – {formatWindowDate(camp.windowEnd)}
                  </div>
                </div>
                <div className="shrink-0">
                  {itemStatusBadge(camp.itemStatus)}
                </div>
              </div>
            ))}
          </div>
        )}

        {expanded && row.campaigns.length === 0 && (
          <div
            className="mt-4 border-t pt-3 text-sm text-muted-foreground text-center"
            onClick={(e) => e.stopPropagation()}
            data-testid={`text-no-campaigns-${row.serviceType}`}
          >
            No campaign instances found
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnnualServiceRollup({ customerId }: AnnualServiceRollupProps) {
  const { data: rollup, isLoading, error } = useQuery<ServiceRollupRow[]>({
    queryKey: ["/api/customers", customerId, "annual-service-rollup"],
  });

  if (isLoading) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-3">Annual Service Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !rollup) {
    return null;
  }

  if (rollup.length === 0) {
    return null;
  }

  const totalScheduled = rollup.reduce((s, r) => s + r.scheduled, 0);
  const totalCompleted = rollup.reduce((s, r) => s + r.completed, 0);
  const overallPct = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

  return (
    <div className="space-y-4" data-testid="section-annual-service-rollup">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-semibold">Annual Service Summary</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span data-testid="text-rollup-overall">{totalCompleted} of {totalScheduled} completed</span>
          <Badge variant={overallPct === 100 ? "default" : "outline"} className={overallPct === 100 ? "bg-green-600 text-xs" : "text-xs"}>
            {overallPct}%
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rollup.map((row) => (
          <ServiceCard key={row.serviceType} row={row} />
        ))}
      </div>
    </div>
  );
}
