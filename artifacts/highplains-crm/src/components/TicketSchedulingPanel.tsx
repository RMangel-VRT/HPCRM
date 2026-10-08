import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarClock, Check, CornerUpLeft, Loader2, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerField } from "@/components/DatePickerField";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { extractApiErrorMessage, parseApiValidationError } from "@/lib/apiError";
import { localDateString } from "@shared/scheduleBy";
import {
  addDaysYmd,
  companyToday,
  invalidateTicketScheduling,
  isBeforeCompanyToday,
  parseCalendarDate,
} from "@/lib/schedulingStatus";

function formatYmd(ymd: string): string {
  return format(parseCalendarDate(ymd), "EEE MMM d");
}

function useSchedulingMutation(ticketId: string, customerId: string | null | undefined) {
  const { toast } = useToast();
  const { t } = useTranslation();
  return {
    toast,
    t,
    onError: (error: Error) =>
      toast({
        title: t("tickets.schedActionFailed"),
        description: parseApiValidationError(error).message ?? extractApiErrorMessage(error) ?? error.message,
        variant: "destructive" as const,
      }),
    refresh: () => invalidateTicketScheduling(queryClient, ticketId, customerId),
  };
}

interface SchedulingPanelProps {
  ticketId: string;
  customerId?: string | null;
  /** New Task/Project and viewer is the assignee, admin or office. */
  canRespond: boolean;
  /** Status is ready_to_schedule or scheduled and the viewer can edit follow-up. */
  canWait: boolean;
  followUpDate: string | null;
  followUpNote: string | null;
  creatorName: string | null;
  scheduledStatusId?: string;
  /** Returned tickets leave the owner's scope; don't leave them on a forbidden detail page. */
  onSentBack?: () => void;
}

export function TicketSchedulingPanel({
  ticketId, customerId, canRespond, canWait, followUpDate, followUpNote, creatorName, scheduledStatusId, onSentBack,
}: SchedulingPanelProps) {
  const { toast, t, onError, refresh } = useSchedulingMutation(ticketId, customerId);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackNote, setSendBackNote] = useState("");
  const [waitOpen, setWaitOpen] = useState(false);
  const [waitDate, setWaitDate] = useState<Date | undefined>(undefined);
  const [waitNote, setWaitNote] = useState("");

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/tickets/${ticketId}/accept`, {});
      return response.json() as Promise<{ currentStatusId: string }>;
    },
    onSuccess: (accepted) => {
      refresh();
      toast({ title: t(accepted.currentStatusId === scheduledStatusId ? "tickets.schedAcceptedScheduled" : "tickets.schedAccepted") });
    },
    onError,
  });

  const sendBackMutation = useMutation({
    mutationFn: (note: string) => apiRequest("POST", `/api/tickets/${ticketId}/send-back`, { note }),
    onSuccess: () => {
      refresh();
      setSendBackOpen(false);
      setSendBackNote("");
      toast({
        title: t("tickets.schedSentBack", { name: creatorName ?? t("tickets.schedSentBackFallback") }),
      });
      onSentBack?.();
    },
    onError,
  });

  const followUpMutation = useMutation({
    mutationFn: (body: { followUpDate: string | null; followUpNote: string | null }) =>
      apiRequest("PATCH", `/api/tickets/${ticketId}`, body),
    onSuccess: (_res, vars) => {
      refresh();
      setWaitOpen(false);
      toast({ title: vars.followUpDate ? t("tickets.followUpSet") : t("tickets.followUpCleared") });
    },
    onError,
  });

  const openWaiting = () => {
    // Default follow-up is three days out, counted in the company (Colorado) day.
    setWaitDate(parseCalendarDate(addDaysYmd(companyToday(), 3)));
    setWaitNote(followUpNote ?? "");
    setWaitOpen(true);
  };

  const trimmedNote = sendBackNote.trim();
  const hasFollowUp = !!followUpDate;
  if (!canRespond && !canWait && !hasFollowUp) return null;

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
        data-testid="panel-ticket-scheduling"
      >
        {canRespond && (
          <>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              data-testid="button-accept-ticket"
            >
              {acceptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("tickets.schedAccept")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setSendBackOpen(true)}
              disabled={acceptMutation.isPending}
              data-testid="button-send-back-ticket"
            >
              <CornerUpLeft className="h-4 w-4" />
              {t("tickets.schedSendBack")}
            </Button>
          </>
        )}
        {hasFollowUp && followUpDate && (
          <>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium ${isBeforeCompanyToday(followUpDate) ? "border-destructive text-destructive" : ""}`}
              title={followUpNote ?? undefined}
              data-testid="pill-ticket-waiting"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {t("tickets.waitingPill", { date: formatYmd(followUpDate) })}
            </span>
            {(canWait || canRespond) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => followUpMutation.mutate({ followUpDate: null, followUpNote: null })}
                disabled={followUpMutation.isPending}
                data-testid="button-customer-replied"
              >
                {followUpMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                {t("tickets.customerReplied")}
              </Button>
            )}
          </>
        )}
        {canWait && !hasFollowUp && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={openWaiting}
            data-testid="button-waiting-on-customer"
          >
            <CalendarClock className="h-4 w-4" />
            {t("tickets.waitingOnCustomer")}
          </Button>
        )}
      </div>

      <Dialog open={sendBackOpen} onOpenChange={(open) => { setSendBackOpen(open); if (!open) setSendBackNote(""); }}>
        <DialogContent data-testid="dialog-send-back">
          <DialogHeader>
            <DialogTitle>{t("tickets.schedSendBackTitle")}</DialogTitle>
            <DialogDescription>{t("tickets.schedSendBackDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="send-back-note">{t("tickets.schedSendBackNote")}</Label>
            <Textarea
              id="send-back-note"
              value={sendBackNote}
              onChange={(e) => setSendBackNote(e.target.value)}
              placeholder={t("tickets.schedSendBackPlaceholder")}
              maxLength={1000}
              rows={4}
              data-testid="input-send-back-note"
            />
            {sendBackNote.length > 0 && trimmedNote.length === 0 && (
              <p className="text-xs text-destructive">{t("tickets.schedSendBackRequired")}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendBackOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => sendBackMutation.mutate(trimmedNote)}
              disabled={trimmedNote.length === 0 || sendBackMutation.isPending}
              data-testid="button-confirm-send-back"
            >
              {sendBackMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("tickets.schedSendBack")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={waitOpen} onOpenChange={setWaitOpen}>
        <DialogContent data-testid="dialog-waiting">
          <DialogHeader>
            <DialogTitle>{t("tickets.waitingDialogTitle")}</DialogTitle>
            <DialogDescription>{t("tickets.waitingDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("tickets.followUpDate")}</Label>
              <DatePickerField value={waitDate} onChange={setWaitDate} data-testid="input-follow-up-date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="follow-up-note">{t("tickets.followUpNote")}</Label>
              <Textarea
                id="follow-up-note"
                value={waitNote}
                onChange={(e) => setWaitNote(e.target.value)}
                placeholder={t("tickets.followUpNotePlaceholder")}
                maxLength={1000}
                rows={3}
                data-testid="input-follow-up-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaitOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => waitDate && followUpMutation.mutate({
                followUpDate: localDateString(waitDate),
                followUpNote: waitNote.trim() || null,
              })}
              disabled={!waitDate || followUpMutation.isPending}
              data-testid="button-save-follow-up"
            >
              {followUpMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("tickets.followUpSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ScheduleByFactProps {
  ticketId: string;
  customerId?: string | null;
  scheduleBy: string | null;
  /** Status is new or ready_to_schedule: past dates read as overdue. */
  overdueEligible: boolean;
  canEdit: boolean;
}

/** Schedule-by value cell for the detail facts strip. */
export function ScheduleByFact({ ticketId, customerId, scheduleBy, overdueEligible, canEdit }: ScheduleByFactProps) {
  const { toast, t, onError, refresh } = useSchedulingMutation(ticketId, customerId);
  const mutation = useMutation({
    mutationFn: (value: string) => apiRequest("PATCH", `/api/tickets/${ticketId}`, { scheduleBy: value }),
    onSuccess: () => {
      refresh();
      toast({ title: t("tickets.scheduleByUpdated") });
    },
    onError,
  });
  const overdue = overdueEligible && isBeforeCompanyToday(scheduleBy);

  return (
    <div className="flex items-center gap-1.5" data-testid="fact-schedule-by">
      <span className={overdue ? "font-semibold text-destructive" : undefined} data-testid="text-schedule-by">
        {scheduleBy ? formatYmd(scheduleBy) : t("tickets.scheduleByNotSet")}
        {overdue && ` · ${t("tickets.scheduleByOverdue")}`}
      </span>
      {canEdit && (
        <DatePickerField
          compact
          value={scheduleBy ? parseCalendarDate(scheduleBy) : undefined}
          onChange={(date) => { if (date && !mutation.isPending) mutation.mutate(localDateString(date)); }}
          disabled={mutation.isPending}
          placeholder={t("tickets.scheduleByEdit")}
          data-testid="input-schedule-by"
        />
      )}
    </div>
  );
}
