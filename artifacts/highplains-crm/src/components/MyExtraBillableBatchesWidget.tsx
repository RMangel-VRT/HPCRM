import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ArrowRight, Star } from "lucide-react";

export interface MyExtraBillableBatch {
  campaignId: string;
  campaignTitle: string;
  campaignStatus: string;
  windowStart: string;
  windowEnd: string;
  crewId: string;
  crewName: string;
  crewColor: string;
  leaderUserId: string;
  leaderName: string;
  isLeader: boolean;
  assignedItemCount: number;
  completedItemCount: number;
  pendingItemCount: number;
  photoCount: number;
  nextDueDate: string | null;
}

export default function MyExtraBillableBatchesWidget({ limit = 3 }: { limit?: number }) {
  const { t } = useTranslation();
  const { data: batches = [], isLoading } = useQuery<MyExtraBillableBatch[]>({
    queryKey: ["/api/me/extra-billable-batches"],
    staleTime: 60000,
  });

  const visible = batches.filter(b => b.campaignStatus === "active").slice(0, limit);

  return (
    <div data-testid="widget-my-batches">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-medium flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          {t("fieldDashboard.myBatches", "My Batches")}
        </h2>
        <Link href="/dashboard/my-batches">
          <span
            className="flex items-center gap-1 text-sm text-muted-foreground hover-elevate rounded-md px-2 py-1 cursor-pointer"
            data-testid="link-view-all-batches"
          >
            {t("fieldDashboard.viewAll", "View all")}
            <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground" data-testid="text-no-batches">
            {t("fieldDashboard.noBatches", "No active batches assigned to you")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map(b => (
            <Link key={b.crewId} href={`/dashboard/campaigns/${b.campaignId}`}>
              <Card
                className="hover-elevate active-elevate-2 cursor-pointer"
                data-testid={`card-batch-${b.crewId}`}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: b.crewColor }}
                        aria-hidden
                      />
                      <span className="font-medium truncate" data-testid={`text-batch-crew-${b.crewId}`}>
                        {b.crewName}
                      </span>
                      {b.isLeader && (
                        <Badge variant="outline" className="gap-1" data-testid={`badge-batch-leader-${b.crewId}`}>
                          <Star className="w-3 h-3" />
                          {t("campaigns.extraBillableCrewLeader")}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground truncate">{b.campaignTitle}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span data-testid={`text-batch-progress-${b.crewId}`}>
                      {b.completedItemCount}/{b.assignedItemCount} {t("campaigns.extraBillableCompletedCount").toLowerCase()}
                    </span>
                    <span>·</span>
                    <span>{t("campaigns.crewPhotoCount", { count: b.photoCount })}</span>
                    {b.nextDueDate && (
                      <>
                        <span>·</span>
                        <span data-testid={`text-batch-due-${b.crewId}`}>
                          {t("fieldDashboard.batchNextDue", "Next due")}: {b.nextDueDate}
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
