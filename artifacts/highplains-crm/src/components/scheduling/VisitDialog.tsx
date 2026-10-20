import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/DatePickerField";
import { useBoardCrews, useVisitActions } from "@/hooks/use-scheduling";
import { calendarDateString, companyToday, parseCalendarDate } from "@/lib/schedulingStatus";

export type VisitDialogMode = "schedule" | "move" | "edit";
export interface VisitDialogVisit {
  id: string;
  crewId: string | null;
  visitDate: string;
  estimatedHours?: number | null;
  startTime?: string | null;
  notes?: string | null;
}

interface Props {
  mode: VisitDialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket?: { id: string; title: string } | null;
  visit?: VisitDialogVisit | null;
  defaultCrewId?: string | null;
  defaultDate?: string | null;
}

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function VisitDialog({ mode, open, onOpenChange, ticket, visit, defaultCrewId, defaultDate }: Props) {
  const { t } = useTranslation();
  const { companyId, createVisit, patchVisit, pending } = useVisitActions();
  const { data: crews = [] } = useBoardCrews(companyId, open && mode !== "edit");
  const [crewId, setCrewId] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [hours, setHours] = useState("");
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");
  const openedCompany = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    openedCompany.current = companyId;
    setCrewId(visit?.crewId ?? defaultCrewId ?? "");
    setDate(parseCalendarDate(visit?.visitDate ?? defaultDate ?? companyToday()));
    setHours(visit?.estimatedHours != null ? String(visit.estimatedHours) : "");
    setStartTime(visit?.startTime ?? "");
    setNotes(visit?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visit?.id, ticket?.id, defaultCrewId, defaultDate]);

  const hoursNum = hours.trim() === "" ? null : Number(hours);
  const hoursInvalid = hoursNum !== null && (!Number.isFinite(hoursNum) || hoursNum < 0 || hoursNum > 24);
  const needsPlace = mode !== "edit";
  const canSubmit = !pending && !hoursInvalid && (!needsPlace || (!!crewId && !!date)) && (mode !== "schedule" || !!ticket);

  const submit = async () => {
    if (!canSubmit) return;
    const visitDate = date ? calendarDateString(date) : undefined;
    const crewName = crews.find(c => c.id === crewId)?.name;
    const ctx = { companyId: openedCompany.current, ticketTitle: ticket?.title, ticketId: ticket?.id, crewName };
    let result: unknown;
    if (mode === "schedule" && ticket && visitDate) {
      const body: Record<string, unknown> = { ticketId: ticket.id, crewId, visitDate };
      if (hoursNum !== null) body.estimatedHours = hoursNum;
      if (startTime) body.startTime = startTime;
      if (notes.trim()) body.notes = notes.trim();
      result = await createVisit(body as never, ctx);
    } else if (mode === "move" && visit) {
      result = await patchVisit(visit.id, { crewId, visitDate }, ctx);
    } else if (mode === "edit" && visit) {
      result = await patchVisit(visit.id, { estimatedHours: hoursNum, startTime: startTime || null, notes: notes.trim() ? notes.trim() : null }, ctx);
    }
    if (result) onOpenChange(false);
  };

  const title = mode === "schedule" ? t("scheduling.scheduleTitle", "Schedule") : mode === "move" ? t("scheduling.moveTitle", "Move visit") : t("scheduling.editTitle", "Edit visit");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-visit">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="truncate">{ticket?.title ?? ""}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
          {needsPlace && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="visit-crew">{t("scheduling.crew", "Crew")}</Label>
                <select id="visit-crew" className={selectCls} value={crewId} onChange={e => setCrewId(e.target.value)} data-testid="select-visit-crew">
                  <option value="">{t("scheduling.chooseCrew", "Choose a crew")}</option>
                  {crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("scheduling.date", "Date")}</Label>
                <DatePickerField value={date} onChange={setDate} inlineClear={false} data-testid="input-visit-date" />
              </div>
            </>
          )}
          {mode !== "move" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="visit-hours">{t("scheduling.hours", "Estimated hours")}</Label>
                <Input id="visit-hours" type="number" inputMode="decimal" min={0} max={24} step={0.25} value={hours} onChange={e => setHours(e.target.value)} aria-invalid={hoursInvalid} data-testid="input-visit-hours" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visit-start">{t("scheduling.startTime", "Start time")}</Label>
                <Input id="visit-start" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} data-testid="input-visit-start" />
              </div>
            </div>
          )}
          {mode !== "move" && (
            <div className="space-y-1.5">
              <Label htmlFor="visit-notes">{t("scheduling.notes", "Notes")}</Label>
              <Textarea id="visit-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-visit-notes" />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-visit-cancel">{t("common.cancel", "Cancel")}</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="button-visit-submit">
              {mode === "schedule" ? t("scheduling.schedule", "Schedule") : t("common.save", "Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
