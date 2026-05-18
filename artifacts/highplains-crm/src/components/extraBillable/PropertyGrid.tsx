import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import PropertyCard, { type PropertyCardItem } from "./PropertyCard";
import PropertyPhotoSheet from "./PropertyPhotoSheet";
import type { CampaignCrewWithMembers } from "@shared/schema";

type GridSort = "newest" | "name" | "photosAsc" | "photosDesc";
type GridStatus = "all" | "pending" | "completed";

interface Props {
  campaignId: string;
  items: PropertyCardItem[];
  crews: CampaignCrewWithMembers[];
  isAdminOrOffice: boolean;
  currentUserId: string | null;
}

/**
 * Lightweight debounce — converts a fast-changing value into one that only
 * updates after `delay` ms of quiet. Used to keep the search input from
 * filtering on every keystroke.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

/**
 * Returns true if item passes the current filter controls (search, crew,
 * status). Used to gate brand-new items before appending them to the grid.
 */
function passesCurrentFilters(
  item: PropertyCardItem,
  search: string,
  crewFilter: string,
  statusFilter: GridStatus,
): boolean {
  const q = search.trim().toLowerCase();
  if (
    q &&
    !(
      (item.customerName || "").toLowerCase().includes(q) ||
      (item.customerCity || "").toLowerCase().includes(q)
    )
  )
    return false;
  if (crewFilter === "unassigned" && item.assignedCampaignCrewId) return false;
  if (
    crewFilter !== "all" &&
    crewFilter !== "unassigned" &&
    item.assignedCampaignCrewId !== crewFilter
  )
    return false;
  if (statusFilter !== "all" && item.status !== statusFilter) return false;
  return true;
}

/**
 * Pure function: apply filter + sort controls to a list of items and return
 * their IDs in the resulting order. Called only when the user changes a
 * control — not on every background data refresh.
 */
function computeSnapshotIds(
  items: PropertyCardItem[],
  search: string,
  crewFilter: string,
  statusFilter: GridStatus,
  sort: GridSort,
): string[] {
  const q = search.trim().toLowerCase();
  let list = items.slice();
  if (q) {
    list = list.filter(
      (i) =>
        (i.customerName || "").toLowerCase().includes(q) ||
        (i.customerCity || "").toLowerCase().includes(q),
    );
  }
  if (crewFilter !== "all") {
    list =
      crewFilter === "unassigned"
        ? list.filter((i) => !i.assignedCampaignCrewId)
        : list.filter((i) => i.assignedCampaignCrewId === crewFilter);
  }
  if (statusFilter !== "all") {
    list = list.filter((i) => i.status === statusFilter);
  }
  list.sort((a, b) => {
    const photosA = (a.photos as string[] | null)?.length ?? 0;
    const photosB = (b.photos as string[] | null)?.length ?? 0;
    switch (sort) {
      case "name":
        return (a.customerName || "").localeCompare(b.customerName || "");
      case "photosAsc":
        return photosA - photosB;
      case "photosDesc":
        return photosB - photosA;
      case "newest":
      default: {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      }
    }
  });
  return list.map((i) => i.id);
}

export default function PropertyGrid({
  campaignId,
  items,
  crews,
  isAdminOrOffice,
  currentUserId,
}: Props) {
  const { t } = useTranslation();

  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 200);
  const [crewFilter, setCrewFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<GridStatus>("all");
  const [sort, setSort] = useState<GridSort>("newest");
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  // Always-current ref so effects that intentionally omit `items` from their
  // dependency array can still read the latest items when they run.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // --- Stable ID snapshot ---------------------------------------------------
  // `snapshotIds`    — ordered, filtered IDs frozen at the last control change.
  //                    Drives tile positions so background refreshes (uploads)
  //                    can't reorder tiles.
  // `snapshotAllIds` — ALL item IDs present at snapshot time (not just the
  //                    filtered subset). Used to distinguish "filtered-out"
  //                    items from "brand-new" arrivals when building `rendered`.
  // `snapshotSeeded` — true once the snapshot has been computed from a non-empty
  //                    items list. Kept separate so the async-load effect can
  //                    still seed the snapshot when items arrive after mount.
  const [snapshotIds, setSnapshotIds] = useState<string[]>([]);
  const snapshotAllIds = useRef(new Set<string>());
  const snapshotSeeded = useRef(false);

  /**
   * Recompute the snapshot whenever the user changes a control. Reads
   * `itemsRef.current` so the latest items are always used without making
   * `items` a dependency (which would defeat the tile-freeze purpose).
   *
   * Only seeds when items are non-empty — if items haven't loaded yet at
   * mount time the async-load effect below handles first seeding.
   */
  useEffect(() => {
    const current = itemsRef.current;
    if (current.length === 0) return; // defer to async-load effect
    snapshotSeeded.current = true;
    snapshotAllIds.current = new Set(current.map((i) => i.id));
    setSnapshotIds(computeSnapshotIds(current, search, crewFilter, statusFilter, sort));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, crewFilter, statusFilter, sort]);

  /**
   * Seed the snapshot the first time non-empty items arrive (async load).
   * After the snapshot has been seeded once (`snapshotSeeded.current === true`),
   * this effect becomes a no-op so background item refreshes (photo uploads,
   * status changes) never reset tile positions.
   */
  useEffect(() => {
    if (snapshotSeeded.current || items.length === 0) return;
    snapshotSeeded.current = true;
    snapshotAllIds.current = new Set(items.map((i) => i.id));
    setSnapshotIds(
      computeSnapshotIds(items, search, crewFilter, statusFilter, sort),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // --- Live lookup ---------------------------------------------------------
  // Build a map of id → live item so card content (photo counts, status
  // badges) always reflects the latest data while positions stay frozen.
  const itemById = useMemo(() => {
    const m = new Map<string, PropertyCardItem>();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  // Rendered list:
  //   1. Items in the snapshot — stable positions, live data via `itemById`.
  //      Items removed from the server list are silently skipped.
  //   2. Truly brand-new items — their ID was absent from `snapshotAllIds` at
  //      snapshot time AND they pass the current filter controls. Items that
  //      were simply filtered out (absent from `snapshotIds` but present in
  //      `snapshotAllIds`) are not re-appended here.
  const rendered = useMemo(() => {
    const snapshotSet = new Set(snapshotIds);
    const result: PropertyCardItem[] = [];
    for (const id of snapshotIds) {
      const item = itemById.get(id);
      if (item) result.push(item);
    }
    for (const item of items) {
      if (!snapshotAllIds.current.has(item.id) && !snapshotSet.has(item.id)) {
        if (passesCurrentFilters(item, search, crewFilter, statusFilter)) {
          result.push(item);
        }
      }
    }
    return result;
  }, [snapshotIds, itemById, items, search, crewFilter, statusFilter]);

  // -------------------------------------------------------------------------

  const crewById = useMemo(() => {
    const m = new Map<string, CampaignCrewWithMembers>();
    crews.forEach((c) => m.set(c.id, c));
    return m;
  }, [crews]);

  const canDropOnItem = (item: PropertyCardItem): boolean => {
    if (isAdminOrOffice) return true;
    if (!currentUserId || !item.assignedCampaignCrewId) return false;
    const crew = crewById.get(item.assignedCampaignCrewId);
    return Boolean(crew && crew.leaderUserId === currentUserId);
  };

  const openItem = useMemo(
    () => (openItemId ? items.find((i) => i.id === openItemId) ?? null : null),
    [openItemId, items],
  );

  return (
    <div className="space-y-3" data-testid="property-grid-root">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("campaigns.extraBillableSearchProperties")}
            className="pl-8"
            data-testid="grid-search-input"
            autoFocus
          />
        </div>

        <Select value={crewFilter} onValueChange={setCrewFilter}>
          <SelectTrigger className="w-[180px]" data-testid="grid-crew-filter">
            <SelectValue placeholder={t("campaigns.extraBillableGridFilterCrew")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("campaigns.extraBillableGridFilterAll")}</SelectItem>
            <SelectItem value="unassigned">{t("campaigns.extraBillableGridFilterUnassigned")}</SelectItem>
            {crews.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as GridStatus)}>
          <SelectTrigger className="w-[160px]" data-testid="grid-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("campaigns.extraBillableGridStatusAll")}</SelectItem>
            <SelectItem value="pending">{t("campaigns.extraBillableGridStatusPending")}</SelectItem>
            <SelectItem value="completed">{t("campaigns.extraBillableGridStatusCompleted")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as GridSort)}>
          <SelectTrigger className="w-[180px]" data-testid="grid-sort-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("campaigns.extraBillableGridSortNewest")}</SelectItem>
            <SelectItem value="name">{t("campaigns.extraBillableGridSortName")}</SelectItem>
            <SelectItem value="photosAsc">{t("campaigns.extraBillableGridSortPhotosAsc")}</SelectItem>
            <SelectItem value="photosDesc">{t("campaigns.extraBillableGridSortPhotosDesc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rendered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="grid-empty">
          {t("campaigns.extraBillableGridEmpty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {rendered.map((item) => (
            <PropertyCard
              key={item.id}
              campaignId={campaignId}
              item={item}
              crew={item.assignedCampaignCrewId ? crewById.get(item.assignedCampaignCrewId) ?? null : null}
              canDrop={canDropOnItem(item)}
              onOpenPhotos={() => setOpenItemId(item.id)}
            />
          ))}
        </div>
      )}

      {openItem && (
        <PropertyPhotoSheet
          open={Boolean(openItemId)}
          onOpenChange={(o) => { if (!o) setOpenItemId(null); }}
          campaignId={campaignId}
          itemId={openItem.id}
          itemName={openItem.customerName}
          canDelete={canDropOnItem(openItem)}
        />
      )}
    </div>
  );
}
