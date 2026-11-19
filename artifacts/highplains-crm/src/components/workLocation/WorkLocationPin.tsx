import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type Point = [number, number];
const defaultCenter: Point = [39.8283, -98.5795];

function PinMapEvents({ position, onChange }: { position: Point | null; onChange: (point: Point) => void }) {
  const map = useMap();
  const lat = position?.[0];
  const lng = position?.[1];
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }, [lat, lng, map]);
  useMapEvents({ click: event => onChange([event.latlng.lat, event.latlng.wrap().lng]) });
  return position ? <Marker position={position} /> : null;
}

export function WorkLocationPin({ position, customerPoint, onChange }: {
  position: Point | null;
  customerPoint: Point | null;
  onChange: (point: Point | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <details className="rounded-md border p-2" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium" data-testid="toggle-work-location-pin">
        {t("workLocation.mapPin")}{position ? ` · ${position[0].toFixed(4)}, ${position[1].toFixed(4)}` : ""}
      </summary>
      {open && <div className="mt-2 space-y-2">
        <p className="text-xs text-muted-foreground">{t("workLocation.mapHint")}</p>
        <div className="flex flex-wrap gap-2">
          {customerPoint && <Button type="button" size="sm" variant="outline" onClick={() => onChange(customerPoint)}
            data-testid="button-work-pin-customer">{t("workLocation.useCustomerLocation")}</Button>}
          {position && <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}
            data-testid="button-remove-work-pin">{t("workLocation.removePin")}</Button>}
        </div>
        <div className="relative h-44 overflow-hidden rounded-md border" data-testid="map-work-location">
          <MapContainer center={position ?? customerPoint ?? defaultCenter} zoom={position || customerPoint ? 16 : 4}
            className="z-0 h-full w-full" scrollWheelZoom={false}>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <PinMapEvents position={position} onChange={onChange} />
          </MapContainer>
        </div>
      </div>}
    </details>
  );
}
