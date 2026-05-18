import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Trash2, Image as ImageIcon, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useItemPhotoUrls } from "@/hooks/useItemPhotoUrls";
import PhotoLightbox from "./PhotoLightbox";

export interface EbPhotoMovePayload {
  type: "eb-photo-move";
  campaignId: string;
  sourceItemId: string;
  storageKey: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  itemId: string;
  itemName: string;
  canDelete: boolean;
}

export default function PropertyPhotoSheet({
  open,
  onOpenChange,
  campaignId,
  itemId,
  itemName,
  canDelete,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: photos = [], isLoading } = useItemPhotoUrls(campaignId, open ? itemId : null, open);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (storageKey: string) => {
      const res = await apiRequest(
        "DELETE",
        `/api/campaigns/${campaignId}/items/${itemId}/photos/${storageKey}`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/campaigns", campaignId, "items", itemId, "photo-urls"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      toast({ title: t("campaigns.extraBillablePhotoDeleted") });
    },
    onError: (err: Error) => {
      toast({
        title: err.message || t("campaigns.extraBillablePhotoDeleteFailed"),
        variant: "destructive",
      });
    },
  });

  const handleDelete = (storageKey: string) => {
    if (!window.confirm(t("campaigns.extraBillablePhotoDeleteConfirm"))) return;
    deleteMutation.mutate(storageKey);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        overlayClassName="pointer-events-none"
        data-testid="property-photo-sheet"
      >
        <SheetHeader>
          <SheetTitle data-testid="property-photo-sheet-title">
            {t("campaigns.extraBillablePhotoSheetTitle", { name: itemName })}
          </SheetTitle>
          <SheetDescription>
            {t("campaigns.extraBillablePhotosCount")}: {photos.length}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center" data-testid="property-photo-sheet-loading">…</p>
        ) : photos.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground" data-testid="property-photo-sheet-empty">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {t("campaigns.extraBillablePhotoEmpty")}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
            {photos.map((photo, idx) => (
              <div
                key={photo.storageKey}
                className="relative group aspect-square rounded overflow-hidden bg-muted"
                data-testid={`sheet-photo-${itemId}-${idx}`}
                draggable={canDelete}
                onDragStart={canDelete ? (e) => {
                  const payload: EbPhotoMovePayload = {
                    type: "eb-photo-move",
                    campaignId,
                    sourceItemId: itemId,
                    storageKey: photo.storageKey,
                  };
                  e.dataTransfer.setData("application/json", JSON.stringify(payload));
                  e.dataTransfer.effectAllowed = "move";
                } : undefined}
                style={canDelete ? { cursor: "grab" } : undefined}
              >
                <button
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className="block w-full h-full"
                  aria-label={t("campaigns.extraBillableGridViewPhotos")}
                >
                  {photo.signedUrl ? (
                    <img
                      src={photo.signedUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                </button>
                {canDelete && (
                  <>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-7 w-7"
                      onClick={() => handleDelete(photo.storageKey)}
                      disabled={deleteMutation.isPending}
                      data-testid={`sheet-photo-delete-${itemId}-${photo.storageKey.split("/").pop()}`}
                      aria-label={t("campaigns.extraBillablePhotoDelete")}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <div className="absolute bottom-1 left-1 text-white/60 pointer-events-none">
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {lightboxIndex !== null && photos.length > 0 && (
          <PhotoLightbox
            photos={photos}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onIndexChange={setLightboxIndex}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
