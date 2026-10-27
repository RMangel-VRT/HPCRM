import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { TicketTypeBadge } from "@/components/TicketIdentity";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { typeHueVar } from "@shared/ticketVisuals";
import { fmtDay, fmtHours, isOpenVisit, serviceLabel, statusLabel, type EnrichedVisit, type QueueItem } from "@/lib/scheduling";
import { daysLate, scheduleByUrgency } from "@/lib/schedulingBoard";

export type DragData =
  | { kind: "queue"; item: QueueItem }
  | { kind: "visit"; visit: EnrichedVisit }
  | { kind: "cell"; crewId: string; date: string };

/** Display identity for badges, rails and queue filtering; raw records stay operational. */
export function queueDisplayType(item: QueueItem) {
  if (!item.typeName && !item.typeKey) return null;
  return { name: item.displayTypeName ?? item.typeName ?? item.typeKey ?? "", typeKey: item.displayTypeKey ?? item.typeKey };
}

/** Queue contract has no type ID: unkeyed identities use the available raw name, never a seeded name fallback. */
export function queueDisplayFilterIdentity(item: QueueItem) {
  const display = queueDisplayType(item);
  return display?.typeKey ?? `unkeyed:${JSON.stringify(display?.name ?? "")}`;
}
export function visitDisplayType(v: EnrichedVisit) {
  if (!v.ticket || (!v.ticket.typeName && !v.ticket.typeKey)) return null;
  return { name: v.ticket.displayTypeName ?? v.ticket.typeName ?? v.ticket.typeKey ?? "", typeKey: v.ticket.displayTypeKey ?? v.ticket.typeKey };
}

const stop = {
  onPointerDown: (e: PointerEvent) => e.stopPropagation(),
  onKeyDown: (e: KeyboardEvent) => e.stopPropagation(),
};

const URGENCY_CLASS = {
  late: "sb-danger font-semibold",
  soon: "font-semibold text-[hsl(var(--warning))]",
  normal: "text-muted-foreground",
} as const;

/* ---------------------------------------------------------------- queue */
export function QueueCardBody({
  item, slipped, today, onSchedule, mode = "normal",
}: { item: QueueItem; slipped: boolean; today: string; onSchedule?: (i: QueueItem) => void; mode?: "normal" | "lifted" | "pending" }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, d) as string;
  const display = queueDisplayType(item);
  const hue = typeHueVar(display);
  const urg = scheduleByUrgency(item.scheduleBy, today);
  const late = daysLate(item.scheduleBy, today);
  const interactive = mode === "normal";
  return (
    <>
      <span className="sb-rail" style={{ width: 4, background: hue }} data-testid={`rail-queue-${item.id}`} data-hue={hue} />
      <div className="min-w-0 flex-1 p-2.5 text-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="sb-prop" data-testid={interactive ? `text-queue-property-${item.id}` : undefined}>
              {item.customer?.name ?? t("scheduling.noProperty", "No property")}
            </div>
            {interactive ? (
              <Link href={`/dashboard/tickets/${item.id}`} draggable={false} {...stop} className="sb-title hover:underline" data-testid={`link-queue-ticket-${item.id}`}>
                {item.title}
              </Link>
            ) : <div className="sb-title">{item.title}</div>}
          </div>
          {interactive && onSchedule && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" {...stop}
              onClick={() => onSchedule(item)} data-testid={`button-queue-schedule-${item.id}`}>
              {slipped ? t("scheduling.moveEllipsis", "Move…") : t("scheduling.scheduleEllipsis", "Schedule…")}
            </Button>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {display && <TicketTypeBadge type={display} testId={interactive ? `badge-queue-type-${item.id}` : undefined} />}
          {(item.priority === "high" || item.priority === "urgent") && (
            <span className="sb-danger text-[11px] font-semibold uppercase tracking-wide" data-testid={interactive ? `badge-queue-priority-${item.id}` : undefined}>
              {t(`priorities.${item.priority}`, item.priority)}
            </span>
          )}
          {item.serviceType && <span className="text-[11px] font-medium" style={{ color: `color-mix(in srgb, ${hue} 82%, hsl(var(--foreground)))` }}>{serviceLabel(item.serviceType, tr)}</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
          {item.scheduleBy && (
            <span className={URGENCY_CLASS[urg]} data-testid={interactive ? `text-queue-scheduleby-${item.id}` : undefined} data-urgency={urg}>
              {t("scheduling.scheduleBy", "Schedule by")} {fmtDay(item.scheduleBy.slice(0, 10))}
              {late > 0 && ` · ${t("scheduling.daysLate", { count: late, defaultValue: "{{count}} days late" })}`}
            </span>
          )}
          {slipped && item.visit && (
            <span className="sb-danger" data-testid={interactive ? `text-queue-slipped-${item.id}` : undefined}>
              {t("scheduling.wasDue", "Was due")} {fmtDay(item.visit.visitDate)}{item.visit.crewName ? ` · ${item.visit.crewName}` : ""}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export function QueueCard({ item, slipped, today, onSchedule }: { item: QueueItem; slipped: boolean; today: string; onSchedule: (i: QueueItem) => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `queue:${item.id}`, data: { kind: "queue", item } satisfies DragData,
    attributes: { role: "group", roleDescription: t("scheduling.dragJob", "Drag to schedule") as string },
  });
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      aria-label={`${item.customer?.name ?? ""} ${item.title}`.trim()}
      className="sb-card sb-queue-card mb-2"
      data-source={isDragging} data-testid={`card-queue-${item.id}`}
    >
      <QueueCardBody item={item} slipped={slipped} today={today} onSchedule={onSchedule} />
    </div>
  );
}

/* ---------------------------------------------------------------- visit */
export function VisitCardBody({ visit, stopNo, menu, handle }: { visit: EnrichedVisit; stopNo: number | null; menu?: ReactNode; handle?: ReactNode }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, d) as string;
  const display = visitDisplayType(visit);
  const hue = typeHueVar(display);
  const open = isOpenVisit(visit);
  const isTicket = visit.sourceType === "ticket" && !!visit.ticketId;
  const prop = visit.customer?.name ?? (isTicket ? null : visit.sourceType.replace("_", " "));
  const title = visit.ticket?.title ?? visit.title ?? t("scheduling.untitled", "Untitled visit");
  return (
    <>
      <span className="sb-rail" style={{ width: 3, background: hue }} title={display?.name} data-testid={`rail-visit-${visit.id}`} data-hue={hue} />
      {display && <span className="sr-only" data-testid={`text-visit-type-${visit.id}`}>{display.name}</span>}
      <div className="min-w-0 flex-1 px-1.5 py-1 text-xs">
        <div className="flex items-start gap-1">
          {handle}
          <div className="min-w-0 flex-1">
            {prop && <div className="sb-prop">{prop}</div>}
            {isTicket && menu ? (
              <Link href={`/dashboard/tickets/${visit.ticketId}`} draggable={false} {...stop} className="sb-title hover:underline" data-testid={`link-visit-ticket-${visit.id}`}>{title}</Link>
            ) : <div className="sb-title">{title}</div>}
          </div>
          {menu}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          <span className="font-mono text-muted-foreground" title={statusLabel(visit.status, t)} data-testid={menu ? `dot-visit-${visit.id}` : undefined}>
            {stopNo != null ? `#${stopNo}` : "–"}
          </span>
          {visit.serviceKey && <span className="truncate font-medium" style={{ color: `color-mix(in srgb, ${hue} 82%, hsl(var(--foreground)))` }}>{serviceLabel(visit.serviceKey, tr)}</span>}
          <span className="ml-auto tabular-nums text-muted-foreground">
            {!open ? (visit.status === "done" ? t("scheduling.doneShort", "Done") : statusLabel(visit.status, t))
              : visit.estimatedHours != null ? `${fmtHours(visit.estimatedHours)} h` : ""}
          </span>
        </div>
      </div>
    </>
  );
}

export function VisitCard({
  visit, index, openCount, onEdit, onMove, onRemove, onAdd, onShift,
}: {
  visit: EnrichedVisit; index: number; openCount: number;
  onEdit: (v: EnrichedVisit) => void; onMove: (v: EnrichedVisit) => void; onRemove: (v: EnrichedVisit) => void; onAdd: (v: EnrichedVisit) => void;
  onShift: (v: EnrichedVisit, dir: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const open = isOpenVisit(visit);
  const drag = useDraggable({ id: `visit:${visit.id}`, data: { kind: "visit", visit } satisfies DragData, disabled: !open });
  const drop = useDroppable({ id: `visit:${visit.id}`, data: { kind: "visit", visit } satisfies DragData, disabled: !open });
  const isTicket = visit.sourceType === "ticket" && !!visit.ticketId;
  const handle = open ? (
    <button type="button" className="mt-0.5 cursor-grab touch-none rounded text-muted-foreground transition-colors hover:text-foreground"
      aria-label={t("scheduling.dragVisit", "Drag visit")} data-testid={`handle-visit-${visit.id}`} {...drag.listeners} {...drag.attributes}>
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  ) : null;
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="sb-menu h-6 w-6 shrink-0" aria-label={t("scheduling.visitMenu", "Visit actions")} data-testid={`button-visit-menu-${visit.id}`}>
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
        {visit.status === "planned" && <DropdownMenuItem className="sb-danger" onSelect={() => onRemove(visit)} data-testid={`menu-remove-${visit.id}`}>{t("scheduling.removeFromSchedule", "Remove from schedule")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <div
      ref={n => { drag.setNodeRef(n); drop.setNodeRef(n); }}
      className="sb-card"
      style={drop.isOver && !drag.isDragging ? { boxShadow: "inset 0 0 0 2px hsl(var(--ring))" } : undefined}
      data-source={drag.isDragging} data-closed={!open}
      data-testid={`card-visit-${visit.id}`} data-status={visit.status}
    >
      <VisitCardBody visit={visit} stopNo={open ? index + 1 : null} menu={menu} handle={handle} />
    </div>
  );
}
