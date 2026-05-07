import { useEffect, useMemo, useState } from "react";
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

  const filtered = useMemo(() => {
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
    return list;
  }, [items, search, crewFilter, statusFilter, sort]);

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

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="grid-empty">
          {t("campaigns.extraBillableGridEmpty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((item) => (
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
