import { useRef, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter, type UniqueIdentifier } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EstimateSectionDto } from "@/lib/estimateBuilder";
import { orderOf } from "@/lib/estimateEditQueue";
import type { EstimateOrderInput } from "../../../../../lib/db/src/estimateContracts";

export const sectionDragId = (id: string) => `section:${id}`;
export const lineDragId = (id: string) => `line:${id}`;
export function useEstimateSortable(kind: "section" | "line", id: string, label: string, disabled: boolean) {
  return useSortable({ id: kind === "section" ? sectionDragId(id) : lineDragId(id), data: { kind, id, label }, disabled });
}
export function sortableStyle(sort: ReturnType<typeof useEstimateSortable>) {
  return { transform: CSS.Translate.toString(sort.transform), transition: sort.transition,
    opacity: sort.isDragging ? 0.75 : undefined, zIndex: sort.isDragging ? 10 : undefined };
}
export function EstimateDragHandle({ sort, label, testId }: { sort: ReturnType<typeof useEstimateSortable>; label: string; testId: string }) {
  return <button id={testId} type="button" ref={sort.setActivatorNodeRef} {...sort.attributes} {...sort.listeners}
    aria-label={label} title={label} data-testid={testId}
    className="inline-flex h-8 w-6 touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-ring cursor-grab active:cursor-grabbing">
    <GripVertical aria-hidden className="h-4 w-4" />
  </button>;
}

export function moveEstimateLine(sections: EstimateSectionDto[], lineId: string, sectionId: string, overLineId?: string): EstimateOrderInput | null {
  const from = sections.find(s => s.lines.some(l => l.id === lineId));
  const to = sections.find(s => s.id === sectionId);
  if (!from || !to || lineId === overLineId) return null;
  const result = orderOf(sections);
  const source = result.sections.find(s => s.id === from.id)!;
  const target = result.sections.find(s => s.id === to.id)!;
  const oldIndex = source.lineIds.indexOf(lineId);
  const newIndex = overLineId ? target.lineIds.indexOf(overLineId) : target.lineIds.length - Number(source === target);
  if (newIndex < 0 || (source === target && newIndex === oldIndex)) return null;
  source.lineIds.splice(oldIndex, 1);
  target.lineIds.splice(newIndex, 0, lineId);
  return result;
}

const estimateCollisions: CollisionDetection = args => {
  const section = args.active.data.current?.kind === "section";
  const groups = args.droppableContainers.filter(d => d.data.current?.kind === "section");
  if (section) {
    if (args.pointerCoordinates) return pointerWithin({ ...args, droppableContainers: groups });
    return closestCenter({ ...args, droppableContainers: groups });
  }
  const rows = args.droppableContainers.filter(d => d.data.current?.kind === "line");
  if (args.pointerCoordinates) return [
    ...pointerWithin({ ...args, droppableContainers: rows }), ...pointerWithin({ ...args, droppableContainers: groups }),
  ];
  const emptyGroups = groups.filter(g => !rows.some(row => row.data.current?.sortable.containerId === g.id));
  return closestCenter({ ...args, droppableContainers: [...rows, ...emptyGroups] });
};

export function EstimateSorting({ sections, children, onOrder }: {
  sections: EstimateSectionDto[]; children: ReactNode; onOrder: (order: EstimateOrderInput, keyboardLineId?: string) => void;
}) {
  const { t } = useTranslation();
  // Keyboard moves follow the logical list, not the closest measured center
  // (which can be a different row for variable-height rows or a scrolled pane).
  const keyboardTarget = useRef<UniqueIdentifier | null>(null);
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    const dir = event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
    if (!dir || !context.active || !context.collisionRect) return;
    event.preventDefault();
    const targetIds = context.active.data.current?.kind === "section" ? sections.map(s => sectionDragId(s.id)) :
      sections.flatMap(s => {
        const rows = s.lines.map(l => lineDragId(l.id)).filter(id => context.droppableRects.has(id));
        return rows.length ? rows : [sectionDragId(s.id)];
      });
    const at = targetIds.indexOf(String(keyboardTarget.current ?? context.active.id));
    const target = targetIds[at + dir];
    const rect = context.droppableRects.get(target);
    if (!rect || at < 0) return;
    keyboardTarget.current = target;
    return { x: rect.left + (rect.width - context.collisionRect.width) / 2, y: rect.top + (rect.height - context.collisionRect.height) / 2 };
  };
  const collisions: CollisionDetection = args => {
    const selected = keyboardTarget.current;
    if (selected !== null && args.droppableRects.has(selected)) return [{ id: selected }];
    return estimateCollisions(args);
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, scrollBehavior: "auto" }));

  function dropped({ active, over, activatorEvent }: DragEndEvent) {
    const keyboard = activatorEvent instanceof KeyboardEvent;
    const chosen = keyboardTarget.current;
    keyboardTarget.current = null;
    if (keyboard ? chosen === null || active.id === chosen : !over || active.id === over.id) return;
    const source = active.data.current;
    const target = keyboard && typeof chosen === "string"
      ? { kind: chosen.startsWith("section:") ? "section" : "line", id: chosen.slice(chosen.indexOf(":") + 1) }
      : over?.data.current;
    if (!source || !target) return;
    if (source.kind === "section") {
      const from = sections.findIndex(s => s.id === source.id), to = sections.findIndex(s => s.id === target.id);
      if (from >= 0 && to >= 0) onOrder(orderOf(arrayMove(sections, from, to)));
    } else {
      const from = sections.findIndex(s => s.lines.some(l => l.id === source.id));
      const to = sections.findIndex(s => target.kind === "section" ? s.id === target.id : s.lines.some(l => l.id === target.id));
      if (from < 0 || to < 0) return;
      const crossesUp = keyboard && to < from && sections[to].lines.at(-1)?.id === target.id;
      const id = target.kind === "line" && !crossesUp ? target.id : undefined;
      const order = moveEstimateLine(sections, source.id, sections[to].id, id);
      if (order) onOrder(order, keyboard ? source.id : undefined);
    }
  }
  const label = (item: DragEndEvent["active"] | DragEndEvent["over"]) => item?.data.current?.label ?? "";
  return <DndContext sensors={sensors} collisionDetection={collisions} onDragEnd={dropped} accessibility={{
    restoreFocus: false,
    screenReaderInstructions: { draggable: t("estimateBuilder.lineEdit.dragInstructions") },
    announcements: {
      onDragStart: ({ active }) => t("estimateBuilder.lineEdit.dragPicked", { name: label(active) }),
      onDragOver: ({ over }) => over ? t("estimateBuilder.lineEdit.dragOver", { name: label(over) }) : undefined,
      onDragEnd: ({ over }) => t(over ? "estimateBuilder.lineEdit.dragDropped" : "estimateBuilder.lineEdit.dragCancelled"),
      onDragCancel: () => t("estimateBuilder.lineEdit.dragCancelled"),
    },
  }} onDragCancel={() => { keyboardTarget.current = null; }}>
    <SortableContext items={sections.map(s => sectionDragId(s.id))} strategy={verticalListSortingStrategy}>{children}</SortableContext>
  </DndContext>;
}
