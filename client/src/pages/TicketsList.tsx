import { useState, useEffect, useMemo } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, ChevronRight, ChevronLeft, Clock, User as UserIcon, MapPin, CalendarDays, Filter, Loader2, Trash2, X, Layers } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Ticket, TicketType, TicketTypeStatus, Customer, WorkType, User as UserType, CompanyUser } from "@shared/schema";
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


export default function TicketsList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [workTypeFilter, setWorkTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [completedPage, setCompletedPage] = useState(1);
  const completedPerPage = 10;
  const [batchToDoOpen, setBatchToDoOpen] = useState(false);
  const [batchInvoiceOpen, setBatchInvoiceOpen] = useState(false);
  
  // Selection state for bulk operations
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useSetBreadcrumbs([
    { label: "Tickets" },
  ], []);

  const isAdmin = user?.activeRole === "admin";

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets"],
  });

  const { data: ticketTypes = [] } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
  });

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

  const enrichedTickets: TicketWithDetails[] = tickets.map(ticket => ({
    ...ticket,
    ticketType: ticketTypes.find(tt => tt.id === ticket.ticketTypeId),
    currentStatus: allStatuses.find((s: TicketTypeStatus) => s.id === ticket.currentStatusId),
    customer: customers.find(c => c.id === ticket.customerId),
  }));

  const filteredTickets = enrichedTickets.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(search.toLowerCase()) ||
      ticket.customer?.name?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    const matchesType = typeFilter === "all" || ticket.ticketTypeId === typeFilter;
    const matchesWorkType = workTypeFilter === "all" || ticket.workType === workTypeFilter;
    const matchesStatus = statusFilter === "all" || ticket.currentStatusId === statusFilter;
    return matchesSearch && matchesPriority && matchesType && matchesWorkType && matchesStatus;
  });
  
  // Get statuses for currently selected ticket type
  const selectedTypeStatuses = typeFilter !== "all" 
    ? allStatuses.filter((s: TicketTypeStatus) => s.ticketTypeId === typeFilter)
    : [];

  const openTickets = filteredTickets.filter(t => !t.completedAt);
  const completedTickets = filteredTickets.filter(t => t.completedAt);
  
  // Reset completed page when filters change
  useEffect(() => {
    setCompletedPage(1);
  }, [search, priorityFilter, typeFilter, workTypeFilter, statusFilter]);
  
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
          size="icon" 
          className="h-11 w-11 shrink-0"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-4 h-4" />
        </Button>
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
            </SelectContent>
          </Select>
          
          {/* Status filter - only show when a ticket type is selected */}
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
      ) : (
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
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground px-1">
                Open ({openTickets.length})
              </h2>
              <div className="space-y-2">
                {openTickets.map((ticket) => (
                  <TicketCard 
                    key={ticket.id} 
                    ticket={ticket} 
                    formatDueDate={formatDueDate}
                    usersMap={usersMap}
                    selectionMode={selectionMode}
                    isSelected={selectedTicketIds.has(ticket.id)}
                    onToggleSelect={() => toggleTicketSelection(ticket.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {completedTickets.length > 0 && (() => {
            const totalPages = Math.ceil(completedTickets.length / completedPerPage);
            const startIdx = (completedPage - 1) * completedPerPage;
            const paginatedCompleted = completedTickets.slice(startIdx, startIdx + completedPerPage);
            
            return (
              <div className="space-y-2 mt-6">
                <h2 className="text-sm font-medium text-muted-foreground px-1">
                  Completed ({completedTickets.length})
                </h2>
                <div className="space-y-2 opacity-75">
                  {paginatedCompleted.map((ticket) => (
                    <TicketCard 
                      key={ticket.id} 
                      ticket={ticket} 
                      formatDueDate={formatDueDate}
                      usersMap={usersMap}
                      selectionMode={selectionMode}
                      isSelected={selectedTicketIds.has(ticket.id)}
                      onToggleSelect={() => toggleTicketSelection(ticket.id)}
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
              </div>
            );
          })()}
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

interface TicketCardProps {
  ticket: TicketWithDetails;
  formatDueDate: (date: Date | null | undefined) => { text: string; className: string } | null;
  usersMap: Map<string, UserType>;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function TicketCard({ ticket, formatDueDate, usersMap, selectionMode, isSelected, onToggleSelect }: TicketCardProps) {
  const dueInfo = formatDueDate(ticket.dueDate);
  
  // Bar color: green for completed, ticket type color for open tickets
  const barColor = ticket.completedAt 
    ? "#22c55e" // green-500
    : (ticket.ticketType?.color || "#6b7280"); // gray-500 fallback

  const cardInner = (
    <Card 
      className={`hover-elevate active-elevate-2 cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""}`}
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
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-base leading-tight line-clamp-2" data-testid={`text-ticket-title-${ticket.id}`}>
                  {ticket.title}
                </h3>
                
                <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                  <span className="font-mono text-xs" data-testid={`text-ticket-id-${ticket.id}`}>
                    #{ticket.id.slice(0, 8)}
                  </span>
                  {ticket.customer && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[120px]">{ticket.customer.name}</span>
                    </span>
                  )}
                  {ticket.ticketType && (
                    <Badge 
                      variant="outline"
                      className="text-xs font-normal"
                      style={{ 
                        backgroundColor: ticket.ticketType.color ? `${ticket.ticketType.color}15` : undefined,
                        borderColor: ticket.ticketType.color || undefined,
                        color: ticket.ticketType.color || undefined,
                      }}
                      data-testid={`badge-tickettype-${ticket.id}`}
                    >
                      {ticket.ticketType.name}
                    </Badge>
                  )}
                  {ticket.workType && WORK_TYPE_CATALOG[ticket.workType as WorkType] && (
                    <Badge 
                      variant={WORK_TYPE_CATALOG[ticket.workType as WorkType].badgeVariant}
                      className="text-xs font-normal"
                      data-testid={`badge-worktype-${ticket.id}`}
                    >
                      {WORK_TYPE_CATALOG[ticket.workType as WorkType].billingLabel}
                    </Badge>
                  )}
                  {ticket.ticketType?.name === "Invoice" && ticket.invoiceCategory && (
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
                  )}
                </div>
              </div>
              
              {!selectionMode && (
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div className="flex items-center gap-3">
                {ticket.currentStatus && (
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                    style={{ borderColor: ticket.currentStatus.color || undefined }}
                  >
                    {ticket.currentStatus.name}
                  </Badge>
                )}
                {dueInfo && (
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
    <Link href={`/dashboard/tickets/${ticket.id}`}>
      {cardInner}
    </Link>
  );
}
