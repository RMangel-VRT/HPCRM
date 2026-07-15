import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Leaf, Check, X, Loader2, ChevronUp, ChevronDown,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlantPaletteWithItems, PlantPaletteItem } from "@shared/schema";
import PlantLibrary from "./PlantLibrary";
import type { PlantPickerSelection } from "./PlantLibrary";

const CATEGORY_ORDER: Record<string, number> = {
  tree: 0,
  shrub: 1,
  perennial: 2,
  shrub_rose: 3,
  vine: 4,
  ornamental_grass: 5,
};

const CATEGORY_LABELS: Record<string, string> = {
  tree: "Trees",
  shrub: "Shrubs & Evergreens",
  perennial: "Perennials",
  shrub_rose: "Roses",
  vine: "Vines",
  ornamental_grass: "Ornamental Grasses",
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCategoryOrder(cat: string): number {
  return CATEGORY_ORDER[cat] ?? 999;
}

function groupByCategory(items: PlantPaletteItem[]): Array<{ category: string; items: PlantPaletteItem[] }> {
  const map = new Map<string, PlantPaletteItem[]>();
  for (const item of items) {
    const arr = map.get(item.category) ?? [];
    arr.push(item);
    map.set(item.category, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => getCategoryOrder(a) - getCategoryOrder(b))
    .map(([category, items]) => ({ category, items }));
}

interface EditingLabel {
  itemId: string;
  value: string;
}

function PaletteItemCard({
  item,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onLabelSave,
}: {
  item: PlantPaletteItem;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onLabelSave: (label: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [labelVal, setLabelVal] = useState(item.typeLabel);

  const imageUrl = item.imageStoragePathSnapshot
    ? `/api/plant-library/photo/${encodeURIComponent(item.varietyKey ?? item.id)}`
    : (item.imageUrlSnapshot ?? null);

  function commitLabel() {
    if (labelVal.trim() && labelVal !== item.typeLabel) {
      onLabelSave(labelVal.trim());
    }
    setEditing(false);
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-background" data-testid={`card-palette-item-${item.id}`}>
      <div className="flex items-center gap-3 p-3">
        {/* Image */}
        <div className="w-16 h-16 rounded overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.nameSnapshot}
              className="w-full h-full object-cover"
              onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <Leaf className="w-6 h-6 text-muted-foreground" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate" data-testid={`text-item-name-${item.id}`}>
            {item.nameSnapshot}
          </p>
          {editing ? (
            <div className="flex items-center gap-1 mt-1">
              <Input
                value={labelVal}
                onChange={(e) => setLabelVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLabel(); } if (e.key === "Escape") { setEditing(false); setLabelVal(item.typeLabel); } }}
                className="h-6 text-xs px-1 italic"
                autoFocus
                data-testid={`input-type-label-${item.id}`}
              />
              <button type="button" onClick={commitLabel} className="text-emerald-600 hover:text-emerald-700" data-testid={`button-save-label-${item.id}`}>
                <Check className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => { setEditing(false); setLabelVal(item.typeLabel); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground italic hover:text-foreground text-left mt-0.5"
              data-testid={`button-edit-label-${item.id}`}
            >
              {item.typeLabel}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            data-testid={`button-move-up-${item.id}`}
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            data-testid={`button-move-down-${item.id}`}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive ml-1"
          data-testid={`button-remove-item-${item.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function PlantPaletteDraft() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [plantSheetOpen, setPlantSheetOpen] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [editIntro, setEditIntro] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: palette, isLoading } = useQuery<PlantPaletteWithItems>({
    queryKey: [`/api/plant-palettes/${id}`],
    queryFn: () => apiRequest("GET", `/api/plant-palettes/${id}`).then((r) => r.json()),
  });

  const patchMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/plant-palettes/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/plant-palettes/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-palettes"] });
      setSavingField(null);
    },
    onError: () => {
      toast({ title: t("plantPalette.saveFailed"), variant: "destructive" });
      setSavingField(null);
    },
  });

  const addItemsMutation = useMutation({
    mutationFn: async (selections: PlantPickerSelection[]) => {
      const results = [];
      for (const sel of selections) {
        const res = await apiRequest("POST", `/api/plant-palettes/${id}/items`, {
          plantCatalogItemId: sel.plantCatalogItemId,
        });
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/plant-palettes/${id}`] });
      setPlantSheetOpen(false);
      setAddPending(false);
    },
    onError: () => {
      toast({ title: t("plantPalette.saveFailed"), variant: "destructive" });
      setAddPending(false);
    },
  });

  const patchItemMutation = useMutation({
    mutationFn: async ({ itemId, body }: { itemId: string; body: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/plant-palettes/${id}/items/${itemId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/plant-palettes/${id}`] });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/plant-palettes/${id}/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/plant-palettes/${id}`] });
    },
  });

  const deletePaletteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/plant-palettes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-palettes"] });
      window.history.back();
    },
    onError: () => {
      toast({ title: t("plantPalette.deleteFailed"), variant: "destructive" });
    },
  });

  function handleTitleBlur() {
    if (editTitle !== null && editTitle !== palette?.title) {
      setSavingField("title");
      patchMutation.mutate({ title: editTitle });
    }
    setEditTitle(null);
  }

  function handleIntroBlur() {
    if (editIntro !== null && editIntro !== palette?.introText) {
      setSavingField("intro");
      patchMutation.mutate({ introText: editIntro });
    }
    setEditIntro(null);
  }

  function handleDateBlur() {
    if (editDate !== null && editDate !== palette?.paletteDate) {
      setSavingField("date");
      patchMutation.mutate({ paletteDate: editDate });
    }
    setEditDate(null);
  }

  function handleAddSelections(selections: PlantPickerSelection[]) {
    if (!selections.length) {
      setPlantSheetOpen(false);
      return;
    }
    setAddPending(true);
    addItemsMutation.mutate(selections);
  }

  function handleMoveItem(allItems: PlantPaletteItem[], item: PlantPaletteItem, direction: "up" | "down") {
    const currentOrder = item.displayOrder;
    const target = allItems.find((i) =>
      direction === "up"
        ? i.displayOrder === currentOrder - 1
        : i.displayOrder === currentOrder + 1
    );
    if (!target) return;
    patchItemMutation.mutate({ itemId: item.id, body: { displayOrder: target.displayOrder } });
    patchItemMutation.mutate({ itemId: target.id, body: { displayOrder: currentOrder } });
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="h-8 bg-muted rounded w-48 mb-4 animate-pulse" />
        <div className="h-4 bg-muted rounded w-64 animate-pulse" />
      </div>
    );
  }

  if (!palette) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-muted-foreground">Palette not found.</p>
        <Link href="/dashboard/tools/plant-palette">
          <Button variant="outline" className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
        </Link>
      </div>
    );
  }

  const groups = groupByCategory(palette.items ?? []);
  const allItems = palette.items ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link href="/dashboard/tools/plant-palette">
          <Button variant="ghost" size="icon" data-testid="button-back-palettes">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          {editTitle !== null ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
              className="text-2xl font-semibold h-auto py-0.5 px-1 -ml-1"
              autoFocus
              data-testid="input-palette-title"
            />
          ) : (
            <h1
              className="text-2xl font-semibold cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => setEditTitle(palette.title)}
              data-testid="text-palette-title"
            >
              {savingField === "title" ? <><Loader2 className="inline w-4 h-4 animate-spin mr-2" />{palette.title}</> : palette.title}
            </h1>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {palette.customerName && (
              <span className="text-sm text-muted-foreground">{palette.customerName}</span>
            )}
            {palette.isTemplate && (
              <Badge variant="outline" className="text-xs">{t("plantPalette.templates")}</Badge>
            )}
            <Badge variant={palette.status === "published" ? "default" : "secondary"} className="text-xs">
              {t(`plantPalette.${palette.status}`)}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {palette.status === "draft" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => patchMutation.mutate({ status: "published" })}
              disabled={patchMutation.isPending}
              data-testid="button-publish-palette"
            >
              {t("plantPalette.publish")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
            data-testid="button-delete-palette"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Meta fields */}
      <Card className="mb-6">
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("plantPalette.introText")}</Label>
            {editIntro !== null ? (
              <Textarea
                value={editIntro}
                onChange={(e) => setEditIntro(e.target.value)}
                onBlur={handleIntroBlur}
                placeholder={t("plantPalette.introTextPlaceholder")}
                rows={3}
                autoFocus
                data-testid="textarea-intro-text"
              />
            ) : (
              <div
                className="text-sm text-muted-foreground cursor-pointer hover:opacity-70 min-h-[2.5rem] rounded border border-transparent hover:border-border px-2 py-1 transition-all"
                onClick={() => setEditIntro(palette.introText ?? "")}
                data-testid="text-intro-text"
              >
                {palette.introText || <span className="italic opacity-60">{t("plantPalette.introTextPlaceholder")}</span>}
              </div>
            )}
          </div>
          <div className="space-y-1 max-w-xs">
            <Label className="text-xs text-muted-foreground">{t("plantPalette.paletteDate")}</Label>
            <Input
              type="date"
              value={editDate ?? (palette.paletteDate ?? "")}
              onChange={(e) => setEditDate(e.target.value)}
              onBlur={handleDateBlur}
              className="h-8 text-sm"
              data-testid="input-palette-date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Items header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Plants</h2>
        <Button onClick={() => setPlantSheetOpen(true)} data-testid="button-add-plants">
          <Plus className="w-4 h-4 mr-2" /> {t("plantPalette.addPlants")}
        </Button>
      </div>

      {/* Groups */}
      {!allItems.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Leaf className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">{t("plantPalette.noItems")}</p>
            <p className="text-sm text-muted-foreground mb-4">{t("plantPalette.noItemsDesc")}</p>
            <Button onClick={() => setPlantSheetOpen(true)} data-testid="button-add-plants-empty">
              <Plus className="w-4 h-4 mr-2" /> {t("plantPalette.addPlants")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ category, items }) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2" data-testid={`heading-category-${category}`}>
                {getCategoryLabel(category)}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items
                  .slice()
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((item, idx, arr) => (
                    <PaletteItemCard
                      key={item.id}
                      item={item}
                      isFirst={idx === 0}
                      isLast={idx === arr.length - 1}
                      onMoveUp={() => handleMoveItem(allItems, item, "up")}
                      onMoveDown={() => handleMoveItem(allItems, item, "down")}
                      onRemove={() => removeItemMutation.mutate(item.id)}
                      onLabelSave={(label) => patchItemMutation.mutate({ itemId: item.id, body: { typeLabel: label } })}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plant Library Sheet */}
      <Sheet open={plantSheetOpen} onOpenChange={setPlantSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>{t("plantPalette.addPlants")}</SheetTitle>
          </SheetHeader>
          <PlantLibrary
            insertMode
            onAddSelections={handleAddSelections}
            addPending={addPending}
          />
        </SheetContent>
      </Sheet>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("plantPalette.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("plantPalette.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePaletteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-palette"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
