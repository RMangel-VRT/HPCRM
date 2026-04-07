import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  SkipForward,
  ClipboardList,
  Megaphone,
  Calendar,
  Map,
  Navigation,
  Snowflake,
  Wrench,
} from "lucide-react";
import ChecklistItemDetailPanel, { type ChecklistItemWithCampaign } from "@/components/ChecklistItemDetailPanel";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import CampaignsList from "@/pages/CampaignsList";
import EquipmentList from "@/pages/EquipmentList";
import SchedulePage from "@/pages/SchedulePage";
import SnowEventsList from "@/pages/SnowEventsList";
import PropertyMapsPage from "@/pages/PropertyMapsPage";
import CustomerRouteMap from "@/pages/CustomerRouteMap";

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

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "completed") return "default";
  if (status === "skipped") return "outline";
  return "secondary";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-green-600" />;
  if (status === "skipped") return <SkipForward className="w-4 h-4 text-muted-foreground" />;
  return <Clock className="w-4 h-4 text-amber-500" />;
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    chemical: "Chemical",
    irrigation: "Irrigation",
    general: "General",
  };
  return map[cat] ?? (cat.charAt(0).toUpperCase() + cat.slice(1));
}

function stepLabel(step: string | null | undefined): string {
  if (!step) return "";
  const map: Record<string, string> = {
    pre_communication: "Pre-Comm",
    work_in_progress: "In Progress",
    work_completed: "Work Done",
    post_communication: "Post-Comm",
  };
  return map[step] ?? step;
}

interface ChecklistRowProps {
  item: ChecklistItemWithCampaign;
  isSelected: boolean;
  onSelect: (item: ChecklistItemWithCampaign) => void;
}

function ChecklistRow({ item, isSelected, onSelect }: ChecklistRowProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md cursor-pointer border transition-colors ${
        isSelected ? "bg-accent border-border" : "border-transparent hover-elevate"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item);
      }}
      data-testid={`checklist-row-${item.id}`}
    >
      <StatusIcon status={item.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate" data-testid={`row-customer-name-${item.id}`}>
            {item.customerName}
          </span>
          {item.customerCity && (
            <span className="text-xs text-muted-foreground">{item.customerCity}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground truncate">{item.campaignTitle}</span>
          <Badge variant="outline" className="text-xs px-1 py-0">
            {categoryLabel(item.campaignCategory)}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.workflowStep && (
          <Badge variant="secondary" className="text-xs hidden sm:flex">
            {stepLabel(item.workflowStep)}
          </Badge>
        )}
        <Badge variant={statusBadgeVariant(item.status)} className="text-xs">
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </Badge>
      </div>
    </div>
  );
}

function ServiceChecklistsTab() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState<ChecklistItemWithCampaign | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isLoading } = useQuery<ChecklistItemWithCampaign[]>({
    queryKey: ["/api/operations/items"],
  });

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (filterCategory !== "all" && item.campaignCategory !== filterCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !item.customerName.toLowerCase().includes(q) &&
          !item.campaignTitle.toLowerCase().includes(q) &&
          !(item.customerCity ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [items, filterStatus, filterCategory, search]);

  const counts = useMemo(() => ({
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    completed: items.filter((i) => i.status === "completed").length,
    skipped: items.filter((i) => i.status === "skipped").length,
  }), [items]);

  const handleSelectItem = useCallback((item: ChecklistItemWithCampaign) => {
    setSelectedItem((prev) => (prev?.id === item.id ? null : item));
  }, []);

  const handleListAreaClick = useCallback(() => {
    setSelectedItem(null);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b space-y-4 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="w-4 h-4 text-amber-500" />
            <span data-testid="stat-pending">{counts.pending} pending</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span data-testid="stat-completed">{counts.completed} completed</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <SkipForward className="w-4 h-4 text-muted-foreground" />
            <span data-testid="stat-skipped">{counts.skipped} skipped</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer, campaign, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-operations"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36" data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36" data-testid="select-filter-category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="chemical">Chemical</SelectItem>
              <SelectItem value="irrigation">Irrigation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={listRef}
          className="h-full overflow-y-auto p-4"
          onClick={handleListAreaClick}
          data-testid="operations-list-area"
        >
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground gap-2">
              <ClipboardList className="w-8 h-8" />
              <p className="text-sm">
                {search || filterStatus !== "all" || filterCategory !== "all"
                  ? "No items match your filters."
                  : "No active campaign items found."}
              </p>
            </div>
          ) : (
            <div className="space-y-1" data-testid="operations-list">
              {filteredItems.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  isSelected={selectedItem?.id === item.id}
                  onSelect={handleSelectItem}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className={`absolute top-0 right-0 h-full w-80 z-10 shadow-lg transition-transform duration-200 ease-in-out ${
            selectedItem ? "translate-x-0" : "translate-x-full"
          }`}
          data-testid="panel-container"
          onClick={(e) => e.stopPropagation()}
        >
          <ChecklistItemDetailPanel
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        </div>
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
