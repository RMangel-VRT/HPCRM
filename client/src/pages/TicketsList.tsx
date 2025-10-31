import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import emptyTicketsImage from "@assets/generated_images/Empty_tickets_state_illustration_2fd7f4ab.png";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const mockTickets = [
  {
    id: "1",
    title: "Sprinkler head replacement needed",
    customer: "Riverside HOA",
    property: "Main Entrance",
    priority: "high",
    status: "open" as const,
    assignedTo: "John Doe",
    dueDate: "2024-03-15",
  },
  {
    id: "2",
    title: "Spring mulch application",
    customer: "Greenfield Corp",
    property: "Corporate Campus",
    priority: "normal",
    status: "in_progress" as const,
    assignedTo: "Sarah Johnson",
    dueDate: "2024-03-20",
  },
  {
    id: "3",
    title: "Irrigation system inspection",
    customer: "Riverside HOA",
    property: "Community Park",
    priority: "urgent",
    status: "waiting" as const,
    assignedTo: "Mike Chen",
    dueDate: "2024-03-12",
  },
];

export default function TicketsList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [tickets] = useState(mockTickets);

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(search.toLowerCase()) ||
      ticket.customer.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "normal":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "low":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage work orders and service tickets
          </p>
        </div>
        <Button data-testid="button-add-ticket">
          <Plus className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting">Waiting</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-priority-filter">
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
      </div>

      {filteredTickets.length === 0 ? (
        <EmptyState
          image={emptyTicketsImage}
          title="No tickets found"
          description="Try adjusting your search or filters, or create a new ticket."
          actionLabel="New Ticket"
          onAction={() => console.log("New ticket")}
        />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map((ticket) => (
                <TableRow key={ticket.id} data-testid={`row-ticket-${ticket.id}`}>
                  <TableCell className="font-medium">{ticket.title}</TableCell>
                  <TableCell>{ticket.customer}</TableCell>
                  <TableCell className="text-muted-foreground">{ticket.property}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getPriorityColor(ticket.priority)}>
                      {ticket.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs">
                          {ticket.assignedTo.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{ticket.assignedTo}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(ticket.dueDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild data-testid={`button-view-${ticket.id}`}>
                      <Link href={`/tickets/${ticket.id}`}>
                        <Eye className="w-4 h-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
