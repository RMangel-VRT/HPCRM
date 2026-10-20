import { useState } from "react";
import { CalendarPlus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VisitDialog } from "@/components/scheduling/VisitDialog";
import { useTicketVisits, useVisitActions } from "@/hooks/use-scheduling";
import { VISITS_CARD_ID, fmtDay, isOpenVisit, statusLabel, type EnrichedVisit } from "@/lib/scheduling";

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  in_progress: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  skipped: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export function TicketVisitsCard(props: { ticketId: string; ticketTitle: string }) {
  const { companyId } = useVisitActions();
  return <TicketVisitsCardInner key={companyId ?? "none"} {...props} />;
}

function TicketVisitsCardInner({ ticketId, ticketTitle }: { ticketId: string; ticketTitle: string }) {
  const { t } = useTranslation();
  const { companyId, removeVisit, pending } = useVisitActions();
  const q = useTicketVisits(companyId, ticketId);
  const [dialog, setDialog] = useState<{ mode: "schedule" | "move"; visit?: EnrichedVisit } | null>(null);
  const [removing, setRemoving] = useState<EnrichedVisit | null>(null);
  const visits = [...(q.data ?? [])].sort((a, b) => a.visitDate.localeCompare(b.visitDate) || (a.routeOrder ?? 0) - (b.routeOrder ?? 0));

  return (
    <Card id={VISITS_CARD_ID} tabIndex={-1} className="scroll-mt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="card-ticket-visits">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm">{t("scheduling.visits", "Visits")}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setDialog({ mode: "schedule" })} data-testid="button-add-visit">
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
          {t("scheduling.addVisit", "Add visit")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {q.isError ? (
          <div className="flex items-center justify-between gap-2 text-sm text-destructive" role="alert">
            <span>{t("scheduling.visitsError", "Couldn't load visits.")}</span>
            <Button size="sm" variant="outline" onClick={() => void q.refetch()} data-testid="button-retry-visits">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("scheduling.retry", "Retry")}
            </Button>
          </div>
        ) : !q.data ? (
          <div className="space-y-2" data-testid="skeleton-ticket-visits"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
        ) : visits.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-visits">{t("scheduling.noVisits", "No visits yet.")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {visits.map(v => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm transition-colors hover:bg-muted/40" data-testid={`row-ticket-visit-${v.id}`}>
                <span className="font-medium tabular-nums">{fmtDay(v.visitDate)}</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: v.crew?.color ?? "hsl(var(--muted-foreground))" }} />
                  {v.crew?.name ?? t("scheduling.noCrew", "No crew")}
                </span>
                <Badge variant="secondary" className={`no-default-hover-elevate ${STATUS_STYLE[v.status] ?? ""}`}>{statusLabel(v.status, t)}</Badge>
                {v.routeOrder != null && <span className="text-xs text-muted-foreground">{t("scheduling.stop", "Stop")} {v.routeOrder}</span>}
                <span className="ml-auto flex gap-1">
                  {isOpenVisit(v) && (
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "move", visit: v })} data-testid={`button-move-visit-${v.id}`}>{t("scheduling.move", "Move")}</Button>
                  )}
                  {v.status === "planned" && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoving(v)} data-testid={`button-remove-visit-${v.id}`}>{t("scheduling.remove", "Remove")}</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <VisitDialog
        mode={dialog?.mode ?? "schedule"}
        open={!!dialog}
        onOpenChange={o => { if (!o) setDialog(null); }}
        ticket={{ id: ticketId, title: ticketTitle }}
        visit={dialog?.visit ?? null}
      />
      <AlertDialog open={!!removing} onOpenChange={o => { if (!o) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scheduling.removeTitle", "Remove from schedule?")}</AlertDialogTitle>
            <AlertDialogDescription>{removing ? `${fmtDay(removing.visitDate)} · ${removing.crew?.name ?? ""}` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              data-testid="button-confirm-remove-visit"
              onClick={() => {
                const v = removing;
                setRemoving(null);
                if (v) void removeVisit(v.id, { ticketId });
              }}
            >
              {t("scheduling.remove", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
