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
import { Badge } from "@/components/ui/badge";
import { Search, ChevronRight, ChevronLeft, Clock, User, MapPin, CalendarDays, Filter, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { Link, useSearch } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Ticket, TicketType, TicketTypeStatus, Customer, WorkType } from "@shared/schema";
import { WORK_TYPE_CATALOG } from "@shared/workTypeCatalog";
import { useAuth } from "@/hooks/use-auth";

const MY_TICKETS_SCROLL_STORAGE_KEY = "myTicketsScrollPosition";

interface TicketWithDetails extends Ticket {
  ticketType?: TicketType;
  currentStatus?: TicketTypeStatus;
  customer?: Customer;
}


export default function MyTickets() {
  const { user } = useAuth();
  
  // URL query params for filter persistence
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  
  // Refs for scroll restoration and URL sync
  const hasRestoredScroll = useRef(false);
  const isUpdatingFromUrl = useRef(false);
  const prevSearchString = useRef(searchString);
  
  // Initialize filter state from URL params
  const [search, setSearch] = useState(() => urlParams.get("q") || "");
  const [priorityFilter, setPriorityFilter] = useState(() => urlParams.get("priority") || "all");
  const [workTypeFilter, setWorkTypeFilter] = useState(() => urlParams.get("workType") || "all");
  const [showFilters, setShowFilters] = useState(false);
  const [completedPage, setCompletedPage] = useState(1);
  const completedPerPage = 10;

  // Sync state from URL when URL changes (e.g., browser back/forward)
  useEffect(() => {
    if (prevSearchString.current === searchString) return;
    prevSearchString.current = searchString;
    
    isUpdatingFromUrl.current = true;
    setSearch(urlParams.get("q") || "");
    setPriorityFilter(urlParams.get("priority") || "all");
    setWorkTypeFilter(urlParams.get("workType") || "all");
  }, [searchString, urlParams]);

  // Update URL when filters change
  useEffect(() => {
    if (isUpdatingFromUrl.current) {
      isUpdatingFromUrl.current = false;
      return;
    }
    
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (workTypeFilter !== "all") params.set("workType", workTypeFilter);
    
    const queryString = params.toString();
    const currentQuery = searchString.startsWith("?") ? searchString.slice(1) : searchString;
    
    // Only update if the computed query differs from current URL
    if (queryString === currentQuery) return;
    
    const newUrl = queryString ? `/dashboard/my-tickets?${queryString}` : "/dashboard/my-tickets";
    prevSearchString.current = queryString ? `?${queryString}` : "";
    
    window.history.replaceState(null, "", newUrl);
  }, [search, priorityFilter, workTypeFilter, searchString]);

  // Save scroll position before navigating away
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
    refetchOnMount: "always",
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    refetchOnMount: "always",
  });

  const { data: allStatuses = [] } = useQuery({
    queryKey: ["/api/ticket-type-statuses-all-my"],
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
    refetchOnMount: "always",
  });

  // Restore scroll position after all required data loads
  const isDataLoaded = !ticketsLoading && !ticketTypesLoading && !customersLoading;
  useEffect(() => {
    if (!isDataLoaded || hasRestoredScroll.current) return;
    
    const savedPosition = sessionStorage.getItem(MY_TICKETS_SCROLL_STORAGE_KEY);
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

  const filteredTickets = enrichedTickets.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(search.toLowerCase()) ||
      ticket.customer?.name?.toLowerCase().includes(search.toLowerCase()) || false;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    const matchesWorkType = workTypeFilter === "all" || ticket.workType === workTypeFilter;
    return matchesSearch && matchesPriority && matchesWorkType;
  });

  const openTickets = filteredTickets.filter(t => !t.completedAt);
  const completedTickets = filteredTickets.filter(t => t.completedAt);
  
  // Reset completed page when filters change
  useEffect(() => {
    setCompletedPage(1);
  }, [search, priorityFilter, workTypeFilter]);
  
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
            My Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 hidden md:block">
            Tickets assigned to you
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="w-4 h-4" />
          <span>{openTickets.length} open</span>
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
          size="icon" 
          className="h-11 w-11 shrink-0"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters-my"
        >
          <Filter className="w-4 h-4" />
        </Button>
      </div>

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
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="estimate_request">Estimate Request</SelectItem>
              <SelectItem value="shop_todo">Shop To-Do</SelectItem>
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
            <h3 className="text-lg font-medium mb-1">No tickets assigned to you</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {search || priorityFilter !== "all" || workTypeFilter !== "all"
                ? "Try adjusting your search or filters."
                : "You don't have any tickets assigned to you yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {openTickets.length > 0 && (
            <div className="space-y-3 md:space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground px-1">
                Open ({openTickets.length})
              </h2>
              <div className="space-y-3 md:space-y-2">
                {openTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} formatDueDate={formatDueDate} onNavigate={saveScrollPosition} />
                ))}
              </div>
            </div>
          )}

          {completedTickets.length > 0 && (() => {
            const totalPages = Math.ceil(completedTickets.length / completedPerPage);
            const startIdx = (completedPage - 1) * completedPerPage;
            const paginatedCompleted = completedTickets.slice(startIdx, startIdx + completedPerPage);
            
            return (
              <div className="space-y-3 md:space-y-2 mt-6">
                <h2 className="text-sm font-medium text-muted-foreground px-1">
                  Completed ({completedTickets.length})
                </h2>
                <div className="space-y-3 md:space-y-2 opacity-75">
                  {paginatedCompleted.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} formatDueDate={formatDueDate} onNavigate={saveScrollPosition} />
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
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

interface TicketCardProps {
  ticket: TicketWithDetails;
  formatDueDate: (date: Date | null | undefined) => { text: string; className: string } | null;
  onNavigate?: () => void;
}

function TicketCard({ ticket, formatDueDate, onNavigate }: TicketCardProps) {
  const dueInfo = formatDueDate(ticket.dueDate);
  
  // Bar color: green for completed, ticket type color for open tickets
  const barColor = ticket.completedAt 
    ? "#22c55e" // green-500
    : (ticket.ticketType?.color || "#6b7280"); // gray-500 fallback

  // Check if this ticket needs scheduling (Ready to Schedule status on Project tickets)
  const needsScheduling = ticket.currentStatus?.name === "Ready to Schedule" && 
                          ticket.ticketType?.name === "Project";

  return (
    <Link href={`/dashboard/tickets/${ticket.id}`} onClick={onNavigate}>
      <Card 
        className={`hover-elevate active-elevate-2 cursor-pointer transition-colors ${needsScheduling ? "ring-2 ring-pink-500 dark:ring-pink-400 animate-pulse" : ""}`}
        data-testid={`card-my-ticket-${ticket.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div 
              className="w-1 self-stretch rounded-full" 
              style={{ backgroundColor: barColor }}
            />
            
            <div className="flex-1 min-w-0">
              {/* Row 1: Ticket type (colored text) + work type badges + needs scheduling indicator */}
              <div className="flex items-center gap-2 flex-wrap">
                {ticket.ticketType && (
                  <span 
                    className="text-sm font-semibold"
                    style={{ color: barColor }}
                    data-testid={`text-my-tickettype-${ticket.id}`}
                  >
                    {ticket.ticketType.name}
                  </span>
                )}
                {ticket.workType && WORK_TYPE_CATALOG[ticket.workType as WorkType] && (
                  <Badge 
                    variant={WORK_TYPE_CATALOG[ticket.workType as WorkType].badgeVariant}
                    className="text-xs font-normal"
                    data-testid={`badge-my-worktype-${ticket.id}`}
                  >
                    {WORK_TYPE_CATALOG[ticket.workType as WorkType].billingLabel}
                  </Badge>
                )}
                {needsScheduling && (
                  <Badge 
                    className="text-xs font-semibold bg-pink-500 text-white border-pink-600 dark:bg-pink-600 dark:border-pink-500"
                    data-testid={`badge-my-needs-scheduling-${ticket.id}`}
                  >
                    Needs Scheduling
                  </Badge>
                )}
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 ml-auto" />
              </div>

              {/* Row 2: Title + ticket ID */}
              <div className="flex items-start justify-between gap-2 mt-1">
                <h3 className="font-medium text-base leading-tight line-clamp-2 flex-1" data-testid={`text-my-ticket-title-${ticket.id}`}>
                  {ticket.title}
                </h3>
                <span className="font-mono text-xs text-muted-foreground shrink-0" data-testid={`text-my-ticket-id-${ticket.id}`}>
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
                    data-testid={`badge-my-invoice-category-${ticket.id}`}
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

              {/* Divider + Status row */}
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
