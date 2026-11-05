import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  DndContext, useDndContext, useDraggable, useDroppable,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, CalendarDays, CalendarRange, ExternalLink, RefreshCw, Route as RouteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RouteStopDrawer } from "@/components/routes/RouteStopDrawer";
import "@/components/scheduling/scheduling-board.css";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { BoardDayCell, BoardOverlay, CapacityMeter, CrewLaneHeader, useBoardDnd } from "@/components/scheduling/BoardPrimitives";
import { useRouteActions, useRouteCrews, useRouteNeeds, useRouteStatus, useRouteStops } from "@/hooks/use-routes";
import type { BoardCrew } from "@/lib/scheduling";
import { pointerFirstCollision } from "@/lib/schedulingBoard";
import {
  ROUTE_SERVICES, WEEKDAYS, cellStops, dayLoadHours, fmtH, fmtMinutes, fmtShortDate, isPaused, isRouteService, nextWeekdayDate,
  planRouteDrop, routeServiceLabel, seasonChip, type RouteDragData, serviceColorVar, weekdayName, weeklyTotals, type RouteNeed, type RouteServiceKey, type RouteStop,
} from "@/lib/routes";

type RDrag = RouteDragData;

const collision: CollisionDetection = pointerFirstCollision("stop:");

export default function RoutesPage() {
  const { user } = useAuth();
  return <RoutesBoard key={`${user?.id ?? "anon"}:${user?.activeCompanyId ?? "none"}`} />;
}

function svcStyle(k: string): CSSProperties { return { "--svc": serviceColorVar(k) } as CSSProperties; }

function StopRow({ stop, n, onOpen }: { stop: RouteStop; n: number; onOpen: (s: RouteStop) => void }) {
  const drag = useDraggable({ id: `stop:${stop.id}`, data: { kind: "stop", stop } satisfies RDrag });
  const drop = useDroppable({ id: `stop:${stop.id}`, data: { kind: "stop", stop } satisfies RDrag });
  const paused = isPaused(stop);
  return (
    <button
      type="button" ref={el => { drag.setNodeRef(el); drop.setNodeRef(el); }}
      className="rt-stop" style={{ ...svcStyle(stop.serviceKey), ...(drop.isOver && !drag.isDragging ? { boxShadow: "inset 0 0 0 2px hsl(var(--ring))" } : {}) }}
      data-source={drag.isDragging} data-paused={paused} {...drag.attributes} {...drag.listeners}
      onClick={() => onOpen(stop)} aria-roledescription="draggable route stop"
      aria-label={`${n}. ${stop.property?.name ?? "Property"}, ${fmtMinutes(stop.minutes)}${stop.everyWeeks === 2 ? ", every 2 weeks" : ""}`}
      data-testid={`row-stop-${stop.id}`}
    >
      <StopRowBody stop={stop} n={n} paused={paused} />
    </button>
  );
}
function StopRowBody({ stop, n, paused }: { stop: RouteStop; n: number | null; paused: boolean }) {
  return (
    <>
      <span className="w-4 shrink-0 text-right font-mono text-[10.5px] text-muted-foreground">{n ?? "–"}</span>
      <span className="min-w-0 flex-1 truncate">{stop.property?.name ?? "Property"}</span>
      {stop.everyWeeks === 2 && <span className="rt-tag" data-testid={`tag-every2-${stop.id}`}>Every 2 wks</span>}
      {paused && <span className="rt-tag" data-testid={`tag-paused-${stop.id}`}>Paused to {fmtShortDate(stop.pausedUntil)}</span>}
      <span className="shrink-0 tabular-nums text-muted-foreground">{fmtMinutes(stop.minutes)}</span>
    </>
  );
}

function NeedCard({ need }: { need: RouteNeed }) {
  const drag = useDraggable({ id: `need:${need.customerId}:${need.serviceKey}`, data: { kind: "need", need } satisfies RDrag });
  return (
    <div ref={drag.setNodeRef} className="rt-need" style={svcStyle(need.serviceKey)} data-source={drag.isDragging} {...drag.attributes} {...drag.listeners}
      aria-roledescription="draggable property" data-testid={`card-need-${need.customerId}`}>
      <NeedBody need={need} />
    </div>
  );
}
function NeedBody({ need }: { need: RouteNeed }) {
  return (
    <>
      <div className="truncate font-semibold">{need.name}</div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{routeServiceLabel(need.serviceKey)}</span>
        {need.minutes != null && <span className="tabular-nums">about {fmtMinutes(need.minutes)}</span>}
      </div>
      {need.contract?.sourceDescription && <div className="mt-0.5 text-[11px]" data-testid={`text-need-source-${need.customerId}`}>{need.contract.sourceDescription}</div>}
      {need.contract && (
        <div className="text-[11px] tabular-nums text-muted-foreground" data-testid={`text-need-terms-${need.customerId}`}>
          {need.contract.quantity != null ? `${need.contract.quantity} visits` : "Quantity not set"}
          {need.contract.window ? ` · ${fmtShortDate(need.contract.window.start)} – ${fmtShortDate(need.contract.window.end)}` : ""}
        </div>
      )}
    </>
  );
}

function WeekCell({ crewId, weekday, children, empty, dragging }: { crewId: string; weekday: number; children: ReactNode; empty: boolean; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${crewId}:${weekday}`, data: { kind: "cell", crewId, weekday } satisfies RDrag });
  const { over } = useDndContext();
  const t = over?.data.current as RDrag | undefined;
  const stopOver = t?.kind === "stop" && t.stop.crewId === crewId && t.stop.weekday === weekday;
  return (
    <BoardDayCell nodeRef={setNodeRef} over={isOver || !!stopOver} empty={empty} dragging={dragging} hint="Drop a stop here" data-last={weekday === 6} data-testid={`cell-${crewId}-${weekday}`}>
      {children}
    </BoardDayCell>
  );
}

function RoutesBoard() {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  const search = useSearch();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const params = new URLSearchParams(search);
  const rawSvc = params.get("service");
  const service: RouteServiceKey = isRouteService(rawSvc) ? rawSvc : "mowing";
  const setService = (k: string) => navigate(`/dashboard/routes?service=${k}`);
  const [showSat, setShowSat] = useState(false);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [create, setCreate] = useState<{ need: RouteNeed; crewId: string; weekday: number } | null>(null);
  const [createForm, setCreateForm] = useState({ minutes: 60, everyWeeks: 1 });
  const [pause, setPause] = useState<{ stopId: string; name: string; until: string } | null>(null);
  const [removeEnd, setRemoveEnd] = useState<{ stopId: string; name: string } | null>(null);
  const [active, setActive] = useState<RDrag | null>(null);
  const [pendingMoves, setPendingMoves] = useState<Set<string>>(new Set());
  const boardRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const { sensors, boardCollision, resetPointer } = useBoardDnd(!!active, [paneRef, boardRef], collision);

  const status = useRouteStatus(service);
  const stopsQ = useRouteStops();
  const needsQ = useRouteNeeds(service);
  const crewsQ = useRouteCrews(companyId);
  const actions = useRouteActions();


  const crews: BoardCrew[] = crewsQ.data ?? [];
  const allStops = useMemo(() => (stopsQ.data ?? []).filter(s => s.isActive), [stopsQ.data]);
  const days = WEEKDAYS.filter(w => w.n <= (showSat ? 6 : 5));
  const needs = (needsQ.data ?? []).filter(n => n.reason !== "Route ends with contract");
  const ends = (needsQ.data ?? []).filter(n => n.reason === "Route ends with contract");
  const drawerStop = drawer ? allStops.find(s => s.id === drawer) ?? null : null;

  const fill = async () => {
    const r = await actions.fill();
    if (r) toast({ title: "Calendar filled", description: `${r.created} route ${r.created === 1 ? "visit" : "visits"} added${r.through ? ` through ${fmtShortDate(r.through)}` : ""}. Existing visits were left as they are.` });
  };

  const clearDrag = () => { setActive(null); resetPointer(); };
  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as RDrag | undefined) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    clearDrag();
    const plan = planRouteDrop(e.active.data.current as RDrag | undefined, e.over?.data.current as RDrag | undefined, allStops);
    if (plan.kind === "create") {
      setCreateForm({ minutes: plan.need.minutes ?? 60, everyWeeks: 1 });
      setCreate({ need: plan.need, crewId: plan.crewId, weekday: plan.weekday });
    } else if (plan.kind === "reorder") {
      void actions.reorder({ crewId: plan.crewId, weekday: plan.weekday, serviceKey: plan.serviceKey, stopIds: plan.stopIds });
    } else if (plan.kind === "move") {
      const id = plan.stopId;
      setPendingMoves(p => new Set(p).add(id));
      void actions.patchStop(id, { crewId: plan.crewId, weekday: plan.weekday })
        .finally(() => setPendingMoves(p => { const n = new Set(p); n.delete(id); return n; }));
    }
  };

  const confirmCreate = async () => {
    if (!create) return;
    const c = create;
    setCreate(null);
    const row = await actions.createStop({
      customerId: c.need.customerId, serviceKey: c.need.serviceKey, crewId: c.crewId, weekday: c.weekday,
      everyWeeks: createForm.everyWeeks, minutes: createForm.minutes, anchorDate: nextWeekdayDate(c.weekday),
    });
    if (row) toast({ title: "Stop added", description: `${c.need.name} on ${weekdayName(c.weekday)}. Applies to visits not yet on the calendar.` });
  };
  const minutesInvalid = !Number.isInteger(createForm.minutes) || createForm.minutes < 5 || createForm.minutes > 720;
  const season = status.data ? seasonChip(status.data.season) : null;
  const latest = status.data?.latestVisitDate;

  const overlay = (
    <BoardOverlay width={240}>
      {active?.kind === "stop" ? <div className="rt-stop" style={svcStyle(active.stop.serviceKey)} data-testid="drag-overlay"><StopRowBody stop={active.stop} n={null} paused={isPaused(active.stop)} /></div>
        : active?.kind === "need" ? <div className="rt-need" style={svcStyle(active.need.serviceKey)} data-testid="drag-overlay"><NeedBody need={active.need} /></div> : null}
    </BoardOverlay>
  );

  const loading = !stopsQ.data || !crewsQ.data;
  const boardError = stopsQ.isError || crewsQ.isError;

  return (
    <div className="sb-page" data-testid="page-routes">
      <div className="sb-header" data-testid="routes-header">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><RouteIcon className="h-5 w-5 text-primary" />Routes</h1>
        <div role="tablist" aria-label="Service" className="flex flex-wrap gap-1 rounded-md bg-muted/60 p-1 text-sm">
          {ROUTE_SERVICES.map(s => (
            <button key={s.key} type="button" role="tab" aria-selected={service === s.key} onClick={() => setService(s.key)}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${service === s.key ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-service-${s.key}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: serviceColorVar(s.key) }} aria-hidden />{s.label}
            </button>
          ))}
        </div>
        {status.isError ? <span className="text-xs text-destructive" data-testid="text-status-error">Status unavailable</span> : !status.data ? <Skeleton className="h-6 w-48" /> : (
          <>
            <span className="rounded-full border px-2.5 py-0.5 text-xs" data-testid="chip-season">{season ?? "No season for this service"}</span>
            <span className="rounded-full border px-2.5 py-0.5 text-xs" data-testid="chip-filled">{latest ? `Calendar filled through ${fmtShortDate(latest)}` : "Nothing on the calendar yet"}</span>
          </>
        )}
        <span className="flex-1" />
        <Button size="sm" onClick={() => void fill()} disabled={actions.pending} data-testid="button-fill"><CalendarRange className="mr-1.5 h-4 w-4" />Fill next 3 weeks</Button>
      </div>
      <div className="flex items-center gap-4 border-b px-4 text-sm" role="tablist">
        <span role="tab" aria-selected="true" className="border-b-2 border-primary py-2 font-medium" data-testid="tab-weekly">Weekly pattern</span>
        {user?.activeRole !== "irrigation_manager" && <Link href={`/dashboard/scheduling?service=${service}`} className="flex items-center gap-1 py-2 text-muted-foreground hover:text-foreground" data-testid="link-on-calendar">
          <CalendarDays className="h-4 w-4" />On the calendar
        </Link>}
        <span className="flex-1" />
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSat} onChange={e => setShowSat(e.target.checked)} data-testid="toggle-saturday" />Saturday</label>
      </div>

      <DndContext sensors={sensors} collisionDetection={boardCollision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={clearDrag}
        autoScroll={{ enabled: false, layoutShiftCompensation: false }}>
        <div className="sb-work">
          <aside className="sb-queue" data-testid="panel-needs">
            <div ref={paneRef} className="sb-queue-list space-y-4 pt-3">
              <section data-testid="section-needs-contracts">
                <h3 className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>From contracts</span><span className="tabular-nums" data-testid="count-needs">{needs.length}</span></h3>
                {needsQ.isError ? <ErrorRow onRetry={() => void needsQ.refetch()} /> : !needsQ.data ? <Skeleton className="h-16" />
                  : needs.length === 0 ? <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Every contracted property has a route.</p>
                  : <div className="space-y-1.5">{needs.map(n => <NeedCard key={n.customerId} need={n} />)}</div>}
              </section>
              <section data-testid="section-route-ends">
                <h3 className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Route ends with contract</span><span className="tabular-nums">{ends.length}</span></h3>
                {ends.length === 0 ? <p className="text-xs text-muted-foreground">None.</p> : ends.map(n => (
                  <div key={n.customerId} className="rt-need mb-1.5 cursor-default" style={svcStyle(n.serviceKey)} data-testid={`card-end-${n.customerId}`}>
                    <div className="truncate font-semibold">{n.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {n.stopId && <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setPause({ stopId: n.stopId!, name: n.name, until: "" })} data-testid={`button-pause-${n.customerId}`}>Pause</Button>}
                      {n.stopId && <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive" onClick={() => setRemoveEnd({ stopId: n.stopId!, name: n.name })} data-testid={`button-remove-end-${n.customerId}`}>Remove</Button>}
                      {n.contract ? <Link href={`/dashboard/contracts/${n.contract.agreementId}`} className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline" data-testid={`link-end-contract-${n.customerId}`}>Contract<ExternalLink className="h-3 w-3" /></Link>
                        : <Link href={`/dashboard/customers/${n.customerId}`} className="text-xs text-primary hover:underline" data-testid={`link-end-contract-${n.customerId}`}>Property contracts</Link>}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col" data-testid="panel-board">
            <div ref={boardRef} className="sb-board flex-1" data-testid="board-scroll">
              {boardError ? (
                <div className="p-4"><ErrorRow onRetry={() => { void stopsQ.refetch(); void crewsQ.refetch(); }} /></div>
              ) : loading ? (
                <div className="space-y-3 p-4" data-testid="skeleton-board"><Skeleton className="h-8" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
              ) : crews.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-crews">No active crews yet. Add one in Settings → Crews.</p>
              ) : (
                <div className="sb-grid text-sm" style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(176px, 1fr))`, minWidth: 232 + days.length * 176 } as CSSProperties} data-testid="board-grid">
                  <div className="sb-corner">CREW</div>
                  {days.map(d => <div key={d.n} className="sb-dayhead" data-testid={`header-weekday-${d.n}`}><span className="font-semibold text-foreground">{d.long}</span></div>)}
                  {crews.map(crew => {
                    const laneStyle = { "--crew": crew.color } as CSSProperties;
                    const wk = weeklyTotals(allStops, crew.id);
                    const cap = crew.defaultHoursPerDay ?? 8;
                    return (
                      <div key={crew.id} className="contents" style={laneStyle} data-testid={`lane-${crew.id}`}>
                        <CrewLaneHeader crew={crew} style={laneStyle} testId={`row-crew-${crew.id}`} summaryTestId={`text-crew-week-${crew.id}`}
                          summary={<>{wk.stops} stops · {fmtH(wk.hours)} h a week</>} />
                        {days.map(d => {
                          const list = cellStops(allStops, crew.id, d.n, service).filter(s => !pendingMoves.has(s.id));
                          const hours = dayLoadHours(allStops, crew.id, d.n);
                          return (
                            <div key={d.n} className="contents" style={laneStyle}>
                              <WeekCell crewId={crew.id} weekday={d.n} empty={list.length === 0} dragging={!!active}>
                                <CapacityMeter left={<>{list.length} {list.length === 1 ? "stop" : "stops"}</>} hours={hours} cap={cap} crewColor={crew.color} fmt={fmtH}
                                  testId={`capacity-${crew.id}-${d.n}`} barTestId={`capacity-bar-${crew.id}-${d.n}`} title="All services' stops this weekday against crew hours" />
                                {list.map((s, i) => <StopRow key={s.id} stop={s} n={i + 1} onOpen={x => setDrawer(x.id)} />)}
                              </WeekCell>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
        {overlay}
      </DndContext>

      <RouteStopDrawer stop={drawerStop} crews={crews} onClose={() => setDrawer(null)} />

      <Dialog open={!!create} onOpenChange={o => { if (!o) setCreate(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-new-stop">
          <DialogHeader>
            <DialogTitle>Add {create?.need.name} to the route</DialogTitle>
            <DialogDescription>{create && `${crews.find(c => c.id === create.crewId)?.name ?? "Crew"} · ${weekdayName(create.weekday)} · ${routeServiceLabel(create.need.serviceKey)}`}</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm"><span className="font-medium">Minutes on site</span>
            <Input type="number" min={5} max={720} step={5} value={createForm.minutes} onChange={e => setCreateForm(f => ({ ...f, minutes: Number(e.target.value) }))} data-testid="input-new-minutes" />
          </label>
          <div className="flex gap-2" role="radiogroup" aria-label="Cadence">
            {[1, 2].map(n => <Button key={n} type="button" size="sm" variant={createForm.everyWeeks === n ? "default" : "outline"} aria-pressed={createForm.everyWeeks === n} onClick={() => setCreateForm(f => ({ ...f, everyWeeks: n }))} data-testid={`button-new-cadence-${n}`}>{n === 1 ? "Every week" : "Every 2 weeks"}</Button>)}
          </div>
          <p className="text-xs text-muted-foreground">Applies to visits not yet on the calendar. Fill adds them.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreate(null)} data-testid="button-new-cancel">Cancel</Button>
            <Button onClick={() => void confirmCreate()} disabled={minutesInvalid} data-testid="button-new-confirm">Add stop</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pause} onOpenChange={o => { if (!o) setPause(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-pause">
          <DialogHeader><DialogTitle>Pause {pause?.name}</DialogTitle><DialogDescription>No new visits are generated before this date. Applies to visits not yet on the calendar.</DialogDescription></DialogHeader>
          <Input type="date" value={pause?.until ?? ""} onChange={e => setPause(p => p && { ...p, until: e.target.value })} data-testid="input-pause-until" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPause(null)}>Cancel</Button>
            <Button disabled={!pause?.until} onClick={() => { const p = pause; setPause(null); if (p) void actions.patchStop(p.stopId, { pausedUntil: p.until }); }} data-testid="button-pause-confirm">Pause</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeEnd} onOpenChange={o => { if (!o) setRemoveEnd(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeEnd?.name} from the route?</AlertDialogTitle>
            <AlertDialogDescription>Its future planned route visits are cancelled. Completed and past visits are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const r = removeEnd; setRemoveEnd(null); if (r) void actions.removeStop(r.stopId); }} data-testid="button-confirm-remove-end">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ErrorRow({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-card p-3 text-sm" role="alert">
      <div className="sb-danger flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Couldn't load this.</div>
      <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>
    </div>
  );
}
