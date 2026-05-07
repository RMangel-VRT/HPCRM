import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Clock, AlertCircle, SkipForward, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

type ChecklistContext =
  | { type: "customer"; customerId: string }
  | { type: "property"; propertyId: string };

interface ChecklistItem {
  id: string;
  campaignId: string;
  campaignTitle: string;
  campaignCategory: string;
  campaignSubtype: string | null;
  campaignStatus: string;
  windowStart: string;
  windowEnd: string;
  seasonId: string | null;
  status: "pending" | "completed" | "skipped";
  completedAt: string | null;
  completedById: string | null;
  notes: string | null;
  skipReason: string | null;
  customerId: string;
  customerName: string;
  propertyId: string | null;
}

interface ServiceChecklistPanelProps {
  context: ChecklistContext;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" data-testid={`badge-status-${status}`}>
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      );
    case "skipped":
      return (
        <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" data-testid={`badge-status-${status}`}>
          <SkipForward className="w-3 h-3 mr-1" />
          Skipped
        </Badge>
      );
    case "pending":
    default:
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" data-testid={`badge-status-${status}`}>
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
  }
}

function getCategoryBadge(category: string) {
  switch (category) {
    case "chemical":
      return (
        <Badge variant="outline" className="text-orange-700 border-orange-300 dark:text-orange-400 dark:border-orange-700">
          Chemical
        </Badge>
      );
    case "irrigation":
      return (
        <Badge variant="outline" className="text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-700">
          Irrigation
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-gray-700 border-gray-300 dark:text-gray-400 dark:border-gray-600">
          General
        </Badge>
      );
  }
}

function computeItemWindowStatus(item: ChecklistItem): "completed" | "in_window" | "upcoming" | "overdue" {
  if (item.status === "completed") return "completed";
  const now = new Date();
  const start = new Date(item.windowStart);
  const end = new Date(item.windowEnd);
  if (now < start) return "upcoming";
  if (now > end) return "overdue";
  return "in_window";
}

export default function ServiceChecklistPanel({ context }: ServiceChecklistPanelProps) {
  const [yearFilter, setYearFilter] = useState<string>(String(new Date().getFullYear()));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);

  const queryKey = context.type === "customer"
    ? ["/api/customers", context.customerId, "campaign-items"]
    : ["/api/properties", context.propertyId, "campaign-items"];

  const { data: items = [], isLoading } = useQuery<ChecklistItem[]>({
    queryKey,
  });

  const availableYears = Array.from(
    new Set(items.map((item) => new Date(item.windowStart).getFullYear()))
  ).sort((a, b) => b - a);

  if (!availableYears.includes(new Date().getFullYear())) {
    availableYears.unshift(new Date().getFullYear());
  }

  const yearFiltered = items.filter((item) => {
    const itemYear = new Date(item.windowStart).getFullYear();
    return String(itemYear) === yearFilter;
  });

  const filteredItems = yearFiltered.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (categoryFilter !== "all" && item.campaignCategory !== categoryFilter) return false;
    return true;
  });

  const completed = filteredItems.filter((i) => i.status === "completed").length;
  const inWindow = filteredItems.filter((i) => computeItemWindowStatus(i) === "in_window").length;
  const upcoming = filteredItems.filter((i) => computeItemWindowStatus(i) === "upcoming").length;
  const overdue = filteredItems.filter((i) => computeItemWindowStatus(i) === "overdue").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-28" data-testid="select-year-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36" data-testid="select-category-filter">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="chemical">Chemical</SelectItem>
            <SelectItem value="irrigation">Irrigation</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3 flex-wrap" data-testid="checklist-summary">
        <div className="flex items-center gap-1.5 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="font-medium text-green-700 dark:text-green-400" data-testid="count-completed">{completed}</span>
          <span className="text-muted-foreground">completed</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-blue-700 dark:text-blue-400" data-testid="count-in-window">{inWindow}</span>
          <span className="text-muted-foreground">in window</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="font-medium" data-testid="count-upcoming">{upcoming}</span>
          <span className="text-muted-foreground">upcoming</span>
        </div>
        {overdue > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="font-medium text-red-600 dark:text-red-400" data-testid="count-overdue">{overdue}</span>
            <span className="text-muted-foreground">overdue</span>
          </div>
        )}
      </div>

      <Separator />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground" data-testid="empty-checklist">
          No service items found for the selected filters.
        </div>
      ) : (
        <div className="space-y-2" data-testid="checklist-items">
          {filteredItems.map((item) => {
            const windowStatus = computeItemWindowStatus(item);
            return (
              <button
                key={item.id}
                className="w-full text-left border rounded-md p-3 hover-elevate transition-colors"
                onClick={() => setSelectedItem(item)}
                data-testid={`checklist-item-${item.id}`}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" data-testid={`text-item-title-${item.id}`}>
                      {item.campaignTitle}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.windowStart).toLocaleDateString()} – {new Date(item.windowEnd).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {getCategoryBadge(item.campaignCategory)}
                    {getStatusBadge(item.status)}
                    {windowStatus === "overdue" && item.status === "pending" && (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                </div>
                {item.completedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Completed {format(new Date(item.completedAt), "MMM d, yyyy")}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedItem && (
            <>
              <SheetHeader>
                <SheetTitle data-testid="drawer-item-title">{selectedItem.campaignTitle}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {getCategoryBadge(selectedItem.campaignCategory)}
                  {getStatusBadge(selectedItem.status)}
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Service Window</p>
                  <p className="text-sm" data-testid="drawer-window">
                    {new Date(selectedItem.windowStart).toLocaleDateString()} – {new Date(selectedItem.windowEnd).toLocaleDateString()}
                  </p>
                </div>

                {selectedItem.campaignSubtype && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Subtype</p>
                    <p className="text-sm capitalize">{selectedItem.campaignSubtype.replace(/_/g, " ")}</p>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Linked Campaign</p>
                  <Link
                    href={`/dashboard/campaigns/${selectedItem.campaignId}`}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                    data-testid="link-campaign"
                  >
                    <LinkIcon className="w-3 h-3" />
                    {selectedItem.campaignTitle}
                  </Link>
                </div>

                {selectedItem.status === "completed" && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">Completion Details</p>
                      {selectedItem.completedAt && (
                        <div className="mb-1">
                          <p className="text-xs text-muted-foreground">Completed at</p>
                          <p className="text-sm" data-testid="drawer-completed-at">
                            {format(new Date(selectedItem.completedAt), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      )}
                      {selectedItem.notes && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground">Notes</p>
                          <p className="text-sm" data-testid="drawer-notes">{selectedItem.notes}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {selectedItem.status === "skipped" && selectedItem.skipReason && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Skip Reason</p>
                      <p className="text-sm" data-testid="drawer-skip-reason">{selectedItem.skipReason}</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
