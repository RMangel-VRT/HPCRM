// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  normalizeCustomerAddress,
  resolveCustomerWeatherLocation,
  WeatherLocationError,
} from "./weatherLocation";

describe("resolveCustomerWeatherLocation", () => {
  it("prefers saved customer coordinates without calling Mapbox", async () => {
    const fetchImpl = vi.fn();
    const persistCoordinates = vi.fn();

    const result = await resolveCustomerWeatherLocation({
      customer: {
        locationLat: 40.5853,
        locationLng: -105.0844,
        street: "123 Main St",
        city: "Fort Collins",
        state: "CO",
        zip: "80521",
      },
      requestedCoordinates: { lat: 1, lng: 2 },
      mapboxToken: "token",
      persistCoordinates,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ lat: 40.5853, lng: -105.0844 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(persistCoordinates).not.toHaveBeenCalled();
  });

  it("normalizes duplicated city, state, and ZIP text from the street field", () => {
    expect(normalizeCustomerAddress({
      street: "123 Main St, Fort Collins, CO 80521",
      city: "Fort Collins",
      state: "CO",
      zip: "80521",
    }).query).toBe("123 MAIN ST, Fort Collins, CO, 80521");
  });

  it("falls back to Mapbox and persists resolved coordinates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ center: [-105.0844, 40.5853] }] }),
    });
    const persistCoordinates = vi.fn().mockResolvedValue(undefined);

    const result = await resolveCustomerWeatherLocation({
      customer: {
        locationLat: null,
        locationLng: null,
        street: "123 Main St",
        city: "Fort Collins",
        state: "CO",
        zip: "80521",
      },
      mapboxToken: "token",
      persistCoordinates,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ lat: 40.5853, lng: -105.0844 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(decodeURIComponent(fetchImpl.mock.calls[0][0])).toContain("123 Main St, Fort Collins, CO, 80521");
    expect(persistCoordinates).toHaveBeenCalledWith({ lat: 40.5853, lng: -105.0844 });
  });

  it("returns an actionable correction for a blank address", async () => {
    const promise = resolveCustomerWeatherLocation({
      customer: {
        locationLat: null,
        locationLng: null,
        street: " ",
        city: "",
        state: "",
        zip: "",
      },
      mapboxToken: "token",
      persistCoordinates: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    await expect(promise).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("Add a street address, city, state, or ZIP code"),
    } satisfies Partial<WeatherLocationError>);
  });
});