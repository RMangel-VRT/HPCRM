import { describe, expect, it } from "vitest";
import { mergeHardscapeCategories } from "../../../../lib/db/src/hardscapeCategories";
import { createHardscapeBody, patchHardscapeBody } from "./hardscapeCsv";
import { insertHardscapeCatalogItemSchema } from "@workspace/db";

describe("Hardscape category contracts", () => {
  it("merges only supplied categories, deterministically retaining stored spelling", () => {
    expect(mergeHardscapeCategories([])).toEqual(["General"]);
    expect(mergeHardscapeCategories(["General", "General"])).toEqual(["General"]);
    expect(mergeHardscapeCategories(["stone", "general"])).toEqual(["general", "stone"]);
    const variants = ["zinc", "pavers", "Pavers", "PAVERS", "GENERAL", "General", "general"];
    expect(mergeHardscapeCategories(variants)).toEqual(["GENERAL", "PAVERS", "zinc"]);
    expect(mergeHardscapeCategories(variants.reverse())).toEqual(["GENERAL", "PAVERS", "zinc"]);
  });
  it("defaults inserts while PATCH remains default-free", () => {
    const input = { name: "Rock", companyId: "a" };
    expect(insertHardscapeCatalogItemSchema.parse(input).category).toBe("General");
    expect(createHardscapeBody.parse({ name: "Rock" }).category).toBe("General");
    expect(patchHardscapeBody.parse({})).toEqual({});
    expect(patchHardscapeBody.parse({ name: "New" })).toEqual({ name: "New" });
    for (const category of ["", "  ", null]) {
      expect(createHardscapeBody.safeParse({ name: "Rock", category }).success).toBe(false);
      expect(patchHardscapeBody.safeParse({ category }).success).toBe(false);
      expect(insertHardscapeCatalogItemSchema.safeParse({ ...input, category }).success).toBe(false);
    }
    expect(createHardscapeBody.parse({ name: "Rock", category: "pAvErS" }).category).toBe("pAvErS");
  });
});
