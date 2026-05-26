import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ExternalLink, Image as ImageIcon, MoveRight, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { useItemPhotoUrls } from "@/hooks/useItemPhotoUrls";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { EbPhotoMovePayload } from "./PropertyPhotoSheet";
import type { CampaignItem, CampaignCrewWithMembers } from "@shared/schema";

export interface PropertyCardItem extends CampaignItem {
  customerCity?: string | null;
}

interface Props {
  campaignId: string;
  item: PropertyCardItem;
  crew: CampaignCrewWithMembers | null;
  canDrop: boolean;
  isAdminOrOffice: boolean;
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
  isAdminOrOffice,
  onOpenPhotos,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState<UploadState>(INITIAL_STATE);
  const stateRef = useRef<UploadState>(INITIAL_STATE);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mark complete / pending ──────────────────────────────────────────────────
  const markStatusMutation = useMutation({
    mutationFn: async (newStatus: "completed" | "pending") => {
      const res = await apiRequest(
        "PATCH",
        `/api/campaigns/${campaignId}/items/${item.id}`,
        { status: newStatus },
      );
      return res.json();
    },
    onSuccess: (_data, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      toast({
        title: newStatus === "completed"
          ? t("campaigns.extraBillableMarkCompleteSuccess")
          : t("campaigns.extraBillableMarkPendingSuccess"),
      });
    },
    onError: (err: Error) => {
      toast({
        title: err.message || t("campaigns.extraBillableMarkCompleteFailed"),
        variant: "destructive",
      });
    },
  });

  // ── Card-level photo delete ──────────────────────────────────────────────────
  const cardDeleteMutation = useMutation({
    mutationFn: async (storageKey: string) => {
      const res = await apiRequest(
        "DELETE",
        `/api/campaigns/${campaignId}/items/${item.id}/photos/${storageKey}`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/campaigns", campaignId, "items", item.id, "photo-urls"],
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

  const handleCardDelete = useCallback((storageKey: string) => {
    if (!window.confirm(t("campaigns.extraBillablePhotoDeleteConfirm"))) return;
    cardDeleteMutation.mutate(storageKey);
  }, [cardDeleteMutation, t]);

  // ── Photo-move drag state ────────────────────────────────────────────────────
  const [isPhotoMoveOver, setIsPhotoMoveOver] = useState(false);
  const moveCounter = useRef(0);

  const moveMutation = useMutation({
    mutationFn: async (payload: EbPhotoMovePayload) => {
      const res = await apiRequest(
        "POST",
        `/api/campaigns/${payload.campaignId}/items/${item.id}/photos/move`,
        { sourceItemId: payload.sourceItemId, storageKey: payload.storageKey },
      );
      return res.json();
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/campaigns", campaignId, "items", payload.sourceItemId, "photo-urls"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/campaigns", campaignId, "items", item.id, "photo-urls"],
      });
      toast({ title: t("campaigns.extraBillablePhotoMoved") });
    },
    onError: (err: Error) => {
      const knownKey = err.message?.includes("extraBillablePhotoForbidden")
        ? "extraBillablePhotoForbidden"
        : null;
      toast({
        title: knownKey ? t(`campaigns.${knownKey}`) : (err.message || t("campaigns.extraBillablePhotoMoveFailed")),
        variant: "destructive",
      });
    },
  });

  const onPhotoMoveDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!canDrop) return;
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes("application/json")) return;
    e.preventDefault();
    e.stopPropagation();
    moveCounter.current += 1;
    setIsPhotoMoveOver(true);
  }, [canDrop]);

  const onPhotoMoveDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    e.stopPropagation();
    moveCounter.current -= 1;
    if (moveCounter.current <= 0) {
      moveCounter.current = 0;
      setIsPhotoMoveOver(false);
    }
  }, [canDrop]);

  const onPhotoMoveDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!canDrop) return;
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes("application/json")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  }, [canDrop]);

  const onPhotoMoveDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    e.stopPropagation();
    moveCounter.current = 0;
    setIsPhotoMoveOver(false);
    const raw = e.dataTransfer?.getData("application/json");
    if (!raw) return;
    let payload: EbPhotoMovePayload;
    try {
      payload = JSON.parse(raw) as EbPhotoMovePayload;
    } catch {
      return;
    }
    if (payload.type !== "eb-photo-move") return;
    if (payload.sourceItemId === item.id) return;
    moveMutation.mutate(payload);
  }, [canDrop, item.id, moveMutation]);

  // Always invalidate the item's photo URL cache when its photos[] changes,
  // so the lightbox/thumbnails refetch with fresh signed URLs.
  const photoList = (item.photos ?? []) as string[];
  const photoCount = photoList.length;

  // Fetch signed URLs for thumbnail rendering when there are photos.
  const { data: photoUrls = [] } = useItemPhotoUrls(campaignId, item.id, photoCount > 0);
  // Keep full photo objects (with storageKey) for the first 3 thumbnails so
  // card-level delete and drag-to-move can reference them directly.
  const thumbPhotos = useMemo(() => photoUrls.slice(0, 3), [photoUrls]);

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

  // Merge file-drop and photo-move drag handlers so both can coexist on the card.
  const mergedDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    bind.onDragEnter(e);
    onPhotoMoveDragEnter(e);
  }, [bind, onPhotoMoveDragEnter]);

  const mergedDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    bind.onDragLeave(e);
    onPhotoMoveDragLeave(e);
  }, [bind, onPhotoMoveDragLeave]);

  const mergedDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    bind.onDragOver(e);
    onPhotoMoveDragOver(e);
  }, [bind, onPhotoMoveDragOver]);

  const mergedDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    // Check which type of drop this is before delegating.
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes("application/json")) {
      onPhotoMoveDrop(e);
    } else {
      bind.onDrop(e);
    }
  }, [bind, onPhotoMoveDrop]);

  return (
    <Card
      data-testid={`grid-card-${item.id}`}
      data-dragging={isDraggingOver || isPhotoMoveOver ? "true" : "false"}
      data-upload-status={uploadState.status}
      className={`relative border-l-4 transition-colors overflow-hidden ${
        isDraggingOver ? "ring-2 ring-primary bg-primary/5" : ""
      } ${isPhotoMoveOver ? "ring-2 ring-amber-500 bg-amber-50/30" : ""} ${isSuccess ? "ring-2 ring-green-500 bg-green-50/40" : ""}`}
      style={borderStyle}
      onDragEnter={mergedDragEnter}
      onDragLeave={mergedDragLeave}
      onDragOver={mergedDragOver}
      onDrop={mergedDrop}
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
              const photo = thumbPhotos[idx];
              const url = photo?.signedUrl ?? null;
              return (
                <div
                  key={idx}
                  className="relative aspect-square rounded bg-muted overflow-hidden"
                  data-testid={`grid-photo-thumb-${item.id}-${idx}`}
                  draggable={canDrop && Boolean(photo)}
                  onDragStart={canDrop && photo ? (e) => {
                    const payload: EbPhotoMovePayload = {
                      type: "eb-photo-move",
                      campaignId,
                      sourceItemId: item.id,
                      storageKey: photo.storageKey,
                    };
                    e.dataTransfer.setData("application/json", JSON.stringify(payload));
                    e.dataTransfer.effectAllowed = "move";
                    e.stopPropagation();
                  } : undefined}
                  style={canDrop && photo ? { cursor: "grab" } : undefined}
                >
                  <button
                    type="button"
                    onClick={onOpenPhotos}
                    className="block w-full h-full hover-elevate"
                    title={t("campaigns.extraBillableGridViewPhotos")}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <span className="sr-only">{t("campaigns.extraBillableGridViewPhotos")}</span>
                    )}
                  </button>
                  {canDrop && photo && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-0.5 right-0.5 h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCardDelete(photo.storageKey);
                      }}
                      disabled={cardDeleteMutation.isPending}
                      data-testid={`card-photo-delete-${item.id}-${photo.storageKey.split("/").pop()}`}
                      aria-label={t("campaigns.extraBillablePhotoDelete")}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
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
          {canDrop && item.status !== "completed" && (
            <Button
              size="sm"
              variant="default"
              className="shrink-0"
              onClick={() => markStatusMutation.mutate("completed")}
              disabled={markStatusMutation.isPending}
              data-testid={`grid-card-mark-complete-${item.id}`}
              title={t("campaigns.extraBillableMarkComplete")}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {t("campaigns.extraBillableMarkComplete")}
            </Button>
          )}
          {isAdminOrOffice && item.status === "completed" && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-muted-foreground"
              onClick={() => markStatusMutation.mutate("pending")}
              disabled={markStatusMutation.isPending}
              data-testid={`grid-card-mark-pending-${item.id}`}
              title={t("campaigns.extraBillableMarkPending")}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              {t("campaigns.extraBillableMarkPending")}
            </Button>
          )}
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

      {isPhotoMoveOver && (
        <div
          className="absolute inset-0 rounded-md border-2 border-dashed border-amber-500 bg-amber-50/40 flex items-center justify-center pointer-events-none"
          data-testid={`grid-card-move-overlay-${item.id}`}
        >
          <div className="text-sm font-medium text-amber-700 inline-flex items-center gap-2">
            <MoveRight className="w-4 h-4" />
            {t("campaigns.extraBillablePhotoMoveHere")}
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
