import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { CustomerDocumentDto } from "./documentModel";

/** Accessible image viewer: focus-trapped dialog, labelled controls, arrow-key next/previous. */
export function DocumentLightbox({ images, index, onIndexChange, onClose }: {
  images: CustomerDocumentDto[]; index: number | null; onIndexChange: (i: number) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const total = images.length;
  const open = index != null && total > 0;
  const i = open ? Math.max(0, Math.min(index!, total - 1)) : 0;
  const img = open ? images[i] : null;
  const next = () => total > 1 && onIndexChange((i + 1) % total);
  const prev = () => total > 1 && onIndexChange((i - 1 + total) % total);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl w-[calc(100vw-1.5rem)] p-0 gap-0 overflow-hidden bg-[hsl(var(--foreground)/0.94)] border-0 [&>button]:hidden"
        data-testid="document-lightbox"
        onKeyDown={e => {
          if (e.key === "ArrowRight") { e.preventDefault(); next(); }
          if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
        }}>
        {img && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 text-background">
              <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium" data-testid="text-lightbox-name">{img.name}</DialogTitle>
              <DialogDescription className="text-xs tabular-nums opacity-80" data-testid="text-lightbox-counter">
                {t("cp5.documents.lightbox.counter", { current: i + 1, total })}
              </DialogDescription>
              <Button asChild size="icon" variant="ghost" className="text-background hover:bg-background/15 hover:text-background">
                <a href={img.downloadUrl} download aria-label={t("cp5.documents.actions.download")} data-testid="link-lightbox-download"><Download className="h-4 w-4" /></a>
              </Button>
              <Button size="icon" variant="ghost" className="text-background hover:bg-background/15 hover:text-background" onClick={onClose}
                aria-label={t("cp5.documents.lightbox.close")} data-testid="button-lightbox-close"><X className="h-4 w-4" /></Button>
            </div>
            <div className="relative flex items-center justify-center bg-[hsl(var(--foreground))] min-h-[50vh]">
              <img src={img.openUrl} alt={img.note ? `${img.name}. ${img.note}` : img.name} className="max-h-[78vh] max-w-full object-contain" data-testid="img-lightbox" />
              {total > 1 && (
                <>
                  <Button size="icon" variant="secondary" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full" onClick={prev}
                    aria-label={t("cp5.documents.lightbox.prev")} data-testid="button-lightbox-prev"><ChevronLeft className="h-5 w-5" /></Button>
                  <Button size="icon" variant="secondary" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full" onClick={next}
                    aria-label={t("cp5.documents.lightbox.next")} data-testid="button-lightbox-next"><ChevronRight className="h-5 w-5" /></Button>
                </>
              )}
            </div>
            {img.note && <p className="px-3 py-2 text-xs text-background/80" data-testid="text-lightbox-note">{img.note}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
