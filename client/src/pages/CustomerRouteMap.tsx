import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Loader2, Map as MapIcon, Satellite } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Customer } from "@shared/schema";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export default function CustomerRouteMap() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [useSatellite, setUseSatellite] = useState(true);

  const canGeocode = user?.activeRole === "admin" || user?.activeRole === "office";

  const { data: mapboxConfig } = useQuery<{ token: string | null }>({
    queryKey: ["/api/config/mapbox-token"],
  });

  const { data: customers = [], isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const mappedCustomers = customers.filter(
    (c) => c.locationLat != null && c.locationLng != null
  );
  const unmappedCount = customers.length - mappedCustomers.length;

  const geocodeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/customers/geocode-missing"),
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const geocoded = data?.geocoded ?? 0;
      const failed = data?.failed ?? 0;
      toast({
        title: geocoded > 0 ? `Geocoded ${geocoded} customer${geocoded !== 1 ? "s" : ""}` : "No new customers geocoded",
        description: failed > 0 ? `${failed} address${failed !== 1 ? "es" : ""} could not be located` : undefined,
      });
    },
    onError: () => {
      toast({ title: "Geocoding failed", description: "Could not geocode customers", variant: "destructive" });
    },
  });

  const [webglError, setWebglError] = useState(false);

  // Initialize map
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

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxConfig?.token]);

  // Update map style when satellite toggle changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    mapRef.current.setStyle(
      useSatellite
        ? "mapbox://styles/mapbox/satellite-streets-v12"
        : "mapbox://styles/mapbox/streets-v12"
    );
  }, [useSatellite, mapReady]);

  // Place markers whenever customers or map readiness changes
  useEffect(() => {
    if (!mapRef.current || !mapReady || mappedCustomers.length === 0) return;

    // Remove existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = new mapboxgl.LngLatBounds();

    for (const customer of mappedCustomers) {
      const lat = customer.locationLat!;
      const lng = customer.locationLng!;

      const isActive = customer.status === "active";

      // Custom marker element
      const el = document.createElement("div");
      el.style.cssText = `
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background-color: ${isActive ? "#22c55e" : "#9ca3af"};
        border: 2.5px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        cursor: pointer;
        transition: transform 0.1s;
      `;
      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.4)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });

      const addressLine = [customer.street, customer.city, customer.state, customer.zip]
        .filter(Boolean)
        .join(", ");

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: true, maxWidth: "260px" })
        .setHTML(`
          <div style="font-family: system-ui, sans-serif; padding: 2px 0;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #111;">${customer.name}</div>
            <div style="font-size: 11px; color: #666; margin-bottom: 8px;">${addressLine}</div>
            <a href="/dashboard/customers/${customer.id}" style="font-size: 12px; color: #1a4d1a; font-weight: 500; text-decoration: none;">
              View Customer →
            </a>
          </div>
        `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
      bounds.extend([lng, lat]);
    }

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 14 });
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
          <h1 className="text-base font-semibold">Route Planning Map</h1>
          {!loadingCustomers && (
            <Badge variant="secondary" className="shrink-0" data-testid="badge-customer-count">
              {mappedCustomers.length} / {customers.length} mapped
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Satellite toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUseSatellite((s) => !s)}
            data-testid="button-toggle-basemap"
          >
            {useSatellite ? (
              <><MapIcon className="w-4 h-4 mr-1.5" />Street</>
            ) : (
              <><Satellite className="w-4 h-4 mr-1.5" />Satellite</>
            )}
          </Button>

          {/* Geocode button — admin/office only, hidden if no unmapped customers */}
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
              Geocode Unmapped ({unmappedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-8 left-3 z-10 bg-white/90 dark:bg-black/80 backdrop-blur-sm rounded-lg shadow px-3 py-2 flex flex-col gap-1.5 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm" />
          <span className="text-foreground">Active customer</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white shadow-sm" />
          <span className="text-foreground">Prospect / inactive</span>
        </div>
      </div>

      {/* Map container */}
      <div className="flex-1 relative">
        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-muted/30">
            <div className="bg-card rounded-lg shadow p-6 text-center max-w-sm">
              <MapPin className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="font-medium mb-1">Map unavailable</p>
              <p className="text-sm text-muted-foreground">WebGL is required to display the interactive map. Please use a modern browser with hardware acceleration enabled.</p>
            </div>
          </div>
        )}
        {!token && !loadingCustomers && !webglError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">Map token not configured.</p>
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
              <p className="font-medium mb-1">No customers mapped yet</p>
              <p className="text-sm text-muted-foreground mb-3">
                {customers.length} customer{customers.length !== 1 ? "s" : ""} need{customers.length === 1 ? "s" : ""} coordinates.
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
                  Geocode All Customers
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
