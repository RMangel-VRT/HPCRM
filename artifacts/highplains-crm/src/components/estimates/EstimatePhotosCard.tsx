import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isEstimatePhoto } from "@/lib/estimatePhotoUpload";
import { ESTIMATE_PHOTO_CAPTION_MAX, type EstimatePhotoDto } from "../../../../../lib/db/src/estimateContracts";
import { InlineInput } from "./InlineEstimateInput";

type Props = {
  photos: EstimatePhotoDto[]; versionUrl: string; companyId: string; editable: boolean; blocked: boolean;
  onUpload: (files: File[]) => Promise<unknown>;
  onReorder: (photoIds: string[]) => Promise<boolean>;
  onCaption: (id: string, caption: string | null) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onInvalid: (message: string) => void;
};

function GalleryPhoto({ photo, number, disabled, editable, imageUrl, onCaption, onRemove, onInvalid }: {
  photo: EstimatePhotoDto; number: number; disabled: boolean; editable: boolean; imageUrl: string;
} & Pick<Props, "onCaption" | "onRemove" | "onInvalid">) {
  const { t } = useTranslation();
  const [missing, setMissing] = useState(false);
  const { setNodeRef, setActivatorNodeRef, transform, transition, attributes, listeners, isDragging } =
    useSortable({ id: photo.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative min-w-0 overflow-hidden rounded-md border bg-card", isDragging && "z-10 shadow-lg")}
      data-testid={`estimate-photo-${photo.id}`}>
      <div className="relative aspect-[4/3] bg-muted">
        {missing
          ? <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{t("estimateBuilder.exhibits.imageMissing")}</div>
          : <img className="h-full w-full object-cover" src={imageUrl} alt={photo.caption || photo.filename}
              loading="lazy" draggable={false} onError={() => setMissing(true)} data-testid={`img-estimate-photo-${photo.id}`} />}
        <span className="absolute left-2 top-2 rounded bg-background/95 px-1.5 py-0.5 text-xs font-semibold tabular-nums"
          data-testid={`number-estimate-photo-${photo.id}`}>{number}</span>
        {editable && <div className="absolute right-1 top-1 flex flex-wrap justify-end gap-1">
          <Button type="button" variant="secondary" size="icon" className="h-7 w-7 touch-none cursor-grab" ref={setActivatorNodeRef}
            {...attributes} {...listeners} disabled={disabled} aria-label={t("estimateBuilder.exhibits.reorder", { number })}
            data-estimate-photo-drag={photo.id} data-testid={`button-drag-estimate-photo-${photo.id}`}><GripVertical className="h-4 w-4" /></Button>
          <Button type="button" variant="secondary" size="icon" className="h-7 w-7" disabled={disabled}
            aria-label={t("estimateBuilder.exhibits.remove", { number })} onClick={() => void onRemove(photo.id)}
            data-testid={`button-remove-estimate-photo-${photo.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>}
      </div>
      <div className="p-1.5">
        {editable ? <InlineInput value={photo.caption ?? ""} disabled={disabled} label={t("estimateBuilder.exhibits.captionFor", { number })}
          placeholder={t("estimateBuilder.exhibits.caption")} testId={`input-estimate-photo-caption-${photo.id}`}
          maxLength={ESTIMATE_PHOTO_CAPTION_MAX} className="w-full text-xs"
          validate={value => ({ value: value.trim() || null, same: (value.trim() || null) === photo.caption })}
          onCommit={caption => onCaption(photo.id, caption as string | null)} onInvalid={onInvalid}
        /> : photo.caption && <p className="break-words px-1 text-xs">{photo.caption}</p>}
        {number % 2 === 0 && <p className="mt-1 border-t border-dashed px-1 pt-1 text-[10px] text-muted-foreground"
          data-testid={`estimate-photo-end-page-${number / 2}`}>{t("estimateBuilder.exhibits.endPage", { page: number / 2 })}</p>}
      </div>
    </li>
  );
}

export function EstimatePhotosCard(props: Props) {
  const { t } = useTranslation();
  const { photos, versionUrl, companyId, editable, blocked, onUpload, onReorder, onCaption, onRemove, onInvalid } = props;
  const input = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLOListElement>(null);
  const keyboardTarget = useRef<string | null>(null);
  const restoreFocus = useRef<string | null>(null);
  const operation = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const disabled = !editable || blocked || uploading;
  const numberOf = (id: string | number) => photos.findIndex(p => p.id === id) + 1;
  // Numbered photos are an ordered list. Unequal card heights and the page marker
  // shouldn't make a keyboard arrow miss the next photo.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    const { active, collisionRect, droppableRects } = context;
    if (!active || !collisionRect) return;
    const columns = gallery.current ? getComputedStyle(gallery.current).gridTemplateColumns.split(/\s+/).length : 3;
    const step = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1
      : event.code === "ArrowDown" ? columns : event.code === "ArrowUp" ? -columns : 0;
    if (!step) return;
    event.preventDefault();
    const target = photos[numberOf(keyboardTarget.current ?? active.id) - 1 + step]?.id;
    const rect = target && droppableRects.get(target);
    if (!target || !rect) return;
    keyboardTarget.current = target;
    return { x: rect.left + (rect.width - collisionRect.width) / 2, y: rect.top + (rect.height - collisionRect.height) / 2 };
  };
  const collisions: CollisionDetection = args => keyboardTarget.current && args.droppableRects.has(keyboardTarget.current)
    ? [{ id: keyboardTarget.current }] : closestCenter(args);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, scrollBehavior: "auto" }));
  useEffect(() => {
    if (disabled || !restoreFocus.current) return;
    const id = restoreFocus.current;
    restoreFocus.current = null;
    const handles = gallery.current?.querySelectorAll<HTMLButtonElement>("[data-estimate-photo-drag]") ?? [];
    Array.from(handles).find(handle => handle.dataset.estimatePhotoDrag === id)?.focus();
  }, [disabled, photos]);

  async function upload(files: File[]) {
    if (disabled || operation.current || !files.length) return;
    const images = files.filter(isEstimatePhoto);
    if (images.length !== files.length) onInvalid(t("estimateBuilder.exhibits.invalidType"));
    if (!images.length) return;
    operation.current = true;
    setUploading(true);
    try { await onUpload(images); }
    finally { operation.current = false; setUploading(false); }
  }
  function dropPhoto({ active, over, activatorEvent }: DragEndEvent) {
    const keyboard = activatorEvent instanceof KeyboardEvent;
    const target = keyboard ? keyboardTarget.current : over?.id;
    keyboardTarget.current = null;
    if (target == null || disabled || active.id === target) return;
    const from = numberOf(active.id) - 1, to = numberOf(target) - 1;
    if (from >= 0 && to >= 0) {
      if (keyboard) restoreFocus.current = String(active.id);
      void onReorder(arrayMove(photos, from, to).map(p => p.id));
    }
  }
  return (
    <section className="rounded-lg border bg-card p-4" data-testid="card-estimate-photos">
      <h2 className="text-base font-semibold">{t("estimateBuilder.exhibits.photos")}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("estimateBuilder.exhibits.photosDescription")}</p>
      {editable && <>
        <input ref={input} type="file" hidden multiple accept="image/*,.heic,.heif" disabled={disabled}
          onChange={e => { const files = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ""; void upload(files); }}
          data-testid="input-estimate-photos" />
        <button type="button" className={cn("flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed p-4 text-sm transition-colors disabled:opacity-60",
          dragOver && !disabled ? "border-primary bg-primary/10" : "bg-muted/25 hover:border-primary/60")}
          disabled={disabled} aria-busy={uploading} onClick={() => input.current?.click()} data-testid="button-add-estimate-photos"
          onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); void upload(Array.from(e.dataTransfer.files)); }}>
          <ImagePlus aria-hidden className="h-5 w-5 text-muted-foreground" />
          <span>{t(uploading ? "estimateBuilder.exhibits.uploading" : "estimateBuilder.exhibits.drop")}</span>
          <span className="text-xs text-muted-foreground">{t("estimateBuilder.exhibits.fileHint")}</span>
        </button>
      </>}
      {!!photos.length && <DndContext sensors={sensors} collisionDetection={collisions} onDragEnd={dropPhoto}
        onDragCancel={() => { keyboardTarget.current = null; }}
        accessibility={{
          screenReaderInstructions: { draggable: t("estimateBuilder.exhibits.sortInstructions") },
          announcements: {
            onDragStart: ({ active }) => t("estimateBuilder.exhibits.sortStarted", { number: numberOf(active.id) }),
            onDragOver: ({ over }) => over ? t("estimateBuilder.exhibits.sortOver", { number: numberOf(over.id) }) : undefined,
            onDragEnd: ({ over }) => over ? t("estimateBuilder.exhibits.sortDropped", { number: numberOf(over.id) }) : t("estimateBuilder.exhibits.sortCancelled"),
            onDragCancel: () => t("estimateBuilder.exhibits.sortCancelled"),
          },
        }}>
        <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
          <ol ref={gallery} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {photos.map((photo, index) => <GalleryPhoto key={photo.id} photo={photo} number={index + 1} disabled={disabled} editable={editable}
              imageUrl={`${versionUrl}/photos/${encodeURIComponent(photo.id)}?company=${encodeURIComponent(companyId)}`}
              onCaption={onCaption} onRemove={onRemove} onInvalid={onInvalid} />)}
          </ol>
        </SortableContext>
      </DndContext>}
      {!editable && !photos.length && <p className="text-sm text-muted-foreground">{t("estimateBuilder.exhibits.empty")}</p>}
    </section>
  );
}
