import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronUp, Code, ExternalLink, FileText, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { CommunicationWithDetails } from "@shared/schema";
import LogCommunicationForm from "./LogCommunicationForm";
import DeleteCommunicationButton from "./DeleteCommunicationButton";
import { useAuth } from "@/hooks/use-auth";

interface CommunicationsQuickViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  totalCount: number;
  onOpenFullTab?: () => void;
}

function CommRow({ comm, customerId, canDelete }: { comm: CommunicationWithDetails; customerId: string; canDelete: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const bodyPreview = comm.bodyText
    ? comm.bodyText.slice(0, 80) + (comm.bodyText.length > 80 ? "…" : "")
    : comm.body
      ? comm.body.slice(0, 80) + (comm.body.length > 80 ? "…" : "")
      : "";
  const timestamp = comm.receivedAt ?? comm.sentAt ?? comm.createdAt;
  const fromAddr = comm.fromAddress ?? comm.recipientEmail ?? comm.sentByName ?? "—";

  return (
    <div className="border rounded-md p-3 space-y-1" data-testid={`comm-row-${comm.id}`}>
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="mt-0.5 shrink-0">
          {comm.direction === "inbound"
            ? <ArrowDownLeft className="w-4 h-4 text-blue-500" />
            : <ArrowUpRight className="w-4 h-4 text-green-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{comm.subject || t("emailTracking.noSubject")}</span>
            {comm.mailboxAccountId && (
              <Badge variant="secondary" className="text-xs shrink-0" data-testid={`badge-mailbox-${comm.id}`}>
                {t("emailTracking.mailboxBadge")}
              </Badge>
            )}
            {comm.customerId && comm.wasManuallySorted ? (
              <Badge
                variant="outline"
                className="text-xs shrink-0 border-amber-300 text-amber-800 bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-900/20"
                title={comm.manuallySortedByName ? `Manually routed by ${comm.manuallySortedByName}` : "Manually routed"}
                data-testid={`badge-routed-${comm.id}`}
              >
                Routed → {comm.customerName ?? "customer"}
              </Badge>
            ) : comm.customerId && comm.mailboxAccountId ? (
              <Badge
                variant="outline"
                className="text-xs shrink-0 border-emerald-300 text-emerald-800 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:bg-emerald-900/20"
                title="Auto-matched by inbox sync"
                data-testid={`badge-sorted-${comm.id}`}
              >
                Sorted → {comm.customerName ?? "customer"}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground truncate">{fromAddr}</p>
          {bodyPreview && !expanded && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{bodyPreview}</p>
          )}
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {timestamp ? formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : "—"}
        </div>
        {canDelete && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <DeleteCommunicationButton
              communicationId={comm.id}
              subject={comm.subject}
              variant="text"
              invalidateKeys={[["/api/customers", customerId, "communications", "recent"]]}
            />
          </div>
        )}
        <div className="shrink-0">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </div>
      {expanded && (
        <div className="pt-2 border-t mt-2 space-y-2">
          {comm.bodyHtml && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showHtml ? "secondary" : "outline"}
                onClick={(e) => { e.stopPropagation(); setShowHtml(false); }}
                data-testid={`btn-view-text-${comm.id}`}
              >
                <FileText className="w-3 h-3 mr-1" />
                {t("emailTracking.viewText")}
              </Button>
              <Button
                size="sm"
                variant={showHtml ? "outline" : "secondary"}
                onClick={(e) => { e.stopPropagation(); setShowHtml(true); }}
                data-testid={`btn-view-html-${comm.id}`}
              >
                <Code className="w-3 h-3 mr-1" />
                {t("emailTracking.viewHtml")}
              </Button>
            </div>
          )}
          {showHtml && comm.bodyHtml ? (
            <iframe
              srcDoc={comm.bodyHtml}
              sandbox="allow-same-origin"
              className="w-full min-h-48 border rounded text-xs"
              title="Email HTML body"
              data-testid={`iframe-html-${comm.id}`}
            />
          ) : (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{comm.bodyText || comm.body || t("emailTracking.noMessageBody")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CommunicationsQuickViewModal({
  open,
  onOpenChange,
  customerId,
  customerName,
  totalCount,
  onOpenFullTab,
}: CommunicationsQuickViewModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canDelete = user?.activeRole === "admin" || user?.activeRole === "office";
  const [showLogForm, setShowLogForm] = useState(false);

  const { data: recentComms = [], isLoading } = useQuery<CommunicationWithDetails[]>({
    queryKey: ["/api/customers", customerId, "communications", "recent"],
    enabled: open,
  });

  const inbound = recentComms.filter(c => c.direction === "inbound");
  const outbound = recentComms.filter(c => c.direction === "outbound");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" data-testid="modal-comms-quick-view">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {customerName} — {t("emailTracking.communicationsTitle")}
            <Badge variant="secondary" data-testid="badge-total-comms">{totalCount}</Badge>
          </DialogTitle>
        </DialogHeader>

        {showLogForm ? (
          <div className="overflow-y-auto flex-1 px-1">
            <LogCommunicationForm
              customerId={customerId}
              onSuccess={() => setShowLogForm(false)}
              onCancel={() => setShowLogForm(false)}
            />
          </div>
        ) : (
          <>
            <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
              <TabsList className="shrink-0" data-testid="tabs-comm-filter">
                <TabsTrigger value="all" data-testid="tab-all">{t("emailTracking.allStatuses")} ({recentComms.length})</TabsTrigger>
                <TabsTrigger value="inbound" data-testid="tab-inbound">{t("emailTracking.directionInbound")} ({inbound.length})</TabsTrigger>
                <TabsTrigger value="outbound" data-testid="tab-outbound">{t("emailTracking.directionOutbound")} ({outbound.length})</TabsTrigger>
              </TabsList>

              {isLoading ? (
                <div className="flex-1 flex items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                </div>
              ) : (
                <>
                  <TabsContent value="all" className="flex-1 overflow-y-auto space-y-2 mt-2">
                    {recentComms.length === 0
                      ? <p className="text-sm text-muted-foreground text-center py-8">{t("emailTracking.communicationsNone")}</p>
                      : recentComms.map(c => <CommRow key={c.id} comm={c} customerId={customerId} canDelete={canDelete} />)}
                  </TabsContent>
                  <TabsContent value="inbound" className="flex-1 overflow-y-auto space-y-2 mt-2">
                    {inbound.length === 0
                      ? <p className="text-sm text-muted-foreground text-center py-8">{t("emailTracking.noInbound")}</p>
                      : inbound.map(c => <CommRow key={c.id} comm={c} customerId={customerId} canDelete={canDelete} />)}
                  </TabsContent>
                  <TabsContent value="outbound" className="flex-1 overflow-y-auto space-y-2 mt-2">
                    {outbound.length === 0
                      ? <p className="text-sm text-muted-foreground text-center py-8">{t("emailTracking.noOutbound")}</p>
                      : outbound.map(c => <CommRow key={c.id} comm={c} customerId={customerId} canDelete={canDelete} />)}
                  </TabsContent>
                </>
              )}
            </Tabs>

            <DialogFooter className="flex flex-row items-center justify-between gap-2 pt-2 border-t mt-2">
              {onOpenFullTab && (
                <Button variant="ghost" size="sm" onClick={onOpenFullTab} data-testid="button-open-full-comms-tab" className="gap-1">
                  <ExternalLink className="w-3 h-3" />
                  {t("emailTracking.openFullTab")}
                </Button>
              )}
              <Button size="sm" onClick={() => setShowLogForm(true)} data-testid="button-log-new-comm" className="gap-1 ml-auto">
                <Plus className="w-3 h-3" />
                {t("emailTracking.logCommunication")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
