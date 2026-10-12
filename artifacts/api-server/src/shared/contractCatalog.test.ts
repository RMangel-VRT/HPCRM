import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SCOPE_CATALOG, RATE_CARD_DEFAULTS, LEGACY_SERVICE_TO_SCOPE,
  LEGACY_CONTRACT_LINE, LEGACY_BILLING_TYPE, scopeServiceByKey,
} from "./contractCatalog";

describe("Contract Center catalog", () => {
  it("contains all 25 scope services and 22 distinct rate defaults", () => {
    expect(SCOPE_CATALOG).toHaveLength(25);
    expect(RATE_CARD_DEFAULTS).toHaveLength(22);
    for (const items of [SCOPE_CATALOG, RATE_CARD_DEFAULTS]) {
      expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    }
  });

  it("has nonnegative integer twelve-month spreads totaling each quantity", () => {
    for (const service of SCOPE_CATALOG) {
      if (service.defaultMonthSpread === null) continue;
      expect(service.defaultMonthSpread).toHaveLength(12);
      expect(service.defaultMonthSpread.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
      expect(service.defaultMonthSpread.reduce((sum, n) => sum + n, 0)).toBe(service.defaultQuantity);
    }
  });

  it("maps legacy services only to existing scope keys and retains review flags", () => {
    for (const mapping of Object.values(LEGACY_SERVICE_TO_SCOPE)) {
      expect(scopeServiceByKey(mapping.key)?.key).toBe(mapping.key);
    }
    expect(LEGACY_SERVICE_TO_SCOPE.irrigation_close).toEqual({ key: "irrigation_winterization", review: true });
    expect(LEGACY_SERVICE_TO_SCOPE.snow_removal).toEqual({ key: "snow_walks", review: true });
    expect(LEGACY_SERVICE_TO_SCOPE.other).toEqual({ key: "other", review: true });
    expect(scopeServiceByKey("missing")).toBeUndefined();
  });

  it("preserves the supplied billing and agreement line mappings", () => {
    expect(LEGACY_CONTRACT_LINE).toEqual({
      Maintenance: "landscape", Chemical: "landscape", Irrigation: "landscape", Other: "landscape", Snow: "snow",
    });
    expect(LEGACY_BILLING_TYPE).toEqual({
      "12-of-12": "equal_monthly", monthly: "monthly_variable", seasonal: "seasonal",
    });
  });

  it("expresses numeric prices as nonnegative integer cents", () => {
    for (const rate of RATE_CARD_DEFAULTS) {
      if (rate.priceCents === null) continue;
      expect(Number.isInteger(rate.priceCents) && rate.priceCents >= 0).toBe(true);
    }
    expect(RATE_CARD_DEFAULTS.find((r) => r.key === "rate_holiday")?.priceText).toBe("1.5x Normal Rates");
  });

  it("keeps the import-free client catalog byte-identical without importing across artifacts", () => {
    const server = readFileSync(new URL("./contractCatalog.ts", import.meta.url), "utf8");
    const client = readFileSync(new URL("../../../highplains-crm/src/shared/contractCatalog.ts", import.meta.url), "utf8");
    expect(client).toBe(server);
    expect(server).not.toMatch(/^\s*import\s/m);
  });
});
