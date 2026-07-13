import { describe, it, expect } from "vitest";
import { parseWholesaleCost, decodeSizeCode, deriveVarietyKey, splitDescription } from "./plantAvailability";

describe("parseWholesaleCost", () => {
  it("2099 → 209.90", () => {
    expect(parseWholesaleCost("2099")).toBeCloseTo(209.90, 2);
  });

  it("5499 → 549.90", () => {
    expect(parseWholesaleCost("5499")).toBeCloseTo(549.90, 2);
  });

  it("799 → 79.90", () => {
    expect(parseWholesaleCost("799")).toBeCloseTo(79.90, 2);
  });

  it("handles ws-prefixed codes like WS2099", () => {
    expect(parseWholesaleCost("WS2099")).toBeCloseTo(209.90, 2);
  });

  it("returns null for null input", () => {
    expect(parseWholesaleCost(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseWholesaleCost("")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseWholesaleCost("N/A")).toBeNull();
  });
});

describe("splitDescription", () => {
  it("splits on last ' - '", () => {
    const result = splitDescription("Crabapple - Malus spp.");
    expect(result.commonName).toBe("Crabapple");
    expect(result.botanicalName).toBe("Malus spp.");
  });

  it("returns null botanical when no separator", () => {
    const result = splitDescription("Generic Shrub");
    expect(result.commonName).toBe("Generic Shrub");
    expect(result.botanicalName).toBeNull();
  });

  it("uses last separator when multiple dashes exist", () => {
    const result = splitDescription("Blue-Stem Grass - Andropogon gerardii - Big");
    expect(result.commonName).toBe("Blue-Stem Grass - Andropogon gerardii");
    expect(result.botanicalName).toBe("Big");
  });
});

describe("deriveVarietyKey", () => {
  it("uppercases and strips rootstock suffixes", () => {
    const key = deriveVarietyKey("Malus domestica M7", "Apple");
    expect(key).toBe("MALUS DOMESTICA");
  });

  it("falls back to common name when botanical is null", () => {
    const key = deriveVarietyKey(null, "Apple Tree");
    expect(key).toBe("APPLE TREE");
  });
});

describe("decodeSizeCode", () => {
  it("decodes 5C as 5-Gal container", () => {
    expect(decodeSizeCode("5C")).toBe("5-Gal");
  });

  it("decodes 2BB as B&B", () => {
    expect(decodeSizeCode("2BB")).toBe("2\" B&B");
  });
});
