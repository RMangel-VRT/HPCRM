import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ClipboardList, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

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
  const { user } = useAuth();
  
  const { data: myTickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets/my", { userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/tickets/my", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
    refetchOnMount: "always",
    staleTime: 0,
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
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : activeTickets.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <ClipboardList className="w-6 h-6 mx-auto mb-1 opacity-50" />
            <p className="text-sm">No active tickets</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTickets.slice(0, 2).map((ticket) => (
              <Link key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                <div
                  className="flex items-center justify-between p-2 border rounded-md hover-elevate cursor-pointer"
                  data-testid={`card-my-ticket-${ticket.id}`}
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="font-medium text-sm truncate">{ticket.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ticket.customer?.name}
                    </p>
                  </div>
                  <Badge 
                    variant={priorityConfig[ticket.priority]?.variant || "secondary"}
                    className="text-xs shrink-0"
                  >
                    {priorityConfig[ticket.priority]?.label || ticket.priority}
                  </Badge>
                </div>
              </Link>
            ))}
            {activeTickets.length > 2 && (
              <Link href="/dashboard/tickets/my">
                <Button variant="ghost" className="w-full" size="sm">
                  +{activeTickets.length - 2} more tickets
                </Button>
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
