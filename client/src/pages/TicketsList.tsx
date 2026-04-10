import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Clock, User as UserIcon, MapPin, CalendarDays, Filter, Loader2, Trash2, X, Layers, Check, List, Columns, Wrench, AlertCircle } from "lucide-react";
import { Link, useSearch } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Ticket, TicketType, TicketTypeStatus, Customer, WorkType, User as UserType, CompanyUser, EquipmentTicket } from "@shared/schema";
import { WORK_TYPE_CATALOG } from "@shared/workTypeCatalog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import QuickAddToDo from "@/components/QuickAddToDo";
import BatchTicketDialog from "@/components/BatchTicketDialog";

interface CompanyUserWithDetails {
  companyUser: CompanyUser;
  user: UserType;
  isSuperAdmin: boolean;
}

interface TicketWithDetails extends Ticket {
  ticketType?: TicketType;
  currentStatus?: TicketTypeStatus;
  customer?: Customer;
}


const SCROLL_STORAGE_KEY = "ticketsList_scrollPosition";

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

export default function TicketsList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchString = useSearch();
  const hasRestoredScroll = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  
  // Parse URL params for filter state
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  
  const [search, setSearch] = useState(urlParams.get("q") || "");
  const [priorityFilter, setPriorityFilter] = useState(urlParams.get("priority") || "all");
  const [typeFilters, setTypeFilters] = useState<string[]>(() => {
    const raw = urlParams.get("type");
    return raw ? raw.split(",").filter(Boolean) : [];
  });
  const [workTypeFilter, setWorkTypeFilter] = useState(urlParams.get("workType") || "all");
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "all");
  const [assignedToFilter, setAssignedToFilter] = useState(urlParams.get("assignedTo") || "all");
  const [actionTypeFilter, setActionTypeFilter] = useState(urlParams.get("actionType") || "all");
  const [showFilters, setShowFilters] = useState(false);
  const [showNeedsScheduling, setShowNeedsScheduling] = useState(urlParams.get("needsScheduling") === "true");
  
  // View mode: list | kanban-type | kanban-user
  type ViewMode = "list" | "kanban-type" | "kanban-user";
  const rawView = urlParams.get("view");
  const initialViewMode: ViewMode = (rawView === "kanban-type" || rawView === "kanban-user") ? rawView : "list";
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  
  // Collapsible section states
  const [openSectionCollapsed, setOpenSectionCollapsed] = useState(false);
  const [completedSectionCollapsed, setCompletedSectionCollapsed] = useState(false);
  const [equipmentSectionCollapsed, setEquipmentSectionCollapsed] = useState(false);
  
  // Sync state from URL when URL changes (e.g., browser back/forward)
  const prevSearchString = useRef(searchString);
  useEffect(() => {
    // Only sync if URL actually changed (not from our own updates)
    if (prevSearchString.current === searchString) return;
    prevSearchString.current = searchString;
    
    isUpdatingFromUrl.current = true;
    setSearch(urlParams.get("q") || "");
    setPriorityFilter(urlParams.get("priority") || "all");
    const rawType = urlParams.get("type");
    setTypeFilters(rawType ? rawType.split(",").filter(Boolean) : []);
    setWorkTypeFilter(urlParams.get("workType") || "all");
    setStatusFilter(urlParams.get("status") || "all");
    setAssignedToFilter(urlParams.get("assignedTo") || "all");
    setActionTypeFilter(urlParams.get("actionType") || "all");
    setShowNeedsScheduling(urlParams.get("needsScheduling") === "true");
    const rv = urlParams.get("view");
    setViewMode((rv === "kanban-type" || rv === "kanban-user") ? rv : "list");
  }, [searchString, urlParams]);
  const [completedPage, setCompletedPage] = useState(1);
  const completedPerPage = 10;
  const [batchToDoOpen, setBatchToDoOpen] = useState(false);
  const [batchInvoiceOpen, setBatchInvoiceOpen] = useState(false);
  
  // Selection state for bulk operations
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Track whether view=pendingInvoices needs to be resolved before URL updates
  const hasPendingView = urlParams.get("view") === "pendingInvoices";

  // Update URL when filters change (but skip if we're syncing from URL or URL already matches)
  useEffect(() => {
    if (isUpdatingFromUrl.current) {
      isUpdatingFromUrl.current = false;
      return;
    }

    // Don't update URL until the pending view param has been resolved into filter values
    if (hasPendingView && !pendingInvoicesResolved.current) return;
    
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (typeFilters.length > 0) params.set("type", typeFilters.join(","));
    if (workTypeFilter !== "all") params.set("workType", workTypeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (assignedToFilter !== "all") params.set("assignedTo", assignedToFilter);
    if (actionTypeFilter !== "all") params.set("actionType", actionTypeFilter);
    if (showNeedsScheduling) params.set("needsScheduling", "true");
    if (viewMode !== "list") params.set("view", viewMode);
    
    const queryString = params.toString();
    const currentQuery = searchString.startsWith("?") ? searchString.slice(1) : searchString;
    
    // Only update if the computed query differs from current URL
    if (queryString === currentQuery) return;
    
    const newUrl = queryString ? `/dashboard/tickets?${queryString}` : "/dashboard/tickets";
    prevSearchString.current = queryString ? `?${queryString}` : "";
    
    // Use replace to avoid adding to browser history on every keystroke
    window.history.replaceState(null, "", newUrl);
  }, [search, priorityFilter, typeFilters, workTypeFilter, statusFilter, assignedToFilter, actionTypeFilter, showNeedsScheduling, viewMode, searchString, hasPendingView]);

  // Save scroll position before navigating away
  const saveScrollPosition = useCallback(() => {
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]') || 
                           document.querySelector('main') ||
                           window;
    const scrollTop = scrollContainer === window 
      ? window.scrollY 
      : (scrollContainer as HTMLElement).scrollTop;
    sessionStorage.setItem(SCROLL_STORAGE_KEY, String(scrollTop));
  }, []);


  useSetBreadcrumbs([
    { label: "Tickets" },
  ], []);

  const isAdmin = user?.activeRole === "admin";
  const canSeeEquipmentTickets = user?.activeRole != null && ["admin", "shop_manager", "office", "field_manager", "chemical_manager", "irrigation_manager"].includes(user.activeRole);

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
  });

  const { data: ticketTypes = [], isLoading: ticketTypesLoading } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
  });

  // Fetch the canonical scheduling status ID (Project's "Ready to Schedule" status)
  const { data: schedulingStatusData } = useQuery<{
    schedulingStatusId: string | null;
    statusName?: string;
    ticketTypeId?: string;
    ticketTypeName?: string;
  }>({
    queryKey: ["/api/scheduling-status"],
  });
  const schedulingStatusId = schedulingStatusData?.schedulingStatusId;

  type EquipmentTicketWithName = EquipmentTicket & { equipmentName: string; _type: "equipment" };
  const { data: equipmentTicketsList = [] } = useQuery<EquipmentTicketWithName[]>({
    queryKey: ["/api/equipment-tickets-list"],
    enabled: canSeeEquipmentTickets,
  });

  // Restore scroll position after all required data loads
  const isDataLoaded = !ticketsLoading && !ticketTypesLoading && !customersLoading && tickets.length >= 0;
  useEffect(() => {
    if (!isDataLoaded || hasRestoredScroll.current) return;
    
    const savedPosition = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (savedPosition) {
      hasRestoredScroll.current = true;
      const scrollTop = parseInt(savedPosition, 10);
      // Use double requestAnimationFrame to ensure DOM has rendered with data
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
      // Clear stored position after restoring
      sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    } else {
      hasRestoredScroll.current = true;
    }
  }, [isDataLoaded]);

  // Create a lookup map for users by ID (extract user from companyUser structure)
  const usersMap = useMemo(() => {
    const map = new Map<string, UserType>();
    companyUsersData.forEach(cu => {
      if (cu.user) {
        map.set(cu.user.id, cu.user);
      }
    });
    return map;
  }, [companyUsersData]);

  const ticketTypeStatusesQueries = ticketTypes.map(tt => ({
    ticketTypeId: tt.id,
    queryKey: ["/api/ticket-types", tt.id, "statuses"],
  }));

  const { data: allStatuses = [] } = useQuery({
    queryKey: ["/api/ticket-type-statuses-all"],
    queryFn: async () => {
      const allStatusArrays = await Promise.all(
        ticketTypes.map(async (tt) => {
          const res = await fetch(`/api/ticket-types/${tt.id}/statuses`, { credentials: "include" });
          if (!res.ok) return [];
          return res.json();
        })
      );
      return allStatusArrays.flat();
    },
    enabled: ticketTypes.length > 0,
  });

  const pendingInvoicesResolved = useRef(false);
  useEffect(() => {
    if (pendingInvoicesResolved.current) return;
    if (urlParams.get("view") !== "pendingInvoices") return;
    if (ticketTypes.length === 0 || allStatuses.length === 0) return;

    const invoiceType = ticketTypes.find(tt => tt.name === "Invoice");
    if (invoiceType) {
      const pendingStatus = (allStatuses as TicketTypeStatus[]).find(
        (s) => s.ticketTypeId === invoiceType.id && s.name === "Pending Invoice"
      );
      isUpdatingFromUrl.current = true;
      setTypeFilters([invoiceType.id]);
      setStatusFilter(pendingStatus?.id || "all");
      setShowFilters(true);
      pendingInvoicesResolved.current = true;

      const params = new URLSearchParams();
      params.set("type", invoiceType.id);
      if (pendingStatus) params.set("status", pendingStatus.id);
      const newUrl = `/dashboard/tickets?${params.toString()}`;
      prevSearchString.current = `?${params.toString()}`;
      window.history.replaceState(null, "", newUrl);
    }
  }, [ticketTypes, allStatuses, urlParams]);

  const enrichedTickets: TicketWithDetails[] = tickets.map(ticket => ({
    ...ticket,
    ticketType: ticketTypes.find(tt => tt.id === ticket.ticketTypeId),
    currentStatus: allStatuses.find((s: TicketTypeStatus) => s.id === ticket.currentStatusId),
    customer: customers.find(c => c.id === ticket.customerId),
  }));

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (priorityFilter !== "all") count++;
    if (typeFilters.length > 0) count++;
    if (workTypeFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    if (assignedToFilter !== "all") count++;
    if (actionTypeFilter !== "all") count++;
    if (showNeedsScheduling) count++;
    return count;
  }, [search, priorityFilter, typeFilters, workTypeFilter, statusFilter, assignedToFilter, actionTypeFilter, showNeedsScheduling]);

  const filteredTickets = enrichedTickets.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(search.toLowerCase()) ||
      ticket.customer?.name?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    const matchesType = typeFilters.length === 0 || typeFilters.includes(ticket.ticketTypeId);
    const matchesWorkType = workTypeFilter === "all" || ticket.workType === workTypeFilter;
    const matchesStatus = statusFilter === "all" || ticket.currentStatusId === statusFilter;
    const matchesAssignedTo = assignedToFilter === "all" || ticket.assignedToId === assignedToFilter;
    const matchesActionType = actionTypeFilter === "all" || (() => {
      const statusActionType = ticket.currentStatus?.actionType || "needs_action";
      const statusWaitingCategory = ticket.currentStatus?.waitingCategory;
      if (actionTypeFilter === "needs_action") return statusActionType === "needs_action";
      if (actionTypeFilter === "waiting") return statusActionType === "waiting";
      if (actionTypeFilter === "waiting_customer") return statusActionType === "waiting" && statusWaitingCategory === "customer";
      if (actionTypeFilter === "waiting_vendor") return statusActionType === "waiting" && statusWaitingCategory === "vendor";
      if (actionTypeFilter === "waiting_internal") return statusActionType === "waiting" && statusWaitingCategory === "internal";
      if (actionTypeFilter === "waiting_other") return statusActionType === "waiting" && statusWaitingCategory === "other";
      return true;
    })();
    
    // Quick filter for scheduling queue (ID-based: currentStatusId === schedulingStatusId)
    const matchesNeedsScheduling = !showNeedsScheduling || 
      (schedulingStatusId && ticket.currentStatusId === schedulingStatusId);
    
    return matchesSearch && matchesPriority && matchesType && matchesWorkType && matchesStatus && matchesAssignedTo && matchesActionType && matchesNeedsScheduling;
  });
  
  // Get statuses for currently selected ticket type (only when exactly one type is selected)
  const selectedTypeStatuses = typeFilters.length === 1
    ? allStatuses.filter((s: TicketTypeStatus) => s.ticketTypeId === typeFilters[0])
    : [];

  const openTickets = filteredTickets.filter(t => !t.completedAt);
  const completedTickets = filteredTickets.filter(t => t.completedAt);
  
  // Reset completed page when filters change
  useEffect(() => {
    setCompletedPage(1);
  }, [search, priorityFilter, typeFilters, workTypeFilter, statusFilter, assignedToFilter, showNeedsScheduling]);

  // Reset statusFilter when type selection changes to 0 or 2+
  useEffect(() => {
    if (typeFilters.length !== 1) {
      setStatusFilter("all");
    }
  }, [typeFilters]);
  
  // Count of tickets needing scheduling (for badge display) - ID-based matching
  const needsSchedulingCount = schedulingStatusId 
    ? enrichedTickets.filter(t => t.currentStatusId === schedulingStatusId && !t.completedAt).length
    : 0;
  
  // Clamp page when data changes (e.g., after refetch)
  useEffect(() => {
    const totalPages = Math.ceil(completedTickets.length / completedPerPage);
    if (completedPage > totalPages && totalPages > 0) {
      setCompletedPage(totalPages);
    }
  }, [completedTickets.length, completedPage, completedPerPage]);

  // Clear selection when exiting selection mode
  useEffect(() => {
    if (!selectionMode) {
      setSelectedTicketIds(new Set());
    }
  }, [selectionMode]);

  // Batch delete mutation
  const batchDeleteMutation = useMutation({
    mutationFn: async (ticketIds: string[]) => {
      const res = await apiRequest("DELETE", "/api/tickets/batch", { ticketIds });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      const { summary } = result;
      toast({
        title: `Deleted ${summary.deletedCount} ticket${summary.deletedCount !== 1 ? "s" : ""}`,
        description: summary.failedCount > 0 
          ? `${summary.failedCount} failed to delete` 
          : undefined,
      });
      setSelectionMode(false);
      setDeleteConfirmOpen(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to delete tickets", 
        description: error.message || "An unexpected error occurred",
        variant: "destructive" 
      });
    },
  });


  const toggleTicketSelection = (ticketId: string) => {
    setSelectedTicketIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ticketId)) {
        newSet.delete(ticketId);
      } else {
        newSet.add(ticketId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    const allVisibleIds = [...openTickets, ...completedTickets].map(t => t.id);
    setSelectedTicketIds(new Set(allVisibleIds));
  };

  const clearSelection = () => {
    setSelectedTicketIds(new Set());
  };

  const handleBatchDelete = () => {
    if (selectedTicketIds.size > 0) {
      batchDeleteMutation.mutate(Array.from(selectedTicketIds));
    }
  };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden md:block">
            Manage work orders and service tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuickAddToDo variant="outline" />
          {isAdmin && (
            <>
              {!selectionMode ? (
                <Button 
                  variant="outline" 
                  size="default" 
                  onClick={() => setSelectionMode(true)}
                  data-testid="button-enter-select-mode" 
                  className="gap-2"
                >
                  <Checkbox className="w-4 h-4" />
                  <span className="hidden sm:inline">Select</span>
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="default" 
                  onClick={() => setSelectionMode(false)}
                  data-testid="button-exit-select-mode" 
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
              )}
              <Button 
                variant="outline" 
                size="default" 
                onClick={() => setBatchToDoOpen(true)}
                data-testid="button-batch-todo" 
                className="gap-2"
              >
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">Batch To-Do</span>
              </Button>
              <Button 
                variant="outline" 
                size="default" 
                onClick={() => setBatchInvoiceOpen(true)}
                data-testid="button-batch-invoice" 
                className="gap-2"
              >
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">Batch Invoice</span>
              </Button>
              <Link href="/dashboard/tickets/new">
                <Button size="default" data-testid="button-add-ticket" className="gap-2">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">New Ticket</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/30 w-fit" data-testid="view-mode-toggle">
        <Button
          variant={viewMode === "list" ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5"
          onClick={() => setViewMode("list")}
          data-testid="button-view-list"
        >
          <List className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">List</span>
        </Button>
        <Button
          variant={viewMode === "kanban-type" ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5"
          onClick={() => setViewMode("kanban-type")}
          data-testid="button-view-kanban-type"
        >
          <Columns className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">By Type</span>
        </Button>
        <Button
          variant={viewMode === "kanban-user" ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5"
          onClick={() => setViewMode("kanban-user")}
          data-testid="button-view-kanban-user"
        >
          <UserIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">By User</span>
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
            data-testid="input-search"
          />
        </div>
        <Button 
          variant="outline" 
          className="h-11 shrink-0 gap-2"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="bg-primary text-primary-foreground">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
        
        {/* Quick filter for Ready to Schedule tickets */}
        {needsSchedulingCount > 0 && (
          <Button 
            variant={showNeedsScheduling ? "default" : "outline"}
            className={`h-11 shrink-0 gap-2 ${showNeedsScheduling ? "bg-pink-500 hover:bg-pink-600 text-white" : ""}`}
            onClick={() => setShowNeedsScheduling(!showNeedsScheduling)}
            data-testid="button-needs-scheduling-filter"
          >
            <CalendarDays className="w-4 h-4" />
            Needs Scheduling
            <Badge 
              variant="secondary" 
              className={`${showNeedsScheduling ? "bg-white text-pink-600" : "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200"}`}
            >
              {needsSchedulingCount}
            </Badge>
          </Button>
        )}
      </div>

      {/* Ticket type pill filters */}
      {ticketTypes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" data-testid="pill-filter-row">
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
                data-testid={`pill-type-${tt.id}`}
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
            <SelectTrigger className="w-[130px] h-10" data-testid="select-priority-filter">
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
            <SelectTrigger className="w-[150px] h-10" data-testid="select-worktype-filter">
              <SelectValue placeholder="Work Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Work Types</SelectItem>
              <SelectItem value="contract">Contract Work</SelectItem>
              <SelectItem value="extra_work">Extra Billable</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="estimate_request">Estimate Request</SelectItem>
              <SelectItem value="shop_todo">Shop To-Do</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Status filter - only show when exactly one ticket type pill is selected */}
          {typeFilters.length === 1 && selectedTypeStatuses.length > 0 && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-10" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {[...selectedTypeStatuses].sort((a, b) => a.displayOrder - b.displayOrder).map((status: TicketTypeStatus) => (
                  <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Assigned To filter */}
          <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
            <SelectTrigger className="w-[160px] h-10" data-testid="select-assignedto-filter">
              <SelectValue placeholder="Assigned To" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {Array.from(usersMap.values()).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Action Type filter */}
          <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
            <SelectTrigger className="w-[175px] h-10" data-testid="select-action-type-filter">
              <SelectValue placeholder="Action Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Action Types</SelectItem>
              <SelectItem value="needs_action">Needs Action</SelectItem>
              <SelectItem value="waiting">Any Waiting</SelectItem>
              <SelectItem value="waiting_customer">Waiting - Customer</SelectItem>
              <SelectItem value="waiting_vendor">Waiting - Vendor</SelectItem>
              <SelectItem value="waiting_internal">Waiting - Internal</SelectItem>
              <SelectItem value="waiting_other">Waiting - Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {viewMode === "kanban-type" && (
        <KanbanByType
          openTickets={openTickets}
          ticketTypes={ticketTypes}
          allStatuses={allStatuses}
          usersMap={usersMap}
          schedulingStatusId={schedulingStatusId}
          onNavigate={saveScrollPosition}
        />
      )}

      {viewMode === "kanban-user" && (
        <KanbanByUser
          openTickets={openTickets}
          usersMap={usersMap}
          allStatuses={allStatuses}
          schedulingStatusId={schedulingStatusId}
          onNavigate={saveScrollPosition}
        />
      )}

      {viewMode === "list" && filteredTickets.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No tickets found</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {search || priorityFilter !== "all"
                ? "Try adjusting your search or filters."
                : isAdmin 
                  ? "Create your first ticket to get started."
                  : "No tickets found."}
            </p>
            {isAdmin && (
              <Link href="/dashboard/tickets/new">
                <Button data-testid="button-create-first-ticket">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Ticket
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <div className="space-y-4">
          {/* Selection mode header */}
          {selectionMode && (
            <div className="flex items-center justify-between gap-3 py-2 px-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {selectedTicketIds.size} selected
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={selectAllVisible}
                  data-testid="button-select-all"
                >
                  Select All ({filteredTickets.length})
                </Button>
                {selectedTicketIds.size > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearSelection}
                    data-testid="button-clear-selection"
                  >
                    Clear
                  </Button>
                )}
              </div>
              {selectedTicketIds.size > 100 && (
                <span className="text-xs text-destructive font-medium">
                  Max 100 at once
                </span>
              )}
              {selectedTicketIds.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={selectedTicketIds.size > 100}
                  data-testid="button-delete-selected"
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete ({selectedTicketIds.size})
                </Button>
              )}
            </div>
          )}

          {openTickets.length > 0 && (
            <div className="space-y-3 md:space-y-2">
              <button 
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
                onClick={() => setOpenSectionCollapsed(!openSectionCollapsed)}
                data-testid="button-toggle-open-section"
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
                      usersMap={usersMap}
                      schedulingStatusId={schedulingStatusId}
                      selectionMode={selectionMode}
                      isSelected={selectedTicketIds.has(ticket.id)}
                      onToggleSelect={() => toggleTicketSelection(ticket.id)}
                      onNavigate={saveScrollPosition}
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
                  data-testid="button-toggle-completed-section"
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
                          usersMap={usersMap}
                          schedulingStatusId={schedulingStatusId}
                          selectionMode={selectionMode}
                          isSelected={selectedTicketIds.has(ticket.id)}
                          onToggleSelect={() => toggleTicketSelection(ticket.id)}
                          onNavigate={saveScrollPosition}
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
                          data-testid="button-completed-prev"
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
                          data-testid="button-completed-next"
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
        </div>
      ) : null}

      {canSeeEquipmentTickets && viewMode === "list" && equipmentTicketsList.length > 0 && (
        <div className="space-y-3 md:space-y-2 mt-6" data-testid="section-equipment-tickets">
          <div className="flex items-center gap-2 px-1 mb-1">
            <Wrench className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">Equipment Tickets</span>
          </div>
          <button
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1 hover:text-foreground transition-colors w-full text-left"
            onClick={() => setEquipmentSectionCollapsed(!equipmentSectionCollapsed)}
            data-testid="button-toggle-equipment-section"
          >
            {equipmentSectionCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            All Equipment Tickets ({equipmentTicketsList.length})
          </button>
          {!equipmentSectionCollapsed && (
            <div className="space-y-3 md:space-y-2">
              {equipmentTicketsList.map((ticket) => {
                const isCompleted = ticket.status === "completed" || ticket.status === "closed";
                const barColor = isCompleted ? "#22c55e" : "#f59e0b";
                return (
                  <Link key={ticket.id} href={`/dashboard/equipment-tickets/${ticket.id}`}>
                    <Card
                      className={`hover-elevate active-elevate-2 cursor-pointer transition-colors ${isCompleted ? "opacity-75" : ""}`}
                      data-testid={`card-equip-ticket-${ticket.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: barColor }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className="text-xs font-normal"
                                data-testid={`badge-equip-category-${ticket.id}`}
                              >
                                {EQUIPMENT_CATEGORY_LABELS[ticket.category] || ticket.category}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-xs capitalize ${EQUIPMENT_TICKET_STATUS_COLORS[ticket.status] || ""}`}
                                data-testid={`badge-equip-status-${ticket.id}`}
                              >
                                {EQUIPMENT_TICKET_STATUS_LABELS[ticket.status] || ticket.status}
                              </Badge>
                              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-auto" />
                            </div>
                            <div className="flex items-start justify-between gap-2 mt-1">
                              <h3 className="font-medium text-base leading-tight line-clamp-2 flex-1" data-testid={`text-equip-ticket-title-${ticket.id}`}>
                                {ticket.title}
                              </h3>
                              <span className="font-mono text-xs text-muted-foreground shrink-0" data-testid={`text-equip-ticket-id-${ticket.id}`}>
                                #{ticket.id.slice(0, 8)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-1.5 text-sm text-muted-foreground">
                              <Wrench className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate" data-testid={`text-equip-name-${ticket.id}`}>{ticket.equipmentName}</span>
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
        </div>
      )}

      {/* Batch Ticket Dialogs */}
      <BatchTicketDialog 
        open={batchToDoOpen} 
        onOpenChange={setBatchToDoOpen} 
        ticketTypeName="To-Do" 
      />
      <BatchTicketDialog 
        open={batchInvoiceOpen} 
        onOpenChange={setBatchInvoiceOpen} 
        ticketTypeName="Invoice" 
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTicketIds.size} ticket{selectedTicketIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected tickets and all their associated data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBatchDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={batchDeleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {batchDeleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Kanban Components ────────────────────────────────────────────────────────

interface KanbanCardProps {
  ticket: TicketWithDetails;
  usersMap: Map<string, UserType>;
  allStatuses: TicketTypeStatus[];
  schedulingStatusId?: string | null;
  onNavigate?: () => void;
}

function KanbanCard({ ticket, usersMap, allStatuses, schedulingStatusId, onNavigate }: KanbanCardProps) {
  const barColor = ticket.ticketType?.color || "#6b7280";
  const needsScheduling = schedulingStatusId && ticket.currentStatusId === schedulingStatusId;
  const currentStatus = allStatuses.find(s => s.id === ticket.currentStatusId);

  return (
    <Link href={`/dashboard/tickets/${ticket.id}`} onClick={() => onNavigate?.()}>
      <Card
        className={`hover-elevate active-elevate-2 cursor-pointer mb-2 ${needsScheduling ? "ring-2 ring-pink-500 dark:ring-pink-400" : ""}`}
        data-testid={`kanban-card-ticket-${ticket.id}`}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: barColor }} />
            <div className="flex-1 min-w-0">
              {/* Type badge + ticket ID */}
              <div className="flex items-center justify-between gap-1 mb-1">
                {ticket.ticketType && (
                  <span className="text-xs font-semibold" style={{ color: barColor }} data-testid={`kanban-tickettype-${ticket.id}`}>
                    {ticket.ticketType.name}
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground shrink-0" data-testid={`kanban-ticket-id-${ticket.id}`}>
                  #{ticket.id.slice(0, 8)}
                </span>
              </div>
              {/* Title */}
              <p className="text-sm font-medium leading-snug line-clamp-2 mb-1" data-testid={`kanban-title-${ticket.id}`}>
                {ticket.title}
              </p>
              {/* Customer name */}
              {ticket.customer && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate" data-testid={`kanban-customer-${ticket.id}`}>{ticket.customer.name}</span>
                </div>
              )}
              {/* Status + assignee row */}
              <div className="flex items-center justify-between gap-2">
                {currentStatus && (
                  <Badge
                    variant="outline"
                    className="text-xs truncate max-w-[120px]"
                    style={{ borderColor: currentStatus.color || undefined }}
                    data-testid={`kanban-status-${ticket.id}`}
                  >
                    {currentStatus.name}
                  </Badge>
                )}
                {ticket.assignedToId && (
                  <span className="text-xs text-muted-foreground truncate max-w-[80px]" data-testid={`kanban-assignee-${ticket.id}`}>
                    {usersMap.get(ticket.assignedToId)?.name || usersMap.get(ticket.assignedToId)?.email?.split("@")[0] || ""}
                  </span>
                )}
              </div>
              {/* Action type badge */}
              {currentStatus && !ticket.completedAt && (
                currentStatus.actionType === "waiting" ? (
                  <Badge
                    className="text-xs font-normal bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700 gap-1 mt-1.5"
                    data-testid={`badge-action-type-waiting-${ticket.id}`}
                  >
                    <Clock className="w-3 h-3" />
                    Waiting{currentStatus.waitingCategory ? ` · ${
                      currentStatus.waitingCategory === "customer" ? "Customer" :
                      currentStatus.waitingCategory === "vendor" ? "Vendor" :
                      currentStatus.waitingCategory === "internal" ? "Internal" : "Other"
                    }` : ""}
                  </Badge>
                ) : (
                  <Badge
                    className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700 gap-1 mt-1.5"
                    data-testid={`badge-action-type-needs-action-${ticket.id}`}
                  >
                    <AlertCircle className="w-3 h-3" />
                    Needs Action
                  </Badge>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface KanbanColumnProps {
  title: string;
  color?: string;
  tickets: TicketWithDetails[];
  usersMap: Map<string, UserType>;
  allStatuses: TicketTypeStatus[];
  schedulingStatusId?: string | null;
  onNavigate?: () => void;
  testId?: string;
}

function KanbanColumn({ title, color, tickets, usersMap, allStatuses, schedulingStatusId, onNavigate, testId }: KanbanColumnProps) {
  return (
    <div
      className="flex flex-col shrink-0 w-72 bg-muted/30 rounded-md border"
      style={{ height: "calc(100vh - 280px)", minHeight: "300px" }}
      data-testid={testId}
    >
      {/* Column header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {color && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
          <span className="text-sm font-semibold truncate">{title}</span>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">{tickets.length}</Badge>
      </div>
      {/* Scrollable card stack */}
      <div className="flex-1 overflow-y-auto p-2">
        {tickets.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
            No open tickets
          </div>
        ) : (
          tickets.map(ticket => (
            <KanbanCard
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

interface KanbanByTypeProps {
  openTickets: TicketWithDetails[];
  ticketTypes: TicketType[];
  allStatuses: TicketTypeStatus[];
  usersMap: Map<string, UserType>;
  schedulingStatusId?: string | null;
  onNavigate?: () => void;
}

function KanbanByType({ openTickets, ticketTypes, allStatuses, usersMap, schedulingStatusId, onNavigate }: KanbanByTypeProps) {
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
    <div className="flex gap-3 overflow-x-auto pb-4" data-testid="kanban-by-type">
      {columns.map(col => (
        <KanbanColumn
          key={col.id}
          title={col.title}
          color={col.color}
          tickets={col.tickets}
          usersMap={usersMap}
          allStatuses={allStatuses}
          schedulingStatusId={schedulingStatusId}
          onNavigate={onNavigate}
          testId={`kanban-col-type-${col.id}`}
        />
      ))}
    </div>
  );
}

interface KanbanByUserProps {
  openTickets: TicketWithDetails[];
  usersMap: Map<string, UserType>;
  allStatuses: TicketTypeStatus[];
  schedulingStatusId?: string | null;
  onNavigate?: () => void;
}

function KanbanByUser({ openTickets, usersMap, allStatuses, schedulingStatusId, onNavigate }: KanbanByUserProps) {
  const unassignedTickets = openTickets.filter(t => !t.assignedToId);
  
  const assignedUserIds = useMemo(() => {
    const ids = new Set<string>();
    openTickets.forEach(t => { if (t.assignedToId) ids.add(t.assignedToId); });
    return Array.from(ids);
  }, [openTickets]);

  const userColumns = assignedUserIds.map(userId => {
    const user = usersMap.get(userId);
    return {
      userId,
      title: user?.name || user?.email?.split("@")[0] || "Unknown",
      tickets: openTickets.filter(t => t.assignedToId === userId),
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  if (openTickets.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        No open tickets.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" data-testid="kanban-by-user">
      {/* Unassigned column always first */}
      <KanbanColumn
        title="Unassigned"
        tickets={unassignedTickets}
        usersMap={usersMap}
        allStatuses={allStatuses}
        schedulingStatusId={schedulingStatusId}
        onNavigate={onNavigate}
        testId="kanban-col-unassigned"
      />
      {userColumns.map(col => (
        <KanbanColumn
          key={col.userId}
          title={col.title}
          tickets={col.tickets}
          usersMap={usersMap}
          allStatuses={allStatuses}
          schedulingStatusId={schedulingStatusId}
          onNavigate={onNavigate}
          testId={`kanban-col-user-${col.userId}`}
        />
      ))}
    </div>
  );
}

// ─── List TicketCard ───────────────────────────────────────────────────────────

interface TicketCardProps {
  ticket: TicketWithDetails;
  formatDueDate: (date: Date | null | undefined) => { text: string; className: string } | null;
  usersMap: Map<string, UserType>;
  schedulingStatusId?: string | null;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onNavigate?: () => void;
  workflowStatuses?: TicketTypeStatus[];
}

function TicketCard({ ticket, formatDueDate, usersMap, schedulingStatusId, selectionMode, isSelected, onToggleSelect, onNavigate, workflowStatuses = [] }: TicketCardProps) {
  const dueInfo = formatDueDate(ticket.dueDate);
  
  // Bar color: green for completed, ticket type color for open tickets
  const barColor = ticket.completedAt 
    ? "#22c55e" // green-500
    : (ticket.ticketType?.color || "#6b7280"); // gray-500 fallback

  // Check if this ticket needs scheduling (ID-based: currentStatusId === schedulingStatusId)
  const needsScheduling = schedulingStatusId && ticket.currentStatusId === schedulingStatusId;

  const cardInner = (
    <Card 
      className={`hover-elevate active-elevate-2 cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""} ${needsScheduling ? "ring-2 ring-pink-500 dark:ring-pink-400 animate-pulse" : ""}`}
      data-testid={`card-ticket-${ticket.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {selectionMode && (
            <div 
              className="flex items-center justify-center pt-1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSelect?.();
              }}
            >
              <Checkbox 
                checked={isSelected}
                data-testid={`checkbox-ticket-${ticket.id}`}
              />
            </div>
          )}
          <div 
            className="w-1 self-stretch rounded-full" 
            style={{ backgroundColor: barColor }}
          />
          
          <div className="flex-1 min-w-0">
            {/* Row 1: Ticket type (colored text) + overdue + needs scheduling indicator */}
            <div className="flex items-center gap-2 flex-wrap">
              {ticket.ticketType && (
                <span 
                  className="text-sm font-semibold"
                  style={{ color: barColor }}
                  data-testid={`text-tickettype-${ticket.id}`}
                >
                  {ticket.ticketType.name}
                </span>
              )}
              {dueInfo?.text === "Overdue" && (
                <Badge 
                  variant="destructive"
                  className="text-xs font-semibold"
                  data-testid={`badge-overdue-${ticket.id}`}
                >
                  Overdue
                </Badge>
              )}
              {needsScheduling && (
                <Badge 
                  className="text-xs font-semibold bg-pink-500 text-white border-pink-600 dark:bg-pink-600 dark:border-pink-500"
                  data-testid={`badge-needs-scheduling-${ticket.id}`}
                >
                  Needs Scheduling
                </Badge>
              )}
              {ticket.currentStatus && !ticket.completedAt && (
                ticket.currentStatus.actionType === "waiting" ? (
                  <Badge
                    className="text-xs font-normal bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700 gap-1"
                    data-testid={`badge-action-type-waiting-${ticket.id}`}
                  >
                    <Clock className="w-3 h-3" />
                    Waiting{ticket.currentStatus.waitingCategory ? ` · ${
                      ticket.currentStatus.waitingCategory === "customer" ? "Customer" :
                      ticket.currentStatus.waitingCategory === "vendor" ? "Vendor" :
                      ticket.currentStatus.waitingCategory === "internal" ? "Internal" : "Other"
                    }` : ""}
                  </Badge>
                ) : (
                  <Badge
                    className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700 gap-1"
                    data-testid={`badge-action-type-needs-action-${ticket.id}`}
                  >
                    <AlertCircle className="w-3 h-3" />
                    Needs Action
                  </Badge>
                )
              )}
              {!selectionMode && (
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-auto" />
              )}
            </div>

            {/* Row 2: Title + ticket ID */}
            <div className="flex items-start justify-between gap-2 mt-1">
              <h3 className="font-medium text-base leading-tight line-clamp-2 flex-1" data-testid={`text-ticket-title-${ticket.id}`}>
                {ticket.title}
              </h3>
              <span className="font-mono text-xs text-muted-foreground shrink-0" data-testid={`text-ticket-id-${ticket.id}`}>
                #{ticket.id.slice(0, 8)}
              </span>
            </div>

            {/* Row 3: Invoice category badge (only for Invoice tickets) */}
            {ticket.ticketType?.name === "Invoice" && ticket.invoiceCategory && (
              <div className="mt-1.5">
                <Badge 
                  variant="outline"
                  className={`text-xs font-normal ${
                    ticket.invoiceCategory === "snow" 
                      ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-300" 
                      : "bg-green-50 border-green-300 text-green-700 dark:bg-green-950 dark:border-green-700 dark:text-green-300"
                  }`}
                  data-testid={`badge-invoice-category-${ticket.id}`}
                >
                  {ticket.invoiceCategory === "snow" ? "Snow" : "Maintenance"}
                </Badge>
              </div>
            )}

            {/* Row 4: Customer */}
            {ticket.customer && (
              <div className="flex items-center gap-1 mt-1.5 text-sm text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate">{ticket.customer.name}</span>
              </div>
            )}

            {/* Divider + Workflow progress row */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div className="flex items-center gap-3">
                {/* Progress bubbles showing workflow position */}
                {workflowStatuses.length > 0 && ticket.currentStatus && (() => {
                  const currentIndex = workflowStatuses.findIndex(s => s.id === ticket.currentStatusId);
                  const isOnFinalStep = currentIndex === workflowStatuses.length - 1;
                  
                  return (
                    <div className="flex items-center" data-testid={`workflow-progress-${ticket.id}`}>
                      {workflowStatuses.map((status, index) => {
                        const isCompleted = index < currentIndex || isOnFinalStep;
                        const isCurrent = index === currentIndex && !isOnFinalStep;
                        const isFirst = index === 0;
                        
                        return (
                          <div key={status.id} className="flex items-center">
                            {/* Connector line before (except for first element) */}
                            {!isFirst && (
                              <div 
                                className={`w-2 h-0.5 ${
                                  isCompleted || isCurrent || isOnFinalStep
                                    ? "bg-green-500 dark:bg-green-400" 
                                    : "bg-muted-foreground/30 dark:bg-muted-foreground/20"
                                }`}
                              />
                            )}
                            
                            {/* Current step shows badge, others show bubble */}
                            {isCurrent ? (
                              <Badge 
                                variant="outline" 
                                className="text-xs mx-0.5"
                                style={{ borderColor: status.color || undefined }}
                                data-testid={`badge-current-status-${ticket.id}`}
                              >
                                {status.name}
                              </Badge>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`w-2.5 h-2.5 rounded-full cursor-default transition-all shrink-0 ${
                                      isCompleted 
                                        ? "bg-green-500 dark:bg-green-400" 
                                        : "bg-muted-foreground/30 dark:bg-muted-foreground/20"
                                    }`}
                                    data-testid={`bubble-status-${status.id}`}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <span className={isCompleted ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                                    {status.name}
                                    {isCompleted && " ✓"}
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Complete indicator when on final step */}
                      {isOnFinalStep && (
                        <>
                          <div className="w-2 h-0.5 bg-green-500 dark:bg-green-400" />
                          <Badge 
                            variant="outline" 
                            className="text-xs mx-0.5 border-green-500 dark:border-green-400 text-green-600 dark:text-green-400"
                            data-testid={`badge-complete-${ticket.id}`}
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Complete
                          </Badge>
                        </>
                      )}
                    </div>
                  );
                })()}
                {/* Fallback: show badge if no workflow statuses */}
                {workflowStatuses.length === 0 && ticket.currentStatus && (
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                    style={{ borderColor: ticket.currentStatus.color || undefined }}
                  >
                    {ticket.currentStatus.name}
                  </Badge>
                )}
                {dueInfo && dueInfo.text !== "Overdue" && (
                  <span className={`text-xs flex items-center gap-1 ${dueInfo.className}`}>
                    <CalendarDays className="w-3 h-3" />
                    {dueInfo.text}
                  </span>
                )}
              </div>

              {ticket.assignedToId && (
                <div className="flex items-center gap-1.5">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-[10px] bg-muted">
                      <UserIcon className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground truncate max-w-[100px]" data-testid={`text-assignee-${ticket.id}`}>
                    {usersMap.get(ticket.assignedToId)?.name || usersMap.get(ticket.assignedToId)?.email?.split('@')[0] || 'Assigned'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // In selection mode, clicking the card toggles selection
  // Otherwise, clicking navigates to ticket detail
  if (selectionMode) {
    return (
      <div onClick={() => onToggleSelect?.()}>
        {cardInner}
      </div>
    );
  }

  return (
    <Link href={`/dashboard/tickets/${ticket.id}`} onClick={() => onNavigate?.()}>
      {cardInner}
    </Link>
  );
}
