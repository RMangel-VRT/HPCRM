import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ClipboardList, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  AlertCircle,
  Calendar
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format, isToday, isTomorrow, parseISO } from "date-fns";

interface Ticket {
  id: string;
  title: string;
  workType: string;
  priority: string;
  currentStatusId: string | null;
  customerId: string | null;
  locationLat: string | null;
  locationLng: string | null;
  createdAt: string;
  customer?: {
    name: string;
    street?: string;
    city?: string;
  } | null;
  currentStatus?: {
    name: string;
    color: string;
  } | null;
}

const priorityConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "Low", variant: "secondary" },
  medium: { label: "Medium", variant: "outline" },
  high: { label: "High", variant: "default" },
  urgent: { label: "Urgent", variant: "destructive" },
};

const workTypeLabels: Record<string, string> = {
  contract: "Contract Work",
  extra_work: "Extra Billable",
  project: "Project",
  admin: "Admin",
  estimate_request: "Estimate",
};

export default function FieldCrewDashboard() {
  const { data: myTickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets/my"],
  });

  const activeTickets = myTickets.filter(t => 
    t.currentStatus?.name?.toLowerCase() !== "completed" && 
    t.currentStatus?.name?.toLowerCase() !== "closed"
  );
  
  const completedToday = myTickets.filter(t => {
    if (t.currentStatus?.name?.toLowerCase() !== "completed") return false;
    return true;
  });

  const urgentTickets = activeTickets.filter(t => t.priority === "urgent" || t.priority === "high");
  
  const stats = [
    {
      title: "Active Tasks",
      value: activeTickets.length.toString(),
      icon: ClipboardList,
      color: "text-blue-500",
    },
    {
      title: "High Priority",
      value: urgentTickets.length.toString(),
      icon: AlertCircle,
      color: "text-orange-500",
    },
    {
      title: "Completed",
      value: completedToday.length.toString(),
      icon: CheckCircle2,
      color: "text-green-500",
    },
  ];

  return (
    <div className="space-y-4 pb-20">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          My Work
        </h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <Card key={stat.title} className="text-center" data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="pt-4 pb-3 px-2">
              <stat.icon className={`w-5 h-5 mx-auto mb-1 ${stat.color}`} />
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground truncate">{stat.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg">My Tickets</CardTitle>
          <Link href="/dashboard/tickets/my">
            <Button variant="ghost" size="sm" data-testid="button-view-all-tickets">
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : activeTickets.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
              <p className="font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground">No active tasks assigned to you</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTickets.slice(0, 5).map((ticket) => (
                <Link key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                  <div
                    className="p-3 border rounded-md hover-elevate active-elevate-2 cursor-pointer"
                    data-testid={`card-ticket-${ticket.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{ticket.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {workTypeLabels[ticket.workType] || ticket.workType}
                        </p>
                      </div>
                      <Badge 
                        variant={priorityConfig[ticket.priority]?.variant || "secondary"}
                        className="shrink-0"
                      >
                        {priorityConfig[ticket.priority]?.label || ticket.priority}
                      </Badge>
                    </div>
                    
                    {ticket.customer && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">
                          {ticket.customer.name}
                          {ticket.customer.street && ` - ${ticket.customer.street}`}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      {ticket.currentStatus && (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            borderColor: ticket.currentStatus.color,
                            color: ticket.currentStatus.color 
                          }}
                        >
                          {ticket.currentStatus.name}
                        </Badge>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {format(parseISO(ticket.createdAt), "MMM d")}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              
              {activeTickets.length > 5 && (
                <Link href="/dashboard/tickets/my">
                  <Button variant="outline" className="w-full" size="sm">
                    View {activeTickets.length - 5} more tickets
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/tickets/my">
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
              <ClipboardList className="w-5 h-5" />
              <span className="text-xs">All My Tickets</span>
            </Button>
          </Link>
          <Link href="/dashboard/customers">
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
              <MapPin className="w-5 h-5" />
              <span className="text-xs">Customer List</span>
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
