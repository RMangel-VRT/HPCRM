import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArrowLeft, Download, RefreshCw, Camera, Upload, ImageIcon, Loader2, Info, Eye } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VisualScopeSheetWithCustomer, MarkupObject } from "@shared/schema";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import VisualScopeEditor from "./VisualScopeEditor";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAP_RENDER_WIDTH = 2000;
const MAP_RENDER_HEIGHT = 1200;

function MapCapture({ token, onCapture }: { token: string; onCapture: (blob: Blob) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapboxgl.supported()) {
      setWebglError("WebGL is not supported in this environment. Please use the image upload option below.");
      return;
    }
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [-98.5795, 39.8283],
        zoom: 4,
        preserveDrawingBuffer: true,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.on("load", () => setMapReady(true));
      map.on("error", (e) => {
        console.warn("Mapbox error:", e);
      });
      mapRef.current = map;
    } catch (err) {
      setWebglError("Map initialization failed. Please use the image upload option below.");
      return;
    }
    return () => { map.remove(); mapRef.current = null; };
  }, [token]);

  useEffect(() => {
    if (!wrapperRef.current || webglError) return;
    const wrapper = wrapperRef.current;
    const parentWidth = wrapper.parentElement?.clientWidth ?? 600;
    const scale = parentWidth / MAP_RENDER_WIDTH;
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = "top left";
    wrapper.style.height = `${MAP_RENDER_HEIGHT * scale}px`;
    wrapper.style.width = `${MAP_RENDER_WIDTH}px`;
  });

  const handleCapture = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    setCapturing(true);
    map.once("render", () => {
      try {
        const canvas = map.getCanvas();
        canvas.toBlob(blob => {
          setCapturing(false);
          if (blob) onCapture(blob);
        }, "image/png");
      } catch {
        setCapturing(false);
      }
    });
    map.triggerRepaint();
  }, [mapReady, onCapture]);

  if (webglError) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-muted text-muted-foreground text-sm" data-testid="map-webgl-error">
        <Info className="w-4 h-4 shrink-0" />
        <span>{webglError}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        style={{ width: MAP_RENDER_WIDTH, height: MAP_RENDER_HEIGHT, overflow: "hidden", borderRadius: "6px" }}
      >
        <div ref={containerRef} style={{ width: MAP_RENDER_WIDTH, height: MAP_RENDER_HEIGHT }} />
      </div>
      <Button
        onClick={handleCapture}
        disabled={!mapReady || capturing}
        className="w-full"
        data-testid="button-capture-map"
      >
        {capturing ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Capturing…</>
        ) : (
          <><Camera className="w-4 h-4 mr-2" /> Capture View</>
        )}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Pan and zoom the map to frame the area, then capture.
      </p>
    </div>
  );
}

function UploadFallback({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed rounded-md p-10 text-center cursor-pointer hover-elevate"
        onClick={() => inputRef.current?.click()}
        data-testid="zone-upload-image"
      >
        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Click to upload a base image</p>
        <p className="text-xs text-muted-foreground mt-1">JPG or PNG, up to 50 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
        data-testid="input-upload-image"
      />
    </div>
  );
}

function CaptureUI({
  token,
  onCapture,
  onFile,
}: {
  token: string | null;
  onCapture: (blob: Blob) => void;
  onFile: (file: File) => void;
}) {
  const [mode, setMode] = useState<"map" | "upload">(token ? "map" : "upload");

  return (
    <div className="space-y-4">
      {!token && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-sm text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Map capture requires a Mapbox token. Upload an image instead.</span>
        </div>
      )}

      {token && mode === "map" && (
        <div className="space-y-2">
          <MapCapture token={token} onCapture={onCapture} />
          <button
            className="text-xs text-muted-foreground underline underline-offset-2 w-full text-center"
            onClick={() => setMode("upload")}
            data-testid="link-switch-to-upload"
          >
            Upload an image instead
          </button>
        </div>
      )}

      {(mode === "upload" || !token) && (
        <div className="space-y-2">
          <UploadFallback onFile={onFile} />
          {token && (
            <button
              className="text-xs text-muted-foreground underline underline-offset-2 w-full text-center"
              onClick={() => setMode("map")}
              data-testid="link-switch-to-map"
            >
              Use map capture instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function VisualScopeDraft() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: sheet, isLoading } = useQuery<VisualScopeSheetWithCustomer>({
    queryKey: ["/api/visual-scope-sheets", id],
    queryFn: async () => {
      const res = await fetch(`/api/visual-scope-sheets/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: mapboxConfig } = useQuery<{ token: string | null }>({
    queryKey: ["/api/config/mapbox-token"],
  });

  const mapboxToken = mapboxConfig?.token ?? null;

  const patchMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/visual-scope-sheets/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets", id] });
    },
  });

  function scheduleDebounce(
    ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    fn: () => void,
    delay = 800
  ) {
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(fn, delay);
  }

  async function uploadAndSave(blob: Blob, filename: string, mimeType: string, isReplace: boolean) {
    setUploading(true);
    try {
      const urlRes = await apiRequest("POST", `/api/visual-scope-sheets/${id}/upload-url`, {
        mimeType,
        fileSize: blob.size,
      });
      const { uploadUrl, objectPath } = await urlRes.json();

      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: blob,
      });

      if (isReplace && sheet?.baseImagePath) {
        await apiRequest("POST", `/api/visual-scope-sheets/${id}/replace-base-image`, {
          newObjectPath: objectPath,
          newFilename: filename,
          newMimeType: mimeType,
          newSize: blob.size,
        });
      } else {
        await patchMutation.mutateAsync({
          baseImagePath: objectPath,
          baseImageFilename: filename,
          baseImageMimeType: mimeType,
          baseImageSize: blob.size,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets"] });
      toast({ title: isReplace ? "Base image replaced" : "Base image saved" });
      setReplaceOpen(false);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function handleCapture(blob: Blob) {
    uploadAndSave(blob, "map-capture.png", "image/png", replaceOpen);
  }

  function handleFile(file: File) {
    uploadAndSave(file, file.name, file.type, replaceOpen);
  }

  const displayTitle = editTitle ?? sheet?.title ?? "";
  const displayDate = editDate ?? sheet?.scopeDate ?? "";

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="p-6 text-center text-muted-foreground">Visual scope sheet not found.</div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/tools/visual-scope">
          <Button variant="ghost" size="icon" data-testid="button-back-list">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={displayTitle}
              onChange={e => {
                setEditTitle(e.target.value);
                scheduleDebounce(titleDebounceRef, () => {
                  patchMutation.mutate({ title: e.target.value || "Visual Scope" });
                  setEditTitle(null);
                });
              }}
              className="text-xl font-semibold h-auto py-0 border-transparent hover:border-input focus:border-input px-1 w-64"
              data-testid="input-scope-title"
            />
            <Badge variant="secondary" data-testid="badge-status">{sheet.status}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span data-testid="text-customer-name">{sheet.customerName}</span>
            <span>·</span>
            <Input
              type="date"
              value={displayDate}
              onChange={e => {
                setEditDate(e.target.value);
                scheduleDebounce(dateDebounceRef, () => {
                  patchMutation.mutate({ scopeDate: e.target.value });
                  setEditDate(null);
                });
              }}
              className="h-auto py-0 border-transparent hover:border-input focus:border-input px-1 w-36 text-sm"
              data-testid="input-scope-date"
            />
          </div>
        </div>
      </div>

      {/* Base Image + Markup Editor Area */}
      {sheet.baseImagePath ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Visual Scope Editor</CardTitle>
              <div className="flex items-center gap-2">
                <a href={sheet.baseImagePath} download={sheet.baseImageFilename ?? "base-image"}>
                  <Button variant="outline" size="sm" data-testid="button-download-image">
                    <Download className="w-4 h-4 mr-1" /> Download
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReplaceOpen(true)}
                  data-testid="button-replace-image"
                >
                  <RefreshCw className="w-4 h-4 mr-1" /> Replace
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden rounded-b-md">
            <VisualScopeEditor
              sheetId={id!}
              baseImagePath={sheet.baseImagePath}
              initialMarkup={(sheet.markupData as MarkupObject[]) ?? []}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets", id] })}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Base Image</CardTitle>
            <p className="text-sm text-muted-foreground">Capture a satellite view or upload an image to get started.</p>
          </CardHeader>
          <CardContent>
            {uploading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Uploading…</span>
              </div>
            ) : (
              <CaptureUI token={mapboxToken} onCapture={handleCapture} onFile={handleFile} />
            )}
          </CardContent>
        </Card>
      )}

      {/* VS3 Exports */}
      {sheet.baseImagePath && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Exports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["base", "overlay", "combined"] as const).map((type) => (
                <div key={type} className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {type === "base" ? "Base Image" : type === "overlay" ? "Overlay Only" : "Combined + Legend"}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-export-preview-${type}`}
                      onClick={() => window.open(`/api/visual-scope-sheets/${id}/export/${type}?inline=1`, "_blank")}
                    >
                      <Eye className="w-3 h-3 mr-1" />Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-export-download-${type}`}
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `/api/visual-scope-sheets/${id}/export/${type}`;
                        a.download = `vs-${type}.png`;
                        a.click();
                      }}
                    >
                      <Download className="w-3 h-3 mr-1" />Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Exports render server-side at 2000 px wide. Append{" "}
              <code className="bg-muted px-1 rounded text-xs">?w=3000</code>{" "}
              to the URL for higher resolution (max 4000 px).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Replace Sheet */}
      <Sheet open={replaceOpen} onOpenChange={setReplaceOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Replace Base Image</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Your current image stays until the new one is saved successfully.
            </p>
          </SheetHeader>
          {uploading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Uploading…</span>
            </div>
          ) : (
            <CaptureUI token={mapboxToken} onCapture={handleCapture} onFile={handleFile} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
