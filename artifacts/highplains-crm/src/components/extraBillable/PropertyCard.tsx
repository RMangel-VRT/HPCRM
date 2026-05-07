import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Image as ImageIcon, Upload, X } from "lucide-react";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { useItemPhotoUrls } from "@/hooks/useItemPhotoUrls";
import type { CampaignItem, CampaignCrewWithMembers } from "@shared/schema";

export interface PropertyCardItem extends CampaignItem {
  customerCity?: string | null;
}

interface Props {
  campaignId: string;
  item: PropertyCardItem;
  crew: CampaignCrewWithMembers | null;
  canDrop: boolean;
  onOpenPhotos: () => void;
}

interface UploadState {
  total: number;
  done: number;
  failed: number;
  status: "idle" | "uploading" | "success" | "error";
  errorMessage?: string;
}

const INITIAL_STATE: UploadState = { total: 0, done: 0, failed: 0, status: "idle" };

const KNOWN_ERROR_KEYS = [
  "extraBillablePhotoForbidden",
  "extraBillablePhotoInvalidType",
  "extraBillablePhotoUploadFailed",
];

export default function PropertyCard({
  campaignId,
  item,
  crew,
  canDrop,
  onOpenPhotos,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState<UploadState>(INITIAL_STATE);
  const stateRef = useRef<UploadState>(INITIAL_STATE);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always invalidate the item's photo URL cache when its photos[] changes,
  // so the lightbox/thumbnails refetch with fresh signed URLs.
  const photoList = (item.photos ?? []) as string[];
  const photoCount = photoList.length;

  // Fetch signed URLs for thumbnail rendering when there are photos.
  const { data: photoUrls = [] } = useItemPhotoUrls(campaignId, item.id, photoCount > 0);
  const thumbUrls = useMemo(
    () => photoUrls.slice(0, 3).map((p) => p.signedUrl).filter((u): u is string => Boolean(u)),
    [photoUrls],
  );

  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
    if (errorTimer.current) clearTimeout(errorTimer.current);
  }, []);

  const updateState = useCallback((next: UploadState) => {
    stateRef.current = next;
    setUploadState(next);
  }, []);

  const uploadOne = useCallback(
    async (file: File) => {
      // Raw byte body (matches the express.raw() server contract). Some
      // browsers leave file.type empty for HEIC; fall back to octet-stream.
      const contentType = file.type || "application/octet-stream";
      const buffer = await file.arrayBuffer();
      const res = await fetch(
        `/api/campaigns/${campaignId}/items/${item.id}/photos/drop`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": contentType },
          body: buffer,
        },
      );
      if (!res.ok) {
        let message = `${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
    },
    [campaignId, item.id],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || !canDrop) return;
      if (successTimer.current) clearTimeout(successTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);

      updateState({ total: files.length, done: 0, failed: 0, status: "uploading" });

      // Concurrency limit of 3 so a 10-photo batch does not flood the server.
      const limit = Math.min(3, files.length);
      let cursor = 0;
      let lastErrorMessage = "";
      const worker = async (): Promise<void> => {
        while (true) {
          const idx = cursor++;
          if (idx >= files.length) return;
          try {
            await uploadOne(files[idx]);
            updateState({
              ...stateRef.current,
              done: stateRef.current.done + 1,
            });
          } catch (err) {
            lastErrorMessage = err instanceof Error ? err.message : String(err);
            updateState({
              ...stateRef.current,
              done: stateRef.current.done + 1,
              failed: stateRef.current.failed + 1,
            });
          }
        }
      };
      await Promise.all(Array.from({ length: limit }, () => worker()));

      const finished = stateRef.current;
      // Refresh the item & its signed URLs so the new photos appear.
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/campaigns", campaignId, "items", item.id, "photo-urls"],
      });

      if (finished.failed === 0) {
        updateState({ ...finished, status: "success" });
        // 1.5s green flash, then back to idle.
        successTimer.current = setTimeout(() => updateState(INITIAL_STATE), 1500);
      } else {
        const knownKey = KNOWN_ERROR_KEYS.find((k) => lastErrorMessage.includes(k));
        const message = knownKey
          ? t(`campaigns.${knownKey}`)
          : t("campaigns.extraBillablePhotoUploadFailed");
        updateState({ ...finished, status: "error", errorMessage: message });
        // 4s dismissible error chip.
        errorTimer.current = setTimeout(() => updateState(INITIAL_STATE), 4000);
      }
    },
    [canDrop, uploadOne, queryClient, campaignId, item.id, t, updateState],
  );

  const { isDraggingOver, bind } = useFileDropZone({
    onFiles: handleFiles,
    enabled: canDrop,
  });

  const dismissError = useCallback(() => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    updateState(INITIAL_STATE);
  }, [updateState]);

  const borderStyle = crew?.color ? { borderLeftColor: crew.color } : undefined;
  const isUploading = uploadState.status === "uploading";
  const isSuccess = uploadState.status === "success";
  const isError = uploadState.status === "error";
  const progressPct = uploadState.total === 0
    ? 0
    : Math.min(100, Math.round((uploadState.done / uploadState.total) * 100));

  return (
    <Card
      data-testid={`grid-card-${item.id}`}
      data-dragging={isDraggingOver ? "true" : "false"}
      data-upload-status={uploadState.status}
      className={`relative border-l-4 transition-colors overflow-hidden ${
        isDraggingOver ? "ring-2 ring-primary bg-primary/5" : ""
      } ${isSuccess ? "ring-2 ring-green-500 bg-green-50/40" : ""}`}
      style={borderStyle}
      {...bind}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/customers/${item.customerId}`}
              className="font-medium text-sm hover:underline block truncate"
              data-testid={`grid-card-name-${item.id}`}
            >
              {item.customerName}
            </Link>
            {item.customerCity && (
              <p className="text-xs text-muted-foreground truncate">{item.customerCity}</p>
            )}
          </div>
          <Badge
            variant={item.status === "completed" ? "default" : "outline"}
            className="text-[10px]"
            data-testid={`grid-card-status-${item.id}`}
          >
            {item.status}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {crew ? (
            <span
              className="inline-flex items-center gap-1"
              data-testid={`grid-card-crew-${item.id}`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: crew.color }}
              />
              {crew.name}
            </span>
          ) : (
            <span data-testid={`grid-card-unassigned-${item.id}`}>
              {t("campaigns.extraBillableUnassigned")}
            </span>
          )}
          <span
            className="ml-auto inline-flex items-center gap-1"
            data-testid={`grid-card-photo-count-${item.id}`}
          >
            <ImageIcon className="w-3 h-3" />
            {photoCount}
          </span>
        </div>

        {photoCount > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 3 }).map((_, idx) => {
              const url = thumbUrls[idx];
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={onOpenPhotos}
                  className="aspect-square rounded bg-muted overflow-hidden hover-elevate"
                  data-testid={`grid-photo-thumb-${item.id}-${idx}`}
                  title={t("campaigns.extraBillableGridViewPhotos")}
                >
                  {url ? (
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="sr-only">{t("campaigns.extraBillableGridViewPhotos")}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div
            className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground"
            data-testid={`grid-card-empty-${item.id}`}
          >
            {canDrop ? t("campaigns.extraBillableGridDropHint") : t("campaigns.extraBillablePhotoEmpty")}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onOpenPhotos}
            data-testid={`grid-card-open-${item.id}`}
          >
            <ImageIcon className="w-3 h-3 mr-1" />
            {t("campaigns.extraBillableGridViewPhotos")}
          </Button>
          <Button asChild variant="ghost" size="sm" data-testid={`grid-card-link-${item.id}`}>
            <Link href={`/customers/${item.customerId}`}>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </Button>
        </div>

        {isError && uploadState.errorMessage && (
          <div
            className="flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive"
            data-testid={`grid-card-error-${item.id}`}
          >
            <span className="flex-1 truncate">{uploadState.errorMessage}</span>
            <button
              type="button"
              onClick={dismissError}
              aria-label={t("campaigns.extraBillableLightboxClose")}
              className="text-destructive/80 hover:text-destructive"
              data-testid={`grid-card-error-dismiss-${item.id}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {isDraggingOver && (
        <div
          className="absolute inset-0 rounded-md border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center pointer-events-none"
          data-testid={`grid-card-drop-overlay-${item.id}`}
        >
          <div className="text-sm font-medium text-primary inline-flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {t("campaigns.extraBillableGridDropping")}
          </div>
        </div>
      )}

      {isUploading && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-muted overflow-hidden"
          data-testid={`grid-card-progress-${item.id}`}
          aria-label={t("campaigns.extraBillablePhotoUploadProgress", {
            done: uploadState.done,
            total: uploadState.total,
          })}
        >
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </Card>
  );
}
