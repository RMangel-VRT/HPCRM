import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Send, Mail, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import type { CommunicationWithDetails, MailboxAccount } from "@shared/schema";
import { useCommunicationsShell } from "./CommunicationsPageShell";
import CommunicationsQuickViewModal from "@/components/customer/communications/CommunicationsQuickViewModal";
import DeleteCommunicationButton from "@/components/customer/communications/DeleteCommunicationButton";
import { useAuth } from "@/hooks/use-auth";

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

function SentSourceBadge({ comm }: { comm: CommunicationWithDetails }) {
  if (!comm.mailboxAccountId || !comm.routingMethod) return null;
  return (
    <Badge
      variant="secondary"
      className="text-xs shrink-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      data-testid={`badge-via-gmail-${comm.id}`}
    >
      Via Gmail
    </Badge>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

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
      data-testid="empty-state-no-mailbox-sent"
    >
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Mail className="w-7 h-7 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-sm">No sent mail yet</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Connect your Gmail or send your first email from the CRM to see sent messages here.
        </p>
      </div>
      <Button asChild size="sm" variant="outline" data-testid="button-connect-mailbox-sent">
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
      data-testid="empty-state-no-results-sent"
    >
      <Send className="w-10 h-10 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No sent messages match your filters</p>
    </div>
  );
}

export default function SentTab() {
  const { search, fromDate, toDate, viewAs } = useCommunicationsShell();
  const { user } = useAuth();
  const canDelete = user?.activeRole === "admin" || user?.activeRole === "office";
  const [selectedComm, setSelectedComm] = useState<CommunicationWithDetails | null>(null);

  const params = new URLSearchParams({ page: "1", limit: "50", direction: "outbound" });
  if (search) params.set("search", search);
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  if (viewAs) params.set("viewAs", viewAs);
  const paramStr = params.toString();

  const { data: response, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/communications", "sent-tab", search, fromDate, toDate, viewAs],
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

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" data-testid="tab-content-sent">
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingSkeleton />
        ) : items.length === 0 ? (
          showNoMailboxCta ? <NoMailboxState /> : <NoResultsState />
        ) : (
          <ul className="divide-y">
            {items.map((comm) => {
              const timestamp = comm.sentAt ?? comm.createdAt;
              const recipient = comm.recipientEmail ?? comm.customerName ?? "—";
              const bodyPreview = comm.bodyText
                ? comm.bodyText.slice(0, 80) + (comm.bodyText.length > 80 ? "…" : "")
                : comm.body
                  ? comm.body.slice(0, 80) + (comm.body.length > 80 ? "…" : "")
                  : "";

              return (
                <li key={comm.id} className="group relative">
                  <button
                    className={`w-full flex items-start gap-3 px-4 py-3 ${canDelete ? "pr-12" : ""} text-left hover-elevate`}
                    onClick={() => setSelectedComm(comm)}
                    data-testid={`row-sent-${comm.id}`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-sm font-medium truncate"
                          data-testid={`text-sent-subject-${comm.id}`}
                        >
                          {comm.subject || "(No subject)"}
                        </span>
                        <SentSourceBadge comm={comm} />
                        <Badge
                          variant="outline"
                          className={`text-xs border-0 py-0 ${STATUS_COLORS[comm.status] ?? ""}`}
                          data-testid={`badge-sent-status-row-${comm.id}`}
                        >
                          {comm.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        <span data-testid={`text-sent-to-${comm.id}`}>To: {recipient}</span>
                        {comm.sentByName && (
                          <span className="ml-2 text-muted-foreground/70">· {comm.sentByName}</span>
                        )}
                      </p>
                      {bodyPreview && (
                        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{bodyPreview}</p>
                      )}
                    </div>
                    <span
                      className="text-xs text-muted-foreground shrink-0 mt-0.5"
                      data-testid={`text-sent-date-${comm.id}`}
                    >
                      {formatDate(timestamp)}
                    </span>
                  </button>
                  {canDelete && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <DeleteCommunicationButton
                        communicationId={comm.id}
                        subject={comm.subject}
                      />
                    </div>
                  )}
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
