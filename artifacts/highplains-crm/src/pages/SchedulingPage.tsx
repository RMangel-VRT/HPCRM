import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  DndContext, PointerSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, GripVertical, MoreHorizontal, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VisitDialog, type VisitDialogMode, type VisitDialogVisit } from "@/components/scheduling/VisitDialog";
import { CrewDaySheet, TONE_CLASS } from "@/components/scheduling/CrewDaySheet";
import { useAuth } from "@/hooks/use-auth";
import { useBoardCrews, useSchedulingQueue, useVisitActions, useWeekSummary, useWeekVisits } from "@/hooks/use-scheduling";
import {
  SERVICE_OPTIONS, capacityTone, fmtDay, fmtHours, isOpenVisit, mondayOf, moveInList, serviceLabel, sortRoute,
  weekDays, weekFromSearch, weekToSearch, statusLabel, type BoardCrew, type EnrichedVisit, type QueueItem,
} from "@/lib/scheduling";
import { addDaysYmd, companyToday, parseCalendarDate } from "@/lib/schedulingStatus";

type DragData =
  | { kind: "queue"; item: QueueItem }
  | { kind: "visit"; visit: EnrichedVisit }
  | { kind: "cell"; crewId: string; date: string };

const collision: CollisionDetection = args => {
  const hits = pointerWithin(args);
  // Pointer drops are defined by the pointer, not the wide queue card's
  // rectangle (which can overlap an adjacent day). Off-board drops do nothing.
  const list = args.pointerCoordinates ? hits : rectIntersection(args);
  return [...list].sort((a, b) => Number(String(b.id).startsWith("visit:")) - Number(String(a.id).startsWith("visit:")));
};

const STATUS_DOT: Record<string, string> = {
  planned: "bg-sky-500", in_progress: "bg-amber-500", done: "bg-emerald-600", skipped: "bg-zinc-400", cancelled: "bg-zinc-300",
};

/* ------------------------------------------------------------------ queue */
function scheduleByTone(scheduleBy: string | null): string {
  if (!scheduleBy) return "text-muted-foreground";
  const today = companyToday();
  const d = scheduleBy.slice(0, 10);
  if (d < today) return "text-red-700 dark:text-red-400 font-semibold";
  if (d <= addDaysYmd(today, 2)) return "text-amber-700 dark:text-amber-400 font-semibold";
  return "text-muted-foreground";
}

function QueueCard({ item, slipped, onSchedule }: { item: QueueItem; slipped: boolean; onSchedule: (i: QueueItem) => void }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, d) as string;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `queue:${item.id}`, data: { kind: "queue", item } satisfies DragData });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`rounded-md border bg-card p-2.5 text-sm shadow-xs transition-shadow hover:shadow-sm ${isDragging ? "relative z-50 opacity-80 shadow-lg" : ""}`}
      data-testid={`card-queue-${item.id}`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("scheduling.dragJob", "Drag to schedule")}
          data-testid={`handle-queue-${item.id}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" data-testid={`text-queue-property-${item.id}`}>{item.customer?.name ?? t("scheduling.noProperty", "No property")}</div>
          <Link href={`/dashboard/tickets/${item.id}`} className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline" data-testid={`link-queue-ticket-${item.id}`}>
            {item.title}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {item.typeName && <Badge variant="outline" className="no-default-hover-elevate px-1.5 py-0 text-[10px]">{item.typeName}</Badge>}
            {(item.priority === "high" || item.priority === "urgent") && (
              <Badge variant="destructive" className="no-default-hover-elevate px-1.5 py-0 text-[10px] capitalize" data-testid={`badge-queue-priority-${item.id}`}>{t(`priorities.${item.priority}`, item.priority)}</Badge>
            )}
            {item.serviceType && <Badge variant="secondary" className="no-default-hover-elevate px-1.5 py-0 text-[10px]">{serviceLabel(item.serviceType, tr)}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {item.scheduleBy && (
              <span className={scheduleByTone(item.scheduleBy)} data-testid={`text-queue-scheduleby-${item.id}`}>
                {t("scheduling.scheduleBy", "Schedule by")} {fmtDay(item.scheduleBy.slice(0, 10))}
              </span>
            )}
            {slipped && item.visit && (
              <span className="text-red-700 dark:text-red-400" data-testid={`text-queue-slipped-${item.id}`}>
                {t("scheduling.wasDue", "Was due")} {fmtDay(item.visit.visitDate)}{item.visit.crewName ? ` · ${item.visit.crewName}` : ""}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => onSchedule(item)} data-testid={`button-queue-schedule-${item.id}`}>
          {slipped ? t("scheduling.moveEllipsis", "Move…") : t("scheduling.scheduleEllipsis", "Schedule…")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ board */
function VisitCard({
  visit, index, openCount, onEdit, onMove, onRemove, onAdd, onShift,
}: {
  visit: EnrichedVisit; index: number; openCount: number;
  onEdit: (v: EnrichedVisit) => void; onMove: (v: EnrichedVisit) => void; onRemove: (v: EnrichedVisit) => void; onAdd: (v: EnrichedVisit) => void;
  onShift: (v: EnrichedVisit, dir: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, d) as string;
  const [, navigate] = useLocation();
  const open = isOpenVisit(visit);
  const drag = useDraggable({ id: `visit:${visit.id}`, data: { kind: "visit", visit } satisfies DragData, disabled: !open });
  const drop = useDroppable({ id: `visit:${visit.id}`, data: { kind: "visit", visit } satisfies DragData, disabled: !open });
  const isTicket = visit.sourceType === "ticket" && !!visit.ticketId;
  const label = visit.sourceType === "ticket" ? visit.ticket?.typeName : visit.sourceType.replace("_", " ");
  return (
    <div
      ref={n => { drag.setNodeRef(n); drop.setNodeRef(n); }}
      style={{ transform: CSS.Translate.toString(drag.transform) }}
      className={`rounded border bg-card p-1.5 text-xs transition-shadow hover:shadow-sm ${open ? "" : "bg-muted/60 text-muted-foreground"} ${drag.isDragging ? "relative z-50 opacity-80 shadow-lg" : ""} ${drop.isOver && !drag.isDragging ? "ring-2 ring-primary" : ""}`}
      data-testid={`card-visit-${visit.id}`}
      data-status={visit.status}
    >
      <div className="flex items-start gap-1">
        {open ? (
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none rounded text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t("scheduling.dragVisit", "Drag visit")}
            data-testid={`handle-visit-${visit.id}`}
            {...drag.listeners}
            {...drag.attributes}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="w-3.5" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[visit.status] ?? "bg-zinc-400"}`} title={statusLabel(visit.status, t)} data-testid={`dot-visit-${visit.id}`} />
            {isTicket ? (
              <Link href={`/dashboard/tickets/${visit.ticketId}`} className="truncate font-medium hover:underline" data-testid={`link-visit-ticket-${visit.id}`}>
                {visit.customer?.name ?? visit.ticket?.title ?? visit.title}
              </Link>
            ) : (
              <span className="truncate font-medium">{visit.customer?.name ?? visit.title ?? t("scheduling.untitled", "Untitled visit")}</span>
            )}
          </div>
          <div className="truncate">{visit.ticket?.title ?? visit.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {label && <Badge variant="outline" className="no-default-hover-elevate px-1 py-0 text-[9px] capitalize">{label}</Badge>}
            {visit.serviceKey && <Badge variant="secondary" className="no-default-hover-elevate px-1 py-0 text-[9px]">{serviceLabel(visit.serviceKey, tr)}</Badge>}
            {visit.estimatedHours != null && <span className="tabular-nums">{fmtHours(visit.estimatedHours)} h</span>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={t("scheduling.visitMenu", "Visit actions")} data-testid={`button-visit-menu-${visit.id}`}>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isTicket && <DropdownMenuItem onSelect={() => navigate(`/dashboard/tickets/${visit.ticketId}`)} data-testid={`menu-open-job-${visit.id}`}>{t("scheduling.openJob", "Open job")}</DropdownMenuItem>}
            {open && <DropdownMenuItem onSelect={() => onEdit(visit)} data-testid={`menu-edit-${visit.id}`}>{t("common.edit", "Edit")}</DropdownMenuItem>}
            {open && <DropdownMenuItem onSelect={() => onMove(visit)} data-testid={`menu-move-${visit.id}`}>{t("scheduling.moveEllipsis", "Move…")}</DropdownMenuItem>}
            {open && index > 0 && <DropdownMenuItem onSelect={() => onShift(visit, -1)} data-testid={`menu-up-${visit.id}`}>{t("scheduling.moveUp", "Move up")}</DropdownMenuItem>}
            {open && index < openCount - 1 && <DropdownMenuItem onSelect={() => onShift(visit, 1)} data-testid={`menu-down-${visit.id}`}>{t("scheduling.moveDown", "Move down")}</DropdownMenuItem>}
            {isTicket && <DropdownMenuItem onSelect={() => onAdd(visit)} data-testid={`menu-add-${visit.id}`}>{t("scheduling.addAnother", "Add another visit")}</DropdownMenuItem>}
            {visit.status === "planned" && <DropdownMenuItem className="text-destructive" onSelect={() => onRemove(visit)} data-testid={`menu-remove-${visit.id}`}>{t("scheduling.removeFromSchedule", "Remove from schedule")}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function BoardCell({ crewId, date, children, isToday }: { crewId: string; date: string; children: React.ReactNode; isToday: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${crewId}:${date}`, data: { kind: "cell", crewId, date } satisfies DragData });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[84px] space-y-1 border-l p-1 transition-colors ${isOver ? "bg-primary/10" : isToday ? "bg-primary/[0.04]" : ""}`}
      data-testid={`cell-${crewId}-${date}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- page */
export default function SchedulingPage() {
  const { user } = useAuth();
  // Remount on company switch so dialogs, sheet and removal state never leak across companies.
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

  const days = useMemo(() => weekDays(week, showSun), [week, showSun]);
  const from = days[0];
  const to = days[days.length - 1];

  const queue = useSchedulingQueue(companyId);
  const crewsQ = useBoardCrews(companyId);
  const visitsQ = useWeekVisits(companyId, from, to, service);
  const summaryQ = useWeekSummary(companyId, from, to, service);
  const actions = useVisitActions();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
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
    for (const i of [...(queue.data?.needsScheduling ?? []), ...(queue.data?.slipped ?? [])]) if (i.typeKey) m.set(i.typeKey, i.typeName ?? i.typeKey);
    return [...m.entries()];
  }, [queue.data]);
  const needle = q.trim().toLowerCase();
  const items = rawItems.filter(i =>
    (!service || i.serviceType === service) &&
    (!typeFilter || i.typeKey === typeFilter) &&
    (!needle || (i.customer?.name ?? "").toLowerCase().includes(needle) || i.title.toLowerCase().includes(needle)));

  const reorderCell = (crewId: string, date: string, openIds: string[]) =>
    actions.reorderCrewDay({ crewId, visitDate: date, visibleIds: openIds, filtered: !!service });
  const shiftVisit = (v: EnrichedVisit, dir: -1 | 1) => {
    const list = (cells.get(`${v.crewId}|${v.visitDate.slice(0, 10)}`) ?? []).filter(isOpenVisit);
    const i = list.findIndex(x => x.id === v.id);
    if (i < 0 || i + dir < 0 || i + dir >= list.length) return;
    void reorderCell(v.crewId as string, v.visitDate.slice(0, 10), moveInList(list.map(x => x.id), i, i + dir));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const a = e.active.data.current as DragData | undefined;
    const o = e.over?.data.current as DragData | undefined;
    if (!a || !o) return;
    const target = o.kind === "cell" ? { crewId: o.crewId, date: o.date } : o.kind === "visit" ? { crewId: o.visit.crewId, date: o.visit.visitDate.slice(0, 10) } : null;
    if (!target || !target.crewId) return;
    const crewName = crews.find(c => c.id === target.crewId)?.name;
    if (a.kind === "queue") {
      const ctx = { ticketTitle: a.item.title, ticketId: a.item.id, crewName };
      if (a.item.visit) void actions.patchVisit(a.item.visit.id, { crewId: target.crewId, visitDate: target.date }, ctx);
      else void actions.createVisit({ ticketId: a.item.id, crewId: target.crewId, visitDate: target.date }, ctx);
    } else if (a.kind === "visit") {
      const v = a.visit;
      const sameCell = v.crewId === target.crewId && v.visitDate.slice(0, 10) === target.date;
      if (sameCell) {
        if (o.kind !== "visit" || o.visit.id === v.id) return;
        const ids = (cells.get(`${target.crewId}|${target.date}`) ?? []).filter(isOpenVisit).map(x => x.id);
        const from0 = ids.indexOf(v.id);
        const to0 = ids.indexOf(o.visit.id);
        if (from0 < 0 || to0 < 0) return;
        void reorderCell(target.crewId, target.date, moveInList(ids, from0, to0));
      } else {
        void actions.patchVisit(v.id, { crewId: target.crewId, visitDate: target.date }, { ticketTitle: v.ticket?.title ?? v.title ?? undefined, ticketId: v.ticketId, crewName });
      }
    }
  };

  const sheetCrew = sheet ? crews.find(c => c.id === sheet.crewId) ?? null : null;
  const sheetVisits = sheet ? cells.get(`${sheet.crewId}|${sheet.date}`) ?? [] : [];
  const needsCount = queue.data?.needsScheduling.length ?? 0;
  const slippedCount = queue.data?.slipped.length ?? 0;
  const dayLabel = (d: string) => parseCalendarDate(d).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });

  return (
    <div className="mx-auto max-w-[1600px] space-y-3" data-testid="page-scheduling">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto flex items-center gap-2 text-xl font-semibold"><CalendarDays className="h-5 w-5 text-primary" />{t("nav.scheduling", "Scheduling")}</h1>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm transition-colors"
          value={service}
          onChange={e => setService(e.target.value)}
          aria-label={t("scheduling.service", "Service")}
          data-testid="select-service-filter"
        >
          <option value="">{t("scheduling.allServices", "All services")}</option>
          {SERVICE_OPTIONS.map(s => <option key={s.key} value={s.key}>{serviceLabel(s.key, tr)}</option>)}
        </select>
      </div>

      <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* queue */}
          <aside className="min-w-0 space-y-2" data-print-hide data-testid="panel-queue">
            <Button variant="outline" className="w-full justify-between lg:hidden" onClick={() => setQueueOpen(o => !o)} aria-expanded={queueOpen} data-testid="button-toggle-queue">
              <span>{t("scheduling.queue", "Queue")} ({needsCount + slippedCount})</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${queueOpen ? "rotate-180" : ""}`} />
            </Button>
            <div className={`${queueOpen ? "block" : "hidden"} space-y-2 lg:block`}>
              <div role="tablist" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
                {([["needs", t("scheduling.needsScheduling", "Needs scheduling"), needsCount], ["slipped", t("scheduling.slipped", "Slipped"), slippedCount]] as const).map(([k, label, n]) => (
                  <button
                    key={k} type="button" role="tab" aria-selected={tab === k}
                    className={`rounded px-2 py-1 transition-colors ${tab === k ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setTab(k)} data-testid={`tab-queue-${k}`}
                  >{label} ({n})</button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" value={q} onChange={e => setQ(e.target.value)} placeholder={t("scheduling.searchQueue", "Search property or title")} data-testid="input-queue-search" />
              </div>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label={t("scheduling.type", "Type")} data-testid="select-queue-type">
                <option value="">{t("scheduling.allTypes", "All types")}</option>
                {typeOptions.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-0.5" data-testid="list-queue">
                {queue.isError ? (
                  <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm" role="alert">
                    <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" />{t("scheduling.queueError", "Couldn't load the queue.")}</div>
                    <Button size="sm" variant="outline" onClick={() => void queue.refetch()} data-testid="button-retry-queue"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("scheduling.retry", "Retry")}</Button>
                  </div>
                ) : !queue.data ? (
                  <><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></>
                ) : items.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground" data-testid="text-queue-empty">
                    {tab === "needs" ? t("scheduling.emptyNeeds", "Nothing waiting for a crew.") : t("scheduling.emptySlipped", "No visits slipped.")}
                  </p>
                ) : (
                  items.map(i => (
                    <QueueCard
                      key={i.id + (i.visit?.id ?? "")} item={i} slipped={tab === "slipped"}
                      onSchedule={it => it.visit
                        ? setDialog({ mode: "move", ticket: { id: it.id, title: it.title }, visit: { id: it.visit.id, crewId: it.visit.crewId, visitDate: it.visit.visitDate } })
                        : setDialog({ mode: "schedule", ticket: { id: it.id, title: it.title } })}
                    />
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* board */}
          <section className="min-w-0 space-y-2" data-testid="panel-board">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => goWeek(addDaysYmd(week, -7))} aria-label={t("scheduling.prevWeek", "Previous week")} data-testid="button-prev-week"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => goWeek(addDaysYmd(week, 7))} aria-label={t("scheduling.nextWeek", "Next week")} data-testid="button-next-week"><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" onClick={() => goWeek(mondayOf(today))} data-testid="button-today">{t("scheduling.today", "Today")}</Button>
              <span className="text-sm font-medium tabular-nums" data-testid="text-week-range">{fmtDay(from)} – {fmtDay(to)}</span>
              <label className="ml-auto flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={showSun} onChange={e => setShowSun(e.target.checked)} data-testid="toggle-sunday" />
                {t("scheduling.sun", "Sun")}
              </label>
            </div>
            <div className="overflow-x-auto rounded-md border" data-testid="board-scroll">
              {crewsQ.isError || visitsQ.isError || summaryQ.isError ? (
                <div className="space-y-2 p-4 text-sm" role="alert">
                  <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" />{t("scheduling.boardError", "Couldn't load the board.")}</div>
                  <Button size="sm" variant="outline" onClick={() => { void crewsQ.refetch(); void visitsQ.refetch(); void summaryQ.refetch(); }} data-testid="button-retry-board"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("scheduling.retry", "Retry")}</Button>
                </div>
              ) : !crewsQ.data || !visitsQ.data || !summaryQ.data ? (
                <div className="space-y-2 p-3" data-testid="skeleton-board"><Skeleton className="h-8" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
              ) : crews.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-crews">
                  {t("scheduling.noCrews", "No active crews yet. Add one in Settings → Crews.")}
                </p>
              ) : (
                <div className="grid text-sm" style={{ gridTemplateColumns: `168px repeat(${days.length}, minmax(148px, 1fr))`, minWidth: 168 + days.length * 148 }} data-testid="board-grid">
                  <div className="sticky left-0 z-10 border-b bg-muted/60 p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("scheduling.crew", "Crew")}</div>
                  {days.map(d => (
                    <div key={d} className={`border-b border-l p-2 text-center text-xs font-medium ${d === today ? "bg-primary/20 text-foreground" : "bg-muted/60 text-muted-foreground"}`} data-testid={`header-day-${d}`} data-today={d === today}>
                      {dayLabel(d)}
                    </div>
                  ))}
                  {crews.map(crew => (
                    <div key={crew.id} className="contents">
                      <div className="sticky left-0 z-10 flex items-start gap-2 border-b bg-background p-2" data-testid={`row-crew-${crew.id}`}>
                        <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: crew.color }} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{crew.name}</div>
                          {crew.supervisorName && <div className="truncate text-xs text-muted-foreground">{crew.supervisorName}</div>}
                        </div>
                      </div>
                      {days.map(d => {
                        const key = `${crew.id}|${d}`;
                        const list = cells.get(key) ?? [];
                        const openList = list.filter(isOpenVisit);
                        const s = summaries.get(key);
                        const hours = s?.plannedHours ?? 0;
                        const cap = s?.capacityHours ?? crew.defaultHoursPerDay ?? 8;
                        const tone = capacityTone(hours, cap);
                        return (
                          <BoardCell key={d} crewId={crew.id} date={d} isToday={d === today}>
                            <button
                              type="button"
                              onClick={() => setSheet({ crewId: crew.id, date: d })}
                              className={`block w-full border-l px-2 py-1 text-left text-[11px] tabular-nums transition-colors hover:bg-muted ${TONE_CLASS[tone]}`}
                              data-testid={`header-cell-${crew.id}-${d}`}
                              data-tone={tone}
                            >
                              {s?.visitCount ?? 0} {t("scheduling.stops", "stops")} · {fmtHours(hours)} / {fmtHours(cap)} h
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
                          </BoardCell>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
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
