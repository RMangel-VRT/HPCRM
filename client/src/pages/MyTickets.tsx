import { useState } from "react";
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
import { Search, ChevronRight, Clock, User, MapPin, CalendarDays, Filter, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Ticket, TicketType, TicketTypeStatus, Customer, WorkType } from "@shared/schema";
import { WORK_TYPE_CATALOG } from "@shared/workTypeCatalog";
import { useAuth } from "@/hooks/use-auth";

interface TicketWithDetails extends Ticket {
  ticketType?: TicketType;
  currentStatus?: TicketTypeStatus;
  customer?: Customer;
}

const priorityConfig = {
  urgent: { color: "bg-red-500", textColor: "text-red-700 dark:text-red-400", label: "Urgent" },
  high: { color: "bg-orange-500", textColor: "text-orange-700 dark:text-orange-400", label: "High" },
  normal: { color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-400", label: "Normal" },
  low: { color: "bg-gray-400", textColor: "text-gray-600 dark:text-gray-400", label: "Low" },
};

export default function MyTickets() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [workTypeFilter, setWorkTypeFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

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

  const { data: ticketTypes = [] } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
    refetchOnMount: "always",
  });

  const { data: customers = [] } = useQuery<Customer[]>({
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

          {completedTickets.length > 0 && (
            <div className="space-y-2 mt-6">
              <h2 className="text-sm font-medium text-muted-foreground px-1">
                Completed ({completedTickets.length})
              </h2>
              <div className="space-y-2 opacity-75">
                {completedTickets.slice(0, 5).map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} formatDueDate={formatDueDate} />
                ))}
                {completedTickets.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    +{completedTickets.length - 5} more completed tickets
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TicketCardProps {
  ticket: TicketWithDetails;
  formatDueDate: (date: Date | null | undefined) => { text: string; className: string } | null;
}

function TicketCard({ ticket, formatDueDate }: TicketCardProps) {
  const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.normal;
  const dueInfo = formatDueDate(ticket.dueDate);

  return (
    <Link href={`/dashboard/tickets/${ticket.id}`}>
      <Card 
        className="hover-elevate active-elevate-2 cursor-pointer transition-colors"
        data-testid={`card-my-ticket-${ticket.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-1 self-stretch rounded-full ${priority.color}`} />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-base leading-tight line-clamp-2" data-testid={`text-my-ticket-title-${ticket.id}`}>
                    {ticket.title}
                  </h3>
                  
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
                    {ticket.customer && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[120px]">{ticket.customer.name}</span>
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
