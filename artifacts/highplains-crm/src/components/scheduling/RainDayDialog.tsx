import { useEffect, useState } from "react";
import { CloudRain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRouteActions } from "@/hooks/use-routes";
import { fmtShortDate, rainDayBody, weekdayName, type RainMode } from "@/lib/routes";
import { parseCalendarDate } from "@/lib/schedulingStatus";
import type { BoardCrew } from "@/lib/scheduling";

export function RainDayDialog({ date, crews, onOpenChange }: { date: string | null; crews: BoardCrew[]; onOpenChange: (open: boolean) => void }) {
  const [crew, setCrew] = useState("all");
  const [mode, setMode] = useState<RainMode>("week");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const actions = useRouteActions();
  useEffect(() => { if (date) { setCrew("all"); setMode("week"); } }, [date]);
  const dow = date ? parseCalendarDate(date).getDay() : 1;
  const dayName = date ? weekdayName(dow === 0 ? 7 : dow) : "";

  const submit = async () => {
    if (!date) return;
    setBusy(true);
    const res = await actions.slide(rainDayBody(date, crew, mode));
    setBusy(false);
    if (!res) return;
    toast({ title: `Rain day applied`, description: `${res.moved} route ${res.moved === 1 ? "visit" : "visits"} moved.` });
    onOpenChange(false);
  };

  return (
    <Dialog open={!!date} onOpenChange={o => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md" data-testid="dialog-rain-day">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CloudRain className="h-5 w-5 text-primary" />Rain day, {dayName} {fmtShortDate(date)}</DialogTitle>
          <DialogDescription>Only route stops move. One-off ticket jobs stay where they are.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Crew</span>
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={crew} onChange={e => setCrew(e.target.value)} data-testid="select-rain-crew">
              <option value="all">All crews</option>
              {crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2" role="radiogroup" aria-label="What moves">
            {([
              ["week", "Push the rest of the week back one day", `Route stops from ${dayName} through the end of the week each move one working day later. Sunday is skipped.`],
              ["day", "Move only this day to the next working day", `Only ${dayName}'s route stops move, to the next working day. The rest of the week stays put.`],
            ] as const).map(([k, title, help]) => (
              <label key={k} className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${mode === k ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                <input type="radio" name="rain-mode" className="mt-1" checked={mode === k} onChange={() => setMode(k)} data-testid={`radio-rain-${k}`} />
                <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted-foreground">{help}</span></span>
              </label>
            ))}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} data-testid="button-rain-cancel">Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy} data-testid="button-rain-confirm">{busy ? "Moving…" : "Move route stops"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
