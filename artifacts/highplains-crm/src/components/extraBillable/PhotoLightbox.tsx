import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PhotoUrl } from "@/hooks/useItemPhotoUrls";

interface Props {
  photos: PhotoUrl[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}

export default function PhotoLightbox({ photos, index, onClose, onIndexChange }: Props) {
  const { t } = useTranslation();
  const total = photos.length;
  const safeIndex = Math.max(0, Math.min(index, total - 1));
  const photo = photos[safeIndex];

  const next = useCallback(() => {
    if (total === 0) return;
    onIndexChange((safeIndex + 1) % total);
  }, [safeIndex, total, onIndexChange]);

  const prev = useCallback(() => {
    if (total === 0) return;
    onIndexChange((safeIndex - 1 + total) % total);
  }, [safeIndex, total, onIndexChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev, onClose]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center"
      data-testid="lightbox-root"
      onClick={onClose}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span className="text-white text-xs" data-testid="lightbox-counter">
          {t("campaigns.extraBillableLightboxCounter", { current: safeIndex + 1, total })}
        </span>
        <Button
          variant="secondary"
          size="icon"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          data-testid="lightbox-close"
          aria-label={t("campaigns.extraBillableLightboxClose")}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      {total > 1 && (
        <>
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-3"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            data-testid="lightbox-prev"
            aria-label={t("campaigns.extraBillableLightboxPrev")}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-3"
            onClick={(e) => { e.stopPropagation(); next(); }}
            data-testid="lightbox-next"
            aria-label={t("campaigns.extraBillableLightboxNext")}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </>
      )}
      <img
        src={photo.signedUrl ?? ""}
        alt=""
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
        data-testid="lightbox-image"
      />
    </div>
  );
}
