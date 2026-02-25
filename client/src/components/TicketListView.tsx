import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, ChevronRight, ChevronLeft, ChevronDown, Clock, CalendarDays, Filter, Loader2, Trash2, X, Layers } from "lucide-react";
import { Link } from "wouter";
import type { Ticket, TicketType, TicketTypeStatus, Customer, User as UserType, CompanyUser } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import QuickAddToDo from "@/components/QuickAddToDo";
import BatchTicketDialog from "@/components/BatchTicketDialog";
import TicketCard from "@/components/TicketCard";

interface CompanyUserWithDetails {
  companyUser: CompanyUser;
  user: UserType;
  isSuperAdmin: boolean;
}

import type { TicketWithDetails } from "@/components/TicketCard";

export interface TicketListViewProps {
  customerId?: string;
  showHeader?: boolean;
  showCustomerColumn?: boolean;
  showBatchActions?: boolean;
  showQuickAdd?: boolean;
  showNewTicketButton?: boolean;
  compact?: boolean;
}

export default function TicketListView({
  customerId,
  showHeader = true,
  showCustomerColumn = true,
  showBatchActions = true,
  showQuickAdd = true,
  showNewTicketButton = true,
  compact = false,
}: TicketListViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [workTypeFilter, setWorkTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedToFilter, setAssignedToFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showNeedsScheduling, setShowNeedsScheduling] = useState(false);
  
  const [openSectionCollapsed, setOpenSectionCollapsed] = useState(false);
  const [completedSectionCollapsed, setCompletedSectionCollapsed] = useState(false);
  
  const [completedPage, setCompletedPage] = useState(1);
  const completedPerPage = 10;
  const [batchToDoOpen, setBatchToDoOpen] = useState(false);
  const [batchInvoiceOpen, setBatchInvoiceOpen] = useState(false);
  
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const isAdmin = user?.activeRole === "admin";

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<Ticket[]>({
    queryKey: customerId ? ["/api/customers", customerId, "tickets"] : ["/api/tickets"],
  });

  const { data: ticketTypes = [], isLoading: ticketTypesLoading } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: showCustomerColumn,
  });

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
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

  const usersMap = useMemo(() => {
    const map = new Map<string, UserType>();
    companyUsersData.forEach(cu => {
      if (cu.user) {
        map.set(cu.user.id, cu.user);
      }
    });
    return map;
  }, [companyUsersData]);

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

  const enrichedTickets: TicketWithDetails[] = tickets.map(ticket => ({
    ...ticket,
    ticketType: ticketTypes.find(tt => tt.id === ticket.ticketTypeId),
    currentStatus: allStatuses.find((s: TicketTypeStatus) => s.id === ticket.currentStatusId),
    customer: showCustomerColumn ? customers.find(c => c.id === ticket.customerId) : undefined,
  }));

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (priorityFilter !== "all") count++;
    if (typeFilter !== "all") count++;
    if (workTypeFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    if (assignedToFilter !== "all") count++;
    if (showNeedsScheduling) count++;
    return count;
  }, [search, priorityFilter, typeFilter, workTypeFilter, statusFilter, assignedToFilter, showNeedsScheduling]);

  const filteredTickets = enrichedTickets.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(search.toLowerCase()) ||
      ticket.customer?.name?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    const matchesType = typeFilter === "all" || ticket.ticketTypeId === typeFilter;
    const matchesWorkType = workTypeFilter === "all" || ticket.workType === workTypeFilter;
    const matchesStatus = statusFilter === "all" || ticket.currentStatusId === statusFilter;
    const matchesAssignedTo = assignedToFilter === "all" || ticket.assignedToId === assignedToFilter;
    
    const matchesNeedsScheduling = !showNeedsScheduling || 
      (schedulingStatusId && ticket.currentStatusId === schedulingStatusId);
    
    return matchesSearch && matchesPriority && matchesType && matchesWorkType && matchesStatus && matchesAssignedTo && matchesNeedsScheduling;
  });
  
  const selectedTypeStatuses = typeFilter !== "all" 
    ? allStatuses.filter((s: TicketTypeStatus) => s.ticketTypeId === typeFilter)
    : [];

  const openTickets = filteredTickets.filter(t => !t.completedAt);
  const completedTickets = filteredTickets.filter(t => t.completedAt);
  
  const needsSchedulingCount = schedulingStatusId 
    ? enrichedTickets.filter(t => t.currentStatusId === schedulingStatusId && !t.completedAt).length
    : 0;

  const batchDeleteMutation = useMutation({
    mutationFn: async (ticketIds: string[]) => {
      const res = await apiRequest("DELETE", "/api/tickets/batch", { ticketIds });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "tickets"] });
      }
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
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const newTicketUrl = customerId 
    ? `/dashboard/tickets/new?customerId=${customerId}` 
    : "/dashboard/tickets/new";

  return (
    <div className="space-y-4">
      {showHeader ? (
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
            {showQuickAdd && <QuickAddToDo variant="outline" />}
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
                {showBatchActions && (
                  <>
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
                  </>
                )}
                {showNewTicketButton && (
                  <Link href={newTicketUrl}>
                    <Button size="default" data-testid="button-add-ticket" className="gap-2">
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">New Ticket</span>
                    </Button>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      ) : isAdmin && showNewTicketButton ? (
        <div className="flex justify-end">
          <Link href={newTicketUrl}>
            <Button size="default" data-testid="button-add-ticket-compact" className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Ticket</span>
            </Button>
          </Link>
        </div>
      ) : null}

      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={showCustomerColumn ? "Search tickets or customers..." : "Search tickets..."}
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

          <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val); setStatusFilter("all"); }}>
            <SelectTrigger className="w-[140px] h-10" data-testid="select-type-filter">
              <SelectValue placeholder="Ticket Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ticketTypes.map(tt => (
                <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>
              ))}
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
          
          {typeFilter !== "all" && selectedTypeStatuses.length > 0 && (
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
        </div>
      )}

      {filteredTickets.length === 0 ? (
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
            {isAdmin && showNewTicketButton && (
              <Link href={newTicketUrl}>
                <Button data-testid="button-create-first-ticket">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Ticket
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
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
                      showCustomer={showCustomerColumn}
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
                          showCustomer={showCustomerColumn}
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
      )}

      {showBatchActions && (
        <>
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
        </>
      )}

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

