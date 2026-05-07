import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EmptyState from "@/components/EmptyState";
import { ClipboardList, Search, Star, Loader2 } from "lucide-react";
import type { MyExtraBillableBatch } from "@/components/MyExtraBillableBatchesWidget";

type SortKey = "dueDate" | "name" | "progress";

export default function MyBatchesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [sort, setSort] = useState<SortKey>("dueDate");

  const { data: batches = [], isLoading } = useQuery<MyExtraBillableBatch[]>({
    queryKey: ["/api/me/extra-billable-batches"],
  });

  const filtered = useMemo(() => {
    let result = batches;
    if (statusFilter !== "all") {
      result = result.filter(b => b.campaignStatus === statusFilter);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(b =>
        b.campaignTitle.toLowerCase().includes(s) ||
        b.crewName.toLowerCase().includes(s),
      );
    }
    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sort === "name") return a.crewName.localeCompare(b.crewName);
      if (sort === "progress") {
        const pa = a.assignedItemCount === 0 ? 0 : a.completedItemCount / a.assignedItemCount;
        const pb = b.assignedItemCount === 0 ? 0 : b.completedItemCount / b.assignedItemCount;
        return pb - pa;
      }
      const da = a.nextDueDate || "9999-12-31";
      const db = b.nextDueDate || "9999-12-31";
      return da.localeCompare(db);
    });
    return sorted;
  }, [batches, search, statusFilter, sort]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20" data-testid="page-my-batches">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <ClipboardList className="w-6 h-6 text-primary" />
          {t("fieldDashboard.myBatches", "My Batches")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("fieldDashboard.myBatchesDescription", "Extra-billable crews you lead or belong to")}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search") || "Search"}
            className="pl-9"
            data-testid="input-batch-search"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList data-testid="tabs-batch-status-filter">
            <TabsTrigger value="active" data-testid="tab-batches-active">{t("campaigns.active")}</TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-batches-completed">{t("campaigns.completed")}</TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-batches-all">{t("common.all")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[160px]" data-testid="select-batch-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dueDate">{t("fieldDashboard.sortDueDate", "Due date")}</SelectItem>
            <SelectItem value="name">{t("fieldDashboard.sortName", "Crew name")}</SelectItem>
            <SelectItem value="progress">{t("fieldDashboard.sortProgress", "Progress")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ClipboardList}
              title={t("fieldDashboard.noBatches", "No active batches assigned to you")}
              description={t("fieldDashboard.noBatchesDescription", "You're not currently a leader or member of any extra-billable crews matching the filters.")}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(b => (
            <Link key={b.crewId} href={`/dashboard/campaigns/${b.campaignId}`}>
              <Card
                className="hover-elevate cursor-pointer"
                data-testid={`card-batch-${b.crewId}`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: b.crewColor }}
                        aria-hidden
                      />
                      <span className="font-semibold truncate" data-testid={`text-batch-crew-${b.crewId}`}>{b.crewName}</span>
                      {b.isLeader && (
                        <Badge variant="outline" className="gap-1" data-testid={`badge-batch-leader-${b.crewId}`}>
                          <Star className="w-3 h-3" />
                          {t("campaigns.extraBillableCrewLeader")}
                        </Badge>
                      )}
                      {b.campaignStatus !== "active" && (
                        <Badge variant="secondary" className="text-xs">{b.campaignStatus}</Badge>
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
                    <span>·</span>
                    <span>{b.windowStart} – {b.windowEnd}</span>
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
