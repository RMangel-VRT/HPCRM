import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, subMonths, startOfYear } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  XCircle,
  History,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { MailboxBackfillRun } from "@shared/schema";

interface BackfillStatus {
  active: MailboxBackfillRun | null;
  history: MailboxBackfillRun[];
}

type QuickRange = "30d" | "90d" | "12m" | "ytd" | "last_year" | "custom";

function quickRangeDates(range: QuickRange): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (range) {
    case "30d":
      return { start: subDays(now, 30), end };
    case "90d":
      return { start: subDays(now, 90), end };
    case "12m":
      return { start: subMonths(now, 12), end };
    case "ytd":
      return { start: startOfYear(now), end };
    case "last_year": {
      const yr = now.getFullYear() - 1;
      return { start: new Date(yr, 0, 1), end: new Date(yr, 11, 31, 23, 59, 59, 999) };
    }
    default:
      return { start: subDays(now, 90), end };
  }
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "success") return "default";
  if (status === "error") return "destructive";
  if (status === "cancelled" || status === "partial") return "secondary";
  return "outline";
}

function statusLabel(status: string): string {
  switch (status) {
    case "queued": return "Queued";
    case "running": return "Running";
    case "success": return "Complete";
    case "partial": return "Partial";
    case "error": return "Error";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}

function RunRow({ run }: { run: MailboxBackfillRun }) {
  const total = (run.inboxFetched ?? 0) + (run.sentFetched ?? 0);
  const routed = (run.inboxRouted ?? 0) + (run.sentRouted ?? 0);
  const unsorted = (run.inboxUnsorted ?? 0) + (run.sentUnsorted ?? 0);
  const deduped = (run.inboxDeduped ?? 0) + (run.sentDeduped ?? 0);

  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b last:border-0 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={statusVariant(run.status)} className="text-xs">
          {statusLabel(run.status)}
        </Badge>
        <span className="text-muted-foreground">
          {format(new Date(run.rangeStart), "MMM d, yyyy")} – {format(new Date(run.rangeEnd), "MMM d, yyyy")}
        </span>
        <span className="text-muted-foreground text-xs">
          {format(new Date(run.startedAt), "MMM d, h:mm a")}
        </span>
      </div>
      {total > 0 && (
        <div className="text-muted-foreground">
          {total} fetched · {routed} routed · {unsorted} unsorted · {deduped} deduped
        </div>
      )}
      {run.errorMessage && (
        <p className="text-destructive truncate">{run.errorMessage}</p>
      )}
    </div>
  );
}

export interface BackfillPanelProps {
  mailboxAccountId: string;
  autoOpen?: boolean;
}

export default function BackfillPanel({ mailboxAccountId, autoOpen = false }: BackfillPanelProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [selectedRange, setSelectedRange] = useState<QuickRange>("90d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [includeInbox, setIncludeInbox] = useState(true);
  const [includeSent, setIncludeSent] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data, isLoading } = useQuery<BackfillStatus>({
    queryKey: ["/api/mailbox-accounts", mailboxAccountId, "backfill", "status"],
    queryFn: () =>
      apiRequest("GET", `/api/mailbox-accounts/${mailboxAccountId}/backfill/status`).then(r => r.json()),
    refetchInterval: (query) => {
      const d = query.state.data as BackfillStatus | undefined;
      const isActive = d?.active && (d.active.status === "queued" || d.active.status === "running");
      return isActive ? 5_000 : false;
    },
    staleTime: 5_000,
  });

  const active = data?.active ?? null;
  const history = data?.history ?? [];
  const isRunning = active !== null && (active.status === "queued" || active.status === "running");

  useEffect(() => {
    if (autoOpen && !isRunning) {
      setSelectedRange("90d");
      setIncludeInbox(true);
      setIncludeSent(true);
    }
  }, [autoOpen]);

  const startMutation = useMutation({
    mutationFn: (payload: {
      rangeStart: string;
      rangeEnd: string;
      includeInbox: boolean;
      includeSent: boolean;
    }) => apiRequest("POST", `/api/mailbox-accounts/${mailboxAccountId}/backfill`, payload).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts", mailboxAccountId, "backfill", "status"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Failed to start backfill", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (runId: string) =>
      apiRequest("POST", `/api/mailbox-accounts/${mailboxAccountId}/backfill/${runId}/cancel`, {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts", mailboxAccountId, "backfill", "status"] });
      toast({ title: "Cancellation requested" });
    },
    onError: () => toast({ title: "Failed to cancel backfill", variant: "destructive" }),
  });

  function handleStart() {
    let start: Date;
    let end: Date;

    if (selectedRange === "custom") {
      if (!customStart || !customEnd) {
        toast({ title: "Please select a custom date range", variant: "destructive" });
        return;
      }
      start = new Date(customStart);
      end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
    } else {
      const dates = quickRangeDates(selectedRange);
      start = dates.start;
      end = dates.end;
    }

    if (!includeInbox && !includeSent) {
      toast({ title: "Select at least one: Inbox or Sent", variant: "destructive" });
      return;
    }

    startMutation.mutate({
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      includeInbox,
      includeSent,
    });
  }

  const totalProcessed = active
    ? (active.inboxFetched ?? 0) + (active.sentFetched ?? 0) +
      (active.inboxDeduped ?? 0) + (active.sentDeduped ?? 0)
    : 0;
  const progressPct =
    active?.estimatedTotal && active.estimatedTotal > 0
      ? Math.min(100, Math.round((totalProcessed / active.estimatedTotal) * 100))
      : null;

  const quickOptions: { label: string; value: QuickRange }[] = [
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
    { label: "Last 12 months", value: "12m" },
    { label: "Year to date", value: "ytd" },
    { label: "Last full year", value: "last_year" },
    { label: "Custom range", value: "custom" },
  ];

  return (
    <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-3 text-sm" data-testid={`panel-backfill-${mailboxAccountId}`}>
      <div className="flex items-center gap-1.5">
        <Download className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-medium text-xs">Backfill historical mail</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading…
        </div>
      ) : isRunning && active ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span className="text-muted-foreground">
              {active.status === "queued" ? "Queued…" : "Running…"}
              {active.currentMonth ? ` (${active.currentMonth})` : ""}
            </span>
          </div>

          {progressPct !== null ? (
            <div className="space-y-1">
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-xs text-muted-foreground">{progressPct}% complete</p>
            </div>
          ) : (
            <Progress value={undefined} className="h-1.5 animate-pulse" />
          )}

          <div className="grid grid-cols-2 gap-1 text-xs">
            {active.includeInbox && (
              <div className="rounded bg-muted px-2 py-1 space-y-0.5">
                <p className="font-medium text-muted-foreground">Inbox</p>
                <p>{active.inboxFetched ?? 0} fetched · {active.inboxRouted ?? 0} routed</p>
                <p className="text-muted-foreground">{active.inboxUnsorted ?? 0} unsorted · {active.inboxDeduped ?? 0} deduped</p>
              </div>
            )}
            {active.includeSent && (
              <div className="rounded bg-muted px-2 py-1 space-y-0.5">
                <p className="font-medium text-muted-foreground">Sent</p>
                <p>{active.sentFetched ?? 0} fetched · {active.sentRouted ?? 0} routed</p>
                <p className="text-muted-foreground">{active.sentUnsorted ?? 0} unsorted · {active.sentDeduped ?? 0} deduped</p>
              </div>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs"
            onClick={() => cancelMutation.mutate(active.id)}
            disabled={cancelMutation.isPending || active.cancelRequested}
            data-testid={`button-cancel-backfill-${mailboxAccountId}`}
          >
            {cancelMutation.isPending || active.cancelRequested ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            {active.cancelRequested ? "Cancelling…" : "Cancel"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1">
            {quickOptions.map(opt => (
              <Button
                key={opt.value}
                size="sm"
                variant={selectedRange === opt.value ? "default" : "outline"}
                className="text-xs h-7"
                onClick={() => setSelectedRange(opt.value)}
                data-testid={`button-range-${opt.value}-${mailboxAccountId}`}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {selectedRange === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="h-7 text-xs w-36"
                  data-testid={`input-custom-start-${mailboxAccountId}`}
                />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="h-7 text-xs w-36"
                  data-testid={`input-custom-end-${mailboxAccountId}`}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Checkbox
                id={`inbox-${mailboxAccountId}`}
                checked={includeInbox}
                onCheckedChange={v => setIncludeInbox(Boolean(v))}
                data-testid={`checkbox-inbox-${mailboxAccountId}`}
              />
              <Label htmlFor={`inbox-${mailboxAccountId}`} className="text-xs cursor-pointer">Inbox</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox
                id={`sent-${mailboxAccountId}`}
                checked={includeSent}
                onCheckedChange={v => setIncludeSent(Boolean(v))}
                data-testid={`checkbox-sent-${mailboxAccountId}`}
              />
              <Label htmlFor={`sent-${mailboxAccountId}`} className="text-xs cursor-pointer">Sent</Label>
            </div>
          </div>

          <Button
            size="sm"
            className="gap-1 text-xs"
            onClick={handleStart}
            disabled={startMutation.isPending}
            data-testid={`button-start-backfill-${mailboxAccountId}`}
          >
            {startMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            {startMutation.isPending ? "Starting…" : "Start backfill"}
          </Button>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover-elevate rounded px-1"
            onClick={() => setHistoryOpen(!historyOpen)}
            data-testid={`button-backfill-history-${mailboxAccountId}`}
          >
            {historyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <History className="w-3 h-3" />
            Recent backfills ({history.length})
          </button>
          {historyOpen && (
            <div className="mt-1.5 rounded-md border bg-muted/30 p-2 space-y-0.5" data-testid={`panel-backfill-history-${mailboxAccountId}`}>
              {history.map(run => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
