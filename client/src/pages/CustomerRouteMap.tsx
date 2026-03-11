import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Loader2, Map as MapIcon, Satellite } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Customer } from "@shared/schema";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const SOURCE_ID = "customers-dots";
const LAYER_ID = "customers-circle";

function buildGeoJSON(customers: Customer[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: customers
      .filter((c) => c.locationLat != null && c.locationLng != null)
      .map((c) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [c.locationLng!, c.locationLat!],
        },
        properties: {
          id: c.id,
          name: c.name,
          street: c.street ?? "",
          city: c.city ?? "",
          state: c.state ?? "",
          zip: c.zip ?? "",
          status: c.status,
        },
      })),
  };
}

function addLayerToMap(map: mapboxgl.Map, geojson: GeoJSON.FeatureCollection) {
  if (map.getSource(SOURCE_ID)) {
    (map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(SOURCE_ID, { type: "geojson", data: geojson });

  map.addLayer({
    id: LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": 7,
      "circle-color": [
        "case",
        ["==", ["get", "status"], "active"],
        "#22c55e",
        "#9ca3af",
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
    },
  });
}

export default function CustomerRouteMap() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [useSatellite, setUseSatellite] = useState(true);
  const [webglError, setWebglError] = useState(false);

  const canGeocode = user?.activeRole === "admin" || user?.activeRole === "office";

  const { data: mapboxConfig } = useQuery<{ token: string | null }>({
    queryKey: ["/api/config/mapbox-token"],
  });

  const { data: customers = [], isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const routeCustomers = customers.filter((c) => c.includeInRoute);
  const mappedCustomers = routeCustomers.filter(
    (c) => c.locationLat != null && c.locationLng != null
  );
  const unmappedCount = routeCustomers.filter(
    (c) => c.locationLat == null || c.locationLng == null
  ).length;

  const geocodeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/customers/geocode-missing"),
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const geocoded = data?.geocoded ?? 0;
      const failed = data?.failed ?? 0;
      toast({
        title: geocoded > 0 ? t("routeMap.geocoded", { count: geocoded }) : t("routeMap.noNewGeocoded"),
        description: failed > 0 ? `${failed} address${failed !== 1 ? "es" : ""} could not be located` : undefined,
      });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("common.error"), variant: "destructive" });
    },
  });

  // Initialize map once token is available
  useEffect(() => {
    const token = mapboxConfig?.token;
    if (!token || !mapContainerRef.current || mapRef.current) return;

    if (!mapboxgl.supported()) {
      setWebglError(true);
      return;
    }

    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: useSatellite
          ? "mapbox://styles/mapbox/satellite-streets-v12"
          : "mapbox://styles/mapbox/streets-v12",
        center: [-98.5795, 39.8283],
        zoom: 4,
      });
    } catch (err) {
      console.warn("CustomerRouteMap: failed to initialize map", err);
      setWebglError(true);
      return;
    }

    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    map.on("load", () => {
      setMapReady(true);
    });

    map.on("error", (e) => {
      console.warn("Mapbox error:", e);
    });

    // Click handler — opens popup without touching the circle layer
    map.on("click", LAYER_ID, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties as {
        id: string; name: string; street: string; city: string; state: string; zip: string;
      };
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      const addressLine = [props.street, props.city, props.state, props.zip]
        .filter(Boolean)
        .join(", ");

      if (popupRef.current) popupRef.current.remove();

      popupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: true, maxWidth: "260px" })
        .setLngLat(coords)
        .setHTML(`
          <div style="font-family: system-ui, sans-serif; padding: 2px 0;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #111;">${props.name}</div>
            <div style="font-size: 11px; color: #666; margin-bottom: 8px;">${addressLine}</div>
            <a href="/dashboard/customers/${props.id}" style="font-size: 12px; color: #1a4d1a; font-weight: 500; text-decoration: none;">
              View Customer →
            </a>
          </div>
        `)
        .addTo(map);
    });

    map.on("mouseenter", LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;

    return () => {
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapboxConfig?.token]);

  // Toggle satellite/street style — re-add layer after style reloads
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const geojson = buildGeoJSON(mappedCustomers);

    map.setStyle(
      useSatellite
        ? "mapbox://styles/mapbox/satellite-streets-v12"
        : "mapbox://styles/mapbox/streets-v12"
    );

    map.once("styledata", () => {
      addLayerToMap(map, geojson);
    });
  }, [useSatellite]);

  // Update/add GeoJSON data whenever customers or map readiness changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const geojson = buildGeoJSON(mappedCustomers);

    addLayerToMap(map, geojson);

    if (mappedCustomers.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      mappedCustomers.forEach((c) => bounds.extend([c.locationLng!, c.locationLat!]));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
      }
    }
  }, [mappedCustomers, mapReady]);

  const token = mapboxConfig?.token;

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background z-10 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/dashboard/customers")}
          data-testid="button-back-to-customers"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h1 className="text-base font-semibold">{t("routeMap.title")}</h1>
          {!loadingCustomers && (
            <Badge variant="secondary" className="shrink-0" data-testid="badge-customer-count">
              {mappedCustomers.length} / {routeCustomers.length} {t("routeMap.onRoute")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUseSatellite((s) => !s)}
            data-testid="button-toggle-basemap"
          >
            {useSatellite ? (
              <><MapIcon className="w-4 h-4 mr-1.5" />{t("routeMap.street")}</>
            ) : (
              <><Satellite className="w-4 h-4 mr-1.5" />{t("routeMap.satellite")}</>
            )}
          </Button>

          {canGeocode && unmappedCount > 0 && (
            <Button
              size="sm"
              variant="default"
              onClick={() => geocodeMutation.mutate()}
              disabled={geocodeMutation.isPending}
              data-testid="button-geocode-missing"
            >
              {geocodeMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4 mr-1.5" />
              )}
              {t("routeMap.geocodeUnmapped", { count: unmappedCount })}
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-8 left-3 z-10 bg-white/90 dark:bg-black/80 backdrop-blur-sm rounded-lg shadow px-3 py-2 flex flex-col gap-1.5 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm" />
          <span className="text-foreground">{t("routeMap.activeCustomer")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white shadow-sm" />
          <span className="text-foreground">{t("routeMap.prospectInactive")}</span>
        </div>
      </div>

      {/* Map container */}
      <div className="flex-1 relative">
        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-muted/30">
            <div className="bg-card rounded-lg shadow p-6 text-center max-w-sm">
              <MapPin className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="font-medium mb-1">{t("routeMap.mapUnavailable")}</p>
              <p className="text-sm text-muted-foreground">{t("routeMap.webglRequired")}</p>
            </div>
          </div>
        )}
        {!token && !loadingCustomers && !webglError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">{t("routeMap.mapTokenMissing")}</p>
          </div>
        )}
        {loadingCustomers && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {mappedCustomers.length === 0 && !loadingCustomers && mapReady && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-white/95 dark:bg-black/80 backdrop-blur-sm rounded-lg shadow px-6 py-4 text-center max-w-xs pointer-events-auto">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="font-medium mb-1">{t("routeMap.noRouteCustomers")}</p>
              <p className="text-sm text-muted-foreground mb-3">
                {routeCustomers.length > 0
                  ? `${routeCustomers.length} route customer${routeCustomers.length !== 1 ? "s" : ""} need${routeCustomers.length === 1 ? "s" : ""} coordinates.`
                  : t("routeMap.noRouteCustomers")}
              </p>
              {canGeocode && (
                <Button
                  size="sm"
                  onClick={() => geocodeMutation.mutate()}
                  disabled={geocodeMutation.isPending}
                  data-testid="button-geocode-missing-empty"
                >
                  {geocodeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4 mr-1.5" />
                  )}
                  {t("routeMap.geocodeAll")}
                </Button>
              )}
            </div>
          </div>
        )}
        <div ref={mapContainerRef} className="w-full h-full" data-testid="map-container" />
      </div>
    </div>
  );
}
