import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Leaf, RefreshCw, Search, ChevronDown, ChevronUp, PackageOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PlantVarietyGroup, PlantSyncRun, PlantCategory } from "@/shared/schema";
import { PLANT_CATEGORY_LABELS } from "@/shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";

const CATEGORIES: Array<{ value: PlantCategory | ""; label: string }> = [
  { value: "", label: "All Categories" },
  { value: "deciduous_trees", label: "Deciduous Trees" },
  { value: "evergreen_trees", label: "Evergreen Trees" },
  { value: "ornamental_trees", label: "Ornamental Trees" },
  { value: "shrubs", label: "Shrubs" },
  { value: "perennials", label: "Perennials" },
  { value: "grasses", label: "Grasses" },
];

function formatPrice(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function SyncStatusBadge({ status }: { status: PlantSyncRun["status"] }) {
  if (status === "success") return <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">Success</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="secondary">Running…</Badge>;
}

function VarietyRow({ group }: { group: PlantVarietyGroup }) {
  const [open, setOpen] = useState(false);
  const totalOnHand = group.sizes.reduce((s, sz) => s + sz.onHand, 0);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
        data-testid="button-plant-variety-row"
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" data-testid="text-plant-common-name">
              {group.commonName}
            </span>
            <Badge variant="outline" className="text-xs">
              {PLANT_CATEGORY_LABELS[group.category]}
            </Badge>
          </div>
          {group.botanicalName && (
            <span className="text-xs text-muted-foreground italic" data-testid="text-plant-botanical-name">
              {group.botanicalName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {group.location && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {group.location}
            </span>
          )}
          <Badge variant={totalOnHand > 0 ? "default" : "secondary"} className="text-xs">
            {totalOnHand} on hand
          </Badge>
          <span className="text-xs text-muted-foreground">
            {group.sizes.length} size{group.sizes.length !== 1 ? "s" : ""}
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t bg-muted/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left px-4 py-2 font-medium">Size</th>
                <th className="text-right px-4 py-2 font-medium">On Hand</th>
                <th className="text-right px-4 py-2 font-medium">Sale Price</th>
                <th className="text-right px-4 py-2 font-medium">Wholesale</th>
                <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Location</th>
              </tr>
            </thead>
            <tbody>
              {group.sizes.map((sz) => (
                <tr key={sz.productCode} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{sz.sizeLabel || sz.sizeCode || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <span className={sz.onHand > 0 ? "text-green-700 font-medium" : "text-muted-foreground"}>
                      {sz.onHand}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPrice(sz.salePrice)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPrice(sz.wholesaleCost)}</td>
                  <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">
                    {group.location ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PlantLibrary() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const canSync = user?.activeRole === "admin" || user?.activeRole === "office" || user?.isSuperAdminBool;

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<PlantCategory | "">("");
  const [inStockOnly, setInStockOnly] = useState(true);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  params.set("inStockOnly", String(inStockOnly));

  const { data: varieties, isLoading, isError } = useQuery<PlantVarietyGroup[]>({
    queryKey: ["/api/plant-library/items", search, category, inStockOnly],
    queryFn: () =>
      apiRequest("GET", `/api/plant-library/items?${params.toString()}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: syncStatus } = useQuery<PlantSyncRun | null>({
    queryKey: ["/api/plant-library/sync-status"],
    queryFn: () =>
      apiRequest("GET", "/api/plant-library/sync-status").then((r) => r.json()),
    refetchInterval: 10_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/plant-library/sync"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/plant-library/items"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/plant-library/sync-status"] });
      toast({ title: t("plantLibrary.syncStarted"), description: t("plantLibrary.syncStartedDesc") });
    },
    onError: () => {
      toast({ title: t("plantLibrary.syncFailed"), variant: "destructive" });
    },
  });

  const lastSyncedText = syncStatus?.startedAt
    ? formatDistanceToNow(new Date(syncStatus.startedAt), { addSuffix: true })
    : null;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Leaf className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              {t("plantLibrary.title")}
            </h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-page-description">
            {t("plantLibrary.description")}
          </p>
          {syncStatus && (
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <SyncStatusBadge status={syncStatus.status} />
              {lastSyncedText && (
                <span data-testid="text-last-synced">
                  {t("plantLibrary.lastSynced", { time: lastSyncedText })}
                </span>
              )}
              {syncStatus.status === "success" && (
                <span>
                  · {syncStatus.itemsUpserted} {t("plantLibrary.itemsUpserted")}
                </span>
              )}
            </div>
          )}
        </div>

        {canSync && (
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || syncStatus?.status === "running"}
            data-testid="button-sync-now"
            className="flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {t("plantLibrary.syncNow")}
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("plantLibrary.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-plant-search"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as PlantCategory | "")}>
          <SelectTrigger className="w-full sm:w-48" data-testid="select-plant-category">
            <SelectValue placeholder={t("plantLibrary.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value || "__all__"}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-1">
          <Switch
            id="in-stock-toggle"
            checked={inStockOnly}
            onCheckedChange={setInStockOnly}
            data-testid="switch-in-stock-only"
          />
          <Label htmlFor="in-stock-toggle" className="text-sm cursor-pointer whitespace-nowrap">
            {t("plantLibrary.inStockOnly")}
          </Label>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground" data-testid="state-loading">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          {t("common.loading")}
        </div>
      )}

      {isError && (
        <div className="text-center py-20 text-destructive" data-testid="state-error">
          {t("plantLibrary.loadError")}
        </div>
      )}

      {!isLoading && !isError && varieties && varieties.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground" data-testid="state-empty">
          <PackageOpen className="w-10 h-10" />
          <p className="text-base font-medium">{t("plantLibrary.empty")}</p>
          <p className="text-sm">{t("plantLibrary.emptyHint")}</p>
        </div>
      )}

      {!isLoading && !isError && varieties && varieties.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="list-plant-varieties">
          <p className="text-sm text-muted-foreground mb-1">
            {t("plantLibrary.showingCount", { count: varieties.length })}
          </p>
          {varieties.map((group) => (
            <VarietyRow key={group.varietyKey} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
