import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useSearch } from "wouter";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection, useDndContext, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VisitDialog, type VisitDialogMode, type VisitDialogVisit } from "@/components/scheduling/VisitDialog";
import { CrewDaySheet, TONE_CLASS } from "@/components/scheduling/CrewDaySheet";
import { QueueCard, QueueCardBody, VisitCard, VisitCardBody, queueDisplayType, queueDisplayFilterIdentity, type DragData } from "@/components/scheduling/SchedulingCards";
import "@/components/scheduling/scheduling-board.css";
import { typeHueVar } from "@shared/ticketVisuals";
import { useAuth } from "@/hooks/use-auth";
import { useBoardCrews, useSchedulingQueue, useVisitActions, useWeekSummary, useWeekVisits } from "@/hooks/use-scheduling";
import { useSchedulingDragScroll } from "@/hooks/use-scheduling-drag-scroll";
import {
  SERVICE_OPTIONS, capacityTone, fmtDay, fmtHours, isOpenVisit, mondayOf, moveInList, serviceLabel, sortRoute,
  weekDays, weekFromSearch, weekToSearch, type BoardCrew, type EnrichedVisit, type QueueItem,
} from "@/lib/scheduling";
import {
  QUEUE_GROUP_ORDER, boardKeyboardCoordinates, capacityBarColor, capacityPct, groupQueue, isoWeekNumber, keepOverlayInViewport, prefersReducedMotion,
} from "@/lib/schedulingBoard";
import { addDaysYmd, companyToday, parseCalendarDate } from "@/lib/schedulingStatus";

export type { DragData };

const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  // Pointer drops are defined by the pointer, not the wide card's rectangle.
  // Off-board drops do nothing. Keyboard drags have no pointer: rect fallback.
  const list = args.pointerCoordinates ? hits : rectIntersection(args);
  return [...list].sort((a, b) => Number(String(b.id).startsWith("visit:")) - Number(String(a.id).startsWith("visit:")));
};

export interface PendingDrop { key: string; crewId: string; date: string; data: Extract<DragData, { kind: "queue" | "visit" }>; slipped: boolean; reordering?: boolean }

const LEGEND = [
  { typeKey: "project", name: "Project", label: "scheduling.legendProject" },
  { typeKey: "task", name: "Task", label: "scheduling.legendTask" },
  { typeKey: "estimate_request", name: "Estimate Request", label: "scheduling.legendEstimate" },
] as const;

function BoardCell({ crewId, date, children, isToday, isLast, empty }: { crewId: string; date: string; children: ReactNode; isToday: boolean; isLast: boolean; empty: boolean }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${crewId}:${date}`, data: { kind: "cell", crewId, date } satisfies DragData });
  const { over } = useDndContext();
  const target = over?.data.current as DragData | undefined;
  const visitOver = target?.kind === "visit" && target.visit.crewId === crewId && target.visit.visitDate.slice(0, 10) === date;
  return (
    <div ref={setNodeRef} className="sb-cell" data-over={isOver || visitOver} data-today={isToday} data-last={isLast} data-testid={`cell-${crewId}-${date}`}>
      {children}
      {empty && <div className="sb-empty" data-testid={`empty-cell-${crewId}-${date}`}>{t("scheduling.dropHere", "Drop a job here")}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- page */
export default function SchedulingPage() {
  const { user } = useAuth();
  // Remount on company switch so dialogs, sheet, drag and pending state never leak across companies.
  return <SchedulingBoardPage key={user?.activeCompanyId ?? "none"} />;
}

function SchedulingBoardPage() {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, d) as string;
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  const search = useSearch();
  const [, navigate] = useLocation();
  const today = companyToday();
  const week = weekFromSearch(search, today);
  const [showSun, setShowSun] = useState(false);
  const [service, setService] = useState("");
  const [tab, setTab] = useState<"needs" | "slipped">("needs");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [queueOpen, setQueueOpen] = useState(true);
  const [dialog, setDialog] = useState<{ mode: VisitDialogMode; ticket?: { id: string; title: string } | null; visit?: VisitDialogVisit | null; crewId?: string; date?: string } | null>(null);
  const [removing, setRemoving] = useState<EnrichedVisit | null>(null);
  const [sheet, setSheet] = useState<{ crewId: string; date: string } | null>(null);
  const [active, setActive] = useState<DragData | null>(null);
  const [pendingDrops, setPendingDrops] = useState<PendingDrop[]>([]);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const queueListRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  useSchedulingDragScroll(!!active, pointerRef, [queueListRef, boardRef]);
  const boardCollision: CollisionDetection = args => {
    pointerRef.current = args.pointerCoordinates;
    return collision(args);
  };

  const days = useMemo(() => weekDays(week, showSun), [week, showSun]);
  const from = days[0];
  const to = days[days.length - 1];

  const queue = useSchedulingQueue(companyId);
  const crewsQ = useBoardCrews(companyId);
  const visitsQ = useWeekVisits(companyId, from, to, service);
  const summaryQ = useWeekSummary(companyId, from, to, service);
  const actions = useVisitActions();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );
  const goWeek = (monday: string) => navigate(`/dashboard/scheduling${weekToSearch(monday)}`);

  const crews: BoardCrew[] = crewsQ.data ?? [];
  const visits = useMemo(() => (visitsQ.data ?? []).filter(v => v.status !== "cancelled"), [visitsQ.data]);
  const cells = useMemo(() => {
    const m = new Map<string, EnrichedVisit[]>();
    for (const v of visits) {
      if (!v.crewId) continue;
      const k = `${v.crewId}|${v.visitDate.slice(0, 10)}`;
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    for (const [k, list] of m) m.set(k, [...sortRoute(list.filter(isOpenVisit)), ...list.filter(v => !isOpenVisit(v))]);
    return m;
  }, [visits]);
  const summaries = useMemo(() => new Map((summaryQ.data ?? []).map(s => [`${s.crewId}|${s.date.slice(0, 10)}`, s])), [summaryQ.data]);

  /* queue filtering */
  const rawItems = (tab === "needs" ? queue.data?.needsScheduling : queue.data?.slipped) ?? [];
  const typeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of [...(queue.data?.needsScheduling ?? []), ...(queue.data?.slipped ?? [])]) {
      const display = queueDisplayType(i);
      if (display) m.set(queueDisplayFilterIdentity(i), display.name);
    }
    return [...m.entries()];
  }, [queue.data]);
  const needle = q.trim().toLowerCase();
  const items = rawItems.filter(i =>
    (!service || i.serviceType === service) &&
    (!typeFilter || queueDisplayFilterIdentity(i) === typeFilter) &&
    (!needle || (i.customer?.name ?? "").toLowerCase().includes(needle) || i.title.toLowerCase().includes(needle)));
  const groups = groupQueue(items, today);

  const reorderCell = (crewId: string, date: string, openIds: string[]) =>
    actions.reorderCrewDay({ crewId, visitDate: date, visibleIds: openIds, filtered: !!service });
  const shiftVisit = (v: EnrichedVisit, dir: -1 | 1) => {
    const list = (cells.get(`${v.crewId}|${v.visitDate.slice(0, 10)}`) ?? []).filter(isOpenVisit);
    const i = list.findIndex(x => x.id === v.id);
    if (i < 0 || i + dir < 0 || i + dir >= list.length) return;
    void reorderCell(v.crewId as string, v.visitDate.slice(0, 10), moveInList(list.map(x => x.id), i, i + dir));
  };

  /** Presentation-only target copy while a drop request is in flight; never touches the cache. */
  const withPending = (p: Omit<PendingDrop, "key">, run: () => Promise<unknown>) => {
    const key = `${p.data.kind}:${p.data.kind === "queue" ? p.data.item.id : p.data.visit.id}:${Date.now()}`;
    setPendingDrops(list => [...list, { ...p, key }]);
    void run().finally(() => setPendingDrops(list => list.filter(x => x.key !== key)));
  };

  const onDragStart = (e: DragStartEvent) => {
    setActive((e.active.data.current as DragData | undefined) ?? null);
  };
  const clearDrag = () => { setActive(null); pointerRef.current = null; };

  const onDragEnd = (e: DragEndEvent) => {
    clearDrag();
    const a = e.active.data.current as DragData | undefined;
    const o = e.over?.data.current as DragData | undefined;
    if (!a || !o) return;
    const target = o.kind === "cell" ? { crewId: o.crewId, date: o.date } : o.kind === "visit" ? { crewId: o.visit.crewId, date: o.visit.visitDate.slice(0, 10) } : null;
    if (!target || !target.crewId) return;
    const crewId = target.crewId;
    const crewName = crews.find(c => c.id === crewId)?.name;
    if (a.kind === "queue") {
      const ctx = { ticketTitle: a.item.title, ticketId: a.item.id, crewName };
      const visit = a.item.visit;
      withPending({ crewId, date: target.date, data: a, slipped: !!visit }, () => visit
        ? actions.patchVisit(visit.id, { crewId, visitDate: target.date }, ctx)
        : actions.createVisit({ ticketId: a.item.id, crewId, visitDate: target.date }, ctx));
    } else if (a.kind === "visit") {
      const v = a.visit;
      const sameCell = v.crewId === crewId && v.visitDate.slice(0, 10) === target.date;
      if (sameCell) {
        if (o.kind !== "visit" || o.visit.id === v.id) return;
        const ids = (cells.get(`${crewId}|${target.date}`) ?? []).filter(isOpenVisit).map(x => x.id);
        const from0 = ids.indexOf(v.id);
        const to0 = ids.indexOf(o.visit.id);
        if (from0 < 0 || to0 < 0) return;
        withPending({ crewId, date: target.date, data: a, slipped: false, reordering: true }, () =>
          reorderCell(crewId, target.date, moveInList(ids, from0, to0)));
      } else {
        withPending({ crewId, date: target.date, data: a, slipped: false }, () =>
          actions.patchVisit(v.id, { crewId, visitDate: target.date }, { ticketTitle: v.ticket?.title ?? v.title ?? undefined, ticketId: v.ticketId, crewName }));
      }
    }
  };

  const sheetCrew = sheet ? crews.find(c => c.id === sheet.crewId) ?? null : null;
  const sheetVisits = sheet ? cells.get(`${sheet.crewId}|${sheet.date}`) ?? [] : [];
  const needsCount = queue.data?.needsScheduling.length ?? 0;
  const slippedCount = queue.data?.slipped.length ?? 0;
  const lng = t("scheduling.dateLocale", "en-US") as string;
  const weekday = (d: string) => parseCalendarDate(d).toLocaleDateString(lng, { weekday: "short" });
  const dayNum = (d: string) => parseCalendarDate(d).getDate();
  const rangeLabel = `${fmtDay(from)} – ${fmtDay(to)}, ${parseCalendarDate(to).getFullYear()}`;
  const reduced = prefersReducedMotion();
  const groupLabel = { past: t("scheduling.groupPast", "Past schedule-by"), week: t("scheduling.groupWeek", "Due this week"), later: t("scheduling.groupLater", "Later") };
  const openSchedule = (it: QueueItem) => it.visit
    ? setDialog({ mode: "move", ticket: { id: it.id, title: it.title }, visit: { id: it.visit.id, crewId: it.visit.crewId, visitDate: it.visit.visitDate } })
    : setDialog({ mode: "schedule", ticket: { id: it.id, title: it.title } });

  const overlay = (
    <DragOverlay style={{ width: 260, height: "auto" }} modifiers={[keepOverlayInViewport]} transition={reduced ? "none" : undefined} dropAnimation={reduced ? null : { duration: 160, easing: "ease-out" }} zIndex={1000}>
      {active?.kind === "queue" ? (
        <div className="sb-card" data-lifted="true" data-testid="drag-overlay">
          <QueueCardBody item={active.item} slipped={!!active.item.visit} today={today} mode="lifted" />
        </div>
      ) : active?.kind === "visit" ? (
        <div className="sb-card" data-lifted="true" data-testid="drag-overlay">
          <VisitCardBody visit={active.visit} stopNo={null} />
        </div>
      ) : null}
    </DragOverlay>
  );

  return (
    <div className="sb-page" data-testid="page-scheduling">
      <div className="sb-header" data-testid="scheduling-header">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays className="h-5 w-5 text-primary" />{t("nav.scheduling", "Scheduling")}</h1>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => goWeek(addDaysYmd(week, -7))} aria-label={t("scheduling.prevWeek", "Previous week")} data-testid="button-prev-week"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => goWeek(addDaysYmd(week, 7))} aria-label={t("scheduling.nextWeek", "Next week")} data-testid="button-next-week"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" className="h-8" onClick={() => goWeek(mondayOf(today))} data-testid="button-today">{t("scheduling.today", "Today")}</Button>
        </div>
        <span className="text-sm font-medium tabular-nums" data-testid="text-week-range">{rangeLabel}</span>
        <span className="text-sm text-muted-foreground tabular-nums" data-testid="text-week-number">{t("scheduling.weekNumber", { n: isoWeekNumber(week), defaultValue: "Week {{n}}" })}</span>
        <span className="flex-1" />
        <div className="sb-legend" data-testid="type-legend">
          {LEGEND.map(l => (
            <span key={l.typeKey} className="flex items-center gap-1.5" data-testid={`legend-${l.typeKey}`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: typeHueVar({ name: l.name, typeKey: l.typeKey }) }} />
              {t(l.label, l.name === "Estimate Request" ? "Estimate" : l.name)}
            </span>
          ))}
        </div>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm transition-colors"
          value={service} onChange={e => setService(e.target.value)}
          aria-label={t("scheduling.service", "Service")} data-testid="select-service-filter"
        >
          <option value="">{t("scheduling.allServices", "All services")}</option>
          {SERVICE_OPTIONS.map(s => <option key={s.key} value={s.key}>{serviceLabel(s.key, tr)}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showSun} onChange={e => setShowSun(e.target.checked)} data-testid="toggle-sunday" />
          {t("scheduling.sun", "Sun")}
        </label>
      </div>

      <DndContext
        sensors={sensors} collisionDetection={boardCollision}
        onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={clearDrag}
        // The bounded pane scroller stays active even when the hovered cell changes.
        // Disable the ancestor-based implementation to avoid competing scroll loops.
        autoScroll={{ enabled: false, layoutShiftCompensation: false }}
      >
        <div className="sb-work">
          {/* queue */}
          <aside className="sb-queue" data-open={queueOpen} data-print-hide data-testid="panel-queue">
            <Button variant="ghost" className="sb-queue-toggle m-2 justify-between" onClick={() => setQueueOpen(o => !o)} aria-expanded={queueOpen} data-testid="button-toggle-queue">
              <span>{t("scheduling.queue", "Queue")} ({needsCount + slippedCount})</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {queueOpen ? t("scheduling.hide", "Hide") : t("scheduling.show", "Show")}
                <ChevronDown className={`h-4 w-4 transition-transform ${queueOpen ? "rotate-180" : ""}`} />
              </span>
            </Button>
            <div className="sb-queue-body flex min-h-0 flex-1 flex-col">
              <div className="space-y-2 p-3 pb-1">
                <div role="tablist" className="grid grid-cols-2 gap-1 rounded-md bg-background/70 p-1 text-sm">
                  {([["needs", t("scheduling.needsScheduling", "Needs scheduling"), needsCount], ["slipped", t("scheduling.slipped", "Slipped"), slippedCount]] as const).map(([k, label, n]) => (
                    <button
                      key={k} type="button" role="tab" aria-selected={tab === k}
                      className={`rounded px-2 py-1 transition-colors ${tab === k ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setTab(k)} data-testid={`tab-queue-${k}`}
                    >{label} ({n})</button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="bg-background pl-8" value={q} onChange={e => setQ(e.target.value)} placeholder={t("scheduling.searchQueue", "Search property or title")} data-testid="input-queue-search" />
                </div>
                <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label={t("scheduling.type", "Type")} data-testid="select-queue-type">
                  <option value="">{t("scheduling.allTypes", "All types")}</option>
                  {typeOptions.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
              </div>
              <div ref={queueListRef} className="sb-queue-list" data-testid="list-queue">
                {queue.isError ? (
                  <div className="space-y-2 rounded-md border border-destructive/40 bg-card p-3 text-sm" role="alert">
                    <div className="sb-danger flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t("scheduling.queueError", "Couldn't load the queue.")}</div>
                    <Button size="sm" variant="outline" onClick={() => void queue.refetch()} data-testid="button-retry-queue"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("scheduling.retry", "Retry")}</Button>
                  </div>
                ) : !queue.data ? (
                  <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
                ) : items.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-card/60 p-4 text-center text-sm text-muted-foreground" data-testid="text-queue-empty">
                    {tab === "needs" ? t("scheduling.emptyNeeds", "Nothing waiting for a crew.") : t("scheduling.emptySlipped", "No visits slipped.")}
                  </p>
                ) : (
                  QUEUE_GROUP_ORDER.filter(g => groups[g].length > 0).map(g => (
                    <section key={g} className="mb-2" data-testid={`queue-group-${g}`}>
                      <h3 className={`mb-1.5 mt-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider ${g === "past" ? "sb-danger" : "text-muted-foreground"}`}>
                        <span>{groupLabel[g]}</span>
                        <span className="tabular-nums" data-testid={`queue-group-count-${g}`}>{groups[g].length}</span>
                      </h3>
                      {groups[g].map(i => (
                        <QueueCard key={i.id + (i.visit?.id ?? "")} item={i} slipped={tab === "slipped"} today={today} onSchedule={openSchedule} />
                      ))}
                    </section>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* board */}
          <section className="flex min-h-0 min-w-0 flex-col" data-testid="panel-board">
          <div ref={boardRef} className="sb-board flex-1" data-testid="board-scroll">
            {crewsQ.isError || visitsQ.isError || summaryQ.isError ? (
              <div className="space-y-2 p-4 text-sm" role="alert">
                <div className="sb-danger flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t("scheduling.boardError", "Couldn't load the board.")}</div>
                <Button size="sm" variant="outline" onClick={() => { void crewsQ.refetch(); void visitsQ.refetch(); void summaryQ.refetch(); }} data-testid="button-retry-board"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("scheduling.retry", "Retry")}</Button>
              </div>
            ) : !crewsQ.data || !visitsQ.data || !summaryQ.data ? (
              <div className="space-y-3 p-4" data-testid="skeleton-board"><Skeleton className="h-8" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
            ) : crews.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-crews">
                {t("scheduling.noCrews", "No active crews yet. Add one in Settings → Crews.")}
              </p>
            ) : (
              <div className="sb-grid text-sm" style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(156px, 1fr))`, minWidth: 232 + days.length * 156 }} data-testid="board-grid">
                <div className="sb-corner">{t("scheduling.crew", "Crew").toUpperCase()}</div>
                {days.map(d => (
                  <div key={d} className="sb-dayhead" data-testid={`header-day-${d}`} data-today={d === today}>
                    {d === today ? (
                      <span className="sb-daypill flex items-baseline gap-1"><span className="text-[15px] font-bold tabular-nums">{dayNum(d)}</span><span className="text-xs">{weekday(d)} · {t("scheduling.todayLower", "today")}</span></span>
                    ) : (<><span className="sb-daynum">{dayNum(d)}</span><span>{weekday(d)}</span></>)}
                  </div>
                ))}
                {crews.map(crew => {
                  const color = crew.color;
                  const laneStyle = { "--crew": color } as CSSProperties;
                  let wkStops = 0, wkHours = 0, wkCap = 0;
                  for (const d of days) {
                    const s = summaries.get(`${crew.id}|${d}`);
                    wkStops += s?.visitCount ?? 0; wkHours += s?.plannedHours ?? 0; wkCap += s?.capacityHours ?? crew.defaultHoursPerDay ?? 8;
                  }
                  return (
                    <div key={crew.id} className="contents" style={laneStyle} data-testid={`lane-${crew.id}`} data-crew-color={color}>
                      <div className="sb-crew" style={laneStyle} data-testid={`row-crew-${crew.id}`}>
                        <div className="truncate font-semibold">{crew.name}</div>
                        {crew.supervisorName && <div className="truncate text-xs text-muted-foreground">{crew.supervisorName}</div>}
                        <div className="mt-1 text-[11px] tabular-nums text-muted-foreground" data-testid={`text-crew-week-${crew.id}`}>
                          {wkStops} {t("scheduling.stops", "stops")} · {fmtHours(wkHours)} / {fmtHours(wkCap)} h {t("scheduling.thisWeek", "this week")}
                        </div>
                      </div>
                      {days.map((d, di) => {
                        const key = `${crew.id}|${d}`;
                        const list = cells.get(key) ?? [];
                        const openList = list.filter(isOpenVisit);
                        const pend = pendingDrops.filter(p => p.crewId === crew.id && p.date === d
                          && !(!p.reordering && p.data.kind === "visit" && list.some(v => v.id === (p.data as { visit: EnrichedVisit }).visit.id)));
                        const s = summaries.get(key);
                        const hours = s?.plannedHours ?? 0;
                        const cap = s?.capacityHours ?? crew.defaultHoursPerDay ?? 8;
                        const tone = capacityTone(hours, cap);
                        const stops = s?.visitCount ?? 0;
                        return (
                          <div key={d} className="contents" style={laneStyle}>
                            <BoardCell crewId={crew.id} date={d} isToday={d === today} isLast={di === days.length - 1} empty={list.length === 0}>
                              <button
                                type="button" onClick={() => setSheet({ crewId: crew.id, date: d })}
                                className={`sb-cap ${TONE_CLASS[tone]}`} data-testid={`header-cell-${crew.id}-${d}`} data-tone={tone}
                              >
                                <span className="flex justify-between gap-2">
                                  <span>{stops} {stops === 1 ? t("scheduling.stopOne", "stop") : t("scheduling.stops", "stops")}</span>
                                  <span>{fmtHours(hours)} / {fmtHours(cap)} h</span>
                                </span>
                                <span className="sb-bar" aria-hidden>
                                  <span style={{ width: `${capacityPct(hours, cap)}%`, background: capacityBarColor(tone, color) }} data-testid={`capacity-bar-${crew.id}-${d}`} data-tone={tone} />
                                </span>
                              </button>
                              {list.map(v => (
                                <VisitCard
                                  key={v.id} visit={v} index={openList.findIndex(x => x.id === v.id)} openCount={openList.length}
                                  onEdit={x => setDialog({ mode: "edit", ticket: x.ticket ? { id: x.ticket.id, title: x.ticket.title } : null, visit: x })}
                                  onMove={x => setDialog({ mode: "move", ticket: x.ticket ? { id: x.ticket.id, title: x.ticket.title } : null, visit: x })}
                                  onRemove={setRemoving}
                                  onAdd={x => setDialog({ mode: "schedule", ticket: x.ticket ? { id: x.ticket.id, title: x.ticket.title } : null, crewId: crew.id, date: d })}
                                  onShift={shiftVisit}
                                />
                              ))}
                              {pend.map(p => (
                                <div key={p.key} className="sb-card sb-pending" data-pending="true" aria-hidden data-testid={`pending-drop-${p.data.kind === "queue" ? p.data.item.id : p.data.visit.id}`}>
                                  {p.data.kind === "queue"
                                    ? <QueueCardBody item={p.data.item} slipped={p.slipped} today={today} mode="pending" />
                                    : <VisitCardBody visit={p.data.visit} stopNo={null} />}
                                </div>
                              ))}
                            </BoardCell>
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
        {typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay}
      </DndContext>

      <VisitDialog
        mode={dialog?.mode ?? "schedule"} open={!!dialog} onOpenChange={o => { if (!o) setDialog(null); }}
        ticket={dialog?.ticket} visit={dialog?.visit} defaultCrewId={dialog?.crewId} defaultDate={dialog?.date}
      />
      <CrewDaySheet
        open={!!sheet} onOpenChange={o => { if (!o) setSheet(null); }}
        crew={sheetCrew} date={sheet?.date ?? null} visits={sheetVisits}
        summary={sheet ? summaries.get(`${sheet.crewId}|${sheet.date}`) : undefined}
        busy={actions.pending}
        onReorder={ids => sheet && void reorderCell(sheet.crewId, sheet.date, ids)}
      />
      <AlertDialog open={!!removing} onOpenChange={o => { if (!o) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scheduling.removeTitle", "Remove from schedule?")}</AlertDialogTitle>
            <AlertDialogDescription>{removing?.ticket?.title ?? removing?.title ?? ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-remove" onClick={() => { const v = removing; setRemoving(null); if (v) void actions.removeVisit(v.id, { ticketId: v.ticketId }); }}>
              {t("scheduling.remove", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
