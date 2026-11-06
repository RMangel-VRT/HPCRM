import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Edit, Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useCustomerScope } from "@/lib/customerScope";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const US_CENTER: [number, number] = [-98.5795, 39.8283];

interface Props {
  customer: Customer;
  /** Admin/office only (CP2 Property). Others see the map read-only. */
  canEdit?: boolean;
  /** Open directly in edit mode (Property "Edit location" title action). */
  autoEdit?: boolean;
}

export default function CustomerLocationEditor({ customer, canEdit = false, autoEdit = false }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const scope = useCustomerScope();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLng, setDraftLng] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const validCoordinates = draftLat != null && draftLng != null &&
    Number.isFinite(draftLat) && Number.isFinite(draftLng) &&
    Math.abs(draftLat) <= 90 && Math.abs(draftLng) <= 180;

  const hasCoords = customer.locationLat != null && customer.locationLng != null;

  const { data: mapboxConfig } = useQuery<{ token: string | null }>({
    queryKey: ["/api/config/mapbox-token"],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!canEdit || !validCoordinates) throw new Error("Invalid coordinates");
      return scope.request("PATCH", `/api/customers/${customer.id}`, {
        locationLat: draftLat,
        locationLng: draftLng,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers/route"] });
      setEditing(false);
      toast({
        title: t("customerDetail.locationSaved"),
        description: t("customerDetail.locationSavedDesc"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("customers.updateFailed"),
        variant: "destructive",
      });
    },
  });

  const destroyMap = useCallback(() => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    setMapReady(false);
  }, []);

  const initMap = useCallback(
    (interactive: boolean) => {
      const token = mapboxConfig?.token;
      if (!token) { setMapError(true); return; }
      if (!mapContainerRef.current) return;

      destroyMap();
      setMapError(false);

      mapboxgl.accessToken = token;

      const center: [number, number] =
        hasCoords
          ? [customer.locationLng!, customer.locationLat!]
          : US_CENTER;
      const zoom = hasCoords ? 15 : 4;

      let map: mapboxgl.Map;
      try {
        // WebGL may be unavailable (managed/headless browsers, disabled GPU).
        // Keep editing usable, but explicitly report that the map failed.
        map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/light-v11",
          center, zoom, interactive,
        });
      } catch {
        setMapError(true);
        return;
      }
      mapRef.current = map;
      map.on("error", () => setMapError(true));

      if (interactive) {
        map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
      }

      map.on("load", () => {
        mapRef.current = map;
        setMapReady(true);

        const markerCenter: [number, number] = hasCoords
          ? [customer.locationLng!, customer.locationLat!]
          : map.getCenter().toArray() as [number, number];

        const marker = new mapboxgl.Marker({
          draggable: interactive,
          color: "#1a4d1a",
        })
          .setLngLat(markerCenter)
          .addTo(map);

        if (interactive) {
          marker.on("drag", () => {
            const lngLat = marker.getLngLat();
            setDraftLat(lngLat.lat);
            setDraftLng(lngLat.lng);
          });
          setDraftLat(markerCenter[1]);
          setDraftLng(markerCenter[0]);
        }

        markerRef.current = marker;
      });
    },
    [mapboxConfig?.token, customer.locationLat, customer.locationLng, hasCoords, destroyMap]
  );

  useEffect(() => {
    if (mapContainerRef.current || editing) initMap(editing);
    return () => {
      destroyMap();
    };
  }, [editing, mapboxConfig?.token, customer.locationLat, customer.locationLng]);

  const handleEditClick = () => {
    if (!canEdit) return;
    setDraftLat(customer.locationLat ?? null);
    setDraftLng(customer.locationLng ?? null);
    setEditing(true);
  };

  const autoEditDone = useRef(false);
  useEffect(() => {
    if (autoEdit && canEdit && !autoEditDone.current) {
      autoEditDone.current = true;
      handleEditClick();
    }
  });

  const handleCancel = () => {
    setEditing(false);
    setDraftLat(null);
    setDraftLng(null);
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const formatCoord = (v: number | null | undefined) =>
    v != null ? v.toFixed(6) : "--";

  return (
    <Card data-testid="card-location-editor">
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          {t("customerDetail.locationSection")}
        </CardTitle>
        {!editing && canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleEditClick}
            data-testid="button-edit-location"
          >
            <Edit className="w-3 h-3 mr-1" />
            {t("customerDetail.editLocation")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!mapboxConfig?.token && !editing ? (
          <div className="flex items-center justify-center h-[180px]">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !hasCoords && !editing ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <MapPin className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("customerDetail.noLocationSet")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("customerDetail.noLocationDesc")}
            </p>
            {canEdit && <Button
              size="sm"
              onClick={handleEditClick}
              data-testid="button-set-location"
            >
              <MapPin className="w-3 h-3 mr-1" />
              {t("customerDetail.editLocation")}
            </Button>}
          </div>
        ) : (
          <>
            <div
              ref={mapContainerRef}
              className="w-full rounded-md overflow-hidden"
              style={{ height: mapError ? 0 : editing ? 300 : 220 }}
              data-testid="map-location-editor"
            />
            {mapError && <p role="status" className="text-sm text-muted-foreground" data-testid="location-map-unavailable">
              {t("customerDetail.mapUnavailable")}
            </p>}
            {editing && mapError && <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">{t("customerDetail.latitude")}
                <input type="number" min="-90" max="90" step="any" value={draftLat ?? ""}
                  onChange={e => setDraftLat(e.target.value === "" ? null : Number(e.target.value))}
                  className="mt-1 w-full rounded border bg-background p-2" data-testid="input-location-latitude" />
              </label>
              <label className="text-sm">{t("customerDetail.longitude")}
                <input type="number" min="-180" max="180" step="any" value={draftLng ?? ""}
                  onChange={e => setDraftLng(e.target.value === "" ? null : Number(e.target.value))}
                  className="mt-1 w-full rounded border bg-background p-2" data-testid="input-location-longitude" />
              </label>
            </div>}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground" data-testid="text-coordinates">
                {t("customerDetail.currentCoords")}:{" "}
                {editing
                  ? `${formatCoord(draftLat)}, ${formatCoord(draftLng)}`
                  : `${formatCoord(customer.locationLat)}, ${formatCoord(customer.locationLng)}`}
              </div>
              {editing && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={saveMutation.isPending}
                    data-testid="button-cancel-location"
                  >
                    {t("customerDetail.cancelEdit")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saveMutation.isPending || !validCoordinates}
                    data-testid="button-save-location"
                  >
                    {saveMutation.isPending && (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    )}
                    {t("customerDetail.saveLocation")}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
