import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import {
  Mail,
  Plus,
  Search,
  Filter,
  MessageSquare,
  Inbox,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import type { CommunicationWithDetails, MailboxAccount } from "@shared/schema";
import { DatePickerField } from "@/components/DatePickerField";
import LogCommunicationForm from "@/components/customer/communications/LogCommunicationForm";

interface CommunicationListTabProps {
  queryKey: string[];
  customerId?: string;
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

const PAGE_LIMIT = 50;

interface PaginatedResponse {
  data: CommunicationWithDetails[];
  total: number;
  page: number;
  limit: number;
}

interface ThreadGroup {
  threadId: string;
  messages: CommunicationWithDetails[];
  latestMessage: CommunicationWithDetails;
}

function DirectionIcon({ direction }: { direction: string | null }) {
  if (direction === "inbound") return <ArrowDownLeft className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  if (direction === "outbound") return <ArrowUpRight className="w-3.5 h-3.5 text-green-600 shrink-0" />;
  return <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

interface CommRowProps {
  comm: CommunicationWithDetails;
  onClick: () => void;
  indent?: boolean;
}

function CommRow({ comm, onClick, indent }: CommRowProps) {
  const timestamp = comm.receivedAt ?? comm.sentAt ?? comm.createdAt;
  const fromAddr = comm.fromAddress ?? comm.sentByName;
  return (
    <TableRow
      className={`cursor-pointer hover-elevate ${indent ? "bg-muted/20" : ""}`}
      onClick={onClick}
      data-testid={`row-comm-${comm.id}`}
    >
      <TableCell className={`${indent ? "pl-8" : "pl-3"} pr-0`}>
        <DirectionIcon direction={comm.direction} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate max-w-[200px]" data-testid={`text-comm-subject-${comm.id}`}>
            {comm.subject}
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge variant="secondary" className={`text-xs ${TYPE_COLORS[comm.type] || ""}`} data-testid={`badge-type-${comm.id}`}>
          {comm.type}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
        <span data-testid={`text-sender-${comm.id}`}>{fromAddr || "—"}</span>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={`text-xs ${STATUS_COLORS[comm.status] || ""}`} data-testid={`badge-status-${comm.id}`}>
          {comm.status}
        </Badge>
      </TableCell>
      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground" data-testid={`text-comm-date-${comm.id}`}>
        {format(new Date(timestamp || comm.createdAt), "MMM d, yyyy h:mm a")}
      </TableCell>
    </TableRow>
  );
}

interface ThreadGroupRowProps {
  group: ThreadGroup;
  onSelectComm: (c: CommunicationWithDetails) => void;
}

function ThreadGroupRow({ group, onSelectComm }: ThreadGroupRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { latestMessage, messages } = group;
  const timestamp = latestMessage.receivedAt ?? latestMessage.sentAt ?? latestMessage.createdAt;

  // Unique participant addresses (from all messages in the thread)
  const participantAddresses = Array.from(
    new Set(
      messages.flatMap(m => [
        m.fromAddress,
        ...(Array.isArray(m.toAddresses) ? (m.toAddresses as string[]) : []),
      ]).filter(Boolean)
    )
  ) as string[];

  const participantSummary = participantAddresses.slice(0, 2).join(", ") +
    (participantAddresses.length > 2 ? ` +${participantAddresses.length - 2}` : "");

  const bodyPreview = latestMessage.bodyText
    ? latestMessage.bodyText.slice(0, 60) + (latestMessage.bodyText.length > 60 ? "…" : "")
    : latestMessage.body
      ? latestMessage.body.slice(0, 60) + (latestMessage.body.length > 60 ? "…" : "")
      : "";

  return (
    <>
      <TableRow
        className="cursor-pointer hover-elevate"
        onClick={() => setExpanded(!expanded)}
        data-testid={`row-thread-${group.threadId}`}
      >
        <TableCell className="pl-3 pr-0">
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm truncate max-w-[180px]">
                {latestMessage.subject}
              </span>
              <Badge variant="secondary" className="text-xs shrink-0" data-testid={`badge-thread-count-${group.threadId}`}>
                {messages.length}
              </Badge>
            </div>
            {bodyPreview && (
              <p className="text-xs text-muted-foreground truncate max-w-[240px] pl-6">{bodyPreview}</p>
            )}
          </div>
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          <Badge variant="secondary" className={`text-xs ${TYPE_COLORS[latestMessage.type] || ""}`}>
            {latestMessage.type}
          </Badge>
        </TableCell>
        <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[160px]">
          <span className="truncate block" title={participantAddresses.join(", ")} data-testid={`text-participants-${group.threadId}`}>
            {participantSummary || "—"}
          </span>
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className={`text-xs ${STATUS_COLORS[latestMessage.status] || ""}`}>
            {latestMessage.status}
          </Badge>
        </TableCell>
        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
          {format(new Date(timestamp || latestMessage.createdAt), "MMM d, yyyy h:mm a")}
        </TableCell>
      </TableRow>
      {expanded && messages.map(msg => (
        <CommRow
          key={msg.id}
          comm={msg}
          onClick={() => onSelectComm(msg)}
          indent
        />
      ))}
    </>
  );
}

export default function CommunicationListTab({ queryKey, customerId }: CommunicationListTabProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [selectedMailboxIds, setSelectedMailboxIds] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [selectedComm, setSelectedComm] = useState<CommunicationWithDetails | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [page, setPage] = useState(1);

  // Build API URL with pagination and server-side filters
  const buildUrl = () => {
    const base = queryKey.join("/");
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    if (search) params.set("search", search);
    if (directionFilter !== "all") params.set("direction", directionFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (fromDate) params.set("fromDate", fromDate.toISOString().split("T")[0]);
    if (toDate) params.set("toDate", toDate.toISOString().split("T")[0]);
    if (selectedMailboxIds.size > 0) params.set("mailboxIds", Array.from(selectedMailboxIds).sort().join(","));
    return `${base}?${params}`;
  };

  const mailboxIdsKey = Array.from(selectedMailboxIds).sort().join(",");

  const { data: response, isLoading } = useQuery<PaginatedResponse>({
    queryKey: [...queryKey, page, search, directionFilter, mailboxIdsKey, typeFilter, statusFilter, fromDate?.toISOString(), toDate?.toISOString()],
    queryFn: async () => {
      const res = await fetch(buildUrl(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch communications");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
    retry: false,
  });

  const rawCommunications = response?.data ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  const communications = rawCommunications;

  // Group communications by threadId or providerThreadId for thread view
  const { threads, standalone } = useMemo(() => {
    const threadMap = new Map<string, CommunicationWithDetails[]>();
    const standalone: CommunicationWithDetails[] = [];

    for (const c of communications) {
      const key = c.threadId ?? c.providerThreadId ?? null;
      if (key) {
        const existing = threadMap.get(key) ?? [];
        existing.push(c);
        threadMap.set(key, existing);
      } else {
        standalone.push(c);
      }
    }

    // Only create thread groups when there are multiple messages in a thread
    const threads: ThreadGroup[] = [];
    for (const [threadId, messages] of Array.from(threadMap.entries())) {
      if (messages.length > 1) {
        const getTs = (c: CommunicationWithDetails) =>
          new Date(c.sentAt ?? c.receivedAt ?? c.createdAt).getTime();
        const sorted = [...messages].sort((a, b) => getTs(a) - getTs(b));
        threads.push({ threadId, messages: sorted, latestMessage: sorted[sorted.length - 1] });
      } else {
        // Single message threads treated as standalone
        standalone.push(messages[0]);
      }
    }

    const getTs = (c: CommunicationWithDetails) =>
      new Date(c.sentAt ?? c.receivedAt ?? c.createdAt).getTime();

    // Sort threads by latest message activity (newest first)
    threads.sort((a, b) => getTs(b.latestMessage) - getTs(a.latestMessage));
    standalone.sort((a, b) => getTs(b) - getTs(a));

    return { threads, standalone };
  }, [communications]);

  const hasResults = threads.length > 0 || standalone.length > 0;

  const activeFilterCount = [
    search,
    typeFilter !== "all" ? typeFilter : "",
    statusFilter !== "all" ? statusFilter : "",
    directionFilter !== "all" ? directionFilter : "",
    selectedMailboxIds.size > 0 ? "mailbox" : "",
    fromDate,
    toDate,
  ].filter(Boolean).length;

  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const toggleMailbox = (id: string) => {
    setSelectedMailboxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("emailTracking.searchEmails")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
            {t("common.filter")}
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="bg-primary text-primary-foreground">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>
        {customerId && (
          <Button
            size="default"
            onClick={() => setShowLogForm(true)}
            data-testid="button-log-new-comm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            {t("emailTracking.logCommunication")}
          </Button>
        )}
      </div>

      {showLogForm && customerId && (
        <Card>
          <CardContent className="pt-4">
            <LogCommunicationForm
              customerId={customerId}
              onSuccess={() => { setShowLogForm(false); setPage(1); }}
              onCancel={() => setShowLogForm(false)}
            />
          </CardContent>
        </Card>
      )}

      {showFilters && (
        <div className="flex gap-2 flex-wrap animate-in slide-in-from-top-2 duration-200">
          <Select value={directionFilter} onValueChange={handleFilterChange(setDirectionFilter)}>
            <SelectTrigger className="w-[140px]" data-testid="select-comm-direction">
              <SelectValue placeholder={t("emailTracking.filterDirection")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("emailTracking.allDirections")}</SelectItem>
              <SelectItem value="inbound">{t("emailTracking.directionInbound")}</SelectItem>
              <SelectItem value="outbound">{t("emailTracking.directionOutbound")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={handleFilterChange(setTypeFilter)}>
            <SelectTrigger className="w-[130px]" data-testid="select-comm-type">
              <SelectValue placeholder={t("emailTracking.filterType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("emailTracking.allTypes")}</SelectItem>
              <SelectItem value="email">{t("emailTracking.typeEmail")}</SelectItem>
              <SelectItem value="sms">{t("emailTracking.typeSms")}</SelectItem>
              <SelectItem value="note">{t("emailTracking.typeNote")}</SelectItem>
              <SelectItem value="letter">{t("emailTracking.typeLetter")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
            <SelectTrigger className="w-[140px]" data-testid="select-comm-status">
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("emailTracking.allStatuses")}</SelectItem>
              <SelectItem value="sent">{t("emailTracking.commStatusSent")}</SelectItem>
              <SelectItem value="scheduled">{t("emailTracking.commStatusScheduled")}</SelectItem>
              <SelectItem value="draft">{t("emailTracking.commStatusDraft")}</SelectItem>
              <SelectItem value="failed">{t("emailTracking.commStatusFailed")}</SelectItem>
            </SelectContent>
          </Select>
          {mailboxAccounts.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  data-testid="popover-comm-mailbox"
                  className="gap-2 w-[160px] justify-start"
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {selectedMailboxIds.size === 0
                      ? t("emailTracking.allMailboxes")
                      : selectedMailboxIds.size === 1
                        ? mailboxAccounts.find(m => selectedMailboxIds.has(m.id))?.displayName ?? t("emailTracking.nMailboxSelected", { count: 1 })
                        : t("emailTracking.nMailboxSelected", { count: selectedMailboxIds.size })}
                  </span>
                  {selectedMailboxIds.size > 0 && (
                    <Badge variant="secondary" className="ml-auto shrink-0">{selectedMailboxIds.size}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  <button
                    className="flex items-center gap-2 w-full text-sm px-2 py-1.5 rounded hover-elevate text-left"
                    onClick={() => { setSelectedMailboxIds(new Set()); setPage(1); }}
                  >
                    <Check className={`w-4 h-4 ${selectedMailboxIds.size === 0 ? "opacity-100" : "opacity-0"}`} />
                    {t("emailTracking.allMailboxes")}
                  </button>
                  {mailboxAccounts.filter(m => m.isActive).map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover-elevate cursor-pointer"
                      onClick={() => toggleMailbox(m.id)}
                      data-testid={`checkbox-mailbox-${m.id}`}
                    >
                      <Checkbox
                        checked={selectedMailboxIds.has(m.id)}
                        onCheckedChange={() => toggleMailbox(m.id)}
                        id={`mailbox-${m.id}`}
                      />
                      <label htmlFor={`mailbox-${m.id}`} className="text-sm cursor-pointer truncate flex-1">
                        {m.displayName}
                      </label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <div className="flex items-center gap-2">
            <div className="w-[150px]">
              <DatePickerField
                value={fromDate}
                onChange={(d) => { setFromDate(d); setPage(1); }}
                placeholder={t("emailTracking.dateFrom")}
                data-testid="input-comm-from-date"
              />
            </div>
            <span className="text-muted-foreground text-sm">—</span>
            <div className="w-[150px]">
              <DatePickerField
                value={toDate}
                onChange={(d) => { setToDate(d); setPage(1); }}
                placeholder={t("emailTracking.dateTo")}
                data-testid="input-comm-to-date"
              />
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      ) : !hasResults ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">{t("emailTracking.noCommFound")}</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {activeFilterCount > 0
                ? t("emailTracking.noCommFiltered")
                : t("emailTracking.communicationsNone")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6"></TableHead>
                  <TableHead>{t("emailTracking.colSubject")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("emailTracking.colType")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("emailTracking.colFromCount")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("emailTracking.colDate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {threads.map(group => (
                  <ThreadGroupRow
                    key={group.threadId}
                    group={group}
                    onSelectComm={setSelectedComm}
                  />
                ))}
                {standalone.map(comm => (
                  <CommRow
                    key={comm.id}
                    comm={comm}
                    onClick={() => setSelectedComm(comm)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {t("emailTracking.showing", { from: (page - 1) * PAGE_LIMIT + 1, to: Math.min(page * PAGE_LIMIT, total), total })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-comm-prev-page"
                >
                  {t("common.previous")}
                </Button>
                <span className="text-xs">{t("emailTracking.pageOf", { page, total: totalPages })}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-comm-next-page"
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedComm} onOpenChange={(open) => { if (!open) setSelectedComm(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {t("emailTracking.commDetail")}
            </DialogTitle>
            <DialogDescription>
              {t("emailTracking.commDetailDesc")}
            </DialogDescription>
          </DialogHeader>
          {selectedComm && (
            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.fieldDirection")}</p>
                  <div className="flex items-center gap-1.5" data-testid="text-detail-direction">
                    <DirectionIcon direction={selectedComm.direction} />
                    <span className="capitalize">{selectedComm.direction ?? "—"}</span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.subjectLabel")}</p>
                  <p data-testid="text-detail-subject">{selectedComm.subject}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.colType")}</p>
                  <Badge variant="secondary" className={TYPE_COLORS[selectedComm.type] || ""} data-testid="badge-detail-type">
                    {selectedComm.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("common.status")}</p>
                  <Badge variant="secondary" className={STATUS_COLORS[selectedComm.status] || ""} data-testid="badge-detail-status">
                    {selectedComm.status}
                  </Badge>
                </div>
                {selectedComm.fromAddress && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.fromLabel")}</p>
                    <p data-testid="text-detail-from">{selectedComm.fromAddress}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.fieldSender")}</p>
                  <p data-testid="text-detail-sender">{selectedComm.sentByName || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.colDate")}</p>
                  <p data-testid="text-detail-date">
                    {format(new Date(selectedComm.createdAt), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
                {selectedComm.sentAt && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.fieldSentAt")}</p>
                    <p>{format(new Date(selectedComm.sentAt), "MMM d, yyyy h:mm a")}</p>
                  </div>
                )}
                {selectedComm.receivedAt && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.receivedLabel")}</p>
                    <p>{format(new Date(selectedComm.receivedAt), "MMM d, yyyy h:mm a")}</p>
                  </div>
                )}
                {selectedComm.customerName && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.fieldCustomer")}</p>
                    <p data-testid="text-detail-customer">{selectedComm.customerName}</p>
                  </div>
                )}
                {selectedComm.contactName && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.fieldContact")}</p>
                    <p data-testid="text-detail-contact">{selectedComm.contactName}</p>
                  </div>
                )}
                {selectedComm.templateName && (
                  <div>
                    <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.fieldTemplate")}</p>
                    <p data-testid="text-detail-template">{selectedComm.templateName}</p>
                  </div>
                )}
              </div>
              {(selectedComm.bodyText || selectedComm.body) && (
                <div>
                  <p className="text-muted-foreground font-medium mb-2 text-sm">{t("emailTracking.bodyLabel")}</p>
                  <div className="border rounded-md p-4 bg-muted/30 text-sm max-h-64 overflow-y-auto whitespace-pre-wrap" data-testid="text-detail-body">
                    {selectedComm.bodyText || selectedComm.body}
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
