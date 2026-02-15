import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Snowflake,
  Plus,
  Search,
  Calendar,
  BarChart3,
  CloudSnow,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import type { SnowEventWithDetails } from "@shared/schema";
import { SNOW_RANGES } from "@shared/schema";

type SortField = "date" | "range" | "properties" | "tickets" | "status";
type SortDirection = "asc" | "desc";

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "draft": return "secondary";
    case "ready": return "default";
    case "locked": return "outline";
    default: return "secondary";
  }
}

export default function SnowEventsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [rangeFilter, setRangeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data: events, isLoading } = useQuery<SnowEventWithDetails[]>({
    queryKey: ["/api/snow-events"],
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filtered = useMemo(() => {
    if (!events) return [];
    let result = [...events];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        (e.eventName || "").toLowerCase().includes(q) ||
        e.snowRange.toLowerCase().includes(q)
      );
    }
    if (rangeFilter !== "all") {
      result = result.filter(e => e.snowRange === rangeFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter(e => e.status === statusFilter);
    }

    result.sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      switch (sortField) {
        case "date":
          return (new Date(a.eventStartDateTime).getTime() - new Date(b.eventStartDateTime).getTime()) * dir;
        case "range":
          return a.snowRange.localeCompare(b.snowRange) * dir;
        case "properties":
          return (a.propertyCount - b.propertyCount) * dir;
        case "tickets":
          return (a.ticketCount - b.ticketCount) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        default:
          return 0;
      }
    });

    return result;
  }, [events, searchQuery, rangeFilter, statusFilter, sortField, sortDirection]);

  const stats = useMemo(() => {
    if (!events) return { total: 0, draft: 0, ready: 0, locked: 0 };
    return {
      total: events.length,
      draft: events.filter(e => e.status === "draft").length,
      ready: events.filter(e => e.status === "ready").length,
      locked: events.filter(e => e.status === "locked").length,
    };
  }, [events]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="snow-events-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Snowflake className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Storm Events</h1>
        </div>
        <Link href="/dashboard/snow/new">
          <Button data-testid="button-new-storm">
            <Plus className="w-4 h-4 mr-2" />
            New Storm Event
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <CloudSnow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-events">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-draft-count">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-ready-count">{stats.ready}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locked</CardTitle>
            <Snowflake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-locked-count">{stats.locked}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle>Storm Events</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  className="pl-8 w-full sm:w-[200px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-events"
                />
              </div>
              <Select value={rangeFilter} onValueChange={setRangeFilter}>
                <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-range-filter">
                  <SelectValue placeholder="All Ranges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ranges</SelectItem>
                  {SNOW_RANGES.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[130px]" data-testid="select-status-filter">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Snowflake className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No storm events found</p>
              {events?.length === 0 && (
                <p className="text-sm mt-1">Create your first storm event to get started.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => handleSort("date")} data-testid="button-sort-date">
                        Date <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => handleSort("range")} data-testid="button-sort-range">
                        Range <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => handleSort("properties")} data-testid="button-sort-properties">
                        Properties <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => handleSort("tickets")} data-testid="button-sort-tickets">
                        Tickets <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => handleSort("status")} data-testid="button-sort-status">
                        Status <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(event => (
                    <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {new Date(event.eventStartDateTime).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {event.eventName || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.snowRange}</Badge>
                      </TableCell>
                      <TableCell>{event.propertyCount}</TableCell>
                      <TableCell>{event.ticketCount}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(event.status)}>
                          {event.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/snow/${event.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-event-${event.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
