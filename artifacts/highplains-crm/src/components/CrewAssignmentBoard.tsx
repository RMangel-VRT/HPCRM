import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GripVertical, X, MoreVertical, Search, ExternalLink, User as UserIcon, AlertTriangle, Plus } from "lucide-react";
import type { CampaignItem, CampaignCrewWithMembers } from "@shared/schema";

const UNASSIGNED = "__unassigned__";

interface BoardItem extends CampaignItem {
  customerCity?: string | null;
}

interface Props {
  campaignId: string;
  items: BoardItem[];
  crews: CampaignCrewWithMembers[];
  isAdminOffice: boolean;
  onSwitchToCrews?: () => void;
  onAddProperties?: () => void;
}

interface BulkAssignVars { itemIds: string[]; crewId: string | null }
interface BulkAssignResult { updated: number; items: CampaignItem[] }

/** Pure reducer for the multi-select state machine. Exported for unit testing. */
export interface SelectState {
  selected: Set<string>;
  lastClicked: { id: string; col: string } | null;
}
export interface SelectAction {
  type: "click" | "escape" | "clear" | "drag-start" | "drag-success" | "prune";
  id?: string;
  col?: string;
  shift?: boolean;
  meta?: boolean;
  columnIds?: string[]; // ordered ids in the clicked column
  presentIds?: Set<string>; // for prune
}
export function selectReducer(state: SelectState, action: SelectAction): SelectState {
  switch (action.type) {
    case "escape":
    case "clear":
    case "drag-success":
      return { selected: new Set(), lastClicked: null };
    case "click": {
      if (!action.id || !action.col) return state;
      const next = new Set(state.selected);
      if (action.shift && state.lastClicked && state.lastClicked.col === action.col && action.columnIds) {
        const a = action.columnIds.indexOf(state.lastClicked.id);
        const b = action.columnIds.indexOf(action.id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(action.columnIds[i]);
        } else {
          next.add(action.id);
        }
      } else if (action.meta) {
        if (next.has(action.id)) next.delete(action.id);
        else next.add(action.id);
      } else {
        // Plain click: toggle. If only this card is selected, clear; else select just this.
        if (next.size === 1 && next.has(action.id)) {
          next.clear();
        } else {
          next.clear();
          next.add(action.id);
        }
      }
      return { selected: next, lastClicked: { id: action.id, col: action.col } };
    }
    case "drag-start": {
      if (!action.id) return state;
      // If dragged card not in selection, replace selection with just it.
      if (!state.selected.has(action.id)) {
        return { selected: new Set([action.id]), lastClicked: state.lastClicked };
      }
      return state;
    }
    case "prune": {
      if (!action.presentIds) return state;
      const present = action.presentIds;
      const next = new Set<string>();
      state.selected.forEach((id) => { if (present.has(id)) next.add(id); });
      if (next.size === state.selected.size) return state;
      return { selected: next, lastClicked: state.lastClicked && present.has(state.lastClicked.id) ? state.lastClicked : null };
    }
    default:
      return state;
  }
}

export default function CrewAssignmentBoard({ campaignId, items, crews, isAdminOffice, onSwitchToCrews, onAddProperties }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [selectState, dispatch] = useReducerLike<SelectState, SelectAction>(
    selectReducer,
    { selected: new Set<string>(), lastClicked: null },
  );
  const selectedIds = selectState.selected;

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [unassignedSearch, setUnassignedSearch] = useState("");
  // Optimistic overrides: itemId -> crewId | null. Wins over server-side assignedCampaignCrewId.
  const [optimisticAssignments, setOptimisticAssignments] = useState<Map<string, string | null>>(new Map());
  const inFlightRef = useRef(0);
  const [inFlight, setInFlight] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const effectiveCrewId = useCallback(
    (item: BoardItem) =>
      optimisticAssignments.has(item.id) ? optimisticAssignments.get(item.id)! : item.assignedCampaignCrewId || null,
    [optimisticAssignments],
  );

  const columns = useMemo(() => {
    const map = new Map<string, BoardItem[]>();
    map.set(UNASSIGNED, []);
    crews.forEach(c => map.set(c.id, []));
    items.forEach(item => {
      const crewId = effectiveCrewId(item);
      const key = crewId || UNASSIGNED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    // Apply unassigned search
    if (unassignedSearch.trim()) {
      const q = unassignedSearch.trim().toLowerCase();
      const u = (map.get(UNASSIGNED) ?? []).filter(i =>
        (i.customerName || "").toLowerCase().includes(q) ||
        (i.customerCity || "").toLowerCase().includes(q),
      );
      map.set(UNASSIGNED, u);
    }
    return map;
  }, [items, crews, effectiveCrewId, unassignedSearch]);

  const itemColumn = useCallback(
    (id: string): string => {
      const it = items.find(i => i.id === id);
      if (!it) return UNASSIGNED;
      return effectiveCrewId(it) || UNASSIGNED;
    },
    [items, effectiveCrewId],
  );

  const bulkAssign = useMutation<BulkAssignResult, Error, BulkAssignVars, { previous: Map<string, string | null> }>({
    mutationFn: async ({ itemIds, crewId }) => {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/bulk-assign-crew`, {
        itemIds,
        assignedCampaignCrewId: crewId,
      });
      return (await res.json()) as BulkAssignResult;
    },
    onMutate: async (vars) => {
      inFlightRef.current += 1;
      setInFlight(inFlightRef.current);
      const previous = new Map(optimisticAssignments);
      setOptimisticAssignments(prev => {
        const next = new Map(prev);
        vars.itemIds.forEach(id => next.set(id, vars.crewId));
        return next;
      });
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx) setOptimisticAssignments(ctx.previous);
      toast({ title: e.message || t("campaigns.boardAssignFailed"), variant: "destructive" });
    },
    onSuccess: (data, vars) => {
      const target = vars.crewId ? crews.find(c => c.id === vars.crewId)?.name ?? "" : t("campaigns.extraBillableUnassigned");
      toast({ title: t("campaigns.boardAssignedToast", { count: data.updated, target }) });
      dispatch({ type: "drag-success" });
    },
    onSettled: () => {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      setInFlight(inFlightRef.current);
      // Reconcile optimistic state on the next refetch
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "crews"] });
    },
  });

  // Once server data reflects an optimistic move, drop the local override
  useEffect(() => {
    if (optimisticAssignments.size === 0) return;
    setOptimisticAssignments(prev => {
      const next = new Map(prev);
      let changed = false;
      items.forEach(item => {
        if (!next.has(item.id)) return;
        const desired = next.get(item.id) ?? null;
        if ((item.assignedCampaignCrewId || null) === desired) {
          next.delete(item.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [items, optimisticAssignments]);

  const onCardClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (!isAdminOffice) return;
      const col = itemColumn(id);
      const colItems = columns.get(col) ?? [];
      dispatch({
        type: "click",
        id, col,
        shift: e.shiftKey,
        meta: e.metaKey || e.ctrlKey,
        columnIds: colItems.map(i => i.id),
      });
    },
    [isAdminOffice, itemColumn, columns, dispatch],
  );

  // Esc clears selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "escape" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  // Prune selection if items disappear
  useEffect(() => {
    dispatch({ type: "prune", presentIds: new Set(items.map(i => i.id)) });
  }, [items, dispatch]);

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveDragId(id);
    dispatch({ type: "drag-start", id });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const overId = e.over ? String(e.over.id) : null;
    const draggedId = activeDragId;
    setActiveDragId(null);
    if (!overId) return;
    const targetCrewId = overId === UNASSIGNED ? null : overId;

    if (targetCrewId) {
      const targetCrew = crews.find(c => c.id === targetCrewId);
      if (targetCrew && !targetCrew.leaderUserId) {
        toast({ title: t("campaigns.boardLeaderlessCrewBlocked"), variant: "destructive" });
        return;
      }
    }

    // Use latest selection snapshot, fall back to dragged card alone
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : (draggedId ? [draggedId] : []);
    if (ids.length === 0) return;
    const changing = ids.filter(id => itemColumn(id) !== (targetCrewId || UNASSIGNED));
    if (changing.length === 0) return;
    bulkAssign.mutate({ itemIds: changing, crewId: targetCrewId });
  };

  const onBulkAssignTo = (crewId: string | null) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (crewId) {
      const target = crews.find(c => c.id === crewId);
      if (target && !target.leaderUserId) {
        toast({ title: t("campaigns.boardLeaderlessCrewBlocked"), variant: "destructive" });
        return;
      }
    }
    bulkAssign.mutate({ itemIds: ids, crewId });
  };

  const orderedColumns = useMemo(
    () => [
      { id: UNASSIGNED, name: t("campaigns.extraBillableUnassigned"), color: "#94a3b8", leaderUserId: null as string | null, leaderName: null as string | null, photoCount: 0, completedCount: 0 },
      ...crews.map(c => ({
        id: c.id,
        name: c.name,
        color: c.color,
        leaderUserId: c.leaderUserId as string | null,
        leaderName: c.leaderName ?? null,
        photoCount: c.photoCount ?? 0,
        completedCount: c.completedCount ?? 0,
      })),
    ],
    [crews, t],
  );

  const activeItem = activeDragId ? items.find(i => i.id === activeDragId) : null;
  const selectionCount = selectedIds.size;
  const activeIsMulti = activeDragId && selectedIds.has(activeDragId) && selectionCount > 1;

  const totalProps = items.length;
  const totalAssigned = items.filter(i => effectiveCrewId(i)).length;
  const allAssigned = totalProps > 0 && totalAssigned === totalProps;

  // Empty states
  if (totalProps === 0) {
    return (
      <Card className="p-8 text-center space-y-3" data-testid="board-empty-no-properties">
        <p className="text-sm text-muted-foreground">{t("campaigns.boardNoProperties")}</p>
        {isAdminOffice && onAddProperties && (
          <Button size="sm" onClick={onAddProperties} data-testid="button-board-add-properties">
            <Plus className="w-4 h-4 mr-1" />
            {t("campaigns.extraBillableAddProperties")}
          </Button>
        )}
      </Card>
    );
  }
  if (crews.length === 0) {
    return (
      <Card className="p-8 text-center space-y-3" data-testid="board-empty-no-crews">
        <p className="text-sm text-muted-foreground">{t("campaigns.extraBillableNoCrews")}</p>
        {isAdminOffice && onSwitchToCrews && (
          <Button size="sm" onClick={onSwitchToCrews} data-testid="button-board-go-to-crews">
            {t("campaigns.boardCreateCrew")}
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {inFlight > 0 && (
        <Progress className="h-1" data-testid="progress-bulk-assign" />
      )}
      {selectionCount >= 2 && isAdminOffice && (
        <MultiSelectActionBar
          count={selectionCount}
          crews={crews}
          onAssign={onBulkAssignTo}
          onClear={() => dispatch({ type: "clear" })}
          disabled={bulkAssign.isPending}
        />
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {orderedColumns.map(col => {
            const colItems = columns.get(col.id) ?? [];
            const isUnassigned = col.id === UNASSIGNED;
            const leaderless = !isUnassigned && !col.leaderUserId;
            return (
              <DroppableCrewColumn
                key={col.id}
                id={col.id}
                name={col.name}
                color={col.color}
                count={colItems.length}
                leaderName={col.leaderName}
                leaderless={leaderless}
                photoCount={col.photoCount}
                completedCount={col.completedCount}
                isUnassigned={isUnassigned}
                disabled={!isAdminOffice || leaderless}
                searchValue={isUnassigned ? unassignedSearch : null}
                onSearchChange={isUnassigned ? setUnassignedSearch : undefined}
              >
                {isUnassigned && allAssigned && (
                  <p className="text-xs text-muted-foreground p-2" data-testid="board-all-assigned-message">
                    {t("campaigns.boardAllAssigned")}
                  </p>
                )}
                {colItems.length === 0 && !(isUnassigned && allAssigned) ? (
                  <p className="text-xs text-muted-foreground p-2" data-testid={`board-empty-${col.id}`}>
                    {t("campaigns.boardEmptyColumn")}
                  </p>
                ) : (
                  colItems.map(item => (
                    <CardWithMenu
                      key={item.id}
                      item={item}
                      crews={crews}
                      selected={selectedIds.has(item.id)}
                      draggable={isAdminOffice}
                      onClick={(e) => onCardClick(item.id, e)}
                      onAssign={(crewId) => bulkAssign.mutate({ itemIds: [item.id], crewId })}
                      onOpenProperty={() => navigate(`/dashboard/campaigns/${campaignId}/items/${item.id}`)}
                      onOpenCustomer={() => navigate(`/customers/${item.customerId}`)}
                    />
                  ))
                )}
              </DroppableCrewColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeItem ? (
            <div className="rounded-md border bg-background shadow-lg px-3 py-2 text-sm flex items-center gap-2 relative">
              {activeIsMulti && (
                <>
                  <span className="absolute -top-1 -left-1 w-full h-full rounded-md border bg-background -z-10" />
                  <span className="absolute -top-2 -left-2 w-full h-full rounded-md border bg-background -z-20 opacity-70" />
                </>
              )}
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{activeItem.customerName}</span>
              {activeIsMulti && (
                <Badge variant="secondary" data-testid="badge-drag-count">
                  +{selectionCount - 1}
                </Badge>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// Lightweight useReducer-shaped hook (we just want a stable dispatch with our pure reducer)
function useReducerLike<S, A>(reducer: (s: S, a: A) => S, initial: S): [S, (a: A) => void] {
  const [state, setState] = useState<S>(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatch = useCallback((action: A) => {
    setState(reducer(stateRef.current, action));
  }, [reducer]);
  return [state, dispatch];
}

function DroppableCrewColumn({
  id, name, color, count, leaderName, leaderless, photoCount, completedCount, isUnassigned, disabled, searchValue, onSearchChange, children,
}: {
  id: string;
  name: string;
  color: string;
  count: number;
  leaderName: string | null;
  leaderless: boolean;
  photoCount: number;
  completedCount: number;
  isUnassigned: boolean;
  disabled?: boolean;
  searchValue?: string | null;
  onSearchChange?: (v: string) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <Card
      ref={setNodeRef}
      data-testid={`board-column-${id}`}
      className={`flex flex-col min-h-[200px] ${isOver && !disabled ? "ring-2 ring-primary" : ""} ${leaderless ? "border-yellow-500" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="font-medium truncate" data-testid={`board-column-name-${id}`}>{name}</span>
        </div>
        <Badge variant="secondary" data-testid={`board-column-count-${id}`}>{count}</Badge>
      </div>
      {!isUnassigned && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b space-y-0.5">
          {leaderless ? (
            <div className="flex items-center gap-1 text-yellow-700 dark:text-yellow-400" data-testid={`board-column-leaderless-${id}`}>
              <AlertTriangle className="w-3 h-3" />
              {t("campaigns.boardLeaderlessCrewBlocked")}
            </div>
          ) : (
            <div className="flex items-center gap-1" data-testid={`board-column-leader-${id}`}>
              <UserIcon className="w-3 h-3" />
              {leaderName || ""}
            </div>
          )}
          <div className="flex gap-3" data-testid={`board-column-counters-${id}`}>
            <span>{t("campaigns.boardCounterProps", { count })}</span>
            <span>{t("campaigns.boardCounterPhotos", { count: photoCount })}</span>
            <span>{t("campaigns.boardCounterDone", { count: completedCount })}</span>
          </div>
        </div>
      )}
      {isUnassigned && onSearchChange && (
        <div className="px-2 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("campaigns.boardSearchUnassigned")}
              className="pl-7 h-8 text-xs"
              data-testid="input-board-unassigned-search"
            />
          </div>
        </div>
      )}
      <div className="p-2 space-y-1.5 flex-1 overflow-y-auto max-h-[60vh]">{children}</div>
    </Card>
  );
}

function CardWithMenu({
  item, crews, selected, draggable, onClick, onAssign, onOpenProperty, onOpenCustomer,
}: {
  item: BoardItem;
  crews: CampaignCrewWithMembers[];
  selected: boolean;
  draggable: boolean;
  onClick: (e: React.MouseEvent) => void;
  onAssign: (crewId: string | null) => void;
  onOpenProperty: () => void;
  onOpenCustomer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <DraggablePropertyCard
          item={item}
          selected={selected}
          draggable={draggable}
          onClick={onClick}
          onAssign={onAssign}
          onOpenProperty={onOpenProperty}
          onOpenCustomer={onOpenCustomer}
          crews={crews}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuSub>
          <ContextMenuSubTrigger data-testid={`ctx-move-${item.id}`}>
            {t("campaigns.boardMoveToCrew")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => onAssign(null)} data-testid={`ctx-move-unassigned-${item.id}`}>
              {t("campaigns.extraBillableUnassigned")}
            </ContextMenuItem>
            {crews.map(c => (
              <ContextMenuItem
                key={c.id}
                disabled={!c.leaderUserId}
                onClick={() => onAssign(c.id)}
                data-testid={`ctx-move-crew-${item.id}-${c.id}`}
              >
                {c.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onOpenProperty} data-testid={`ctx-open-${item.id}`}>
          {t("campaigns.boardOpenProperty")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onOpenCustomer} data-testid={`ctx-customer-${item.id}`}>
          {t("campaigns.boardViewCustomer")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DraggablePropertyCard({
  item, selected, draggable, onClick, onAssign, onOpenProperty, onOpenCustomer, crews,
}: {
  item: BoardItem;
  selected: boolean;
  draggable: boolean;
  onClick: (e: React.MouseEvent) => void;
  onAssign: (crewId: string | null) => void;
  onOpenProperty: () => void;
  onOpenCustomer: () => void;
  crews: CampaignCrewWithMembers[];
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: !draggable });
  const photoCount = item.completionPhotoStorageKeys?.length || 0;
  return (
    <div
      ref={setNodeRef}
      data-testid={`card-property-${item.id}`}
      onClick={onClick}
      className={`group rounded-md border bg-background px-2 py-1.5 text-sm flex items-center gap-2 select-none ${selected ? "ring-2 ring-primary scale-[1.01]" : ""} ${isDragging ? "opacity-40" : ""} ${draggable ? "cursor-pointer" : ""}`}
    >
      {draggable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground touch-none"
          data-testid={`grip-property-${item.id}`}
          aria-label="Drag handle"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.customerName}</div>
        {item.customerCity && (
          <div className="text-xs text-muted-foreground truncate">{item.customerCity}</div>
        )}
      </div>
      {photoCount > 0 && (
        <Badge variant="outline" className="text-[10px]" data-testid={`badge-card-photos-${item.id}`}>
          {photoCount}
        </Badge>
      )}
      {item.status !== "pending" && (
        <Badge variant={item.status === "completed" ? "default" : "outline"} className="text-[10px]">
          {item.status}
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(e) => e.stopPropagation()}
            data-testid={`button-card-kebab-${item.id}`}
            aria-label="Quick actions"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {draggable && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid={`kebab-move-${item.id}`}>
                  {t("campaigns.boardMoveToCrew")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => onAssign(null)} data-testid={`kebab-move-unassigned-${item.id}`}>
                    {t("campaigns.extraBillableUnassigned")}
                  </DropdownMenuItem>
                  {crews.map(c => (
                    <DropdownMenuItem
                      key={c.id}
                      disabled={!c.leaderUserId}
                      onClick={() => onAssign(c.id)}
                      data-testid={`kebab-move-crew-${item.id}-${c.id}`}
                    >
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onOpenProperty} data-testid={`kebab-open-${item.id}`}>
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            {t("campaigns.boardOpenProperty")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenCustomer} data-testid={`kebab-customer-${item.id}`}>
            <UserIcon className="w-3.5 h-3.5 mr-2" />
            {t("campaigns.boardViewCustomer")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MultiSelectActionBar({
  count, crews, onAssign, onClear, disabled,
}: {
  count: number;
  crews: CampaignCrewWithMembers[];
  onAssign: (crewId: string | null) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="sticky top-0 md:top-2 bottom-0 md:bottom-auto z-10 flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 shadow-sm flex-wrap"
      data-testid="bulk-assign-action-bar"
    >
      <div className="flex items-center gap-2">
        <Badge data-testid="text-bulk-selected-count">{count}</Badge>
        <span className="text-sm">{t("campaigns.boardSelectedLabel")}</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="default" disabled={disabled} data-testid="button-bulk-assign-trigger">
              {t("campaigns.boardAssignTo")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onAssign(null)} data-testid="bulk-assign-action-unassigned">
              {t("campaigns.extraBillableUnassigned")}
            </DropdownMenuItem>
            {crews.map(c => (
              <DropdownMenuItem
                key={c.id}
                disabled={!c.leaderUserId}
                onClick={() => onAssign(c.id)}
                data-testid={`bulk-assign-action-${c.id}`}
              >
                <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: c.color }} />
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" onClick={onClear} data-testid="button-bulk-clear">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
