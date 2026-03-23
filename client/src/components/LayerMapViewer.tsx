import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CustomerMapLayer } from "@shared/schema";
import { MapContainer, TileLayer, GeoJSON, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, X, ChevronLeft, ChevronRight, Map as MapIcon, Satellite, LocateFixed } from "lucide-react";
import { Badge } from "@/components/ui/badge";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const LAYER_TYPES = {
  base: [
    { value: "community_outline", label: "Community Outline", color: "#00FFFF" }, // Bright cyan
  ],
  community: [
    { value: "mowing", label: "Mowing Zones", color: "#00FF00" },      // Bright green
    { value: "native_grass", label: "Native Grass Areas", color: "#ADFF2F" }, // Green-yellow
    { value: "landscape_beds", label: "Landscape Beds", color: "#FF6600" },   // Bright orange
    { value: "pet_stations", label: "Pet Stations", color: "#FF00FF" },       // Magenta
  ],
  snow: [
    { value: "atv_route", label: "ATV Routes", color: "#FFD700" },     // Bright orangish yellow (gold)
    { value: "truck_plow", label: "Truck Plow", color: "#FFFF00" },    // Yellow
    { value: "hand_shovel", label: "Hand Shovel", color: "#FF69B4" },  // Hot pink
    { value: "ice_melt", label: "Ice Melt", color: "#FF0000" },        // Bright red
    { value: "ice_melt_buckets", label: "Ice Melt Buckets", color: "#00CED1" }, // Dark turquoise
  ],
  custom: [] as { value: string; label: string; color: string }[],
};

interface LayerData {
  layer: CustomerMapLayer;
  geoJson: GeoJSON.FeatureCollection | null;
  loading: boolean;
  error: boolean;
}

interface LayerMapViewerProps {
  customerId: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  fullScreen?: boolean;
  onClose?: () => void;
  isVisible?: boolean;
}

function FitBounds({ bounds, fitTrigger }: { bounds: L.LatLngBounds | null; fitTrigger?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds || !bounds.isValid()) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [50, 50] });
    }, 100);
    return () => clearTimeout(timer);
  }, [map, bounds, fitTrigger]);
  return null;
}

function LocateMeControl({ active }: { active: boolean }) {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!active) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
      return;
    }

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const latlng: L.LatLngExpression = [latitude, longitude];

        if (!markerRef.current) {
          markerRef.current = L.circleMarker(latlng, {
            radius: 8,
            color: "#fff",
            weight: 2.5,
            fillColor: "#3b82f6",
            fillOpacity: 1,
          }).addTo(map);
        } else {
          markerRef.current.setLatLng(latlng);
        }

        if (!circleRef.current) {
          circleRef.current = L.circle(latlng, {
            radius: accuracy,
            color: "#3b82f6",
            fillColor: "#3b82f6",
            fillOpacity: 0.12,
            weight: 1,
          }).addTo(map);
        } else {
          circleRef.current.setLatLng(latlng);
          circleRef.current.setRadius(accuracy);
        }

        map.setView(latlng, Math.max(map.getZoom(), 16));
      },
      (err) => console.warn("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
    };
  }, [map, active]);

  return null;
}

export default function LayerMapViewer({
  customerId,
  initialCenter = [39.8283, -98.5795],
  initialZoom = 4,
  fullScreen = false,
  onClose,
  isVisible,
}: LayerMapViewerProps) {
  const [enabledLayers, setEnabledLayers] = useState<Set<string>>(new Set());
  const [layerData, setLayerData] = useState<Map<string, LayerData>>(new Map());
  const [showLayerPanel, setShowLayerPanel] = useState(true);
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [useSatellite, setUseSatellite] = useState(true);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [showMyLocation, setShowMyLocation] = useState(false);

  useEffect(() => {
    if (isVisible) setFitTrigger(t => t + 1);
  }, [isVisible]);

  const { data: mapLayers = [], isLoading: loadingLayers } = useQuery<CustomerMapLayer[]>({
    queryKey: ["/api/customers", customerId, "map-layers"],
  });

  useEffect(() => {
    if (mapLayers.length > 0) {
      const newEnabledLayers = new Set(mapLayers.map((l) => l.id));
      setEnabledLayers(newEnabledLayers);
    }
  }, [mapLayers]);

  useEffect(() => {
    const fetchLayerData = async () => {
      for (const layer of mapLayers) {
        if (layerData.has(layer.id)) continue;

        setLayerData((prev) => {
          const newMap = new Map(prev);
          newMap.set(layer.id, { layer, geoJson: null, loading: true, error: false });
          return newMap;
        });

        try {
          // The kmlPath should already be in /objects/... format
          const kmlUrl = layer.kmlPath;

          const response = await fetch(kmlUrl, { credentials: "include" });
          if (!response.ok) throw new Error(`Failed to fetch KML: ${response.status}`);

          const kmlText = await response.text();
          const geoJson = kmlToGeoJson(kmlText);

          setLayerData((prev) => {
            const newMap = new Map(prev);
            newMap.set(layer.id, { layer, geoJson, loading: false, error: false });
            return newMap;
          });
        } catch (error) {
          console.error(`Error loading layer ${layer.id}:`, error);
          setLayerData((prev) => {
            const newMap = new Map(prev);
            newMap.set(layer.id, { layer, geoJson: null, loading: false, error: true });
            return newMap;
          });
        }
      }
    };

    if (mapLayers.length > 0) {
      fetchLayerData();
    }
  }, [mapLayers]);

  useEffect(() => {
    const allBounds = L.latLngBounds([]);
    layerData.forEach((data) => {
      if (data.geoJson && enabledLayers.has(data.layer.id)) {
        const layer = L.geoJSON(data.geoJson);
        const layerBounds = layer.getBounds();
        if (layerBounds.isValid()) {
          allBounds.extend(layerBounds);
        }
      }
    });
    if (allBounds.isValid()) {
      setBounds(allBounds);
    }
  }, [layerData, enabledLayers]);

  const toggleLayer = (layerId: string) => {
    setEnabledLayers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(layerId)) {
        newSet.delete(layerId);
      } else {
        newSet.add(layerId);
      }
      return newSet;
    });
  };

  const baseLayers = mapLayers.filter((l) => l.category === "base");
  const communityLayers = mapLayers.filter((l) => l.category === "community");
  const snowLayers = mapLayers.filter((l) => l.category === "snow");
  const customLayers = mapLayers.filter((l) => l.category === "custom");

  const mapCenter: [number, number] = initialCenter;

  if (loadingLayers) {
    return (
      <div className={fullScreen ? "fixed inset-0 bg-background z-50" : "absolute inset-0"}>
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (mapLayers.length === 0) {
    return (
      <div className={fullScreen ? "fixed inset-0 bg-background z-50 flex items-center justify-center" : "absolute inset-0 flex items-center justify-center border rounded-md"}>
        {fullScreen && onClose && (
          <div className="absolute top-4 right-4 z-[1000]">
            <Button variant="outline" size="icon" onClick={onClose} data-testid="button-close-map-viewer">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        <div className="text-center text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No map layers uploaded for this property</p>
          {fullScreen && onClose && (
            <Button variant="outline" className="mt-4" onClick={onClose} data-testid="button-back-from-map">
              Back to List
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={fullScreen ? "fixed inset-0 bg-background z-50" : "absolute inset-0"}>
      {/* Top toolbar - compact horizontal strip */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center justify-between pointer-events-none">
        {/* Left controls - layers and map type */}
        <div className="flex items-center gap-1 pointer-events-auto">
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 bg-white/90 backdrop-blur-sm text-black shadow-md border-0 hover:bg-white dark:bg-black/80 dark:text-white dark:hover:bg-black"
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            data-testid="button-toggle-layers"
          >
            <Layers className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 bg-white/90 backdrop-blur-sm text-black shadow-md border-0 hover:bg-white dark:bg-black/80 dark:text-white dark:hover:bg-black"
            onClick={() => setUseSatellite(!useSatellite)}
            data-testid="button-toggle-satellite"
          >
            {useSatellite ? <MapIcon className="w-4 h-4" /> : <Satellite className="w-4 h-4" />}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className={`h-9 w-9 backdrop-blur-sm shadow-md border-0 transition-colors ${
              showMyLocation
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-white/90 text-black hover:bg-white dark:bg-black/80 dark:text-white dark:hover:bg-black"
            }`}
            onClick={() => setShowMyLocation(!showMyLocation)}
            title={showMyLocation ? "Hide my location" : "Show my location"}
            data-testid="button-toggle-my-location"
          >
            <LocateFixed className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Right control - close button */}
        {fullScreen && onClose && (
          <Button 
            variant="secondary"
            size="icon"
            className="h-9 w-9 bg-white/90 backdrop-blur-sm text-black shadow-md border-0 hover:bg-white dark:bg-black/80 dark:text-white dark:hover:bg-black pointer-events-auto"
            onClick={onClose} 
            data-testid="button-close-map-viewer"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Layer panel - slides down from top */}
      {showLayerPanel && (
        <div className="absolute top-14 left-3 right-3 z-[1000] max-h-[50vh] overflow-auto bg-white/95 backdrop-blur-sm dark:bg-black/90 rounded-lg shadow-lg">
          <div className="p-3 space-y-3">
            {baseLayers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Base</p>
                <div className="flex flex-wrap gap-2">
                  {baseLayers.map((layer) => {
                    const data = layerData.get(layer.id);
                    const isEnabled = enabledLayers.has(layer.id);
                    return (
                      <button
                        key={layer.id}
                        onClick={() => toggleLayer(layer.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-all ${
                          isEnabled 
                            ? 'bg-primary text-primary-foreground shadow-sm' 
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }`}
                        data-testid={`chip-layer-${layer.id}`}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full border border-current/30"
                          style={{ backgroundColor: layer.color || "#FFFFFF" }}
                        />
                        <span className="truncate max-w-[100px]">{layer.name}</span>
                        {data?.loading && <span className="text-[8px]">...</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {communityLayers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Community</p>
                <div className="flex flex-wrap gap-2">
                  {communityLayers.map((layer) => {
                    const data = layerData.get(layer.id);
                    const isEnabled = enabledLayers.has(layer.id);
                    return (
                      <button
                        key={layer.id}
                        onClick={() => toggleLayer(layer.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-all ${
                          isEnabled 
                            ? 'bg-primary text-primary-foreground shadow-sm' 
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }`}
                        data-testid={`chip-layer-${layer.id}`}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: layer.color || "#22c55e" }}
                        />
                        <span className="truncate max-w-[100px]">{layer.name}</span>
                        {data?.loading && <span className="text-[8px]">...</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {snowLayers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Snow</p>
                <div className="flex flex-wrap gap-2">
                  {snowLayers.map((layer) => {
                    const data = layerData.get(layer.id);
                    const isEnabled = enabledLayers.has(layer.id);
                    return (
                      <button
                        key={layer.id}
                        onClick={() => toggleLayer(layer.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-all ${
                          isEnabled 
                            ? 'bg-primary text-primary-foreground shadow-sm' 
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }`}
                        data-testid={`chip-layer-${layer.id}`}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: layer.color || "#3b82f6" }}
                        />
                        <span className="truncate max-w-[100px]">{layer.name}</span>
                        {data?.loading && <span className="text-[8px]">...</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {customLayers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Custom</p>
                <div className="flex flex-wrap gap-2">
                  {customLayers.map((layer) => {
                    const data = layerData.get(layer.id);
                    const isEnabled = enabledLayers.has(layer.id);
                    return (
                      <button
                        key={layer.id}
                        onClick={() => toggleLayer(layer.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-all ${
                          isEnabled 
                            ? 'bg-primary text-primary-foreground shadow-sm' 
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }`}
                        data-testid={`chip-layer-${layer.id}`}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: layer.color || "#6b7280" }}
                        />
                        <span className="truncate max-w-[100px]">{layer.name}</span>
                        {data?.loading && <span className="text-[8px]">...</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <MapContainer
        center={mapCenter}
        zoom={initialZoom}
        maxZoom={21}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
        className="z-0 [&_.leaflet-control-zoom]:!left-3 [&_.leaflet-control-zoom]:!bottom-3 [&_.leaflet-control-zoom]:!top-auto"
      >
        <ZoomControl position="bottomleft" />
        {useSatellite ? (
          <TileLayer
            attribution='&copy; Google Maps'
            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            maxZoom={21}
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}
        <FitBounds bounds={bounds} fitTrigger={fitTrigger} />
        <LocateMeControl active={showMyLocation} />

        {Array.from(layerData.values()).map((data) => {
          if (!data.geoJson || !enabledLayers.has(data.layer.id)) return null;
          const isOutlineOnly = data.layer.layerType === "community_outline";
          return (
            <GeoJSON
              key={data.layer.id}
              data={data.geoJson}
              style={{
                color: data.layer.color || "#3388ff",
                weight: isOutlineOnly ? 3 : 2,
                opacity: 1,
                fillOpacity: isOutlineOnly ? 0 : 0.3,
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}

function kmlToGeoJson(kmlText: string): GeoJSON.FeatureCollection {
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlText, "text/xml");

  const features: GeoJSON.Feature[] = [];

  const placemarks = kmlDoc.querySelectorAll("Placemark");
  placemarks.forEach((placemark) => {
    const name = placemark.querySelector("name")?.textContent || "";
    const description = placemark.querySelector("description")?.textContent || "";

    const polygon = placemark.querySelector("Polygon");
    if (polygon) {
      const coordinates = parseKmlCoordinates(
        polygon.querySelector("outerBoundaryIs LinearRing coordinates")?.textContent || ""
      );
      if (coordinates.length > 0) {
        features.push({
          type: "Feature",
          properties: { name, description },
          geometry: {
            type: "Polygon",
            coordinates: [coordinates],
          },
        });
      }
    }

    const lineString = placemark.querySelector("LineString");
    if (lineString) {
      const coordinates = parseKmlCoordinates(
        lineString.querySelector("coordinates")?.textContent || ""
      );
      if (coordinates.length > 0) {
        features.push({
          type: "Feature",
          properties: { name, description },
          geometry: {
            type: "LineString",
            coordinates,
          },
        });
      }
    }

    const point = placemark.querySelector("Point");
    if (point) {
      const coordinates = parseKmlCoordinates(
        point.querySelector("coordinates")?.textContent || ""
      );
      if (coordinates.length > 0) {
        features.push({
          type: "Feature",
          properties: { name, description },
          geometry: {
            type: "Point",
            coordinates: coordinates[0],
          },
        });
      }
    }
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

function parseKmlCoordinates(coordString: string): number[][] {
  if (!coordString.trim()) return [];

  return coordString
    .trim()
    .split(/\s+/)
    .map((coord) => {
      const [lng, lat, alt] = coord.split(",").map(Number);
      return [lng, lat];
    })
    .filter((coord) => !isNaN(coord[0]) && !isNaN(coord[1]));
}
