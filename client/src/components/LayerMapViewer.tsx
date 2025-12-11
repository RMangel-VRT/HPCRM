import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CustomerMapLayer } from "@shared/schema";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, X, ChevronLeft, ChevronRight, Map as MapIcon, Satellite } from "lucide-react";
import { Badge } from "@/components/ui/badge";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const LAYER_TYPES = {
  community: [
    { value: "mowing", label: "Mowing Zones", color: "#00FF00" },      // Bright green
    { value: "native_grass", label: "Native Grass Areas", color: "#ADFF2F" }, // Green-yellow
    { value: "landscape_beds", label: "Landscape Beds", color: "#FF6600" },   // Bright orange
    { value: "pet_stations", label: "Pet Stations", color: "#FF00FF" },       // Magenta
  ],
  snow: [
    { value: "atv_route", label: "ATV Routes", color: "#00FFFF" },     // Cyan
    { value: "truck_plow", label: "Truck Plow", color: "#FFFF00" },    // Yellow
    { value: "hand_shovel", label: "Hand Shovel", color: "#FF69B4" },  // Hot pink
    { value: "ice_melt", label: "Ice Melt", color: "#FF0000" },        // Bright red
  ],
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
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, bounds]);
  return null;
}

export default function LayerMapViewer({
  customerId,
  initialCenter = [39.8283, -98.5795],
  initialZoom = 4,
  fullScreen = false,
  onClose,
}: LayerMapViewerProps) {
  const [enabledLayers, setEnabledLayers] = useState<Set<string>>(new Set());
  const [layerData, setLayerData] = useState<Map<string, LayerData>>(new Map());
  const [showLayerPanel, setShowLayerPanel] = useState(true);
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [useSatellite, setUseSatellite] = useState(true); // Default to satellite view

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

  const communityLayers = mapLayers.filter((l) => l.category === "community");
  const snowLayers = mapLayers.filter((l) => l.category === "snow");

  const mapCenter: [number, number] = initialCenter;

  if (loadingLayers) {
    return (
      <div className={fullScreen ? "fixed inset-0 bg-background z-50" : "h-[500px]"}>
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (mapLayers.length === 0) {
    return (
      <div className={fullScreen ? "fixed inset-0 bg-background z-50 flex items-center justify-center" : "h-[300px] flex items-center justify-center border rounded-md"}>
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
    <div className={fullScreen ? "fixed inset-0 bg-background z-50" : "h-[500px] relative"}>
      {fullScreen && onClose && (
        <div className="absolute top-4 right-4 z-[1000]">
          <Button variant="outline" size="icon" onClick={onClose} data-testid="button-close-map-viewer">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Controls positioned at bottom-left to avoid zoom controls */}
      <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLayerPanel(!showLayerPanel)}
          data-testid="button-toggle-layers"
        >
          {showLayerPanel ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Layers className="w-4 h-4 ml-1" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUseSatellite(!useSatellite)}
          data-testid="button-toggle-satellite"
        >
          {useSatellite ? <MapIcon className="w-4 h-4" /> : <Satellite className="w-4 h-4" />}
          <span className="ml-1">{useSatellite ? "Street" : "Satellite"}</span>
        </Button>
      </div>

      {showLayerPanel && (
        <Card className="absolute bottom-4 left-32 z-[1000] w-64 max-h-[60%] overflow-auto">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Map Layers</CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-4 space-y-4">
            {communityLayers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Community Season</p>
                {communityLayers.map((layer) => {
                  const data = layerData.get(layer.id);
                  return (
                    <div key={layer.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`layer-${layer.id}`}
                        checked={enabledLayers.has(layer.id)}
                        onCheckedChange={() => toggleLayer(layer.id)}
                        data-testid={`checkbox-layer-${layer.id}`}
                      />
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: layer.color || "#22c55e" }}
                      />
                      <Label htmlFor={`layer-${layer.id}`} className="text-sm cursor-pointer flex-1">
                        {layer.name}
                      </Label>
                      {data?.loading && <Badge variant="outline" className="text-xs">Loading</Badge>}
                      {data?.error && <Badge variant="destructive" className="text-xs">Error</Badge>}
                    </div>
                  );
                })}
              </div>
            )}

            {snowLayers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Snow Season</p>
                {snowLayers.map((layer) => {
                  const data = layerData.get(layer.id);
                  return (
                    <div key={layer.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`layer-${layer.id}`}
                        checked={enabledLayers.has(layer.id)}
                        onCheckedChange={() => toggleLayer(layer.id)}
                        data-testid={`checkbox-layer-${layer.id}`}
                      />
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: layer.color || "#3b82f6" }}
                      />
                      <Label htmlFor={`layer-${layer.id}`} className="text-sm cursor-pointer flex-1">
                        {layer.name}
                      </Label>
                      {data?.loading && <Badge variant="outline" className="text-xs">Loading</Badge>}
                      {data?.error && <Badge variant="destructive" className="text-xs">Error</Badge>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <MapContainer
        center={mapCenter}
        zoom={initialZoom}
        maxZoom={21}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
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
        <FitBounds bounds={bounds} />

        {Array.from(layerData.values()).map((data) => {
          if (!data.geoJson || !enabledLayers.has(data.layer.id)) return null;
          return (
            <GeoJSON
              key={data.layer.id}
              data={data.geoJson}
              style={{
                color: data.layer.color || "#3388ff",
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.3,
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
