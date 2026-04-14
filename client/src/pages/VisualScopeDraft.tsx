import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
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
import { ArrowLeft, Download, RefreshCw, ImageIcon, Loader2, Info, Eye, Zap, RotateCcw, Compass } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VisualScopeSheetWithCustomer, MarkupObject, CaptureParams } from "@shared/schema";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import VisualScopeEditor from "./VisualScopeEditor";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAP_RENDER_WIDTH = 2000;
const MAP_RENDER_HEIGHT = 2000;

function MapCapture({
  token,
  mapRef,
  onMapReady,
  onWebGLError,
  onBearingChange,
  initialCenter,
}: {
  token: string;
  mapRef: React.RefObject<mapboxgl.Map | null>;
  onMapReady: (ready: boolean) => void;
  onWebGLError?: () => void;
  onBearingChange?: (bearing: number) => void;
  initialCenter?: { lat: number; lng: number; zoom: number; bearing: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const initialCenterRef = useRef(initialCenter);
  useEffect(() => { initialCenterRef.current = initialCenter; }, [initialCenter]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapboxgl.supported()) {
      const msg = "WebGL is not supported in this environment.";
      setWebglError(msg);
      onWebGLError?.();
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
        preserveDrawingBuffer: false,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.on("load", () => {
        const center = initialCenterRef.current;
        if (center) {
          map.flyTo({
            center: [center.lng, center.lat],
            zoom: center.zoom,
            bearing: center.bearing,
          });
        }
        onMapReady(true);
      });
      map.on("rotate", () => {
        onBearingChange?.(map.getBearing());
      });
      map.on("error", (e) => {
        console.warn("Mapbox error:", e);
      });
      (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = map;
    } catch (err) {
      const msg = "Map initialization failed. Please use the image upload option below.";
      setWebglError(msg);
      onWebGLError?.();
      return;
    }
    return () => {
      map.remove();
      (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = null;
      onMapReady(false);
    };
  }, [token]);

  useEffect(() => {
    if (!wrapperRef.current || !outerRef.current || webglError) return;
    const wrapper = wrapperRef.current;
    const outer = outerRef.current;
    const parentWidth = outer.clientWidth || outer.parentElement?.clientWidth || 600;
    const scale = parentWidth / MAP_RENDER_WIDTH;
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = "top left";
    wrapper.style.height = `${MAP_RENDER_HEIGHT}px`;
    wrapper.style.width = `${MAP_RENDER_WIDTH}px`;
    outer.style.height = `${MAP_RENDER_HEIGHT * scale}px`;
  });

  if (webglError) {
    return null;
  }

  const cornerStyle: React.CSSProperties = {
    position: "absolute",
    width: 22,
    height: 22,
  };
  const cornerBorder = "3px solid rgba(255,255,255,0.95)";

  return (
    <div
      ref={outerRef}
      style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: "6px" }}
      data-testid="container-map-preview"
    >
      <div
        ref={wrapperRef}
        style={{ width: MAP_RENDER_WIDTH, height: MAP_RENDER_HEIGHT, overflow: "hidden", borderRadius: "6px" }}
      >
        <div ref={containerRef} style={{ width: MAP_RENDER_WIDTH, height: MAP_RENDER_HEIGHT }} />
      </div>

      {/* Capture zone frame overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          borderRadius: "6px",
          border: "2px solid rgba(255,255,255,0.55)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
        }}
        data-testid="overlay-capture-frame"
      >
        {/* Corner handles */}
        <div style={{ ...cornerStyle, top: 8, left: 8, borderTop: cornerBorder, borderLeft: cornerBorder }} />
        <div style={{ ...cornerStyle, top: 8, right: 8, borderTop: cornerBorder, borderRight: cornerBorder }} />
        <div style={{ ...cornerStyle, bottom: 8, left: 8, borderBottom: cornerBorder, borderLeft: cornerBorder }} />
        <div style={{ ...cornerStyle, bottom: 8, right: 8, borderBottom: cornerBorder, borderRight: cornerBorder }} />

        {/* Capture area label */}
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.52)",
            color: "white",
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 10px",
            borderRadius: 4,
            letterSpacing: "0.07em",
            whiteSpace: "nowrap",
          }}
        >
          CAPTURE AREA
        </div>
      </div>
    </div>
  );
}

function UploadFallback({ onFile }: { onFile: (file: File) => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <div
        className="border-2 border-dashed rounded-md p-10 text-center cursor-pointer hover-elevate"
        onClick={() => inputRef.current?.click()}
        data-testid="zone-upload-image"
      >
        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">{t("visualScope.clickToUpload")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("visualScope.fileTypes")}</p>
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
  sheetId,
  captureParams,
  customerAddress,
  onFile,
  onHighResSuccess,
}: {
  token: string | null;
  sheetId: string;
  captureParams?: CaptureParams | null;
  customerAddress?: { street?: string | null; city?: string | null; state?: string | null } | null;
  onFile: (file: File) => void;
  onHighResSuccess: () => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [mode, setMode] = useState<"map" | "upload">(token ? "map" : "upload");
  const [captureWidth, setCaptureWidth] = useState<2000 | 3000 | 4000>(2000);
  const [highResCapturing, setHighResCapturing] = useState(false);
  const [webglFallbackMode, setWebglFallbackMode] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualZoom, setManualZoom] = useState("14");
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [geocodedCenter, setGeocodedCenter] = useState<{ lat: number; lng: number; zoom: number; bearing: number } | null>(null);

  useEffect(() => {
    if (captureParams) return;
    const { street, city, state } = customerAddress ?? {};
    const addressParts = [street, city, state].filter(Boolean);
    if (!addressParts.length) return;
    const address = addressParts.join(", ");
    fetch(`/api/geocode?address=${encodeURIComponent(address)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.lat != null && data?.lng != null) {
          setGeocodedCenter({ lat: data.lat, lng: data.lng, zoom: 17, bearing: 0 });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!geocodedCenter || !mapReady || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [geocodedCenter.lng, geocodedCenter.lat],
      zoom: geocodedCenter.zoom,
      bearing: geocodedCenter.bearing,
    });
  }, [geocodedCenter, mapReady]);

  function handleBearingSlider(value: number[]) {
    const b = value[0];
    setBearing(b);
    mapRef.current?.setBearing(b);
  }

  function handleResetNorth() {
    setBearing(0);
    mapRef.current?.rotateTo(0, { duration: 400 } as any);
  }

  async function handleHighResCapture(params?: { lat: number; lng: number; zoom: number }) {
    const map = mapRef.current;
    const lat = params?.lat ?? map?.getCenter().lat;
    const lng = params?.lng ?? map?.getCenter().lng;
    const zoom = params?.zoom ?? map?.getZoom();
    if (lat == null || lng == null || zoom == null || isNaN(Number(lat)) || isNaN(Number(lng)) || isNaN(Number(zoom))) {
      toast({ title: t("common.error"), variant: "destructive" });
      return;
    }
    const bearing = map?.getBearing() ?? 0;
    const pitch = map?.getPitch() ?? 0;
    setHighResCapturing(true);
    try {
      const res = await apiRequest("POST", `/api/visual-scope-sheets/${sheetId}/capture-highres`, {
        centerLat: Number(lat),
        centerLng: Number(lng),
        zoom: Number(zoom),
        bearing,
        pitch,
        width: captureWidth,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "High-res capture failed");
      }
      onHighResSuccess();
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setHighResCapturing(false);
    }
  }

  return (
    <div className="space-y-4">
      {token && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">{t("visualScope.width")}</span>
          {([2000, 3000, 4000] as const).map((w) => (
            <Button
              key={w}
              size="sm"
              variant={captureWidth === w ? "default" : "outline"}
              onClick={() => setCaptureWidth(w)}
              data-testid={`button-width-${w}`}
            >
              {w}px
            </Button>
          ))}
        </div>
      )}

      {token && mode === "map" && !webglFallbackMode && (
        <div className="space-y-3">
          <MapCapture
            token={token}
            mapRef={mapRef}
            onMapReady={setMapReady}
            onWebGLError={() => setWebglFallbackMode(true)}
            onBearingChange={setBearing}
            initialCenter={
              captureParams
                ? { lat: captureParams.centerLat, lng: captureParams.centerLng, zoom: captureParams.zoom, bearing: captureParams.bearing }
                : geocodedCenter
            }
          />
          {mapReady && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Compass className="w-3.5 h-3.5" />
                  <span>{t("visualScope.rotation")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground w-12 text-right">
                    {bearing >= 0 ? bearing.toFixed(0) : (360 + bearing).toFixed(0)}°
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={handleResetNorth}
                    data-testid="button-reset-north"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("visualScope.north")}
                  </Button>
                </div>
              </div>
              <Slider
                min={-180}
                max={180}
                step={1}
                value={[bearing]}
                onValueChange={handleBearingSlider}
                data-testid="slider-bearing"
              />
            </div>
          )}
          <Button
            className="w-full"
            onClick={() => handleHighResCapture()}
            disabled={!mapReady || highResCapturing}
            data-testid="button-capture-highres"
          >
            {highResCapturing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("visualScope.generatingHighRes")}</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" />{t("visualScope.captureHighRes")}</>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {t("visualScope.captureBaseImage")}
          </p>
          <button
            className="text-xs text-muted-foreground underline underline-offset-2 w-full text-center"
            onClick={() => setMode("upload")}
            data-testid="link-switch-to-upload"
          >
            {t("visualScope.uploadImage")}
          </button>
        </div>
      )}

      {token && mode === "map" && webglFallbackMode && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{t("visualScope.mapNotAvailable")}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("visualScope.latitude")}</label>
              <Input
                value={manualLat}
                onChange={e => setManualLat(e.target.value)}
                placeholder="39.83"
                data-testid="input-manual-lat"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("visualScope.longitude")}</label>
              <Input
                value={manualLng}
                onChange={e => setManualLng(e.target.value)}
                placeholder="-98.58"
                data-testid="input-manual-lng"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("visualScope.zoom")}</label>
              <Input
                value={manualZoom}
                onChange={e => setManualZoom(e.target.value)}
                placeholder="14"
                data-testid="input-manual-zoom"
              />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={highResCapturing}
            onClick={() =>
              handleHighResCapture({
                lat: parseFloat(manualLat),
                lng: parseFloat(manualLng),
                zoom: parseFloat(manualZoom),
              })
            }
            data-testid="button-capture-highres-manual"
          >
            {highResCapturing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("visualScope.generating")}</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" />{t("visualScope.recaptureHighRes")}</>
            )}
          </Button>
          <button
            className="text-xs text-muted-foreground underline underline-offset-2 w-full text-center"
            onClick={() => setMode("upload")}
            data-testid="link-switch-to-upload"
          >
            {t("visualScope.uploadImage")}
          </button>
        </div>
      )}

      {!token && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-sm text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{t("visualScope.uploadImage")}</span>
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
              {t("visualScope.useMapCapture")}
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
  const { t } = useTranslation();
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reCapturing, setReCapturing] = useState(false);
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
      toast({ title: isReplace ? t("visualScope.baseReplaced") : t("visualScope.baseSaved") });
      setReplaceOpen(false);
    } catch (err: any) {
      toast({ title: t("proposals.uploadFailed"), description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function handleFile(file: File) {
    uploadAndSave(file, file.name, file.type, replaceOpen);
  }

  function handleHighResSuccess() {
    queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets"] });
    toast({ title: t("visualScope.highResCaptured"), description: t("visualScope.satelliteSaved") });
    setReplaceOpen(false);
  }

  async function handleReCapture() {
    const params = sheet?.captureParams as CaptureParams | null | undefined;
    if (!params) return;
    setReCapturing(true);
    try {
      const res = await apiRequest("POST", `/api/visual-scope-sheets/${id}/capture-highres`, {
        centerLat: params.centerLat,
        centerLng: params.centerLng,
        zoom: params.zoom,
        bearing: params.bearing,
        pitch: params.pitch,
        width: params.widthUsed,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Re-capture failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets"] });
      toast({ title: t("visualScope.highResCaptured"), description: t("visualScope.satelliteSaved") });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setReCapturing(false);
    }
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
      <div className="p-6 text-center text-muted-foreground">{t("visualScope.noSheets")}</div>
    );
  }

  const captureParams = sheet.captureParams as CaptureParams | null | undefined;

  const imgCacheKey = captureParams?.capturedAt
    ?? sheet.baseImageSize?.toString()
    ?? "1";
  const baseImageApiUrl = `/api/visual-scope-sheets/${id}/base-image?v=${encodeURIComponent(imgCacheKey)}`;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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

      {sheet.baseImagePath ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">{t("visualScope.markupLayer")}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {captureParams && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reCapturing}
                    onClick={handleReCapture}
                    data-testid="button-recapture-highres"
                  >
                    {reCapturing ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" />{t("visualScope.generatingHighRes")}</>
                    ) : (
                      <><Zap className="w-4 h-4 mr-1" />{t("visualScope.recaptureCurrent")}</>
                    )}
                  </Button>
                )}
                <a href={baseImageApiUrl} download={sheet.baseImageFilename ?? "base-image"}>
                  <Button variant="outline" size="sm" data-testid="button-download-image">
                    <Download className="w-4 h-4 mr-1" /> {t("common.download")}
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReplaceOpen(true)}
                  data-testid="button-replace-image"
                >
                  <RefreshCw className="w-4 h-4 mr-1" /> {t("visualScope.replaceBaseImage")}
                </Button>
              </div>
            </div>
            {captureParams && (
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-capture-params">
                High-res capture · {captureParams.widthUsed}px · Zoom {captureParams.zoom.toFixed(1)} ·{" "}
                {new Date(captureParams.capturedAt).toLocaleDateString()}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-0 overflow-hidden rounded-b-md">
            <VisualScopeEditor
              sheetId={id!}
              baseImagePath={baseImageApiUrl}
              initialMarkup={(sheet.markupData as MarkupObject[]) ?? []}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets", id] })}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("visualScope.captureBaseImage")}</CardTitle>
          </CardHeader>
          <CardContent>
            {uploading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t("proposals.uploading")}</span>
              </div>
            ) : (
              <CaptureUI
                token={mapboxToken}
                sheetId={id!}
                captureParams={captureParams}
                customerAddress={{ street: sheet.customerStreet, city: sheet.customerCity, state: sheet.customerState }}
                onFile={handleFile}
                onHighResSuccess={handleHighResSuccess}
              />
            )}
          </CardContent>
        </Card>
      )}

      {sheet.baseImagePath && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("visualScope.downloadCombined")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["base", "overlay", "combined"] as const).map((type) => (
                <div key={type} className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {type === "base" ? t("proposalVersion.downloadBase") : type === "overlay" ? t("proposalVersion.downloadOverlay") : t("proposalVersion.downloadCombined")}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-export-preview-${type}`}
                      onClick={() => window.open(`/api/visual-scope-sheets/${id}/export/${type}?inline=1`, "_blank")}
                    >
                      <Eye className="w-3 h-3 mr-1" />{t("common.preview")}
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
                      <Download className="w-3 h-3 mr-1" />{t("common.download")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Sheet open={replaceOpen} onOpenChange={setReplaceOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{t("visualScope.replaceBaseImage")}</SheetTitle>
          </SheetHeader>
          {uploading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t("proposals.uploading")}</span>
            </div>
          ) : (
            <CaptureUI
              token={mapboxToken}
              sheetId={id!}
              captureParams={captureParams}
              customerAddress={{ street: sheet.customerStreet, city: sheet.customerCity, state: sheet.customerState }}
              onFile={handleFile}
              onHighResSuccess={handleHighResSuccess}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
