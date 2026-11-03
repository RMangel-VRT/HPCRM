/** Shared property-location lookup used by the existing location API and setup. */
export async function geocodeProperty(address: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
    { headers: { "User-Agent": "LandscapingCRM/1.0 (landscaping-crm@replit.app)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("GEOCODING_SERVICE_ERROR");
  const data = await response.json() as { lat: string; lon: string; display_name: string }[];
  if (!data[0]) return null;
  const lat = Number(data[0].lat), lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("GEOCODING_SERVICE_ERROR");
  return { lat, lng, displayName: data[0].display_name };
}
