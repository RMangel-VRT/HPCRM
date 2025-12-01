import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ClipboardList, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";

interface Ticket {
  id: string;
  title: string;
  workType: string;
  priority: string;
  currentStatusId: string | null;
  createdAt: string;
  customer?: {
    name: string;
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

export default function MyTicketsPreview() {
  const { data: myTickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets/my"],
  });

  const activeTickets = myTickets.filter(t => 
    t.currentStatus?.name?.toLowerCase() !== "completed" && 
    t.currentStatus?.name?.toLowerCase() !== "closed"
  );

  return (
    <Card data-testid="card-my-tickets-preview">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          My Tickets
        </CardTitle>
        <Link href="/dashboard/tickets/my">
          <Button variant="ghost" size="sm" data-testid="button-view-my-tickets">
            View All
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : activeTickets.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active tickets assigned to you</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTickets.slice(0, 3).map((ticket) => (
              <Link key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                <div
                  className="flex items-center justify-between p-3 border rounded-md hover-elevate cursor-pointer"
                  data-testid={`card-my-ticket-${ticket.id}`}
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="font-medium text-sm truncate">{ticket.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      {ticket.customer && (
                        <span className="truncate">{ticket.customer.name}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(parseISO(ticket.createdAt), "MMM d")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                      variant={priorityConfig[ticket.priority]?.variant || "secondary"}
                      className="text-xs"
                    >
                      {priorityConfig[ticket.priority]?.label || ticket.priority}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
            {activeTickets.length > 3 && (
              <Link href="/dashboard/tickets/my">
                <Button variant="outline" className="w-full" size="sm">
                  +{activeTickets.length - 3} more tickets
                </Button>
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
