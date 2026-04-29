import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  CheckCircle2,
  Clock,
  ClipboardList,
  Megaphone,
  Calendar,
  Map,
  Navigation,
  Snowflake,
  Wrench,
  Radio,
  X,
  Building2,
  Home,
} from "lucide-react";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import CampaignsList from "@/pages/CampaignsList";
import EquipmentList from "@/pages/EquipmentList";
import SchedulePage from "@/pages/SchedulePage";
import SnowEventsList from "@/pages/SnowEventsList";
import PropertyMapsPage from "@/pages/PropertyMapsPage";
import CustomerRouteMap from "@/pages/CustomerRouteMap";
import type { ChecklistItemWithCampaign } from "@/components/ChecklistItemDetailPanel";

type UserRole =
  | "admin"
  | "office"
  | "field_manager"
  | "chemical_manager"
  | "field"
  | "irrigation_manager"
  | "shop_manager"
  | "mapping"
  | "landscape_supervisor";

interface CustomerServiceSummary {
  customerId: string;
  customerName: string;
  city: string | null;
  state: string | null;
  customerType: "commercial" | "hoa";
  ranking: "standard" | "preferred" | "key_account";
  totalScheduled: number;
  totalCompleted: number;
  completionPct: number;
}

interface ServiceRollupRow {
  serviceType: string;
  label: string;
  scheduled: number;
  scheduledSource: "contract" | "campaigns";
  completed: number;
  remaining: number;
  campaigns: {
    id: string;
    title: string;
    windowStart: string;
    windowEnd: string;
    itemId: string;
    itemStatus: string;
  }[];
}

function rankingLabel(ranking: string): string {
  if (ranking === "preferred") return "Preferred";
  if (ranking === "key_account") return "Key Account";
  return "Standard";
}

function rankingVariant(ranking: string): "default" | "secondary" | "outline" {
  if (ranking === "key_account") return "default";
  if (ranking === "preferred") return "secondary";
  return "outline";
}

function completionStatus(pct: number): "complete" | "in_progress" | "not_started" {
  if (pct >= 100) return "complete";
  if (pct > 0) return "in_progress";
  return "not_started";
}

function CustomerCard({ summary, onClick }: { summary: CustomerServiceSummary; onClick: () => void }) {
  const status = completionStatus(summary.completionPct);
  const isComplete = status === "complete";

  return (
    <Card
      className={`cursor-pointer hover-elevate transition-all ${isComplete ? "border-green-500/40" : ""}`}
      onClick={onClick}
      data-testid={`card-customer-${summary.customerId}`}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate leading-tight" data-testid={`text-customer-name-${summary.customerId}`}>
              {summary.customerName}
            </p>
            {(summary.city || summary.state) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {[summary.city, summary.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {summary.customerType === "hoa" ? (
              <Home className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {summary.customerType === "hoa" ? "HOA" : "Commercial"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={rankingVariant(summary.ranking)} className="text-xs">
            {rankingLabel(summary.ranking)}
          </Badge>
          {isComplete && (
            <Badge className="bg-green-600 text-xs" data-testid={`badge-complete-${summary.customerId}`}>
              Complete
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground" data-testid={`text-progress-label-${summary.customerId}`}>
              {summary.totalCompleted} of {summary.totalScheduled} services complete
            </span>
            <span className={`font-medium ${isComplete ? "text-green-600" : ""}`} data-testid={`text-pct-${summary.customerId}`}>
              {summary.completionPct}%
            </span>
          </div>
          <Progress
            value={summary.completionPct}
            className={`h-1.5 ${isComplete ? "[&>div]:bg-green-600" : ""}`}
            data-testid={`progress-customer-${summary.customerId}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerDetailPanel({
  customerId,
  customerName,
  onClose,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
}) {
  const { data: rollup, isLoading } = useQuery<ServiceRollupRow[]>({
    queryKey: ["/api/customers", customerId, "annual-service-rollup"],
    enabled: !!customerId,
  });

  function formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  }

  function mostRecentCompletion(campaigns: ServiceRollupRow["campaigns"]): string | null {
    const completed = campaigns
      .filter((c) => c.itemStatus === "completed")
      .map((c) => c.windowEnd)
      .sort()
      .reverse();
    return completed[0] ?? null;
  }

  return (
    <div className="h-full flex flex-col bg-background border-l shadow-lg">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0">
        <h2 className="font-semibold text-sm truncate" data-testid="panel-customer-name">
          {customerName}
        </h2>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          data-testid="button-close-panel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="panel-service-list">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : !rollup || rollup.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground gap-2">
            <ClipboardList className="w-8 h-8" />
            <p className="text-sm">No service data available.</p>
          </div>
        ) : (
          rollup.map((row) => {
            const isFullyComplete = row.scheduled > 0 && row.completed >= row.scheduled;
            const isPartial = row.completed > 0 && !isFullyComplete;
            const lastDate = mostRecentCompletion(row.campaigns);

            return (
              <div
                key={row.serviceType}
                className={`flex items-start gap-3 p-3 rounded-md border ${
                  isFullyComplete ? "border-green-500/40 bg-green-50/40 dark:bg-green-950/20" : "border-border"
                }`}
                data-testid={`panel-service-row-${row.serviceType}`}
              >
                <div className="mt-0.5 shrink-0">
                  {isFullyComplete ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : isPartial ? (
                    <Clock className="w-4 h-4 text-amber-500" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isFullyComplete ? "text-green-700 dark:text-green-400" : ""}`}>
                    {row.label}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    <span>
                      Scheduled: <span className="font-medium text-foreground">{row.scheduled}</span>
                    </span>
                    <span>
                      Done: <span className={`font-medium ${row.completed > 0 ? "text-green-600" : "text-foreground"}`}>{row.completed}</span>
                    </span>
                    {!isFullyComplete && row.remaining > 0 && (
                      <span>
                        Remaining: <span className="font-medium text-amber-600">{row.remaining}</span>
                      </span>
                    )}
                    {isFullyComplete && lastDate && (
                      <span className="text-green-600">
                        Last: {formatDate(lastDate)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ServiceChecklistsTab() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);

  const { data: summaries = [], isLoading } = useQuery<CustomerServiceSummary[]>({
    queryKey: ["/api/operations/customer-service-summaries"],
  });

  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!s.customerName.toLowerCase().includes(q) && !(s.city ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterStatus !== "all") {
        const status = completionStatus(s.completionPct);
        if (filterStatus === "complete" && status !== "complete") return false;
        if (filterStatus === "in_progress" && status !== "in_progress") return false;
        if (filterStatus === "not_started" && status !== "not_started") return false;
      }
      return true;
    });
  }, [summaries, search, filterStatus]);

  const handleCardClick = useCallback((summary: CustomerServiceSummary) => {
    setSelectedCustomer({ id: summary.customerId, name: summary.customerName });
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedCustomer(null);
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="p-4 border-b space-y-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer or city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-checklists"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40" data-testid="select-filter-checklist-status">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4" data-testid="checklist-grid-area">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-md" />
              ))}
            </div>
          ) : filteredSummaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground gap-2">
              <ClipboardList className="w-8 h-8" />
              <p className="text-sm">
                {search || filterStatus !== "all"
                  ? "No customers match your filters."
                  : "No active customers with contracts found."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="checklist-grid">
              {filteredSummaries.map((summary) => (
                <CustomerCard
                  key={summary.customerId}
                  summary={summary}
                  onClick={() => handleCardClick(summary)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className={`shrink-0 transition-all duration-200 ease-in-out overflow-hidden ${
          selectedCustomer ? "w-80" : "w-0"
        }`}
        data-testid="customer-detail-panel"
      >
        {selectedCustomer && (
          <CustomerDetailPanel
            customerId={selectedCustomer.id}
            customerName={selectedCustomer.name}
            onClose={handleClosePanel}
          />
        )}
      </div>
    </div>
  );
}

interface TabDef {
  value: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

const ALL_TABS: TabDef[] = [
  {
    value: "campaigns",
    label: "Campaigns",
    icon: Megaphone,
    roles: ["admin", "office", "field_manager", "chemical_manager"],
  },
  {
    value: "checklists",
    label: "Service Checklists",
    icon: ClipboardList,
    roles: ["admin", "office", "field_manager", "chemical_manager"],
  },
  {
    value: "schedule",
    label: "Schedule",
    icon: Calendar,
    roles: ["admin", "office"],
  },
  {
    value: "maps",
    label: "Property Maps",
    icon: Map,
    roles: ["admin", "office", "field_manager", "chemical_manager"],
  },
  {
    value: "routemap",
    label: "Route Map",
    icon: Navigation,
    roles: ["admin", "field_manager", "chemical_manager"],
  },
  {
    value: "snow",
    label: "Snow",
    icon: Snowflake,
    roles: ["admin", "office", "field_manager"],
  },
  {
    value: "equipment",
    label: "Equipment",
    icon: Wrench,
    roles: ["admin", "office"],
  },
];

function CommandCenterHeader() {
  const { data: checklistItems = [], isLoading: checklistsLoading } = useQuery<ChecklistItemWithCampaign[]>({
    queryKey: ["/api/operations/items"],
  });

  type Campaign = { id: number; status: string; title: string };
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === "active").length,
    [campaigns]
  );
  const pendingChecklists = useMemo(
    () => checklistItems.filter((i) => i.status === "pending").length,
    [checklistItems]
  );

  const isLoading = checklistsLoading || campaignsLoading;

  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b shrink-0">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-tight tracking-tight" data-testid="header-title">
          Operations Command Center
        </h1>
        <div className="flex items-center flex-wrap gap-2" data-testid="header-status-line">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-36 rounded-full" />
              <Skeleton className="h-5 w-40 rounded-full" />
            </>
          ) : (
            <>
              <Badge variant="secondary" data-testid="badge-active-campaigns">
                {activeCampaigns} Active Campaign{activeCampaigns !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="secondary" data-testid="badge-pending-checklists">
                {pendingChecklists} Pending Checklist{pendingChecklists !== 1 ? "s" : ""}
              </Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GlobalOperationsPage() {
  const { user } = useAuth();
  const role = (user?.activeRole ?? "admin") as UserRole;

  const visibleTabs = ALL_TABS.filter((tab) => tab.roles.includes(role));
  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.value ?? "campaigns");

  useSetBreadcrumbs([{ label: "Operations" }]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <CommandCenterHeader />

      <div className="px-4 pt-3 border-b shrink-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1" data-testid="tabs-operations">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  data-testid={`tab-${tab.value}`}
                  className="flex items-center gap-1.5 py-2 px-3"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "checklists" && <ServiceChecklistsTab />}
        {activeTab === "campaigns" && (
          <div className="h-full overflow-y-auto">
            <CampaignsList />
          </div>
        )}
        {activeTab === "equipment" && (
          <div className="h-full overflow-y-auto">
            <EquipmentList />
          </div>
        )}
        {activeTab === "schedule" && (
          <div className="h-full overflow-y-auto">
            <SchedulePage />
          </div>
        )}
        {activeTab === "snow" && (
          <div className="h-full overflow-y-auto">
            <SnowEventsList />
          </div>
        )}
        {activeTab === "maps" && (
          <div className="h-full overflow-hidden">
            <PropertyMapsPage />
          </div>
        )}
        {activeTab === "routemap" && (
          <div className="h-full overflow-hidden">
            <CustomerRouteMap />
          </div>
        )}
      </div>
    </div>
  );
}
