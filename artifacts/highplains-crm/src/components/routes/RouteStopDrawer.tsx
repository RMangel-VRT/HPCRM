import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { CalendarSync, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useRouteActions, useRouteProgress, type StopInput } from "@/hooks/use-routes";
import { MONTH_INITIALS, WEEKDAYS, fmtMinutes, fmtShortDate, routeServiceLabel, serviceColorVar, type RouteStop } from "@/lib/routes";
import type { BoardCrew } from "@/lib/scheduling";

export const EFFECT_NOTE = "Applies to visits not yet on the calendar.";

export function MonthStrip({ spread, serviceKey }: { spread: readonly number[] | null | undefined; serviceKey: string }) {
  if (!spread || spread.length !== 12) return <p className="text-xs text-muted-foreground" data-testid="text-month-strip-empty">No contract month spread.</p>;
  return (
    <div className="rt-months" style={{ "--svc": serviceColorVar(serviceKey) } as CSSProperties} data-testid="month-strip">
      {spread.map((n, i) => (
        <span key={i} data-on={n > 0} data-testid={`month-${i + 1}`}><i>{n > 0 ? n : ""}</i>{MONTH_INITIALS[i]}</span>
      ))}
    </div>
  );
}

export function RouteStopDrawer({ stop, crews, onClose }: { stop: RouteStop | null; crews: BoardCrew[]; onClose: () => void }) {
  const actions = useRouteActions();
  const { toast } = useToast();
  const progress = useRouteProgress(stop?.customerId, stop?.serviceKey ?? "mowing", stop?.reportYear);
  const [form, setFormState] = useState<Required<Pick<StopInput, "crewId" | "weekday" | "everyWeeks" | "minutes">> & { seasonStart: string; seasonEnd: string; pausedUntil: string }>(
    { crewId: "", weekday: 1, everyWeeks: 1, minutes: 60, seasonStart: "", seasonEnd: "", pausedUntil: "" });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const stopId = stop?.id;
  const dirty = useRef(false);
  const lastId = useRef<string | null>(null);
  const setForm: typeof setFormState = v => { dirty.current = true; setFormState(v); };

  // Reinitialise on a new stop, or when server data changes and the user has no unsaved edits.
  useEffect(() => {
    if (!stop) { lastId.current = null; return; }
    const isNew = lastId.current !== stop.id;
    if (!isNew && dirty.current) return;
    lastId.current = stop.id; dirty.current = false;
    setFormState({ crewId: stop.crewId, weekday: stop.weekday, everyWeeks: stop.everyWeeks, minutes: stop.minutes,
      seasonStart: stop.seasonStart ?? "", seasonEnd: stop.seasonEnd ?? "", pausedUntil: stop.pausedUntil ?? "" });
    if (isNew) setSavedAt(null);
  }, [stopId, stop?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stop) return <Sheet open={false} onOpenChange={() => onClose()}><SheetContent /></Sheet>;
  const override = !!stop.seasonStart && !!stop.seasonEnd;
  const contract = stop.contract ?? progress.data?.contract ?? null;
  const minutesInvalid = !Number.isInteger(form.minutes) || form.minutes < 5 || form.minutes > 720;
  const seasonInvalid = !!form.seasonStart !== !!form.seasonEnd || (!!form.seasonStart && form.seasonStart > form.seasonEnd);

  const save = async (patch?: StopInput) => {
    const body: StopInput = patch ?? {};
    if (!patch) {
      if (form.crewId !== stop.crewId) body.crewId = form.crewId;
      if (form.weekday !== stop.weekday) body.weekday = form.weekday;
      if (form.everyWeeks !== stop.everyWeeks) body.everyWeeks = form.everyWeeks;
      if (form.minutes !== stop.minutes) body.minutes = form.minutes;
      if ((form.seasonStart || null) !== stop.seasonStart || (form.seasonEnd || null) !== stop.seasonEnd) { body.seasonStart = form.seasonStart || null; body.seasonEnd = form.seasonEnd || null; }
      if ((form.pausedUntil || null) !== stop.pausedUntil) body.pausedUntil = form.pausedUntil || null;
    }
    if (!Object.keys(body).length) return;
    const row = await actions.patchStop(stop.id, body);
    if (row) { dirty.current = false; setSavedAt(row.updatedAt); toast({ title: "Stop updated", description: EFFECT_NOTE }); }
  };

  const apply = async () => {
    setConfirmApply(false);
    // Latest timestamp we know: the server row (refetched) or our own PATCH response, whichever is newer.
    const expected = savedAt && savedAt > stop.updatedAt ? savedAt : stop.updatedAt;
    const res = await actions.applyCalendar(stop.id, expected);
    if (res) toast({ title: "Calendar updated", description: `${res.moved} moved · ${res.cancelled} cancelled · ${res.unchanged} unchanged` });
  };
  const remove = async () => {
    setConfirmRemove(false);
    const res = await actions.removeStop(stop.id);
    if (res) { toast({ title: "Removed from route", description: `${res.cancelled} future planned ${res.cancelled === 1 ? "visit" : "visits"} cancelled.` }); onClose(); }
  };
  const p = progress.data;

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="drawer-route-stop" style={{ "--svc": serviceColorVar(stop.serviceKey) } as CSSProperties}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: "var(--svc)" }} aria-hidden />
            {stop.property && stop.customerId
              ? <Link href={`/dashboard/customers/${stop.customerId}`} className="hover:underline" data-testid="link-stop-property">{stop.property.name}</Link>
              : <span>{stop.property?.name ?? "Property"}</span>}
          </SheetTitle>
          <SheetDescription data-testid="text-stop-summary">
            {routeServiceLabel(stop.serviceKey)} · {stop.crew?.name ?? "Crew"} · {WEEKDAYS.find(w => w.n === stop.weekday)?.long} · {stop.everyWeeks === 2 ? "Every 2 weeks" : "Every week"} · {fmtMinutes(stop.minutes)} on site
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5 text-sm">
          <section className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Season</h3>
            <p data-testid="text-stop-season">
              {stop.season ? `${fmtShortDate(stop.season.start)} – ${fmtShortDate(stop.season.end)}` : "No season"}{" "}
              <span className="rounded border px-1 text-[11px]">{override ? "override" : "from contract"}</span>
            </p>
          </section>

          <section className="space-y-2" data-testid="section-progress">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contract progress</h3>
            {progress.isError ? (
              <div className="flex items-center gap-2 text-destructive">Couldn't load progress.<Button size="sm" variant="outline" onClick={() => void progress.refetch()} data-testid="button-retry-progress">Retry</Button></div>
            ) : !p ? <Skeleton className="h-10" /> : (
              <>
                <p className="text-base font-semibold tabular-nums" data-testid="text-progress-done">
                  {p.done} of {p.quantity ?? "–"} visits done
                </p>
                <p className="text-xs tabular-nums text-muted-foreground" data-testid="text-progress-detail">{p.planned} planned · {p.skipped} skipped</p>
              </>
            )}
            <MonthStrip spread={contract?.monthSpread} serviceKey={stop.serviceKey} />
            {contract && (
              <Link href={`/dashboard/contracts/${contract.agreementId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" data-testid="link-stop-contract">
                {contract.seasonLabel || "Governing contract"}<ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Change day or crew</h3>
            <div className="grid grid-cols-2 gap-2">
              <select className="h-9 rounded-md border border-input bg-background px-2" value={form.crewId} onChange={e => setForm(f => ({ ...f, crewId: e.target.value }))} aria-label="Crew" data-testid="select-stop-crew">
                {crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {!crews.some(c => c.id === form.crewId) && <option value={form.crewId}>{stop.crew?.name ?? "Current crew"}</option>}
              </select>
              <select className="h-9 rounded-md border border-input bg-background px-2" value={form.weekday} onChange={e => setForm(f => ({ ...f, weekday: Number(e.target.value) }))} aria-label="Weekday" data-testid="select-stop-weekday">
                {WEEKDAYS.map(w => <option key={w.n} value={w.n}>{w.long}</option>)}
              </select>
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label="Cadence">
              {[1, 2].map(n => (
                <Button key={n} type="button" size="sm" variant={form.everyWeeks === n ? "default" : "outline"} aria-pressed={form.everyWeeks === n} onClick={() => setForm(f => ({ ...f, everyWeeks: n }))} data-testid={`button-cadence-${n}`}>
                  {n === 1 ? "Every week" : "Every 2 weeks"}
                </Button>
              ))}
            </div>
            <label className="block space-y-1"><span className="text-xs font-medium">Time on site (minutes)</span>
              <Input type="number" min={5} max={720} step={5} value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: Number(e.target.value) }))} data-testid="input-stop-minutes" />
            </label>
            <div className="space-y-1">
              <span className="text-xs font-medium">Season override</span>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={form.seasonStart} onChange={e => setForm(f => ({ ...f, seasonStart: e.target.value }))} aria-label="Season start" data-testid="input-season-start" />
                <Input type="date" value={form.seasonEnd} onChange={e => setForm(f => ({ ...f, seasonEnd: e.target.value }))} aria-label="Season end" data-testid="input-season-end" />
              </div>
              {override && <Button type="button" variant="ghost" size="sm" className="h-auto p-0 text-primary underline-offset-2 hover:underline" onClick={() => void save({ seasonStart: null, seasonEnd: null })} data-testid="button-reset-season">Reset to from contract</Button>}
            </div>
            <label className="block space-y-1"><span className="text-xs font-medium">Pause until…</span>
              <Input type="date" value={form.pausedUntil} onChange={e => setForm(f => ({ ...f, pausedUntil: e.target.value }))} data-testid="input-paused-until" />
            </label>
            <p className="text-xs text-muted-foreground" data-testid="text-effect-note">{EFFECT_NOTE}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void save()} disabled={actions.pending || minutesInvalid || seasonInvalid} data-testid="button-save-stop">Save changes</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmApply(true)} disabled={actions.pending || dirty.current} title={dirty.current ? "Save your changes first" : undefined} data-testid="button-apply-calendar">
                <CalendarSync className="mr-1.5 h-3.5 w-3.5" />Also update visits already on the calendar
              </Button>
            </div>
            {(minutesInvalid || seasonInvalid) && <p className="text-xs text-destructive" role="alert">{minutesInvalid ? "Minutes must be between 5 and 720." : "Supply both season dates in order, or clear both."}</p>}
          </section>

          <Button variant="outline" className="w-full text-destructive" onClick={() => setConfirmRemove(true)} disabled={actions.pending} data-testid="button-remove-stop">
            <Trash2 className="mr-1.5 h-4 w-4" />Remove from route
          </Button>
        </div>

        <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Update visits already on the calendar?</AlertDialogTitle>
              <AlertDialogDescription>Only this stop's future planned route visits move or are cancelled to match. Done, skipped, cancelled, in-progress and past visits stay as they are. Ticket jobs are never touched.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void apply()} data-testid="button-confirm-apply">Update calendar</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {stop.property?.name ?? "this property"} from the route?</AlertDialogTitle>
              <AlertDialogDescription>The stop stops generating visits. Its future planned route visits are cancelled; completed and past visits are kept.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void remove()} data-testid="button-confirm-remove-stop">Remove</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
