import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  UserCheck,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format, formatDistanceToNow } from "date-fns";
import type { CommunicationWithDetails, MailboxAccount, UnsortedEmail } from "@shared/schema";
import { DatePickerField } from "@/components/DatePickerField";
import LogCommunicationForm from "@/components/customer/communications/LogCommunicationForm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCustomerScope } from "@/lib/customerScope";
import { PageEmptyState, TableSkeleton, useCustomerDates } from "@/components/customer/page";

interface CommunicationListTabProps {
  queryKey: string[];
  customerId?: string;
  /** Customer pages move Log communication into the section title; other hosts keep the inline button. */
  showLogButton?: boolean;
}

// ── Unsorted Candidates Panel ────────────────────────────────────────────────
// Shows unsorted emails where this customer is a routing candidate
function UnsortedCandidatesPanel({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const scope = useCustomerScope();

  const { data: candidates = [], isLoading } = useQuery<UnsortedEmail[]>({
    queryKey: ["/api/unsorted-emails", "candidate", customerId, ...scope.scope],
    queryFn: async ({ signal }) => {
      try {
        return await scope.getJson<UnsortedEmail[]>(`/api/unsorted-emails?candidateCustomerId=${encodeURIComponent(customerId)}&status=pending&limit=20`, signal);
      } catch { return []; }
    },
    staleTime: 30_000,
    enabled: open && scope.enabled,
  });

  const routeMutation = useMutation({
    mutationFn: (emailId: string) =>
      apiRequest("POST", `/api/unsorted-emails/${emailId}/route`, { customerId }),
    onSuccess: () => {
      toast({ title: t("emailTracking.routedSuccessfully") });
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unsorted-emails", "candidate", customerId] });
      // Also refresh the communications list for this customer
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "communications"] });
    },
    onError: () => toast({ title: t("emailTracking.routeEmailError"), variant: "destructive" }),
  });

  return (
    <Card className="rounded-[10px]" data-testid="card-unsorted-candidates">
      <CardHeader className="pb-2 pt-3 px-4">
        <button
          type="button"
          aria-expanded={open}
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setOpen(!open)}
          data-testid="button-unsorted-candidates-toggle"
        >
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <CardTitle className="text-sm font-medium">{t("emailTracking.unsortedCandidates")}</CardTitle>
          <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="px-4 pb-3 pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />)}
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-unsorted-candidates-empty">
              {t("emailTracking.unsortedCandidatesEmpty")}
            </p>
          ) : (
            <div className="space-y-2">
              {candidates.map(email => (
                <div
                  key={email.id}
                  className="flex items-start gap-3 rounded-md border bg-muted/30 px-3 py-2"
                  data-testid={`card-unsorted-candidate-${email.id}`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{email.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {email.receivedAt ? formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true }) : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 shrink-0 text-xs"
                    disabled={routeMutation.isPending}
                    onClick={() => routeMutation.mutate(email.id)}
                    data-testid={`button-route-candidate-${email.id}`}
                  >
                    <UserCheck className="w-3 h-3" />
                    {t("emailTracking.routeAsCustomer")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
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
const DAY_GROUP_THRESHOLD = 8;

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

function SourceBadge({ comm }: { comm: CommunicationWithDetails }) {
  const { t } = useTranslation();
  if (!comm.mailboxAccountId) return null;
  if (comm.direction === "outbound") {
    return (
      <Badge
        variant="secondary"
        className="text-xs shrink-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
        data-testid={`badge-via-gmail-${comm.id}`}
      >
        {t("emailTracking.viaGmailBadge")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="text-xs shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      data-testid={`badge-inbox-sync-${comm.id}`}
    >
      {t("emailTracking.inboxSyncBadge")}
    </Badge>
  );
}


const COMM_TYPES = ["email", "sms", "note", "letter"] as const;
/** Labels for stored communication type/status values; never shows raw codes. */
export function commTypeLabel(t: (k: string) => string, type: string | null | undefined) {
  return (COMM_TYPES as readonly string[]).includes(type ?? "") ? t(`cp4.comm.type.${type}`) : t("cp4.comm.type.other");
}
export function commStatusLabel(t: (k: string) => string, status: string | null | undefined) {
  const k = { sent: "commStatusSent", scheduled: "commStatusScheduled", draft: "commStatusDraft", failed: "commStatusFailed" }[status ?? ""];
  return k ? t(`emailTracking.${k}`) : t("cp4.comm.statusOther");
}
export type CommChip = "all" | "from_us" | "from_them" | "logged";
/**
 * Logged = recorded locally by a user (Log communication). Mirrors the server's source=logged predicate:
 * no mailbox, no provider message id, no delivery provider and no automation rule. Imported mail whose
 * mailbox was later deleted (keeps providerMessageId) and automated SendGrid mail are never "logged".
 */
export type LoggedCommFields = { mailboxAccountId?: string | null; providerMessageId?: string | null; deliveryProvider?: string | null; automationRuleId?: string | null };
export const isLoggedComm = (c: LoggedCommFields) =>
  !c.mailboxAccountId && !c.providerMessageId && !c.deliveryProvider && !c.automationRuleId;
export function matchesCommChip(c: CommunicationWithDetails, chip: CommChip) {
  if (chip === "from_us") return c.direction === "outbound";
  if (chip === "from_them") return c.direction === "inbound";
  if (chip === "logged") return isLoggedComm(c);
  return true;
}
const commTime = (c: CommunicationWithDetails) => c.receivedAt ?? c.sentAt ?? c.createdAt;
const firstLine = (c: CommunicationWithDetails) => ((c.bodyText || c.body || "").split(/\r?\n/).map((s: string) => s.trim()).find(Boolean) ?? "");
const senderOf = (c: CommunicationWithDetails) => c.direction === "outbound" ? (c.sentByName || c.fromAddress || "") : (c.contactName || c.fromAddress || c.sentByName || "");

function ThreadRow({ group, onSelectComm }: { group: ThreadGroup; onSelectComm: (c: CommunicationWithDetails) => void }) {
  const { t } = useTranslation();
  const dates = useCustomerDates();
  const [expanded, setExpanded] = useState(false);
  const { latestMessage: m, messages } = group;
  const multi = messages.length > 1;
  const open = () => (multi ? setExpanded(v => !v) : onSelectComm(m));
  const sender = senderOf(m) || t("cp4.comm.unknownSender");
  const preview = firstLine(m);
  return (
    <li className="border-b last:border-b-0">
      <div role="button" tabIndex={0} aria-expanded={multi ? expanded : undefined}
        className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        onClick={open} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        data-testid={multi ? `row-thread-${group.threadId}` : `row-comm-${m.id}`}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Mail className="h-3.5 w-3.5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium" data-testid={`text-comm-subject-${m.id}`}>{m.subject || t("cp3.activity.noSubject")}</span>
            {multi && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums" data-testid={`badge-thread-count-${group.threadId}`}>{messages.length}</span>}
            {isLoggedComm(m) && <span className="shrink-0 rounded-full border px-1.5 text-[11px] text-muted-foreground" data-testid={`chip-logged-${m.id}`}>{t("cp4.comm.logged")}</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground" data-testid={`text-comm-preview-${m.id}`}>
            <span className="inline-flex items-center gap-1 align-middle"><DirectionIcon direction={m.direction} /></span> {sender}{preview ? ` \u00b7 ${preview}` : ""}
          </span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground" data-testid={`text-comm-date-${m.id}`}>{dates.day(commTime(m))}</span>
      </div>
      {multi && expanded && (
        <ul className="border-t bg-muted/20">
          {[...messages].reverse().map(msg => (
            <li key={msg.id}>
              <button type="button" className="flex min-h-[40px] w-full items-center gap-3 py-1.5 pl-12 pr-3 text-left hover:bg-muted/50" onClick={() => onSelectComm(msg)} data-testid={`row-comm-${msg.id}`}>
                <DirectionIcon direction={msg.direction} />
                <span className="min-w-0 flex-1 truncate text-xs"><span className="font-medium">{senderOf(msg) || t("cp4.comm.unknownSender")}</span>{firstLine(msg) ? ` \u00b7 ${firstLine(msg)}` : ""}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{dates.day(commTime(msg))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CommunicationListTab({ queryKey, customerId, showLogButton = true }: CommunicationListTabProps) {
  const { t } = useTranslation();
  const dates = useCustomerDates();
  const scope = useCustomerScope();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [chip, setChip] = useState<CommChip>("all");
  const directionFilter = chip === "from_us" ? "outbound" : chip === "from_them" ? "inbound" : "all";
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
    if (chip === "logged") params.set("source", "logged");
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (fromDate) params.set("fromDate", fromDate.toISOString().split("T")[0]);
    if (toDate) params.set("toDate", toDate.toISOString().split("T")[0]);
    if (selectedMailboxIds.size > 0) params.set("mailboxIds", Array.from(selectedMailboxIds).sort().join(","));
    return `${base}?${params}`;
  };

  const mailboxIdsKey = Array.from(selectedMailboxIds).sort().join(",");

  // Company/viewer/role scoped: key carries scope.scope, request sends X-Company-Id.
  const { data: response, isLoading } = useQuery<PaginatedResponse>({
    queryKey: [...queryKey, page, search, chip, mailboxIdsKey, typeFilter, statusFilter, fromDate?.toISOString(), toDate?.toISOString(), ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<PaginatedResponse>(buildUrl(), signal),
    enabled: scope.enabled,
    staleTime: 30_000,
  });

  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts", ...scope.scope],
    queryFn: ({ signal }) => scope.getJson<MailboxAccount[]>("/api/mailbox-accounts", signal),
    enabled: scope.enabled,
    retry: false,
  });

  const rawCommunications = response?.data ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  const communications = useMemo(() => rawCommunications.filter(c => matchesCommChip(c, chip)), [rawCommunications, chip]);

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
  /** One row per thread (single messages are one-message threads), newest activity first; day groups when the list is long. */
  const groupedRows = useMemo(() => {
    const rows: ThreadGroup[] = [...threads, ...standalone.map(c => ({ threadId: `single-${c.id}`, messages: [c], latestMessage: c }))]
      .sort((a, b) => new Date(commTime(b.latestMessage)).getTime() - new Date(commTime(a.latestMessage)).getTime());
    if (rows.length <= DAY_GROUP_THRESHOLD) return [{ key: "all", label: null as string | null, rows }];
    const out: { key: string; label: string | null; rows: ThreadGroup[] }[] = [];
    for (const r of rows) {
      const key = dates.dayKey(commTime(r.latestMessage));
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(r); else out.push({ key, label: dates.day(commTime(r.latestMessage)), rows: [r] });
    }
    return out;
  }, [threads, standalone, dates]);

  const activeFilterCount = [
    search,
    typeFilter !== "all" ? typeFilter : "",
    statusFilter !== "all" ? statusFilter : "",
    chip !== "all" ? chip : "",
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

  const chips: CommChip[] = ["all", "from_us", "from_them", "logged"];
  return (
    <div className="space-y-3" data-testid="communications-list">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("emailTracking.searchEmails")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 pl-9"
            data-testid="input-comm-search"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("cp4.comm.filterLabel")}>
          {chips.map(c => (
            <button key={c} type="button" aria-pressed={chip === c} onClick={() => { setChip(c); setPage(1); }}
              className={`rounded-full border px-3 py-1 text-[12.5px] ${chip === c ? "border-transparent bg-[hsl(var(--rail-active))] font-semibold text-[hsl(var(--rail-heading))]" : "bg-background hover:bg-muted"}`}
              data-testid={`chip-comm-${c}`}>
              {t(`cp4.comm.chips.${c}`)}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} data-testid="button-comm-filters" className="h-9 gap-2">
          <Filter className="w-4 h-4" />
          {t("common.filter")}
          {activeFilterCount > 0 && <Badge variant="secondary" className="bg-primary text-primary-foreground">{activeFilterCount}</Badge>}
        </Button>
        {customerId && showLogButton && (
          <Button variant="outline" size="sm" onClick={() => setShowLogForm(true)} data-testid="button-log-new-comm" className="h-9 gap-2">
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
        <TableSkeleton rows={5} cols={3} testId="comm-skeleton" />
      ) : !hasResults ? (
        <PageEmptyState icon={Inbox} testId="comm-empty"
          message={activeFilterCount > 0 ? t("emailTracking.noCommFiltered") : t("emailTracking.communicationsNone")} />
      ) : (
        <>
          <div className="overflow-hidden rounded-[10px] border" data-testid="comm-thread-list">
            {groupedRows.map(g => (
              <div key={g.key}>
                {g.label && <div className="border-b bg-[hsl(var(--table-header))] px-3 py-1.5 text-xs font-medium text-muted-foreground" data-testid={`comm-day-${g.key}`}>{g.label}</div>}
                <ul>{g.rows.map(group => <ThreadRow key={group.threadId} group={group} onSelectComm={setSelectedComm} />)}</ul>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t("emailTracking.showing", { from: (page - 1) * PAGE_LIMIT + 1, to: Math.min(page * PAGE_LIMIT, total), total })}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-comm-prev-page">{t("common.previous")}</Button>
                <span className="text-xs">{t("emailTracking.pageOf", { page, total: totalPages })}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-comm-next-page">{t("common.next")}</Button>
              </div>
            </div>
          )}
        </>
      )}

      {customerId && (
        <UnsortedCandidatesPanel customerId={customerId} />
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
                    <span>{selectedComm.direction === "inbound" ? t("emailTracking.directionInbound") : selectedComm.direction === "outbound" ? t("emailTracking.directionOutbound") : "\u2014"}</span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.fieldSource")}</p>
                  <div data-testid="text-detail-source">
                    {selectedComm.mailboxAccountId ? (
                      <SourceBadge comm={selectedComm} />
                    ) : (
                      <span className="text-sm">{t("emailTracking.sourceCrm")}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.subjectLabel")}</p>
                  <p data-testid="text-detail-subject">{selectedComm.subject}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("emailTracking.colType")}</p>
                  <Badge variant="secondary" className={TYPE_COLORS[selectedComm.type] || ""} data-testid="badge-detail-type">
                    {commTypeLabel(t, selectedComm.type)}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium mb-1">{t("common.status")}</p>
                  <Badge variant="secondary" className={STATUS_COLORS[selectedComm.status] || ""} data-testid="badge-detail-status">
                    {commStatusLabel(t, selectedComm.status)}
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
