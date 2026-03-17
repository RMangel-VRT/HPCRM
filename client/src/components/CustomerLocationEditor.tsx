import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Edit, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@shared/schema";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const US_CENTER: [number, number] = [-98.5795, 39.8283];

interface Props {
  customer: Customer;
}

export default function CustomerLocationEditor({ customer }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLng, setDraftLng] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const hasCoords = customer.locationLat != null && customer.locationLng != null;

  const { data: mapboxConfig } = useQuery<{ token: string | null }>({
    queryKey: ["/api/config/mapbox-token"],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (draftLat == null || draftLng == null) throw new Error("No coordinates");
      return apiRequest("PATCH", `/api/customers/${customer.id}`, {
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
      if (!token || !mapContainerRef.current) return;

      destroyMap();

      mapboxgl.accessToken = token;

      const center: [number, number] =
        hasCoords
          ? [customer.locationLng!, customer.locationLat!]
          : US_CENTER;
      const zoom = hasCoords ? 15 : 4;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center,
        zoom,
        interactive,
      });

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
    if (!editing && mapboxConfig?.token) {
      initMap(false);
    }
    return () => {
      destroyMap();
    };
  }, [editing, mapboxConfig?.token, customer.locationLat, customer.locationLng]);

  const handleEditClick = () => {
    setEditing(true);
    setTimeout(() => {
      initMap(true);
    }, 50);
  };

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
        {!editing && (
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
        {!mapboxConfig?.token ? (
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
            <Button
              size="sm"
              onClick={handleEditClick}
              data-testid="button-set-location"
            >
              <MapPin className="w-3 h-3 mr-1" />
              {t("customerDetail.editLocation")}
            </Button>
          </div>
        ) : (
          <>
            <div
              ref={mapContainerRef}
              className="w-full rounded-md overflow-hidden"
              style={{ height: editing ? 300 : 220 }}
              data-testid="map-location-editor"
            />
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
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saveMutation.isPending || draftLat == null}
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
