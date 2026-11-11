import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUICK_ITEM_KINDS, QUICK_ITEM_UNITS, UMBRELLA_KEYS, createQuickItemSchema, patchQuickItemSchema } from "./estimateSetup";
import { LINE_TINT } from "../lib/estimateBuilder";

describe("services catalog shared contracts", () => {
  it("keeps kinds, units and the six umbrellas in sync with database contracts", () => {
    const source = readFileSync(new URL("../../../../lib/db/src/schema/estimateSetup.ts", import.meta.url), "utf8");
    for (const [name, list] of Object.entries({ QUICK_ITEM_KINDS, QUICK_ITEM_UNITS, UMBRELLA_KEYS })) {
      const match = source.match(new RegExp(`export const ${name} = (\\[[^\\n]+?\\]) as const`));
      expect(match, name).not.toBeNull();
      expect(JSON.parse(match![1])).toEqual(list);
    }
    expect(UMBRELLA_KEYS).toHaveLength(6);
  });
  it("requires category on service creation, rejects it on other kinds and leaves server defaults omitted", () => {
    const service = { kind: "service", label: "Aeration", serviceCategoryId: "cat" };
    expect(createQuickItemSchema.parse(service)).toEqual({ ...service, isActive: true, sortOrder: 0 });
    expect(createQuickItemSchema.safeParse({ kind: "service", label: "No category" }).success).toBe(false);
    expect(createQuickItemSchema.safeParse({ ...service, kind: "fee" }).success).toBe(false);
    expect(createQuickItemSchema.parse({ ...service, defaultUnit: "visit", umbrellaKey: "plants" })).toMatchObject({ defaultUnit: "visit", umbrellaKey: "plants" });
    expect(patchQuickItemSchema.parse({ label: "Rename" })).toEqual({ label: "Rename" });
    expect(patchQuickItemSchema.parse({ serviceCategoryId: null })).toEqual({ serviceCategoryId: null });
  });
  it("gives service text a distinct tint with at least 4.5:1 contrast on white", () => {
    const [h, s, l] = LINE_TINT.service.match(/[\d.]+/g)!.map(Number);
    const sat = s / 100, light = l / 100;
    const a = sat * Math.min(light, 1 - light);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
    expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(new Set(Object.values(LINE_TINT)).size).toBe(8);
  });
});
