export interface CustomerAddressFields {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface NormalizedAddress {
  query: string;
  missingFields: string[];
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface WeatherLocationCustomer extends CustomerAddressFields {
  locationLat?: number | null;
  locationLng?: number | null;
}

export class WeatherLocationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WeatherLocationError";
  }
}

const ADDRESS_FIELD_LABELS = [
  ["street", "street address"],
  ["city", "city"],
  ["state", "state"],
  ["zip", "ZIP code"],
] as const;

function cleanPart(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function addressTokens(value: string): string[] {
  return value.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
}

function endsWithTokens(value: string[], suffix: string[]): boolean {
  return suffix.length > 0
    && value.length > suffix.length
    && suffix.every((token, index) => value[value.length - suffix.length + index] === token);
}

/**
 * Customer imports sometimes put the city/state/ZIP in the street column too.
 * Strip only a matching trailing suffix so that the canonical query contains
 * each address component once while retaining the useful street portion.
 */
function stripDuplicatedLocationSuffix(
  street: string,
  city: string,
  state: string,
  zip: string,
): string {
  const streetTokens = addressTokens(street);
  const suffixes = [
    [city, state, zip],
    [city, state],
    [state, zip],
    [city, zip],
    [city],
    [state],
    [zip],
  ]
    .map((parts) => parts.flatMap(addressTokens))
    .filter((suffix) => suffix.length > 0)
    .sort((a, b) => b.length - a.length);

  const matchingSuffix = suffixes.find((suffix) => endsWithTokens(streetTokens, suffix));
  if (!matchingSuffix) return street;
  return streetTokens.slice(0, -matchingSuffix.length).join(" ");
}

export function normalizeCustomerAddress(fields: CustomerAddressFields): NormalizedAddress {
  const street = cleanPart(fields.street);
  const city = cleanPart(fields.city);
  const state = cleanPart(fields.state);
  const zip = cleanPart(fields.zip);
  const normalizedStreet = stripDuplicatedLocationSuffix(street, city, state, zip);

  const parts = [normalizedStreet, city, state, zip].filter(Boolean);
  const uniqueParts = parts.filter((part, index) => {
    const normalizedPart = addressTokens(part).join(" ");
    return parts.findIndex((candidate) => addressTokens(candidate).join(" ") === normalizedPart) === index;
  });

  const missingFields = ADDRESS_FIELD_LABELS
    .filter(([key]) => !cleanPart(fields[key]))
    .map(([, label]) => label);

  return {
    query: uniqueParts.join(", "),
    missingFields,
  };
}

export async function geocodeAddressWithMapbox(
  address: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Coordinates | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${encodeURIComponent(token)}&country=US&limit=1&autocomplete=false`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Mapbox geocoder returned ${response.status}`);
  }

  const data = await response.json() as {
    features?: Array<{ center?: unknown }>;
  };
  const center = data.features?.[0]?.center;
  if (!Array.isArray(center) || center.length < 2) return null;

  const lng = Number(center[0]);
  const lat = Number(center[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function weatherLocationCorrectionMessage(address: NormalizedAddress): string {
  if (!address.query) {
    return "The property address is blank. Add a street address, city, state, or ZIP code to the customer record, then try again.";
  }
  if (address.missingFields.length > 0) {
    return `Could not locate this property. Correct the ${address.missingFields.join(", ")} on the customer record, then try again.`;
  }
  return "Could not locate this property. Verify the street address, city, state, and ZIP code on the customer record, then try again.";
}

function validCoordinates(lat: number | null | undefined, lng: number | null | undefined): Coordinates | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function resolveCustomerWeatherLocation(options: {
  customer: WeatherLocationCustomer;
  requestedCoordinates?: Coordinates | null;
  mapboxToken?: string;
  persistCoordinates: (coordinates: Coordinates) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<Coordinates> {
  const savedCoordinates = validCoordinates(options.customer.locationLat, options.customer.locationLng);
  if (savedCoordinates) return savedCoordinates;

  if (options.requestedCoordinates) {
    await options.persistCoordinates(options.requestedCoordinates);
    return options.requestedCoordinates;
  }

  const normalizedAddress = normalizeCustomerAddress(options.customer);
  if (!normalizedAddress.query) {
    throw new WeatherLocationError(weatherLocationCorrectionMessage(normalizedAddress), 422);
  }
  if (!options.mapboxToken) {
    throw new WeatherLocationError(
      "Property location lookup is not configured. Contact an administrator.",
      503,
    );
  }

  const resolved = await geocodeAddressWithMapbox(
    normalizedAddress.query,
    options.mapboxToken,
    options.fetchImpl,
  );
  if (!resolved) {
    throw new WeatherLocationError(weatherLocationCorrectionMessage(normalizedAddress), 422);
  }

  await options.persistCoordinates(resolved);
  return resolved;
}