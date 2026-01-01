import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Plus, Search, ChevronRight, ChevronLeft, Clock, User, MapPin, CalendarDays, Filter, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Ticket, TicketType, TicketTypeStatus, Customer, WorkType } from "@shared/schema";
import { WORK_TYPE_CATALOG } from "@shared/workTypeCatalog";
import { useAuth } from "@/hooks/use-auth";
import QuickAddToDo from "@/components/QuickAddToDo";
import BatchTicketDialog from "@/components/BatchTicketDialog";
import { Layers } from "lucide-react";

interface TicketWithDetails extends Ticket {
  ticketType?: TicketType;
  currentStatus?: TicketTypeStatus;
  customer?: Customer;
}


export default function TicketsList() {
  const { user } = useAuth();
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
          {openTickets.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground px-1">
                Open ({openTickets.length})
              </h2>
              <div className="space-y-2">
                {openTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} formatDueDate={formatDueDate} />
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
                    <TicketCard key={ticket.id} ticket={ticket} formatDueDate={formatDueDate} />
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
    </div>
  );
}

interface TicketCardProps {
  ticket: TicketWithDetails;
  formatDueDate: (date: Date | null | undefined) => { text: string; className: string } | null;
}

function TicketCard({ ticket, formatDueDate }: TicketCardProps) {
  const dueInfo = formatDueDate(ticket.dueDate);
  
  // Bar color: green for completed, ticket type color for open tickets
  const barColor = ticket.completedAt 
    ? "#22c55e" // green-500
    : (ticket.ticketType?.color || "#6b7280"); // gray-500 fallback

  return (
    <Link href={`/dashboard/tickets/${ticket.id}`}>
      <Card 
        className="hover-elevate active-elevate-2 cursor-pointer transition-colors"
        data-testid={`card-ticket-${ticket.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
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
                  </div>
                </div>
                
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
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
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-[10px] bg-muted">
                      <User className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
