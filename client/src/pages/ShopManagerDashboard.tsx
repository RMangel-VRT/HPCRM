import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ClipboardList, 
  CheckCircle2, 
  ArrowRight,
  AlertCircle,
  Wrench
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format } from "date-fns";

interface Ticket {
  id: string;
  title: string;
  workType: string;
  priority: string;
  currentStatusId: string | null;
  customerId: string | null;
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

export default function ShopManagerDashboard() {
  const { data: myTickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets/my"],
  });

  const activeTickets = myTickets.filter(t => 
    t.currentStatus?.name?.toLowerCase() !== "completed" && 
    t.currentStatus?.name?.toLowerCase() !== "closed"
  );
  
  const completedTickets = myTickets.filter(t => 
    t.currentStatus?.name?.toLowerCase() === "completed"
  );

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
      value: completedTickets.length.toString(),
      icon: CheckCircle2,
      color: "text-green-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4 pb-20">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3">
                <Skeleton className="h-5 w-5 mx-auto mb-2" />
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
                <Skeleton className="h-3 w-16 mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 mb-2" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          Shop Manager Dashboard
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
          {activeTickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active tickets assigned to you</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTickets.slice(0, 5).map((ticket) => (
                <Link key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                  <div 
                    className="p-3 rounded-lg border hover-elevate cursor-pointer"
                    data-testid={`card-ticket-${ticket.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{ticket.title}</p>
                        {ticket.customer && (
                          <p className="text-xs text-muted-foreground truncate">
                            {ticket.customer.name}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
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
                        <Badge 
                          variant={priorityConfig[ticket.priority]?.variant || "outline"}
                          className="text-xs"
                        >
                          {priorityConfig[ticket.priority]?.label || ticket.priority}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {activeTickets.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  + {activeTickets.length - 5} more tickets
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
