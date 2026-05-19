import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronRight, ChevronLeft, ChevronDown, Clock, CalendarDays, Filter, Loader2, CheckCircle2, RefreshCw, Wrench, ClipboardCheck, List, Columns, MapPin } from "lucide-react";
import { Link, useSearch } from "wouter";
import type { Ticket, TicketType, TicketTypeStatus, Customer, EquipmentTicket, Equipment, CompanyUser, User as UserType, CampaignWithProgress } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import TicketCard from "@/components/TicketCard";
import type { TicketWithDetails } from "@/components/TicketCard";

const MY_TICKETS_SCROLL_STORAGE_KEY = "myTicketsScrollPosition";

interface CompanyUserWithDetails {
  companyUser: CompanyUser;
  user: UserType;
  isSuperAdmin: boolean;
}

const EQUIPMENT_TICKET_STATUS_COLORS: Record<string, string> = {
  new: "bg-primary/10 text-primary border-primary/30",
  diagnosing: "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700",
  waiting_on_parts: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700",
  in_repair: "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-700",
  completed: "bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-700",
  closed: "bg-muted text-muted-foreground border-border",
};

const EQUIPMENT_TICKET_STATUS_LABELS: Record<string, string> = {
  new: "New",
  diagnosing: "Diagnosing",
  waiting_on_parts: "Waiting on Parts",
  in_repair: "In Repair",
  completed: "Completed",
  closed: "Closed",
};

const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  preventative_maintenance: "PM",
  repair: "Repair",
  inspection: "Inspection",
  safety: "Safety",
  breakdown: "Breakdown",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700",
  high: "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-700",
  normal: "bg-muted text-muted-foreground border-border",
  low: "bg-muted text-muted-foreground border-border",
};

type ViewMode = "list" | "kanban-type";

export default function MyTickets() {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  
  const hasRestoredScroll = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const prevSearchString = useRef(searchString);
  
  const rawView = urlParams.get("view");
  const initialViewMode: ViewMode = rawView === "kanban-type" ? "kanban-type" : "list";

  const [search, setSearch] = useState(() => urlParams.get("q") || "");
  const [priorityFilter, setPriorityFilter] = useState(() => urlParams.get("priority") || "all");
  const [workTypeFilter, setWorkTypeFilter] = useState(() => urlParams.get("workType") || "all");
  const [typeFilters, setTypeFilters] = useState<string[]>(() => {
    const raw = urlParams.get("type");
    return raw ? raw.split(",").filter(Boolean) : [];
  });
  const [statusFilter, setStatusFilter] = useState(() => urlParams.get("status") || "all");
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [showFilters, setShowFilters] = useState(false);
  const [completedPage, setCompletedPage] = useState(1);
  const completedPerPage = 10;
  
  const [openSectionCollapsed, setOpenSectionCollapsed] = useState(false);
  const [completedSectionCollapsed, setCompletedSectionCollapsed] = useState(false);
  const [equipOpenSectionCollapsed, setEquipOpenSectionCollapsed] = useState(false);
  const [equipCompletedSectionCollapsed, setEquipCompletedSectionCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"tickets" | "campaigns">("tickets");

  const showTabs = user?.activeRole === "landscape_supervisor";

  useEffect(() => {
    if (prevSearchString.current === searchString) return;
    prevSearchString.current = searchString;
    
    isUpdatingFromUrl.current = true;
    setSearch(urlParams.get("q") || "");
    setPriorityFilter(urlParams.get("priority") || "all");
    setWorkTypeFilter(urlParams.get("workType") || "all");
    const rawType = urlParams.get("type");
    setTypeFilters(rawType ? rawType.split(",").filter(Boolean) : []);
    setStatusFilter(urlParams.get("status") || "all");
    const rv = urlParams.get("view");
    setViewMode(rv === "kanban-type" ? "kanban-type" : "list");
  }, [searchString, urlParams]);

  useEffect(() => {
    if (isUpdatingFromUrl.current) {
      isUpdatingFromUrl.current = false;
      return;
    }
    
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (workTypeFilter !== "all") params.set("workType", workTypeFilter);
    if (typeFilters.length > 0) params.set("type", typeFilters.join(","));
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (viewMode !== "list") params.set("view", viewMode);
    
    const queryString = params.toString();
    const currentQuery = searchString.startsWith("?") ? searchString.slice(1) : searchString;
    
    if (queryString === currentQuery) return;
    
    const newUrl = queryString ? `/dashboard/tickets/my?${queryString}` : "/dashboard/tickets/my";
    prevSearchString.current = queryString ? `?${queryString}` : "";
    
    window.history.replaceState(null, "", newUrl);
  }, [search, priorityFilter, workTypeFilter, typeFilters, statusFilter, viewMode, searchString]);

  // Reset statusFilter when type selection changes to 0 or 2+
  useEffect(() => {
    if (typeFilters.length !== 1) {
      setStatusFilter("all");
    }
  }, [typeFilters]);

  const saveScrollPosition = useCallback(() => {
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]') || 
                           document.querySelector('main');
    const scrollTop = scrollContainer ? (scrollContainer as HTMLElement).scrollTop : window.scrollY;
    sessionStorage.setItem(MY_TICKETS_SCROLL_STORAGE_KEY, scrollTop.toString());
  }, []);

  const { data: tickets = [], isLoading: ticketsLoading, refetch, isFetching } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets/my", { userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/tickets/my", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: ticketTypes = [], isLoading: ticketTypesLoading } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });

  const { data: customersResp, isLoading: customersLoading } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers"],
  });
  const customers = customersResp?.customers ?? [];

  const { data: allStatuses = [] } = useQuery<TicketTypeStatus[]>({
    queryKey: ["/api/ticket-type-statuses"],
  });

  const { data: schedulingStatusData } = useQuery<{
    schedulingStatusId: string | null;
    statusName?: string;
    ticketTypeId?: string;
    ticketTypeName?: string;
  }>({
    queryKey: ["/api/scheduling-status"],
  });
  const schedulingStatusId = schedulingStatusData?.schedulingStatusId;

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
    queryFn: async () => {
      const res = await fetch("/api/companies/users", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const usersMap = useMemo(() => {
    const map = new Map<string, UserType>();
    companyUsersData.forEach(cu => {
      if (cu.user) {
        map.set(cu.user.id, cu.user);
      }
    });
    return map;
  }, [companyUsersData]);

  const { data: equipmentTickets = [], isLoading: equipTicketsLoading } = useQuery<EquipmentTicket[]>({
    queryKey: ["/api/equipment-tickets", { operatorUserId: user?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/equipment-tickets?operatorUserId=${user?.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: equipmentList = [] } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    queryFn: async () => {
      const res = await fetch("/api/equipment", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const campaignAllowedRoles = ["admin", "office", "field_manager", "field", "landscape_supervisor"];
  const showCampaigns = campaignAllowedRoles.includes(user?.activeRole || "");

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<CampaignWithProgress[]>({
    queryKey: ["/api/campaigns"],
    enabled: showCampaigns,
  });

  const activeCampaigns = useMemo(() => 
    campaigns.filter(c => c.status === "active"),
    [campaigns]
  );

  const [campaignSectionCollapsed, setCampaignSectionCollapsed] = useState(false);

  const equipmentMap = useMemo(() => {
    const map = new Map<string, Equipment>();
    equipmentList.forEach(e => map.set(e.id, e));
    return map;
  }, [equipmentList]);

  const isDataLoaded = !ticketsLoading && !ticketTypesLoading && !customersLoading;
  useEffect(() => {
    if (!isDataLoaded || hasRestoredScroll.current) return;
    
    const savedPosition = sessionStorage.getItem(MY_TICKETS_SCROLL_STORAGE_KEY);
    if (savedPosition) {
      hasRestoredScroll.current = true;
      const scrollTop = parseInt(savedPosition, 10);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]') || 
                                 document.querySelector('main');
          if (scrollContainer) {
            (scrollContainer as HTMLElement).scrollTop = scrollTop;
          } else {
            window.scrollTo(0, scrollTop);
          }
        });
      });
      sessionStorage.removeItem(MY_TICKETS_SCROLL_STORAGE_KEY);
    } else {
      hasRestoredScroll.current = true;
    }
  }, [isDataLoaded]);

  const enrichedTickets: TicketWithDetails[] = tickets.map(ticket => ({
    ...ticket,
    ticketType: ticketTypes.find(tt => tt.id === ticket.ticketTypeId),
    currentStatus: allStatuses.find((s: TicketTypeStatus) => s.id === ticket.currentStatusId),
    customer: customers.find(c => c.id === ticket.customerId),
  }));

  // Get statuses for the currently selected type (only when exactly one type pill is selected)
  const selectedTypeStatuses = typeFilters.length === 1
    ? allStatuses.filter((s: TicketTypeStatus) => s.ticketTypeId === typeFilters[0])
    : [];

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (priorityFilter !== "all") count++;
    if (workTypeFilter !== "all") count++;
    if (typeFilters.length > 0) count++;
    if (statusFilter !== "all") count++;
    return count;
  }, [search, priorityFilter, workTypeFilter, typeFilters, statusFilter]);

  const filteredTickets = enrichedTickets.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(search.toLowerCase()) ||
      ticket.customer?.name?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    const matchesWorkType = workTypeFilter === "all" || ticket.workType === workTypeFilter;
    const matchesType = typeFilters.length === 0 || typeFilters.includes(ticket.ticketTypeId);
    const matchesStatus = statusFilter === "all" || ticket.currentStatusId === statusFilter;
    return matchesSearch && matchesPriority && matchesWorkType && matchesType && matchesStatus;
  });

  const openTickets = filteredTickets.filter(t => !t.completedAt);
  const completedTickets = filteredTickets.filter(t => t.completedAt);

  const openEquipTickets = equipmentTickets.filter(t => t.status !== "completed" && t.status !== "closed");
  const completedEquipTickets = equipmentTickets.filter(t => t.status === "completed" || t.status === "closed");

  const totalOpenCount = showTabs ? openTickets.length : openTickets.length + openEquipTickets.length;
  
  useEffect(() => {
    setCompletedPage(1);
  }, [search, priorityFilter, workTypeFilter, typeFilters, statusFilter]);
  
  useEffect(() => {
    const totalPages = Math.ceil(completedTickets.length / completedPerPage);
    if (completedPage > totalPages && totalPages > 0) {
      setCompletedPage(totalPages);
    }
  }, [completedTickets.length, completedPage, completedPerPage]);

  const formatDueDate = (date: Date | null | undefined) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: "Overdue", className: "text-red-600 dark:text-red-400 font-medium" };
    if (diffDays === 0) return { text: "Today", className: "text-orange-600 dark:text-orange-400 font-medium" };
    if (diffDays === 1) return { text: "Tomorrow", className: "text-yellow-600 dark:text-yellow-400" };
    if (diffDays <= 7) return { text: `${diffDays} days`, className: "text-muted-foreground" };
    return { text: d.toLocaleDateString(), className: "text-muted-foreground" };
  };

  if (ticketsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAnyCustomerTickets = filteredTickets.length > 0;
  const hasAnyEquipTickets = equipmentTickets.length > 0;

  // Shared filter controls used in both showTabs and non-showTabs paths
  const filterControls = (
    <>
      {/* View mode toggle */}
      <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/30 w-fit" data-testid="view-mode-toggle-my">
        <Button
          variant={viewMode === "list" ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5"
          onClick={() => setViewMode("list")}
          data-testid="button-view-list-my"
        >
          <List className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">List</span>
        </Button>
        <Button
          variant={viewMode === "kanban-type" ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5"
          onClick={() => setViewMode("kanban-type")}
          data-testid="button-view-kanban-type-my"
        >
          <Columns className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">By Type</span>
        </Button>
      </div>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets or customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
            data-testid="input-search-my-tickets"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-my-tickets"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="outline"
          className="h-11 shrink-0 gap-2"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters-my"
        >
          <Filter className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="bg-primary text-primary-foreground">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Pill-style type filters */}
      {ticketTypes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" data-testid="pill-filter-row-my">
          {ticketTypes.map((tt) => {
            const isActive = typeFilters.includes(tt.id);
            return (
              <Button
                key={tt.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                style={isActive && tt.color ? { backgroundColor: tt.color, borderColor: tt.color } : undefined}
                onClick={() => {
                  setTypeFilters(prev =>
                    prev.includes(tt.id)
                      ? prev.filter(id => id !== tt.id)
                      : [...prev, tt.id]
                  );
                }}
                data-testid={`pill-type-my-${tt.id}`}
              >
                {tt.name}
              </Button>
            );
          })}
        </div>
      )}

      {showFilters && (
        <div className="flex gap-2 flex-wrap animate-in slide-in-from-top-2 duration-200">
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[130px] h-10" data-testid="select-priority-filter-my">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={workTypeFilter} onValueChange={setWorkTypeFilter}>
            <SelectTrigger className="w-[150px] h-10" data-testid="select-worktype-filter-my">
              <SelectValue placeholder="Work Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Work Types</SelectItem>
              <SelectItem value="contract">Contract Work</SelectItem>
              <SelectItem value="extra_work">Extra Billable</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="estimate_request">Estimate Request</SelectItem>
              <SelectItem value="shop_todo">Shop To-Do</SelectItem>
            </SelectContent>
          </Select>
          {/* Status filter — only when exactly one type pill is selected */}
          {typeFilters.length === 1 && selectedTypeStatuses.length > 0 && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-10" data-testid="select-status-filter-my">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {[...selectedTypeStatuses].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)).map((status: TicketTypeStatus) => (
                  <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            {showTabs ? "My Work" : "My Tickets"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden md:block">
            {showTabs ? "Your assigned tickets and campaigns" : "Tickets assigned to you"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-total-open-count">
          <CheckCircle2 className="w-4 h-4" />
          <span>{totalOpenCount} open</span>
        </div>
      </div>

      {showTabs && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "tickets" | "campaigns")} data-testid="tabs-my-work">
          <TabsList>
            <TabsTrigger value="tickets" data-testid="tab-my-tickets">My Tickets</TabsTrigger>
            <TabsTrigger value="campaigns" data-testid="tab-my-campaigns">My Campaigns</TabsTrigger>
          </TabsList>

          <TabsContent value="tickets" className="mt-4 space-y-4">
            {filterControls}

            {viewMode === "kanban-type" ? (
              <MyKanbanByType
                openTickets={openTickets}
                ticketTypes={ticketTypes}
                allStatuses={allStatuses}
                usersMap={usersMap}
                schedulingStatusId={schedulingStatusId}
                onNavigate={saveScrollPosition}
              />
            ) : (
              <div className="space-y-4">
                {openTickets.length > 0 && (
                  <div className="space-y-3 md:space-y-2">
                    <button
                      className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
                      onClick={() => setOpenSectionCollapsed(!openSectionCollapsed)}
                      data-testid="button-toggle-open-section-my"
                    >
                      {openSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      Open ({openTickets.length})
                    </button>
                    {!openSectionCollapsed && (
                      <div className="space-y-3 md:space-y-2">
                        {openTickets.map((ticket) => (
                          <TicketCard
                            key={ticket.id}
                            ticket={ticket}
                            formatDueDate={formatDueDate}
                            schedulingStatusId={schedulingStatusId}
                            onNavigate={saveScrollPosition}
                            usersMap={usersMap}
                            workflowStatuses={allStatuses.filter((s: TicketTypeStatus) => s.ticketTypeId === ticket.ticketTypeId).sort((a: TicketTypeStatus, b: TicketTypeStatus) => (a.displayOrder || 0) - (b.displayOrder || 0))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {completedTickets.length > 0 && (() => {
                  const totalPages = Math.ceil(completedTickets.length / completedPerPage);
                  const startIdx = (completedPage - 1) * completedPerPage;
                  const paginatedCompleted = completedTickets.slice(startIdx, startIdx + completedPerPage);
                  return (
                    <div className="space-y-3 md:space-y-2 mt-4">
                      <button
                        className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
                        onClick={() => setCompletedSectionCollapsed(!completedSectionCollapsed)}
                        data-testid="button-toggle-completed-section-my"
                      >
                        {completedSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Completed ({completedTickets.length})
                      </button>
                      {!completedSectionCollapsed && (
                        <>
                          <div className="space-y-3 md:space-y-2 opacity-75">
                            {paginatedCompleted.map((ticket) => (
                              <TicketCard
                                key={ticket.id}
                                ticket={ticket}
                                formatDueDate={formatDueDate}
                                schedulingStatusId={schedulingStatusId}
                                onNavigate={saveScrollPosition}
                                usersMap={usersMap}
                                workflowStatuses={allStatuses.filter((s: TicketTypeStatus) => s.ticketTypeId === ticket.ticketTypeId).sort((a: TicketTypeStatus, b: TicketTypeStatus) => (a.displayOrder || 0) - (b.displayOrder || 0))}
                              />
                            ))}
                          </div>
                          {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 pt-3">
                              <Button variant="outline" size="sm" onClick={() => setCompletedPage(p => Math.max(1, p - 1))} disabled={completedPage === 1} data-testid="button-my-completed-prev">
                                <ChevronLeft className="w-4 h-4 mr-1" />Previous
                              </Button>
                              <span className="text-sm text-muted-foreground">Page {completedPage} of {totalPages}</span>
                              <Button variant="outline" size="sm" onClick={() => setCompletedPage(p => Math.min(totalPages, p + 1))} disabled={completedPage === totalPages} data-testid="button-my-completed-next">
                                Next<ChevronRight className="w-4 h-4 ml-1" />
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
                {openTickets.length === 0 && completedTickets.length === 0 && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Clock className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-medium mb-1">No tickets assigned to you</h3>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        You don't have any tickets assigned to you yet.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="campaigns" className="mt-4">
            {campaignsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activeCampaigns.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ClipboardCheck className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-1">No active campaigns</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    You don't have any active campaigns assigned to you.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 md:space-y-2">
                {activeCampaigns.map((campaign) => {
                  const pendingCount = campaign.totalItems - campaign.completedItems - campaign.skippedItems;
                  return (
                    <Link key={campaign.id} href={`/dashboard/campaigns/${campaign.id}`} onClick={saveScrollPosition}>
                      <Card
                        className="hover-elevate active-elevate-2 cursor-pointer transition-colors"
                        data-testid={`card-campaign-${campaign.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-1 self-stretch rounded-full bg-primary" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-medium text-base leading-tight line-clamp-2 flex-1" data-testid={`text-campaign-title-${campaign.id}`}>
                                  {campaign.title}
                                </h3>
                                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                              </div>
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="w-3 h-3" />
                                  {campaign.windowStart && campaign.windowEnd
                                    ? `${new Date(campaign.windowStart).toLocaleDateString()} - ${new Date(campaign.windowEnd).toLocaleDateString()}`
                                    : t("campaigns.window")}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {pendingCount} {t("campaigns.pending")}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {campaign.completedItems}/{campaign.totalItems} {t("campaigns.done")}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {!showTabs && (
        <div className="space-y-4">
          {filterControls}

              {/* Customer tickets: list or kanban view */}
          {viewMode === "kanban-type" ? (
            <MyKanbanByType
              openTickets={openTickets}
              ticketTypes={ticketTypes}
              allStatuses={allStatuses}
              usersMap={usersMap}
              schedulingStatusId={schedulingStatusId}
              onNavigate={saveScrollPosition}
            />
          ) : hasAnyCustomerTickets ? (
            <>
              {openTickets.length > 0 && (
                <div className="space-y-3 md:space-y-2">
                  <button 
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
                    onClick={() => setOpenSectionCollapsed(!openSectionCollapsed)}
                    data-testid="button-toggle-open-section-my"
                  >
                    {openSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Open ({openTickets.length})
                  </button>
                  {!openSectionCollapsed && (
                    <div className="space-y-3 md:space-y-2">
                      {openTickets.map((ticket) => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          formatDueDate={formatDueDate}
                          schedulingStatusId={schedulingStatusId}
                          onNavigate={saveScrollPosition}
                          usersMap={usersMap}
                          workflowStatuses={allStatuses.filter((s: TicketTypeStatus) => s.ticketTypeId === ticket.ticketTypeId).sort((a: TicketTypeStatus, b: TicketTypeStatus) => (a.displayOrder || 0) - (b.displayOrder || 0))}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {completedTickets.length > 0 && (() => {
                const totalPages = Math.ceil(completedTickets.length / completedPerPage);
                const startIdx = (completedPage - 1) * completedPerPage;
                const paginatedCompleted = completedTickets.slice(startIdx, startIdx + completedPerPage);
                
                return (
                  <div className="space-y-3 md:space-y-2 mt-6">
                    <button 
                      className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
                      onClick={() => setCompletedSectionCollapsed(!completedSectionCollapsed)}
                      data-testid="button-toggle-completed-section-my"
                    >
                      {completedSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      Completed ({completedTickets.length})
                    </button>
                    {!completedSectionCollapsed && (
                      <>
                        <div className="space-y-3 md:space-y-2 opacity-75">
                          {paginatedCompleted.map((ticket) => (
                            <TicketCard
                              key={ticket.id}
                              ticket={ticket}
                              formatDueDate={formatDueDate}
                              schedulingStatusId={schedulingStatusId}
                              onNavigate={saveScrollPosition}
                              usersMap={usersMap}
                              workflowStatuses={allStatuses.filter((s: TicketTypeStatus) => s.ticketTypeId === ticket.ticketTypeId).sort((a: TicketTypeStatus, b: TicketTypeStatus) => (a.displayOrder || 0) - (b.displayOrder || 0))}
                            />
                          ))}
                        </div>
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-4 pt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCompletedPage(p => Math.max(1, p - 1))}
                              disabled={completedPage === 1}
                              data-testid="button-my-completed-prev"
                            >
                              <ChevronLeft className="w-4 h-4 mr-1" />
                              Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              Page {completedPage} of {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCompletedPage(p => Math.min(totalPages, p + 1))}
                              disabled={completedPage === totalPages}
                              data-testid="button-my-completed-next"
                            >
                              Next
                              <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </>
          ) : null}

              {hasAnyEquipTickets && (
                <div className="space-y-3 md:space-y-2 mt-6" data-testid="section-equipment-tickets">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">Equipment Tickets</span>
                  </div>

                  {openEquipTickets.length > 0 && (
                    <div className="space-y-3 md:space-y-2">
                      <button
                        className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
                        onClick={() => setEquipOpenSectionCollapsed(!equipOpenSectionCollapsed)}
                        data-testid="button-toggle-equip-open-section"
                      >
                        {equipOpenSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Open ({openEquipTickets.length})
                      </button>
                      {!equipOpenSectionCollapsed && (
                        <div className="space-y-3 md:space-y-2">
                          {openEquipTickets.map((ticket) => (
                            <EquipmentTicketCard
                              key={ticket.id}
                              ticket={ticket}
                              equipmentMap={equipmentMap}
                              formatDueDate={formatDueDate}
                              onNavigate={saveScrollPosition}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {completedEquipTickets.length > 0 && (
                    <div className="space-y-3 md:space-y-2 mt-4">
                      <button
                        className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
                        onClick={() => setEquipCompletedSectionCollapsed(!equipCompletedSectionCollapsed)}
                        data-testid="button-toggle-equip-completed-section"
                      >
                        {equipCompletedSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Completed ({completedEquipTickets.length})
                      </button>
                      {!equipCompletedSectionCollapsed && (
                        <div className="space-y-3 md:space-y-2 opacity-75">
                          {completedEquipTickets.map((ticket) => (
                            <EquipmentTicketCard
                              key={ticket.id}
                              ticket={ticket}
                              equipmentMap={equipmentMap}
                              formatDueDate={formatDueDate}
                              onNavigate={saveScrollPosition}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {equipTicketsLoading && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              {showCampaigns && activeCampaigns.length > 0 && (
                <div className="space-y-3 md:space-y-2 mt-6" data-testid="section-campaigns">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">{t("campaigns.title")}</span>
                  </div>

                  <button
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
                    onClick={() => setCampaignSectionCollapsed(!campaignSectionCollapsed)}
                    data-testid="button-toggle-campaigns-section"
                  >
                    {campaignSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {t("campaigns.active")} ({activeCampaigns.length})
                  </button>
                  {!campaignSectionCollapsed && (
                    <div className="space-y-3 md:space-y-2">
                      {activeCampaigns.map((campaign) => {
                        const pendingCount = campaign.totalItems - campaign.completedItems - campaign.skippedItems;
                        return (
                          <Link key={campaign.id} href={`/dashboard/campaigns/${campaign.id}`} onClick={saveScrollPosition}>
                            <Card
                              className="hover-elevate active-elevate-2 cursor-pointer transition-colors"
                              data-testid={`card-campaign-${campaign.id}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <div
                                    className="w-1 self-stretch rounded-full bg-primary"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <h3 className="font-medium text-base leading-tight line-clamp-2 flex-1" data-testid={`text-campaign-title-${campaign.id}`}>
                                        {campaign.title}
                                      </h3>
                                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <CalendarDays className="w-3 h-3" />
                                        {campaign.windowStart && campaign.windowEnd
                                          ? `${new Date(campaign.windowStart).toLocaleDateString()} - ${new Date(campaign.windowEnd).toLocaleDateString()}`
                                          : t("campaigns.window")}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                      <Badge variant="outline" className="text-xs">
                                        {pendingCount} {t("campaigns.pending")}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {campaign.completedItems}/{campaign.totalItems} {t("campaigns.done")}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {campaignsLoading && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              {viewMode === "list" && !hasAnyCustomerTickets && !equipTicketsLoading && !hasAnyEquipTickets && !(showCampaigns && activeCampaigns.length > 0) && (
                <Card className="mt-8">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Clock className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-1">No tickets assigned to you</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                      You don't have any tickets assigned to you yet.
                    </p>
                  </CardContent>
                </Card>
              )}
        </div>
      )}
    </div>
  );
}

// ─── Kanban Components (My Tickets) ──────────────────────────────────────────

interface MyKanbanCardProps {
  ticket: TicketWithDetails;
  usersMap: Map<string, UserType>;
  allStatuses: TicketTypeStatus[];
  schedulingStatusId?: string | null;
  onNavigate?: () => void;
}

function MyKanbanCard({ ticket, usersMap, allStatuses, schedulingStatusId, onNavigate }: MyKanbanCardProps) {
  const barColor = ticket.ticketType?.color || "#6b7280";
  const needsScheduling = schedulingStatusId && ticket.currentStatusId === schedulingStatusId;
  const currentStatus = allStatuses.find(s => s.id === ticket.currentStatusId);

  return (
    <Link href={`/dashboard/tickets/${ticket.id}`} onClick={() => onNavigate?.()}>
      <Card
        className={`hover-elevate active-elevate-2 cursor-pointer mb-2 ${needsScheduling ? "ring-2 ring-pink-500 dark:ring-pink-400" : ""}`}
        data-testid={`kanban-card-my-ticket-${ticket.id}`}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: barColor }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1">
                {ticket.ticketType && (
                  <span className="text-xs font-semibold" style={{ color: barColor }} data-testid={`kanban-my-tickettype-${ticket.id}`}>
                    {ticket.ticketType.name}
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground shrink-0" data-testid={`kanban-my-ticket-id-${ticket.id}`}>
                  #{ticket.id.slice(0, 8)}
                </span>
              </div>
              <p className="text-sm font-medium leading-snug line-clamp-2 mb-1" data-testid={`kanban-my-title-${ticket.id}`}>
                {ticket.title}
              </p>
              {ticket.customer && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate" data-testid={`kanban-my-customer-${ticket.id}`}>{ticket.customer.name}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                {currentStatus && (
                  <Badge
                    variant="outline"
                    className="text-xs truncate max-w-[120px]"
                    style={{ borderColor: currentStatus.color || undefined }}
                    data-testid={`kanban-my-status-${ticket.id}`}
                  >
                    {currentStatus.name}
                  </Badge>
                )}
                {ticket.assignedToId && (
                  <span className="text-xs text-muted-foreground truncate max-w-[80px]" data-testid={`kanban-my-assignee-${ticket.id}`}>
                    {usersMap.get(ticket.assignedToId)?.name || usersMap.get(ticket.assignedToId)?.email?.split("@")[0] || ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface MyKanbanColumnProps {
  title: string;
  color?: string;
  tickets: TicketWithDetails[];
  usersMap: Map<string, UserType>;
  allStatuses: TicketTypeStatus[];
  schedulingStatusId?: string | null;
  onNavigate?: () => void;
  testId?: string;
}

function MyKanbanColumn({ title, color, tickets, usersMap, allStatuses, schedulingStatusId, onNavigate, testId }: MyKanbanColumnProps) {
  return (
    <div
      className="flex flex-col shrink-0 w-72 bg-muted/30 rounded-md border"
      style={{ height: "calc(100vh - 280px)", minHeight: "300px" }}
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {color && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
          <span className="text-sm font-semibold truncate">{title}</span>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">{tickets.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tickets.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
            No open tickets
          </div>
        ) : (
          tickets.map(ticket => (
            <MyKanbanCard
              key={ticket.id}
              ticket={ticket}
              usersMap={usersMap}
              allStatuses={allStatuses}
              schedulingStatusId={schedulingStatusId}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface MyKanbanByTypeProps {
  openTickets: TicketWithDetails[];
  ticketTypes: TicketType[];
  allStatuses: TicketTypeStatus[];
  usersMap: Map<string, UserType>;
  schedulingStatusId?: string | null;
  onNavigate?: () => void;
}

function MyKanbanByType({ openTickets, ticketTypes, allStatuses, usersMap, schedulingStatusId, onNavigate }: MyKanbanByTypeProps) {
  const columns = ticketTypes.map(tt => ({
    id: tt.id,
    title: tt.name,
    color: tt.color || undefined,
    tickets: openTickets.filter(t => t.ticketTypeId === tt.id),
  }));

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        No ticket types configured.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" data-testid="kanban-by-type-my">
      {columns.map(col => (
        <MyKanbanColumn
          key={col.id}
          title={col.title}
          color={col.color}
          tickets={col.tickets}
          usersMap={usersMap}
          allStatuses={allStatuses}
          schedulingStatusId={schedulingStatusId}
          onNavigate={onNavigate}
          testId={`kanban-col-my-type-${col.id}`}
        />
      ))}
    </div>
  );
}

// ─── Equipment Ticket Card ────────────────────────────────────────────────────

interface EquipmentTicketCardProps {
  ticket: EquipmentTicket;
  equipmentMap: Map<string, Equipment>;
  formatDueDate: (date: Date | null | undefined) => { text: string; className: string } | null;
  onNavigate?: () => void;
}

function EquipmentTicketCard({ ticket, equipmentMap, formatDueDate, onNavigate }: EquipmentTicketCardProps) {
  const dueInfo = formatDueDate(ticket.dueDate);
  const equipmentItem = equipmentMap.get(ticket.equipmentId);

  const barColor = ticket.status === "completed" || ticket.status === "closed"
    ? "#22c55e"
    : "#f59e0b";

  return (
    <Link href={`/dashboard/equipment-tickets/${ticket.id}`} onClick={onNavigate}>
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer transition-colors"
        data-testid={`card-my-equip-ticket-${ticket.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-1 self-stretch rounded-full"
              style={{ backgroundColor: barColor }}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="text-xs font-normal"
                  data-testid={`badge-my-equip-category-${ticket.id}`}
                >
                  {EQUIPMENT_CATEGORY_LABELS[ticket.category] || ticket.category}
                </Badge>
                {ticket.priority && ticket.priority !== "normal" && (
                  <Badge
                    variant="outline"
                    className={`text-xs capitalize ${PRIORITY_COLORS[ticket.priority] || ""}`}
                    data-testid={`badge-my-equip-priority-${ticket.id}`}
                  >
                    {ticket.priority}
                  </Badge>
                )}
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-auto" />
              </div>

              <div className="flex items-start justify-between gap-2 mt-1">
                <h3 className="font-medium text-base leading-tight line-clamp-2 flex-1" data-testid={`text-my-equip-ticket-title-${ticket.id}`}>
                  {ticket.title}
                </h3>
                <span className="font-mono text-xs text-muted-foreground shrink-0" data-testid={`text-my-equip-ticket-id-${ticket.id}`}>
                  #{ticket.id.slice(0, 8)}
                </span>
              </div>

              {equipmentItem && (
                <div className="flex items-center gap-1 mt-1.5 text-sm text-muted-foreground">
                  <Wrench className="w-3.5 h-3.5" />
                  <span className="truncate" data-testid={`text-my-equip-name-${ticket.id}`}>{equipmentItem.name}</span>
                </div>
              )}

              {dueInfo && (
                <div className={`flex items-center gap-1 mt-1.5 text-xs ${dueInfo.className}`}>
                  <CalendarDays className="w-3 h-3" />
                  <span>{dueInfo.text}</span>
                </div>
              )}

              <div className="mt-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${EQUIPMENT_TICKET_STATUS_COLORS[ticket.status] || ""}`}
                  data-testid={`badge-my-equip-status-${ticket.id}`}
                >
                  {EQUIPMENT_TICKET_STATUS_LABELS[ticket.status] || ticket.status}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
