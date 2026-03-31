import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Mail, Plus, Search, Filter, MessageSquare, Inbox } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { CommunicationWithDetails } from "@shared/schema";

interface CommunicationListTabProps {
  queryKey: string[];
}

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_COLORS: Record<string, string> = {
  email: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  sms: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  note: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  letter: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function CommunicationListTab({ queryKey }: CommunicationListTabProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedComm, setSelectedComm] = useState<CommunicationWithDetails | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data: communications = [], isLoading } = useQuery<CommunicationWithDetails[]>({
    queryKey,
  });

  const filtered = useMemo(() => {
    return communications
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((c) => {
        const matchesSearch =
          !search ||
          c.subject.toLowerCase().includes(search.toLowerCase()) ||
          (c.customerName && c.customerName.toLowerCase().includes(search.toLowerCase())) ||
          (c.sentByName && c.sentByName.toLowerCase().includes(search.toLowerCase()));
        const matchesType = typeFilter === "all" || c.type === typeFilter;
        const matchesStatus = statusFilter === "all" || c.status === statusFilter;
        const createdAt = new Date(c.createdAt);
        const matchesFrom = !fromDate || createdAt >= new Date(fromDate);
        const matchesTo = !toDate || createdAt <= new Date(toDate + "T23:59:59");
        return matchesSearch && matchesType && matchesStatus && matchesFrom && matchesTo;
      });
  }, [communications, search, typeFilter, statusFilter, fromDate, toDate]);

  const activeFilterCount = [
    search,
    typeFilter !== "all" ? typeFilter : "",
    statusFilter !== "all" ? statusFilter : "",
    fromDate,
    toDate,
  ].filter(Boolean).length;

  function handleNewMessage() {
    toast({
      title: "Coming soon",
      description: "Message composition will be available in a future update.",
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search communications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-comm-search"
            />
          </div>
          <Button
            variant="outline"
            size="default"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-comm-filters"
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="bg-primary text-primary-foreground">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={handleNewMessage}
          data-testid="button-new-message"
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          New Message
        </Button>
      </div>

      {showFilters && (
        <div className="flex gap-2 flex-wrap animate-in slide-in-from-top-2 duration-200">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px]" data-testid="select-comm-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="letter">Letter</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-comm-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[150px]"
              data-testid="input-comm-from-date"
              placeholder="From date"
            />
            <span className="text-muted-foreground text-sm">—</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[150px]"
              data-testid="input-comm-to-date"
              placeholder="To date"
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No communications found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {search || typeFilter !== "all" || statusFilter !== "all" || fromDate || toDate
                ? "Try adjusting your search or filters."
                : "No messages have been sent for this record yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Sender</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((comm) => (
                <TableRow
                  key={comm.id}
                  className="cursor-pointer hover-elevate"
                  onClick={() => setSelectedComm(comm)}
                  data-testid={`row-comm-${comm.id}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate max-w-[200px]" data-testid={`text-comm-subject-${comm.id}`}>
                        {comm.subject}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant="secondary"
                      className={`text-xs ${TYPE_COLORS[comm.type] || ""}`}
                      data-testid={`badge-type-${comm.id}`}
                    >
                      {comm.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    <span data-testid={`text-sender-${comm.id}`}>
                      {comm.sentByName || "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${STATUS_COLORS[comm.status] || ""}`}
                      data-testid={`badge-status-${comm.id}`}
                    >
                      {comm.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground" data-testid={`text-comm-date-${comm.id}`}>
                    {format(new Date(comm.createdAt), "MMM d, yyyy h:mm a")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedComm} onOpenChange={(open) => { if (!open) setSelectedComm(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Communication Detail
            </DialogTitle>
            <DialogDescription>
              Read-only view of this communication record.
            </DialogDescription>
          </DialogHeader>
          {selectedComm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Subject</p>
                  <p data-testid="text-detail-subject">{selectedComm.subject}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Type</p>
                  <Badge
                    variant="secondary"
                    className={TYPE_COLORS[selectedComm.type] || ""}
                    data-testid="badge-detail-type"
                  >
                    {selectedComm.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Status</p>
                  <Badge
                    variant="secondary"
                    className={STATUS_COLORS[selectedComm.status] || ""}
                    data-testid="badge-detail-status"
                  >
                    {selectedComm.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Sender</p>
                  <p data-testid="text-detail-sender">{selectedComm.sentByName || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Date</p>
                  <p data-testid="text-detail-date">
                    {format(new Date(selectedComm.createdAt), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
                {selectedComm.sentAt && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">Sent At</p>
                    <p>{format(new Date(selectedComm.sentAt), "MMM d, yyyy h:mm a")}</p>
                  </div>
                )}
                {selectedComm.customerName && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">Customer</p>
                    <p data-testid="text-detail-customer">{selectedComm.customerName}</p>
                  </div>
                )}
                {selectedComm.contactName && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">Contact</p>
                    <p data-testid="text-detail-contact">{selectedComm.contactName}</p>
                  </div>
                )}
                {selectedComm.templateName && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">Template</p>
                    <p data-testid="text-detail-template">{selectedComm.templateName}</p>
                  </div>
                )}
              </div>
              {selectedComm.body && (
                <div>
                  <p className="text-muted-foreground font-medium mb-2 text-sm">Message Body</p>
                  <div className="border rounded-md p-4 bg-muted/30 text-sm max-h-64 overflow-y-auto whitespace-pre-wrap" data-testid="text-detail-body">
                    {selectedComm.body}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
