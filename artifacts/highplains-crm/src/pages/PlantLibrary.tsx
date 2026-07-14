import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Leaf, RefreshCw, Search, ChevronDown, ChevronUp, PackageOpen, Plus, Check, Minus
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PlantVarietyGroup, PlantSyncRun, PlantCategory, PlantEnrichmentData } from "@/shared/schema";
import { PLANT_CATEGORY_LABELS } from "@/shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";

const CATEGORIES: Array<{ value: PlantCategory | ""; label: string }> = [
  { value: "", label: "All Categories" },
  { value: "tree",             label: "Trees" },
  { value: "shrub",            label: "Shrubs" },
  { value: "perennial",        label: "Perennials" },
  { value: "shrub_rose",       label: "Roses" },
  { value: "vine",             label: "Vines" },
  { value: "ornamental_grass", label: "Ornamental Grasses" },
];

type TraitFilter = "xeriscape" | "native" | "pollinator" | "deer";

export interface PlantPickerSelection {
  plantCatalogItemId: string;
  quantity: number;
}

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

function TraitChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center text-xs rounded-full px-2.5 py-1 border transition-colors ${
        active
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-background text-muted-foreground border-border hover:border-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function EnrichmentPanel({ enrichment }: { enrichment: PlantEnrichmentData }) {
  const { t } = useTranslation();
  const facts: Array<{ label: string; value: string | null }> = [
    { label: t("plantLibrary.filterLight"), value: enrichment.light },
    { label: t("plantLibrary.filterWater"), value: enrichment.waterUse },
    { label: t("plantLibrary.filterBloom"), value: enrichment.bloomTime },
    { label: "Bloom Color", value: enrichment.bloomColor },
    { label: "Fall Color", value: enrichment.fallColor },
    { label: "Growth Rate", value: enrichment.growthRate },
  ].filter((f) => f.value);

  const traits: string[] = [];
  if (enrichment.isXeriscape) traits.push(t("plantLibrary.filterXeriscape"));
  if (enrichment.isNative) traits.push(t("plantLibrary.filterNative"));
  if (enrichment.isPollinatorFriendly) traits.push(t("plantLibrary.filterPollinator"));
  if (enrichment.deerResistant) traits.push(t("plantLibrary.filterDeer"));

  return (
    <div className="border-t bg-muted/10 px-4 py-3 flex flex-col gap-3">
      <div className="flex gap-3 flex-col sm:flex-row">
        {enrichment.imageUrl && (
          <div className="sm:w-28 flex-shrink-0">
            <img
              src={enrichment.imageUrl}
              alt={enrichment.displayName ?? ""}
              className="w-full h-20 sm:h-24 object-cover rounded"
              onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }}
            />
            {enrichment.imageAttribution && (
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                {t("plantLibrary.photoCredit")}: {enrichment.imageAttribution}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {enrichment.matchStatus === "auto" && (
            <Badge variant="secondary" className="text-xs w-fit">{t("plantLibrary.unverifiedMatch")}</Badge>
          )}
          {enrichment.descriptionText && (
            <p className="text-xs text-muted-foreground line-clamp-3">{enrichment.descriptionText}</p>
          )}
          {facts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {facts.map((f) => (
                <span key={f.label} className="text-xs bg-background border border-border rounded-full px-2 py-0.5">
                  <span className="font-medium text-foreground">{f.label}:</span>{" "}
                  <span className="text-muted-foreground">{f.value}</span>
                </span>
              ))}
            </div>
          )}
          {traits.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {traits.map((tr) => (
                <span key={tr} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                  {tr}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SizeRowInsertState {
  selected: boolean;
  quantity: number;
}

function VarietyRow({
  group,
  insertMode,
  selections,
  onToggleSize,
  onQuantityChange,
}: {
  group: PlantVarietyGroup;
  insertMode?: boolean;
  selections?: Map<string, SizeRowInsertState>;
  onToggleSize?: (productCode: string) => void;
  onQuantityChange?: (productCode: string, qty: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const totalOnHand = group.sizes.reduce((s, sz) => s + sz.onHand, 0);
  const enrichment = group.enrichment ?? null;

  const anySelected = insertMode && group.sizes.some(sz => selections?.get(sz.productCode)?.selected);

  return (
    <div className={`border rounded-lg overflow-hidden ${anySelected ? "border-emerald-500 ring-1 ring-emerald-300" : ""}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
        data-testid="button-plant-variety-row"
      >
        <div className="flex items-center gap-3 min-w-0">
          {enrichment?.imageUrl && (
            <img
              src={enrichment.imageUrl}
              alt={group.commonName}
              className="w-10 h-10 object-cover rounded flex-shrink-0 hidden sm:block"
              onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm" data-testid="text-plant-common-name">
                {group.commonName}
              </span>
              <Badge variant="outline" className="text-xs">
                {PLANT_CATEGORY_LABELS[group.category][i18n.language === "es" ? "es" : "en"]}
              </Badge>
              {enrichment?.matchStatus === "auto" && (
                <Badge variant="secondary" className="text-xs opacity-80">{t("plantLibrary.unverifiedMatch")}</Badge>
              )}
              {anySelected && (
                <Badge className="text-xs bg-emerald-600">Selected</Badge>
              )}
            </div>
            {group.botanicalName && (
              <span className="text-xs text-muted-foreground italic" data-testid="text-plant-botanical-name">
                {group.botanicalName}
              </span>
            )}
            {enrichment && (enrichment.light || enrichment.isXeriscape || enrichment.isNative || enrichment.isPollinatorFriendly) && (
              <div className="flex gap-1 flex-wrap mt-0.5">
                {enrichment.light && (
                  <span className="text-[10px] text-muted-foreground">{enrichment.light}</span>
                )}
                {enrichment.isXeriscape && <span className="text-[10px] text-emerald-600">· Xeriscape</span>}
                {enrichment.isNative && <span className="text-[10px] text-emerald-600">· Native</span>}
                {enrichment.isPollinatorFriendly && <span className="text-[10px] text-emerald-600">· Pollinator</span>}
              </div>
            )}
          </div>
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
          {enrichment && (enrichment.imageUrl || enrichment.light || enrichment.bloomTime || enrichment.descriptionText) && (
            <EnrichmentPanel enrichment={enrichment} />
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                {insertMode && <th className="w-8 px-3 py-2" />}
                <th className="text-left px-4 py-2 font-medium">Size</th>
                <th className="text-right px-4 py-2 font-medium">On Hand</th>
                {!insertMode && <th className="text-right px-4 py-2 font-medium">Sale Price</th>}
                {!insertMode && <th className="text-right px-4 py-2 font-medium">Wholesale</th>}
                {!insertMode && <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Location</th>}
                {insertMode && <th className="text-right px-4 py-2 font-medium">Qty</th>}
              </tr>
            </thead>
            <tbody>
              {group.sizes.map((sz) => {
                const state = selections?.get(sz.productCode);
                const isSelected = state?.selected ?? false;
                const qty = state?.quantity ?? 1;
                return (
                  <tr
                    key={sz.productCode}
                    className={`border-b last:border-0 ${insertMode ? "cursor-pointer" : ""} ${isSelected ? "bg-emerald-50 dark:bg-emerald-950/30" : "hover:bg-muted/30"}`}
                    onClick={insertMode ? () => onToggleSize?.(sz.productCode) : undefined}
                  >
                    {insertMode && (
                      <td className="px-3 py-2">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-2 font-medium">{sz.sizeLabel || sz.sizeCode || "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className={sz.onHand > 0 ? "text-green-700 font-medium" : "text-muted-foreground"}>
                        {sz.onHand}
                      </span>
                    </td>
                    {!insertMode && <td className="px-4 py-2 text-right tabular-nums">{formatPrice(sz.salePrice)}</td>}
                    {!insertMode && <td className="px-4 py-2 text-right tabular-nums">{formatPrice(sz.wholesaleCost)}</td>}
                    {!insertMode && (
                      <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">
                        {group.location ?? "—"}
                      </td>
                    )}
                    {insertMode && (
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {isSelected && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted"
                              onClick={(e) => { e.stopPropagation(); onQuantityChange?.(sz.productCode, Math.max(1, qty - 1)); }}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => onQuantityChange?.(sz.productCode, Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-12 text-center text-sm border rounded px-1 py-0.5"
                            />
                            <button
                              type="button"
                              className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted"
                              onClick={(e) => { e.stopPropagation(); onQuantityChange?.(sz.productCode, qty + 1); }}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface PlantLibraryProps {
  insertMode?: boolean;
  onAddSelections?: (selections: PlantPickerSelection[]) => void;
  addPending?: boolean;
}

export default function PlantLibrary({ insertMode, onAddSelections, addPending }: PlantLibraryProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const canSync = user?.activeRole === "admin" || user?.activeRole === "office" || user?.isSuperAdminBool;

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<PlantCategory | "">("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [activeTraits, setActiveTraits] = useState<Set<TraitFilter>>(new Set());
  const [sizeSelections, setSizeSelections] = useState<Map<string, SizeRowInsertState>>(new Map());

  function toggleTrait(tr: TraitFilter) {
    setActiveTraits((prev) => {
      const next = new Set(prev);
      if (next.has(tr)) next.delete(tr);
      else next.add(tr);
      return next;
    });
  }

  function handleToggleSize(productCode: string) {
    setSizeSelections((prev) => {
      const next = new Map(prev);
      const cur = next.get(productCode);
      if (cur?.selected) {
        next.delete(productCode);
      } else {
        next.set(productCode, { selected: true, quantity: cur?.quantity ?? 1 });
      }
      return next;
    });
  }

  function handleQuantityChange(productCode: string, qty: number) {
    setSizeSelections((prev) => {
      const next = new Map(prev);
      const cur = next.get(productCode);
      if (cur) next.set(productCode, { ...cur, quantity: qty });
      return next;
    });
  }

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
    enabled: !insertMode,
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

  const filteredVarieties = varieties?.filter((group) => {
    if (activeTraits.size === 0) return true;
    const e = group.enrichment;
    if (!e) return false;
    if (activeTraits.has("xeriscape") && !e.isXeriscape) return false;
    if (activeTraits.has("native") && !e.isNative) return false;
    if (activeTraits.has("pollinator") && !e.isPollinatorFriendly) return false;
    if (activeTraits.has("deer") && !e.deerResistant) return false;
    return true;
  });

  const TRAITS: Array<{ key: TraitFilter; label: string }> = [
    { key: "xeriscape", label: t("plantLibrary.filterXeriscape") },
    { key: "native", label: t("plantLibrary.filterNative") },
    { key: "pollinator", label: t("plantLibrary.filterPollinator") },
    { key: "deer", label: t("plantLibrary.filterDeer") },
  ];

  const selectedCount = [...sizeSelections.values()].filter(s => s.selected).length;

  function buildSelections(): PlantPickerSelection[] {
    if (!varieties) return [];
    const result: PlantPickerSelection[] = [];
    for (const group of varieties) {
      for (const sz of group.sizes) {
        const state = sizeSelections.get(sz.productCode);
        if (!state?.selected) continue;
        result.push({
          plantCatalogItemId: sz.productCode,
          quantity: state.quantity,
        });
      }
    }
    return result;
  }

  const outerClass = insertMode ? "p-4 max-w-full" : "p-8 max-w-6xl mx-auto";

  return (
    <div className={outerClass}>
      {!insertMode && (
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
      )}

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
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

        <div className="flex gap-2 flex-wrap" data-testid="trait-filters">
          {TRAITS.map((trait) => (
            <TraitChip
              key={trait.key}
              label={trait.label}
              active={activeTraits.has(trait.key)}
              onClick={() => toggleTrait(trait.key)}
            />
          ))}
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

      {!isLoading && !isError && filteredVarieties && filteredVarieties.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground" data-testid="state-empty">
          <PackageOpen className="w-10 h-10" />
          <p className="text-base font-medium">{t("plantLibrary.empty")}</p>
          <p className="text-sm">{t("plantLibrary.emptyHint")}</p>
        </div>
      )}

      {!isLoading && !isError && filteredVarieties && filteredVarieties.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="list-plant-varieties">
          {!insertMode && (
            <p className="text-sm text-muted-foreground mb-1">
              {t("plantLibrary.showingCount", { count: filteredVarieties.length })}
            </p>
          )}
          {filteredVarieties.map((group) => (
            <VarietyRow
              key={group.varietyKey}
              group={group}
              insertMode={insertMode}
              selections={sizeSelections}
              onToggleSize={handleToggleSize}
              onQuantityChange={handleQuantityChange}
            />
          ))}
        </div>
      )}

      {insertMode && selectedCount > 0 && (
        <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 p-3 rounded-lg border bg-background shadow-lg">
          <span className="text-sm font-medium">
            {selectedCount} size{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <Button
            size="sm"
            onClick={() => {
              const items = buildSelections();
              onAddSelections?.(items);
            }}
            disabled={addPending}
            data-testid="button-add-plants-to-proposal"
          >
            {addPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Add {selectedCount} to Proposal
          </Button>
        </div>
      )}
    </div>
  );
}
