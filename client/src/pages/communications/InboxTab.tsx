import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { ArrowDownLeft, Inbox, Mail, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import type { CommunicationWithDetails, MailboxAccount } from "@shared/schema";
import { useCommunicationsShell } from "./CommunicationsPageShell";
import CommunicationsQuickViewModal from "@/components/customer/communications/CommunicationsQuickViewModal";

interface PaginatedResponse {
  data: CommunicationWithDetails[];
  total: number;
  page: number;
  limit: number;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return formatDistanceToNow(new Date(d as string), { addSuffix: true });
  } catch {
    return "—";
  }
}

function InboxSourceBadge({ comm }: { comm: CommunicationWithDetails }) {
  if (!comm.mailboxAccountId) return null;
  return (
    <Badge
      variant="secondary"
      className="text-xs shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
      data-testid={`badge-inbox-sync-${comm.id}`}
    >
      Inbox Sync
    </Badge>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-0 divide-y">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="w-4 h-4 rounded-full mt-1 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function NoMailboxState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center p-8 gap-4"
      data-testid="empty-state-no-mailbox-inbox"
    >
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Mail className="w-7 h-7 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-sm">No mailbox connected</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Connect your Gmail to receive inbound messages directly in this inbox.
        </p>
      </div>
      <Button asChild size="sm" variant="outline" data-testid="button-connect-mailbox-inbox">
        <Link href="/dashboard/settings/my-mailbox">
          <Settings className="w-3.5 h-3.5 mr-1.5" />
          Connect a mailbox
        </Link>
      </Button>
    </div>
  );
}

function NoResultsState() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center p-8 gap-3"
      data-testid="empty-state-no-results-inbox"
    >
      <Inbox className="w-10 h-10 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">Nothing new in the last 30 days</p>
    </div>
  );
}

export default function InboxTab() {
  const { search, fromDate, toDate, viewAs } = useCommunicationsShell();
  const [selectedComm, setSelectedComm] = useState<CommunicationWithDetails | null>(null);
  const searchString = useSearch();
  const focusId = new URLSearchParams(searchString).get("focus");
  const [highlightId, setHighlightId] = useState<string | null>(focusId);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const params = new URLSearchParams({ page: "1", limit: "50", direction: "inbound" });
  if (search) params.set("search", search);
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  if (viewAs) params.set("viewAs", viewAs);
  const paramStr = params.toString();

  const { data: response, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/communications", "inbox-tab", search, fromDate, toDate, viewAs],
    queryFn: async () => {
      const res = await fetch(`/api/communications?${paramStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: mailboxAccounts = [], isLoading: mailboxLoading } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
    retry: false,
    staleTime: 60_000,
  });

  const items = response?.data ?? [];

  const noFiltersActive = !search && !fromDate && !toDate;
  const hasNoMailbox = !mailboxLoading && mailboxAccounts.length === 0;
  const showNoMailboxCta = items.length === 0 && hasNoMailbox && noFiltersActive;

  // Focus deep-link: scroll to and highlight the target row
  useEffect(() => {
    if (!focusId || isLoading) return;
    const el = rowRefs.current[focusId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(focusId);
      const timer = setTimeout(() => setHighlightId(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [focusId, isLoading, response]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" data-testid="tab-content-inbox">
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingSkeleton />
        ) : items.length === 0 ? (
          showNoMailboxCta ? <NoMailboxState /> : <NoResultsState />
        ) : (
          <ul className="divide-y">
            {items.map((comm) => {
              const timestamp = comm.receivedAt ?? comm.sentAt ?? comm.createdAt;
              const fromAddr = comm.fromAddress ?? comm.sentByName ?? "—";
              const bodyPreview = comm.bodyText
                ? comm.bodyText.slice(0, 80) + (comm.bodyText.length > 80 ? "…" : "")
                : comm.body
                  ? comm.body.slice(0, 80) + (comm.body.length > 80 ? "…" : "")
                  : "";
              const isHighlighted = highlightId === comm.id;

              return (
                <li key={comm.id}>
                  <button
                    ref={(el) => { rowRefs.current[comm.id] = el; }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover-elevate transition-all duration-500 ${isHighlighted ? "ring-2 ring-inset ring-primary bg-primary/5" : ""}`}
                    onClick={() => setSelectedComm(comm)}
                    data-testid={`row-inbox-${comm.id}`}
                  >
                    <ArrowDownLeft className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-sm font-medium truncate"
                          data-testid={`text-inbox-subject-${comm.id}`}
                        >
                          {comm.subject || "(No subject)"}
                        </span>
                        <InboxSourceBadge comm={comm} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        <span data-testid={`text-inbox-from-${comm.id}`}>{fromAddr}</span>
                        {comm.customerName && (
                          <span className="ml-2 text-muted-foreground/70">· {comm.customerName}</span>
                        )}
                      </p>
                      {bodyPreview && (
                        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{bodyPreview}</p>
                      )}
                    </div>
                    <span
                      className="text-xs text-muted-foreground shrink-0 mt-0.5"
                      data-testid={`text-inbox-date-${comm.id}`}
                    >
                      {formatDate(timestamp)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedComm && selectedComm.customerId && (
        <CommunicationsQuickViewModal
          open={!!selectedComm}
          onOpenChange={(v) => { if (!v) setSelectedComm(null); }}
          customerId={selectedComm.customerId}
          customerName={selectedComm.customerName ?? "Customer"}
          totalCount={1}
        />
      )}
    </div>
  );
}
