import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Droplets, Hammer, Leaf, MoreHorizontal, Mountain, PenLine, Receipt, Sprout, Tractor, Trash2 } from "lucide-react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { derivePaletteTypeLabel } from "../../../../../lib/db/src/plantExhibitContracts";
import { estimateCatalogReference, estimateCatalogReferenceSchema, type EstimateCatalogReference } from "../../../../../lib/db/src/estimateContracts";
import { normalizeEstimateUnit, unitLabel } from "@/lib/estimateUnits";
import { centsToInput, formatCents, parseDollarsToCents } from "@/lib/hardscapeCatalog";
import { FREE_UNITS, FREE_UNIT_TYPES, LINE_TINT, validQuantity, type EstimateLineDto, type EstimateSectionDto } from "@/lib/estimateBuilder";
import { isTemporaryLine } from "@/lib/estimateEditQueue";
import type { PickerLinePreview } from "@/lib/pickerSources";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { InlineInput } from "./InlineEstimateInput";
import { SectionSearch, type SearchHandoff } from "./SectionSearch";
import { EstimateDragHandle, lineDragId, sectionDragId, sortableStyle, useEstimateSortable } from "./EstimateSorting";

const icons = { plant: Leaf, hardscape: Mountain, irrigation: Droplets, labor: Hammer, service: Sprout, equipment: Tractor, fee: Receipt, custom: PenLine };

type CatalogActions = {
  onSwap: (line: EstimateLineDto, reference: EstimateCatalogReference, preview?: PickerLinePreview) => void;
  onReset: (line: EstimateLineDto, reference: EstimateCatalogReference) => void;
};
type CardProps = CatalogActions & {
  paletteDefaults?: Record<string, string>;
  section: EstimateSectionDto; sections: EstimateSectionDto[]; subtotal: number; editable: boolean; lang: string; vBase: string;
  run: (method: string, url: string, body?: unknown) => Promise<boolean>;
  invalid: (m: string) => void; onRemove: () => void; onAdd: (h: SearchHandoff) => void;
  onDuplicate: (l: EstimateLineDto) => void; onMoveTo: (l: EstimateLineDto, sectionId: string) => void;
  customerId: string; companyId: string;
};

export function EstimateSectionCard(props: CardProps) {
  const { section: s, editable, lang, run, vBase } = props;
  const { t } = useTranslation();
  const sort = useEstimateSortable("section", s.id, s.name, !editable);
  return (
    <section ref={sort.setNodeRef} style={sortableStyle(sort)} className="relative rounded-lg border bg-card"
      data-testid={`card-section-${s.id}`} aria-label={s.name}>
      <div className="flex flex-wrap items-center gap-2 rounded-t-lg border-b bg-[hsl(var(--table-header))] px-3 py-2">
        {editable && <EstimateDragHandle sort={sort} label={t("estimateBuilder.lineEdit.dragSection", { name: s.name })} testId={`button-drag-section-${s.id}`} />}
        <div className="min-w-0 flex-1">
          {editable ? <InlineInput value={s.name} disabled={false} label={t("estimateBuilder.section.name")} testId={`input-section-name-${s.id}`}
            className="border-transparent bg-transparent px-1 font-semibold shadow-none hover:border-input focus-visible:border-input"
            validate={raw => raw.trim() ? { value: raw.trim(), same: raw.trim() === s.name } : { error: t("estimateBuilder.err.required") }}
            onCommit={name => run("PATCH", `${vBase}/sections/${encodeURIComponent(s.id)}`, { name })} onInvalid={props.invalid} />
            : <h2 className="px-1 font-semibold" data-testid={`text-section-name-${s.id}`}>{s.name}</h2>}
        </div>
        <span className="text-xs text-muted-foreground" data-testid={`text-section-count-${s.id}`}>{t("estimateBuilder.section.lines", { count: s.lines.length })}</span>
        <span className="font-semibold tabular-nums" data-testid={`text-section-subtotal-${s.id}`}>{formatCents(props.subtotal, lang)}</span>
        {editable && props.sections.length > 1 &&
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("estimateBuilder.section.remove")} onClick={props.onRemove} data-testid={`button-remove-section-${s.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>}
      </div>
      {s.lines.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground" data-testid={`text-section-empty-${s.id}`}>{t("estimateBuilder.section.empty")}</p> : <>
        <div aria-hidden className="estimate-line-row estimate-line-heading grid gap-2 border-b bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="estimate-item">{t("estimateBuilder.lineEdit.item")}</span>
          <span className="estimate-qty text-right">{t("estimateBuilder.lineEdit.qty")}</span>
          <span className="estimate-unit">{t("estimateBuilder.picker.unit")}</span>
          <span className="estimate-rate text-right">{t("estimateBuilder.lineEdit.rate")}</span>
          <span className="estimate-amount text-right">{t("estimateBuilder.lineEdit.amount")}</span>
        </div>
        <SortableContext id={sectionDragId(s.id)} items={s.lines.map(l => lineDragId(l.id))} strategy={verticalListSortingStrategy}>
          <ul className="divide-y">{s.lines.map(l => <EstimateLineRow key={l.id} line={l} {...props} />)}</ul>
        </SortableContext>
      </>}
      {editable && <div className="rounded-b-lg border-t bg-muted/20 px-3 py-2.5" data-testid={`bar-add-${s.id}`}>
        <SectionSearch sectionId={s.id} customerId={props.customerId} companyId={props.companyId} onOpen={props.onAdd} />
      </div>}
    </section>
  );
}

function EstimateLineRow({ line: l, editable, lang, run, vBase, invalid, sections, paletteDefaults, ...props }: CardProps & { line: EstimateLineDto }) {
  const { t } = useTranslation();
  const [swapOpen, setSwapOpen] = useState(false);
  const temporary = isTemporaryLine(l.id);
  const canEdit = editable && !temporary;
  const sort = useEstimateSortable("line", l.id, l.name, !canEdit);
  const Icon = icons[l.lineType];
  const url = `${vBase}/lines/${encodeURIComponent(l.id)}`;
  const patch = (body: Record<string, unknown>) => run("PATCH", url, body);
  const reference = estimateCatalogReference(l);
  const units = !reference && l.priceSource !== "quick_list" && FREE_UNIT_TYPES.includes(l.lineType) ? FREE_UNITS : null;
  const others = sections.filter(s => s.id !== l.sectionId);
  const tint = LINE_TINT[l.lineType];
  const type = t(`estimateBuilder.line.type.${l.lineType}`);
  const source = t(`estimateBuilder.line.source.${l.priceSource}`);
  const paletteLabel = l.paletteTypeLabel ?? paletteDefaults?.[l.id] ?? derivePaletteTypeLabel("other");

  return (
    <li ref={sort.setNodeRef} style={sortableStyle(sort)} className="estimate-line-row relative grid items-start gap-x-2 gap-y-1.5 bg-card px-3 py-2.5"
      data-testid={`row-line-${l.id}`} data-line-type={l.lineType} aria-busy={temporary || undefined}>
      {canEdit && <div className="estimate-handle">
        <EstimateDragHandle sort={sort} label={t("estimateBuilder.lineEdit.dragLine", { name: l.name })} testId={`button-drag-line-${l.id}`} />
      </div>}
      <span className="estimate-icon mt-1 inline-flex h-6 w-6 items-center justify-center rounded" aria-label={type} title={type}
        style={{ background: `hsl(${tint} / 0.12)`, color: `hsl(${tint})` }} data-testid={`chip-type-${l.id}`}>
        <Icon aria-hidden className="h-3.5 w-3.5" />
      </span>
      <div className="estimate-item min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {canEdit ? <Popover open={swapOpen} onOpenChange={setSwapOpen}>
            <PopoverTrigger asChild><button type="button" className="min-w-0 text-left font-semibold leading-tight [overflow-wrap:anywhere] hover:underline"
              title={t("estimateBuilder.lineEdit.swap")} data-testid={`text-line-name-${l.id}`}>{l.name}</button></PopoverTrigger>
            <PopoverContent align="start" aria-label={t("estimateBuilder.lineEdit.swap")} className="w-[min(25rem,calc(100vw-2rem))] p-2">
              <SectionSearch sectionId={`swap-${l.id}`} companyId={props.companyId} customerId={props.customerId} preferredType={l.lineType}
                onDismiss={() => setSwapOpen(false)} onOpen={({ type, row }) => {
                  const parsed = estimateCatalogReferenceSchema.safeParse({ lineType: type, ...row?.body });
                  if (parsed.success) { setSwapOpen(false); props.onSwap(l, parsed.data, row?.preview); }
                }} />
            </PopoverContent>
          </Popover> : <span className="font-semibold leading-tight" data-testid={`text-line-name-${l.id}`}>{l.name}</span>}
          {l.lineType === "plant" && <button type="button" disabled={!canEdit} aria-pressed={l.includeInPalette}
            aria-label={t("estimateBuilder.line.palette", { name: l.name })} onClick={() => void patch({ includeInPalette: !l.includeInPalette })}
            data-testid={`toggle-palette-${l.id}`} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] disabled:cursor-default",
              l.includeInPalette ? "border-primary/25 bg-primary/10 text-primary" : "text-muted-foreground")}>
            <Leaf className="h-3 w-3" aria-hidden />{t("estimateBuilder.lineEdit.plantTable")}
          </button>}
        </div>
        {canEdit ? <InlineInput value={l.detail ?? ""} disabled={false} label={t("estimateBuilder.lineEdit.description", { name: l.name })}
          placeholder={t("estimateBuilder.lineEdit.descriptionHint")} maxLength={10000} testId={`input-description-${l.id}`}
          className="-ml-1 h-7 border-transparent bg-transparent px-1 text-xs text-muted-foreground shadow-none hover:border-input focus-visible:border-input"
          validate={raw => ({ value: raw.trim() ? raw : null, same: raw.trim() ? raw === l.detail : l.detail === null })}
          onCommit={detail => patch({ detail })} onInvalid={invalid} />
          : l.detail && <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground" data-testid={`text-line-detail-${l.id}`}>{l.detail}</div>}
        {l.lineType === "plant" && <div className="flex flex-wrap items-center gap-1">
          {canEdit ? <>
            <InlineInput value={paletteLabel} disabled={false} label={t("plantExhibits.label", { name: l.name })} testId={`palette-label-${l.id}`}
              className="h-7 w-32 max-w-full text-xs" maxLength={500}
              validate={raw => raw.trim() ? { value: raw.trim(), same: raw.trim() === paletteLabel } : { error: t("plantExhibits.labelRequired") }}
              onCommit={paletteTypeLabel => patch({ paletteTypeLabel })} onInvalid={invalid} />
            {l.paletteTypeLabel !== null && <Button variant="ghost" size="sm" onClick={() => void patch({ paletteTypeLabel: null })}
              aria-label={t("plantExhibits.resetLabel", { name: l.name })} data-testid={`palette-reset-${l.id}`}>{t("plantExhibits.reset")}</Button>}
          </> : <span className="text-xs text-muted-foreground" data-testid={`palette-label-readonly-${l.id}`}>{paletteLabel}</span>}
        </div>}
      </div>
      <div className="estimate-qty min-w-0">
        <InlineInput value={l.quantity} disabled={!canEdit} inputMode="decimal" label={t("estimateBuilder.line.quantity", { name: l.name })} testId={`input-quantity-${l.id}`}
          className="px-1.5 text-right tabular-nums"
          validate={raw => { const q = validQuantity(raw); return q ? { value: q, same: Number(q) === Number(l.quantity) } : { error: t("estimateBuilder.err.quantity") }; }}
          onCommit={quantity => patch({ quantity })} onInvalid={invalid} />
      </div>
      <div className="estimate-unit min-w-0 text-xs text-muted-foreground">
        {units && canEdit ? <select aria-label={t("estimateBuilder.line.unit", { name: l.name })} value={normalizeEstimateUnit(l.unit) ?? ""} onChange={e => void patch({ unit: e.target.value })}
          className="h-8 w-full rounded-md border border-input bg-background px-1" data-testid={`select-unit-${l.id}`}>
          {!normalizeEstimateUnit(l.unit) && <option value="" disabled>{l.unit}</option>}
          {units.map(u => <option key={u} value={u}>{unitLabel(u, t)}</option>)}
        </select> : <span className="flex min-h-8 items-center" data-testid={`text-unit-${l.id}`}>{unitLabel(l.unit, t)}</span>}
      </div>
      <div className="estimate-rate min-w-0">
        <InlineInput value={l.needsPrice ? "" : centsToInput(l.unitPriceCents)} disabled={!canEdit} inputMode="decimal"
          label={t("estimateBuilder.line.rate", { name: l.name })} testId={`input-rate-${l.id}`} placeholder={l.needsPrice ? t("estimateBuilder.lineEdit.needsPrice") : undefined}
          className={cn("px-1.5 text-right tabular-nums", l.needsPrice && "border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn-bg))] placeholder:text-[hsl(var(--est-warn))]")}
          validate={raw => { const c = parseDollarsToCents(raw); return typeof c === "number" ? { value: c, same: c === l.unitPriceCents } : { error: c === "tooLarge" ? t("estimateBuilder.err.tooLarge") : t("estimateBuilder.err.rate") }; }}
          onCommit={unitPriceCents => patch({ unitPriceCents })} onInvalid={invalid} />
      </div>
      <span className="estimate-amount flex min-h-8 min-w-0 items-center justify-end text-right text-sm font-semibold tabular-nums"
        aria-label={t("estimateBuilder.lineEdit.amount")} data-testid={`text-extended-${l.id}`}>
        {l.needsPrice ? <span className="inline-flex items-center gap-1 rounded bg-[hsl(var(--est-warn-bg))] px-1.5 py-1 text-xs text-[hsl(var(--est-warn))]"
          data-testid={`marker-needs-price-${l.id}`}><AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />{t("estimateBuilder.lineEdit.needsPrice")}</span>
          : formatCents(l.extendedCents, lang)}
      </span>
      {canEdit && <div className="estimate-menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-7"
            aria-label={t("estimateBuilder.lineEdit.menu", { name: l.name })} data-testid={`button-line-menu-${l.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground" data-testid={`badge-source-${l.id}`}>
              {t("estimateBuilder.lineEdit.from", { source: l.priceSource === "manual" && reference ? type : source })}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => props.onDuplicate(l)} data-testid={`menu-duplicate-${l.id}`}>{t("estimateBuilder.lineEdit.duplicate")}</DropdownMenuItem>
            {others.length > 0 && <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid={`menu-move-${l.id}`}>{t("estimateBuilder.lineEdit.move")}</DropdownMenuSubTrigger>
              <DropdownMenuPortal><DropdownMenuSubContent>{others.map(s => <DropdownMenuItem key={s.id} onSelect={() => props.onMoveTo(l, s.id)}
                data-testid={`menu-move-${l.id}-${s.id}`}>{s.name}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuPortal>
            </DropdownMenuSub>}
            {reference && l.priceSource === "manual" && <DropdownMenuItem onSelect={() => props.onReset(l, reference)} data-testid={`menu-reset-price-${l.id}`}>
              {t("estimateBuilder.lineEdit.resetPrice")}
            </DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void run("DELETE", url)}
              data-testid={`menu-remove-line-${l.id}`}>{t("estimateBuilder.lineEdit.remove")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
    </li>
  );
}
