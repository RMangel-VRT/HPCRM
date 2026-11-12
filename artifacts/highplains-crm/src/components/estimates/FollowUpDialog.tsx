import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, MessageSquareText } from "lucide-react";
import type { EstimateActionTicket } from "@shared/schema";
import { denverToday, formatCalendarDate, isCalendarDate } from "@/lib/estimateBuilder";
import { formatCents } from "@/lib/hardscapeCatalog";
import { addDaysYmd } from "@/lib/estimateActionList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PICKS = [{ key: "d3", days: 3 }, { key: "w1", days: 7 }, { key: "w2", days: 14 }] as const;

export function FollowUpDialog(props: {
  ticket: EstimateActionTicket | null; busy: boolean; error: string | null;
  onClose: () => void; onSave: (b: { followUpDate: string; followUpNote: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const { ticket } = props;
  const open = !!ticket;
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => addDaysYmd(denverToday(), 7));
  const [dateErr, setDateErr] = useState(false);
  useEffect(() => { if (open) { setNote(""); setDate(addDaysYmd(denverToday(), 7)); setDateErr(false); } }, [open, ticket?.id]);
  const today = denverToday();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (props.busy) return;
    if (!isCalendarDate(date)) { setDateErr(true); return; }
    setDateErr(false);
    props.onSave({ followUpDate: date, followUpNote: note });
  }
  const est = ticket?.estimate;
  const parts = [
    est?.number ?? ticket?.estimateNumber,
    est && est.subtotalCents !== null ? formatCents(est.subtotalCents, i18n.language) : null,
    est?.sentAt ? t("estimateActions.followUp.sentOn", { date: formatCalendarDate(denverToday(new Date(est.sentAt)), i18n.language) }) : null,
    est?.validUntil ? t("estimateActions.followUp.validUntil", { date: formatCalendarDate(est.validUntil, i18n.language) }) : null,
  ].filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !props.busy) props.onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-follow-up">
        <DialogHeader>
          <DialogTitle>{t("estimateActions.followUp.title", { customer: ticket?.customer?.name ?? ticket?.title ?? "" })}</DialogTitle>
          <DialogDescription data-testid="text-follow-up-desc">{parts.join(" · ")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          {ticket?.followUpNote && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs" data-testid="text-follow-up-last">
              <p className="mb-0.5 flex items-center gap-1.5 font-semibold text-muted-foreground"><MessageSquareText className="h-3.5 w-3.5" />{t("estimateActions.followUp.lastNote")}</p>
              <p className="whitespace-pre-wrap">{ticket.followUpNote}</p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="follow-up-note">{t("estimateActions.followUp.what")}</Label>
            <Textarea id="follow-up-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t("estimateActions.followUp.placeholder")} data-testid="input-follow-up-note" />
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium"><CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />{t("estimateActions.followUp.next")}</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {PICKS.map((p) => {
                const v = addDaysYmd(today, p.days);
                return (
                  <button key={p.key} type="button" aria-pressed={date === v} onClick={() => { setDate(v); setDateErr(false); }} data-testid={`pick-follow-up-${p.key}`}
                    className={cn("inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      date === v ? "border-transparent bg-rail-active text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover")}>
                    {t(`estimateActions.followUp.${p.key}`)}
                  </button>
                );
              })}
              <Input type="date" aria-label={t("estimateActions.followUp.date")} value={date} min={today} aria-invalid={dateErr}
                onChange={(e) => setDate(e.target.value)} className="h-8 w-[160px] text-sm" data-testid="input-follow-up-date" />
            </div>
            {dateErr && <p className="text-xs font-medium text-destructive" data-testid="error-follow-up-date">{t("estimateActions.followUp.errDate")}</p>}
          </fieldset>
          {props.error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-follow-up">{props.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose} disabled={props.busy} data-testid="button-cancel-follow-up">{t("estimateBuilder.cancel")}</Button>
            <Button type="submit" disabled={props.busy} aria-busy={props.busy} data-testid="button-save-follow-up">
              {props.busy ? t("estimateBuilder.life.working") : t("estimateActions.followUp.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
