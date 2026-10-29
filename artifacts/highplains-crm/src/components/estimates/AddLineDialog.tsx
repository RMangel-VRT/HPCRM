import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { HARDSCAPE_API, catalogListUrl, fetchJson, formatCents, parseDollarsToCents, type HardscapeListResponse } from "@/lib/hardscapeCatalog";
import { irrigationListUrl, type IrrigationListResponse } from "@/lib/irrigationCatalog";
import { QUICK_ITEMS_API, RATES_PREVIEW_API, moneyOrText, type QuickItem } from "@/lib/estimateSettings";
import {
  DEFAULT_UMBRELLA, FREE_UNITS, UMBRELLAS, validQuantity,
  type EstimateLineType, type EstimateUmbrella, type PlantVariety, type RatesPreviewWithContext,
} from "@/lib/estimateBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AddLineBody = Record<string, unknown> & { lineType: EstimateLineType; sectionId: string; quantity: string };

interface Row { key: string; title: string; detail?: string; meta?: string; badge?: string; warn?: string; disabled?: string; body?: Record<string, unknown>; free?: boolean }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

/** Plant dollar strings ("12.5") -> cents for display only. */
function plantDollars(s: string | null, lang: string): string | null {
  if (s == null || s === "") return null;
  const c = parseDollarsToCents(s);
  return typeof c === "number" ? formatCents(c, lang) : s;
}

export function AddLineDialog(props: {
  type: EstimateLineType | null; sectionId: string; customerId: string; companyId: string;
  onClose: () => void; onSubmit: (body: AddLineBody) => Promise<boolean>;
}) {
  const { type } = props;
  return (
    <Dialog open={!!type} onOpenChange={(o) => { if (!o) props.onClose(); }}>
      <DialogContent className="max-w-2xl" data-testid="dialog-add-line">
        {type && <PickerBody key={`${type}-${props.sectionId}`} {...props} type={type} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ type, sectionId, customerId, companyId, onClose, onSubmit }: {
  type: EstimateLineType; sectionId: string; customerId: string; companyId: string;
  onClose: () => void; onSubmit: (body: AddLineBody) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const scopeKey = [user?.activeCompanyId, user?.id, user?.activeRole] as const;
  const [freeMode, setFreeMode] = useState(type === "custom");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), 250);
  const [category, setCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [quantity, setQuantity] = useState("1");
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const enabled = !freeMode;
  const q = useQuery<unknown>({
    queryKey: ["estimate-picker", type, ...scopeKey, search, category, brand, customerId],
    enabled,
    queryFn: ({ signal }) => {
      switch (type) {
        case "plant": {
          const p = new URLSearchParams({ inStockOnly: "false", activeOnly: "true" }); if (search) p.set("search", search);
          return fetchJson<PlantVariety[]>(`/api/plant-library/items?${p}`, companyId, signal);
        }
        case "hardscape": return fetchJson<HardscapeListResponse>(catalogListUrl({ search, category, includeInactive: false }), companyId, signal);
        case "irrigation": return fetchJson<IrrigationListResponse>(irrigationListUrl({ search, category, brand, includeInactive: false }), companyId, signal);
        case "labor": return fetchJson<RatesPreviewWithContext>(`${RATES_PREVIEW_API}?customerId=${encodeURIComponent(customerId)}`, companyId, signal);
        default: return fetchJson<QuickItem[]>(`${QUICK_ITEMS_API}?kind=${type}`, companyId, signal);
      }
    },
  });

  const { rows, categories, brands } = useMemo(() => {
    const d = q.data;
    const s = search.toLowerCase();
    let rows: Row[] = []; let categories: string[] = []; let brands: string[] = [];
    if (!d) return { rows, categories, brands };
    if (type === "plant") {
      for (const v of d as PlantVariety[]) for (const sz of v.sizes.filter((x) => x.isActive !== false)) {
        rows.push({
          key: `${v.varietyKey}-${sz.productCode}`, title: v.commonName, detail: [v.botanicalName, sz.sizeLabel].filter(Boolean).join(" · "),
          meta: [t("estimateBuilder.picker.onHand", { count: sz.onHand }), plantDollars(sz.wholesaleCost, lang) && t("estimateBuilder.picker.cost", { amount: plantDollars(sz.wholesaleCost, lang) }),
            plantDollars(sz.salePrice, lang) && t("estimateBuilder.picker.price", { amount: plantDollars(sz.salePrice, lang) })].filter(Boolean).join(" · "),
          disabled: sz.id ? undefined : t("estimateBuilder.picker.noRef"),
          body: sz.id ? { plantCatalogItemId: sz.id } : undefined,
        });
      }
    } else if (type === "hardscape" || type === "irrigation") {
      const r = d as HardscapeListResponse & Partial<IrrigationListResponse>;
      categories = r.categories ?? []; brands = r.brands ?? [];
      rows = r.items.filter((i) => i.isActive).map((i) => ({
        key: i.id, title: i.name, detail: [i.sku, i.description].filter(Boolean).join(" · "),
        meta: [i.unit, i.retailPriceCents != null && t("estimateBuilder.picker.price", { amount: formatCents(i.retailPriceCents, lang) }),
          i.wholesaleCostCents != null && t("estimateBuilder.picker.cost", { amount: formatCents(i.wholesaleCostCents, lang) })].filter(Boolean).join(" · "),
        body: type === "hardscape" ? { hardscapeCatalogItemId: i.id } : { irrigationCatalogItemId: i.id },
      }));
    } else if (type === "labor") {
      rows = (d as RatesPreviewWithContext).items.filter((r) => !s || r.label.toLowerCase().includes(s) || r.rateKey.toLowerCase().includes(s)).map((r) => {
        const textOnly = r.rateCents == null && !!r.priceText?.trim();
        return {
          key: r.rateKey, title: r.label, detail: r.unit ?? undefined,
          meta: moneyOrText(r.rateCents, null, lang) ?? undefined,
          badge: r.source === "unset" ? undefined : t(`estimateBuilder.line.source.${r.source}`),
          warn: textOnly ? t("estimateBuilder.picker.textRate", { text: r.priceText }) : undefined,
          disabled: r.source === "unset" || (r.rateCents == null && !textOnly) ? t("estimateBuilder.picker.unset") : undefined,
          body: { rateKey: r.rateKey },
        };
      });
    } else {
      rows = (d as QuickItem[]).filter((i) => i.isActive && (!s || i.label.toLowerCase().includes(s))).sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          key: i.id, title: i.label, detail: t(`estimateBuilder.unit.${i.defaultUnit}`, { defaultValue: i.defaultUnit }),
          meta: i.defaultRateCents != null ? formatCents(i.defaultRateCents, lang) : t("estimateBuilder.picker.noDefault"),
          body: { quickItemId: i.id },
        }));
      rows.push({ key: "__free", title: t("estimateBuilder.picker.freeType"), detail: t("estimateBuilder.picker.freeTypeHint"), free: true });
    }
    return { rows, categories, brands };
  }, [q.data, type, search, lang, t]);

  useEffect(() => { setHighlight(0); }, [rows.length, search, category, brand]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [highlight]);

  async function submit(extra: Record<string, unknown>) {
    const qty = validQuantity(quantity);
    if (!qty) { setQtyError(t("estimateBuilder.err.quantity")); return; }
    setQtyError(null); setPending(true);
    const ok = await onSubmit({ lineType: type, sectionId, quantity: qty, ...extra });
    setPending(false);
    if (ok) onClose();
  }
  function choose(r: Row | undefined) {
    if (!r || pending) return;
    if (r.free) { setFreeMode(true); return; }
    if (r.disabled || !r.body) return;
    void submit(r.body);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(rows.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(rows[highlight]); }
  }

  const title = t(`estimateBuilder.picker.title.${type}`);
  if (freeMode) {
    return <FreeForm type={type} title={title} pending={pending} quantity={quantity} setQuantity={setQuantity} qtyError={qtyError}
      onBack={type === "custom" ? undefined : () => setFreeMode(false)} onCancel={onClose}
      onSubmit={(fields) => void submit(fields)} />;
  }

  const chip = (on: boolean) => cn("h-7 rounded-full border px-3 text-[12.5px] transition-colors",
    on ? "border-transparent bg-rail-active font-semibold text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover");
  const activeId = rows[highlight] ? `pick-${rows[highlight].key}` : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t("estimateBuilder.picker.desc")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={onKey}
            placeholder={t("estimateBuilder.picker.searchPlaceholder")} aria-label={t("estimateBuilder.picker.search")} className="pl-8"
            role="combobox" aria-expanded aria-controls="picker-list" aria-activedescendant={activeId} data-testid="input-picker-search" />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("estimateBuilder.picker.categories")}>
            {[null, ...categories].map((c) => (
              <button key={c ?? "__all"} type="button" aria-pressed={category === c} className={chip(category === c)} onClick={() => setCategory(c)} data-testid={`chip-picker-category-${c ?? "all"}`}>
                {c ?? t("estimateBuilder.picker.all")}
              </button>
            ))}
          </div>
        )}
        {brands.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("estimateBuilder.picker.brands")}>
            {[null, ...brands].map((b) => (
              <button key={b ?? "__all"} type="button" aria-pressed={brand === b} className={chip(brand === b)} onClick={() => setBrand(b)} data-testid={`chip-picker-brand-${b ?? "all"}`}>
                {b ?? t("estimateBuilder.picker.all")}
              </button>
            ))}
          </div>
        )}
        {q.isError ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="picker-error">
            {t("estimateBuilder.picker.loadError")}
            <Button size="sm" variant="outline" onClick={() => q.refetch()} data-testid="button-picker-retry">{t("estimateBuilder.picker.retry")}</Button>
          </div>
        ) : q.isLoading ? (
          <div role="status" aria-label={t("estimateBuilder.picker.loading")} className="space-y-1.5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground" data-testid="picker-empty">{t("estimateBuilder.picker.empty")}</p>
        ) : (
          <ul id="picker-list" ref={listRef} role="listbox" aria-label={t("estimateBuilder.picker.results")} className="max-h-[46vh] divide-y overflow-y-auto rounded-md border bg-card" data-testid="list-picker">
            {rows.map((r, i) => (
              <li key={r.key} id={`pick-${r.key}`} data-index={i} role="option" aria-selected={i === highlight} aria-disabled={!!r.disabled}
                onMouseEnter={() => setHighlight(i)} onClick={() => choose(r)} data-testid={`option-${r.key}`}
                className={cn("flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 text-sm",
                  i === highlight && "bg-rail-hover", r.disabled && "cursor-not-allowed opacity-60", r.free && "border-t-2 border-dashed")}>
                <div className="min-w-0">
                  <div className={cn("font-semibold", r.free && "italic")}>{r.title}</div>
                  {r.detail && <div className="truncate text-xs text-muted-foreground">{r.detail}</div>}
                  {r.warn && <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--est-warn))]" data-testid={`warn-${r.key}`}><AlertTriangle className="h-3 w-3" />{r.warn}</div>}
                  {r.disabled && <div className="mt-0.5 text-xs text-destructive">{r.disabled}</div>}
                </div>
                <div className="shrink-0 text-right">
                  {r.meta && <div className="text-xs tabular-nums text-muted-foreground">{r.meta}</div>}
                  {r.badge && <span className="mt-0.5 inline-block rounded border px-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">{r.badge}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="grid w-32 gap-1">
            <Label htmlFor="picker-qty">{t("estimateBuilder.picker.quantity")}</Label>
            <Input id="picker-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); choose(rows[highlight]); } }}
              aria-invalid={!!qtyError} className="tabular-nums" data-testid="input-picker-quantity" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-picker-cancel">{t("estimateBuilder.cancel")}</Button>
            <Button type="button" disabled={pending || !rows[highlight] || !!rows[highlight].disabled} onClick={() => choose(rows[highlight])} data-testid="button-picker-add">
              {pending ? t("estimateBuilder.picker.adding") : t("estimateBuilder.picker.add")}
            </Button>
          </DialogFooter>
        </div>
        {qtyError && <p className="text-xs font-medium text-destructive" data-testid="error-picker-quantity">{qtyError}</p>}
      </div>
    </>
  );
}

function FreeForm({ type, title, pending, quantity, setQuantity, qtyError, onBack, onCancel, onSubmit }: {
  type: EstimateLineType; title: string; pending: boolean; quantity: string; setQuantity: (v: string) => void; qtyError: string | null;
  onBack?: () => void; onCancel: () => void; onSubmit: (fields: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [unit, setUnit] = useState<string>(type === "fee" || type === "custom" ? "ea" : "hour");
  const [rate, setRate] = useState("");
  const [umbrella, setUmbrella] = useState<EstimateUmbrella>(DEFAULT_UMBRELLA[type as "equipment" | "fee" | "custom"] ?? "landscape_materials");
  const [errs, setErrs] = useState<{ name?: string; rate?: string }>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const n: typeof errs = {};
    if (!name.trim()) n.name = t("estimateBuilder.err.required");
    const c = parseDollarsToCents(rate);
    if (c === null || c === "invalid") n.rate = t("estimateBuilder.err.rate");
    if (c === "tooLarge") n.rate = t("estimateBuilder.err.tooLarge");
    setErrs(n);
    if (Object.keys(n).length || typeof c !== "number") return;
    onSubmit({ name: name.trim(), ...(detail.trim() ? { detail: detail.trim() } : {}), unit, unitPriceCents: c, umbrellaKey: umbrella });
  }
  const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t("estimateBuilder.picker.freeTypeHint")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="grid gap-3" data-testid="form-free-entry">
        <div className="grid gap-1">
          <Label htmlFor="free-name">{t("estimateBuilder.picker.name")}</Label>
          <Input id="free-name" autoFocus maxLength={500} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errs.name} data-testid="input-free-name" />
          {errs.name && <p className="text-xs text-destructive">{errs.name}</p>}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="free-detail">{t("estimateBuilder.picker.detail")}</Label>
          <Input id="free-detail" value={detail} onChange={(e) => setDetail(e.target.value)} data-testid="input-free-detail" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="free-unit">{t("estimateBuilder.picker.unit")}</Label>
            <select id="free-unit" className={sel} value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="select-free-unit">
              {FREE_UNITS.map((u) => <option key={u} value={u}>{t(`estimateBuilder.unit.${u}`)}</option>)}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="free-rate">{t("estimateBuilder.picker.rate")}</Label>
            <Input id="free-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!!errs.rate} className="tabular-nums" data-testid="input-free-rate" />
            {errs.rate && <p className="text-xs text-destructive">{errs.rate}</p>}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="free-qty">{t("estimateBuilder.picker.quantity")}</Label>
            <Input id="free-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="tabular-nums" data-testid="input-free-quantity" />
            {qtyError && <p className="text-xs text-destructive" data-testid="error-picker-quantity">{qtyError}</p>}
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="free-umbrella">{t("estimateBuilder.picker.umbrella")}</Label>
          <select id="free-umbrella" className={sel} value={umbrella} onChange={(e) => setUmbrella(e.target.value as EstimateUmbrella)} data-testid="select-free-umbrella">
            {UMBRELLAS.map((u) => <option key={u} value={u}>{t(`qboSetup.umbrella.${u}`)}</option>)}
          </select>
        </div>
        <DialogFooter className="gap-2">
          {onBack && <Button type="button" variant="ghost" onClick={onBack} className="mr-auto" data-testid="button-free-back"><ArrowLeft className="mr-1 h-4 w-4" />{t("estimateBuilder.picker.back")}</Button>}
          <Button type="button" variant="outline" onClick={onCancel} data-testid="button-picker-cancel">{t("estimateBuilder.cancel")}</Button>
          <Button type="submit" disabled={pending} data-testid="button-free-add">{pending ? t("estimateBuilder.picker.adding") : t("estimateBuilder.picker.add")}</Button>
        </DialogFooter>
      </form>
    </>
  );
}
