import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CheckCircle2, ExternalLink, Loader2, AlertCircle, Receipt, Users } from "lucide-react";
import type { CampaignItem, CampaignCrewWithMembers } from "@shared/schema";

type BillingFilter = "ready" | "billed" | "ineligible";

interface BillingSummary {
  totalCompleted: number;
  totalSkipped: number;
  totalPending: number;
  ticketsCreated: number;
  notYetCreated: number;
  ineligibleItems: Array<{ itemId: string; customerName: string; reason: "no_crew_assigned" | "crew_has_no_leader" }>;
  billedTickets: Array<{ itemId: string; customerName: string; ticketId: string; currentStatusId: string | null; currentStatusName: string | null }>;
  estimatedAmountTotal: number | null;
}

interface BulkResult {
  generated: number;
  skipped: number;
  failed: number;
  results: Array<{ itemId: string; customerName: string; success: boolean; ticketId?: string; error?: string; photoCopyFailures?: number }>;
}

interface Props {
  campaignId: string;
  items: (CampaignItem & { customerCity?: string | null })[];
  crews: CampaignCrewWithMembers[];
  highlightItemId: string | null;
  onJumpToAssignments: (itemId: string) => void;
  onJumpToCrews: (crewId: string) => void;
}

export default function BillingQueueTab({
  campaignId,
  items,
  crews,
  onJumpToAssignments,
  onJumpToCrews,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<BillingFilter>("ready");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [lastBulkResult, setLastBulkResult] = useState<BulkResult | null>(null);

  const { data: summary } = useQuery<BillingSummary>({
    queryKey: ["/api/campaigns", campaignId, "billing-summary"],
  });

  const crewById = useMemo(() => {
    const m = new Map<string, CampaignCrewWithMembers>();
    crews.forEach(c => m.set(c.id, c));
    return m;
  }, [crews]);

  const { readyItems, billedItems, ineligibleRows } = useMemo(() => {
    const ready: typeof items = [];
    const billed: typeof items = [];
    const ineligible: { item: (typeof items)[number]; reason: "no_crew_assigned" | "crew_has_no_leader" }[] = [];
    for (const it of items) {
      const alreadyBilled = it.billingStatus !== "not_created" || !!it.ticketId;
      if (alreadyBilled) {
        billed.push(it);
        continue;
      }
      if (it.status !== "completed") continue;
      if (!it.assignedCampaignCrewId) {
        ineligible.push({ item: it, reason: "no_crew_assigned" });
        continue;
      }
      const crew = crewById.get(it.assignedCampaignCrewId);
      if (!crew?.leaderUserId) {
        ineligible.push({ item: it, reason: "crew_has_no_leader" });
        continue;
      }
      ready.push(it);
    }
    return { readyItems: ready, billedItems: billed, ineligibleRows: ineligible };
  }, [items, crewById]);

  useEffect(() => {
    if (!bulkRunning) {
      setShowSlowHint(false);
      return;
    }
    const t1 = window.setTimeout(() => setShowSlowHint(true), 5000);
    return () => window.clearTimeout(t1);
  }, [bulkRunning]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "billing-summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
  };

  const generateAllMutation = useMutation({
    mutationFn: async (itemIds?: string[]) => {
      setBulkRunning(true);
      const body = itemIds && itemIds.length > 0 ? { itemIds } : {};
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/generate-tickets`, body);
      return (await res.json()) as BulkResult;
    },
    onSuccess: (result) => {
      setBulkRunning(false);
      setLastBulkResult(result);
      invalidate();
      const variant = result.failed > 0 ? "destructive" : undefined;
      toast({
        title: t("campaigns.billingGenerateAllResultTitle"),
        description: t("campaigns.billingGenerateAllResultDesc", {
          generated: result.generated,
          skipped: result.skipped,
          failed: result.failed,
        }),
        variant,
      });
    },
    onError: (e: Error) => {
      setBulkRunning(false);
      toast({ title: e.message || t("campaigns.billingGenerateAllFailed"), variant: "destructive" });
    },
  });

  const generateOneMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/${itemId}/generate-ticket`);
      return await res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: t("campaigns.billingGenerateOneSuccess") });
    },
    onError: (e: Error) => {
      toast({ title: e.message || t("campaigns.billingGenerateOneFailed"), variant: "destructive" });
    },
  });

  const failedItemIds = lastBulkResult?.results.filter(r => !r.success && r.error !== "already_billed" && r.error !== "no_crew_assigned" && r.error !== "crew_has_no_leader").map(r => r.itemId) ?? [];

  const summaryReady = summary?.notYetCreated ?? readyItems.length;
  const summaryBilled = summary?.ticketsCreated ?? billedItems.length;
  const summaryIneligible = summary?.ineligibleItems.length ?? ineligibleRows.length;

  return (
    <div className="space-y-3" data-testid="billing-queue-tab">
      <div className="rounded-md border p-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span data-testid="text-billing-ready">
            <strong>{summaryReady}</strong> {t("campaigns.billingReadyLabel")}
          </span>
          <span className="text-muted-foreground">·</span>
          <span data-testid="text-billing-billed">
            <strong>{summaryBilled}</strong> {t("campaigns.billingBilledLabel")}
          </span>
          <span className="text-muted-foreground">·</span>
          <span data-testid="text-billing-ineligible">
            <strong>{summaryIneligible}</strong> {t("campaigns.billingIneligibleLabel")}
          </span>
          {summary?.estimatedAmountTotal != null && (
            <>
              <span className="text-muted-foreground">·</span>
              <span data-testid="text-billing-estimated">
                {t("campaigns.billingEstTotal")}: ${summary.estimatedAmountTotal.toFixed(2)}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setConfirmAllOpen(true)}
            disabled={summaryReady === 0 || bulkRunning}
            data-testid="button-generate-all"
          >
            <Receipt className="w-4 h-4 mr-1" />
            {t("campaigns.billingGenerateAll", { count: summaryReady })}
          </Button>
        </div>
      </div>

      {bulkRunning && (
        <div className="space-y-1" data-testid="billing-bulk-progress">
          <Progress value={undefined} />
          {showSlowHint && (
            <p className="text-xs text-muted-foreground">{t("campaigns.billingSlowHint")}</p>
          )}
        </div>
      )}

      {lastBulkResult && lastBulkResult.failed > 0 && (
        <Alert variant="destructive" data-testid="billing-failures-alert">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>{t("campaigns.billingFailuresTitle")}</AlertTitle>
          <AlertDescription className="space-y-2">
            <ul className="list-disc pl-5 text-sm">
              {lastBulkResult.results.filter(r => !r.success && failedItemIds.includes(r.itemId)).map(r => (
                <li key={r.itemId}>
                  {r.customerName} — {r.error || t("campaigns.billingFailedGeneric")}
                </li>
              ))}
            </ul>
            {failedItemIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateAllMutation.mutate(failedItemIds)}
                disabled={bulkRunning}
                data-testid="button-retry-failed"
              >
                {t("campaigns.billingRetryFailed", { count: failedItemIds.length })}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        <Button
          variant={filter === "ready" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("ready")}
          data-testid="chip-billing-ready"
        >
          {t("campaigns.billingFilterReady")} ({readyItems.length})
        </Button>
        <Button
          variant={filter === "billed" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("billed")}
          data-testid="chip-billing-billed"
        >
          {t("campaigns.billingFilterBilled")} ({billedItems.length})
        </Button>
        <Button
          variant={filter === "ineligible" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("ineligible")}
          data-testid="chip-billing-ineligible"
        >
          {t("campaigns.billingFilterIneligible")} ({ineligibleRows.length})
        </Button>
      </div>

      {filter === "ready" && (
        <div className="rounded-md border" data-testid="billing-ready-list">
          {readyItems.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground" data-testid="text-billing-ready-empty">
              {t("campaigns.billingNoReady")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">{t("campaigns.extraBillableProperties")}</th>
                  <th className="text-left p-2 font-medium">{t("campaigns.extraBillableAssignedCrew")}</th>
                  <th className="text-left p-2 font-medium">{t("campaigns.extraBillablePhotosCount")}</th>
                  <th className="text-right p-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {readyItems.map(item => {
                  const crew = item.assignedCampaignCrewId ? crewById.get(item.assignedCampaignCrewId) : null;
                  const photoCount = item.completionPhotoStorageKeys?.length || 0;
                  return (
                    <tr key={item.id} className="border-b" data-testid={`row-billing-${item.id}`}>
                      <td className="p-2">
                        <div className="font-medium">{item.customerName}</div>
                        {item.customerCity && <div className="text-xs text-muted-foreground">{item.customerCity}</div>}
                      </td>
                      <td className="p-2">
                        {crew ? (
                          <Badge variant="outline" style={{ borderColor: crew.color }}>{crew.name}</Badge>
                        ) : "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">{photoCount}</td>
                      <td className="p-2 text-right">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="sm" data-testid={`button-generate-row-${item.id}`}>
                              {t("campaigns.billingGenerateRow")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64">
                            <div className="space-y-2">
                              <p className="text-sm">{t("campaigns.billingGenerateRowConfirm")}</p>
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => generateOneMutation.mutate(item.id)}
                                  disabled={generateOneMutation.isPending}
                                  data-testid={`button-generate-row-confirm-${item.id}`}
                                >
                                  {generateOneMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : t("common.confirm")}
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {filter === "billed" && (
        <div className="rounded-md border" data-testid="billing-billed-list">
          {billedItems.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("campaigns.billingNoBilled")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">{t("campaigns.extraBillableProperties")}</th>
                  <th className="text-left p-2 font-medium">{t("campaigns.billingTicketStatus")}</th>
                  <th className="text-right p-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {billedItems.map(item => {
                  const billedInfo = summary?.billedTickets.find(b => b.itemId === item.id);
                  const statusName = billedInfo?.currentStatusName || item.billingStatus;
                  return (
                    <tr key={item.id} className="border-b" data-testid={`row-billing-billed-${item.id}`}>
                      <td className="p-2">{item.customerName}</td>
                      <td className="p-2">
                        <Badge
                          variant="secondary"
                          data-testid={`badge-ticket-status-${item.id}`}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {statusName}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">
                        {item.ticketId && (
                          <Button asChild variant="ghost" size="sm" data-testid={`link-ticket-${item.ticketId}`}>
                            <Link href={`/dashboard/tickets/${item.ticketId}`}>
                              <ExternalLink className="w-4 h-4 mr-1" />
                              {t("campaigns.billingViewTicket")}
                            </Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {filter === "ineligible" && (
        <div className="rounded-md border" data-testid="billing-ineligible-list">
          {ineligibleRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("campaigns.billingNoIneligible")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">{t("campaigns.extraBillableProperties")}</th>
                  <th className="text-left p-2 font-medium">{t("campaigns.billingReason")}</th>
                  <th className="text-right p-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {ineligibleRows.map(({ item, reason }) => (
                  <tr key={item.id} className="border-b" data-testid={`row-billing-ineligible-${item.id}`}>
                    <td className="p-2">{item.customerName}</td>
                    <td className="p-2">
                      <Badge variant="outline">
                        {reason === "no_crew_assigned"
                          ? t("campaigns.billingReasonNoCrew")
                          : t("campaigns.billingReasonNoLeader")}
                      </Badge>
                    </td>
                    <td className="p-2 text-right">
                      {reason === "no_crew_assigned" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onJumpToAssignments(item.id)}
                          data-testid={`button-fix-assign-${item.id}`}
                        >
                          <Users className="w-4 h-4 mr-1" />
                          {t("campaigns.extraBillableAssignToCrew")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => item.assignedCampaignCrewId && onJumpToCrews(item.assignedCampaignCrewId)}
                          data-testid={`button-fix-leader-${item.id}`}
                        >
                          {t("campaigns.billingSetLeader")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <AlertDialogContent data-testid="dialog-confirm-generate-all">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("campaigns.billingConfirmAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("campaigns.billingConfirmAllDesc", { count: summaryReady })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-generate-all">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmAllOpen(false);
                generateAllMutation.mutate(undefined);
              }}
              data-testid="button-confirm-generate-all"
            >
              {t("campaigns.billingGenerateAllConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
