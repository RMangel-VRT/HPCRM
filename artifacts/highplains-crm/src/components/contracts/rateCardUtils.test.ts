import { describe, it, expect } from "vitest";
import { parseDollarsToCents, formatDollars, centsToInput, missingDefaultCount, groupRates, RATE_KEY_RE, type RateCardItem } from "./rateCardUtils";

describe("rateCardUtils", () => {
  it("parses dollars", () => {
    expect(parseDollarsToCents("$1.45")).toBe(145);
    expect(parseDollarsToCents("245")).toBe(24500);
    expect(parseDollarsToCents("1,250.5")).toBe(125050);
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("-1")).toBeNull();
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("99999999999")).toBeNull();
    expect(parseDollarsToCents("")).toBeNull();
  });
  it("formats", () => {
    expect(formatDollars(145)).toBe("$1.45");
    expect(formatDollars(500)).toBe("$5.00");
    expect(centsToInput(24500)).toBe("245.00");
    expect(centsToInput(150000)).toBe("1,500.00");
    expect(formatDollars(150000)).toBe("$1,500.00");
    expect(centsToInput(0)).toBe("0.00");
    expect(parseDollarsToCents(centsToInput(2147483647))).toBe(2147483647);
  });
  it("validates keys", () => {
    expect(RATE_KEY_RE.test("rate_x")).toBe(true);
    expect(RATE_KEY_RE.test("Bad")).toBe(false);
  });
  it("groups and counts missing", () => {
    const rows = [{ rateKey: "rate_service_truck", line: "snow", category: "A" }, { rateKey: "z", line: "snow", category: "A" }] as RateCardItem[];
    expect(groupRates(rows)).toHaveLength(1);
    expect(missingDefaultCount(rows)).toBe(23);
  });
});
