// @vitest-environment node
/**
 * Unit tests for plantEnrichment.ts
 *
 * - matchVariety: SKU-first match and fuzzy token-overlap paths
 * - mapFacts: field-mapping table rows → enrichment columns
 * - enrichPlants (fetch failure): all network calls fail → success run, 0 enriched
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

vi.mock("../db", () => ({ db: {} }));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../objectStorage", () => ({
  ObjectStorageService: class {
    saveBufferToPrivatePath = vi.fn().mockResolvedValue("/stored/path.jpg");
  },
}));
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@workspace/db", () => ({
  plantCatalogItems: { companyId: "companyId", isActive: "isActive", varietyKey: "varietyKey", commonName: "commonName", botanicalName: "botanicalName", productCode: "productCode" },
  plantEnrichment: { companyId: "companyId", varietyKey: "varietyKey", lastEnrichedAt: "lastEnrichedAt", matchStatus: "matchStatus" },
  plantSyncRuns: { id: "id", companyId: "companyId" },
  companies: { id: "id" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => `eq(${String(_col)},${String(_val)})`),
  and: vi.fn((...args: unknown[]) => `and(${args.join(",")})`),
  or: vi.fn((...args: unknown[]) => `or(${args.join(",")})`),
  isNull: vi.fn((col: unknown) => `isNull(${String(col)})`),
  desc: vi.fn((col: unknown) => `desc(${String(col)})`),
}));

import { matchVariety, mapFacts, enrichPlants } from "./plantEnrichment";
import type { CandidateProduct } from "./plantEnrichment";
import { db } from "../db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<CandidateProduct> = {}): CandidateProduct {
  return {
    slug: "colorado-blue-spruce",
    title: "Colorado Blue Spruce",
    sku: null,
    imageUrl: null,
    imageAttribution: null,
    pageUrl: "https://www.thetreefarm.com/products/colorado-blue-spruce",
    ...overrides,
  };
}

function makeSelectChain(result: unknown[]) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from };
}

function makeInsertRunChain(runRow: unknown) {
  const returning = vi.fn().mockResolvedValue([runRow]);
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ returning, onConflictDoUpdate });
  return { values };
}

function makeUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set };
}

// ── matchVariety ──────────────────────────────────────────────────────────────

describe("matchVariety", () => {
  const candidates: CandidateProduct[] = [
    makeCandidate({ slug: "colorado-blue-spruce", title: "Colorado Blue Spruce", sku: "CBS5G" }),
    makeCandidate({ slug: "autumn-blaze-maple", title: "Autumn Blaze Maple", sku: "ABM10" }),
    makeCandidate({ slug: "knockout-rose", title: "Knockout Rose", sku: null }),
    makeCandidate({ slug: "ornamental-grass-blue-oat", title: "Blue Oat Grass", sku: "BOG1G" }),
  ];

  describe("SKU-first path", () => {
    it("matches when product-code prefix equals candidate SKU exactly", () => {
      // extractSkuPrefix strips the size suffix iff digits are immediately followed
      // by a capital letter: "CBS5G-10G" → strips "-10G" → prefix "CBS5G".
      // A bare numeric suffix like "-10" has no trailing capital so is NOT stripped.
      const result = matchVariety(
        "spruce-colorado-blue",
        "Colorado Blue Spruce",
        "Picea pungens",
        ["CBS5G-10G"],
        candidates,
      );
      expect(result.matchStatus).toBe("auto");
      expect(result.confidence).toBe(1.0);
      expect(result.candidate?.sku).toBe("CBS5G");
    });

    it("matches when candidate SKU starts with product-code prefix", () => {
      const result = matchVariety(
        "maple-autumn-blaze",
        "Autumn Blaze Maple",
        "Acer freemanii",
        ["ABM"],
        candidates,
      );
      expect(result.matchStatus).toBe("auto");
      expect(result.confidence).toBe(1.0);
      expect(result.candidate?.slug).toBe("autumn-blaze-maple");
    });

    it("skips candidates with null SKU during SKU-first phase and falls back to fuzzy", () => {
      // Candidate has no SKU, so SKU-first path skips it; fuzzy path is used instead.
      // Use a variety that does NOT fuzzy-match the candidate so we can confirm the
      // SKU path genuinely skipped (i.e. this isn't auto-matched via names).
      const onlyNullSku: CandidateProduct[] = [
        makeCandidate({ slug: "arrowwood-viburnum", title: "Arrowwood Viburnum", sku: null }),
      ];
      const result = matchVariety(
        "spruce-colorado-xyz",
        "Colorado Blue Spruce",
        "Picea pungens",
        ["CBS-10G"],
        onlyNullSku,
      );
      // The candidate name doesn't match the variety — result is unmatched (below SURFACE_THRESHOLD)
      expect(result.matchStatus).toBe("unmatched");
      expect(result.candidate).toBeNull();
    });

    it("strips leading # from candidate SKU before comparing", () => {
      const withHashSku: CandidateProduct[] = [
        makeCandidate({ slug: "bog-grass", title: "Blue Oat Grass", sku: "#BOG1G" }),
      ];
      // extractSkuPrefix strips the size suffix only when a digit-run is immediately
      // followed by a capital letter (e.g. "-10G" → strips to "BOG1G").
      // "-20" has no trailing capital so would NOT be stripped; use "-10G" here.
      const result = matchVariety(
        "grass-blue-oat",
        "Blue Oat Grass",
        null,
        ["BOG1G-10G"],
        withHashSku,
      );
      expect(result.matchStatus).toBe("auto");
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("fuzzy (token-overlap) path", () => {
    it("returns auto when title tokens overlap strongly with commonName", () => {
      const noskuCandidates: CandidateProduct[] = [
        makeCandidate({ slug: "colorado-blue-spruce", title: "Colorado Blue Spruce", sku: null }),
      ];
      const result = matchVariety(
        "spruce-colorado-blue",
        "Colorado Blue Spruce",
        "Picea pungens",
        [],
        noskuCandidates,
      );
      expect(result.matchStatus).toBe("auto");
      expect(result.confidence).toBeGreaterThanOrEqual(0.72);
    });

    it("returns unmatched (surfaced) when score is between surface and auto thresholds", () => {
      // "Norway Spruce" vs "Blue Spruce": SPRUCE token overlaps in both titleOverlap
      // (0.5) and keyOverlap (0.5), giving a combined score ≈ 0.38 — above SURFACE_THRESHOLD
      // (0.35) but below AUTO_CONFIRM_THRESHOLD (0.72). The candidate is surfaced for
      // human review (matchStatus "unmatched") rather than auto-confirmed.
      const partialMatch: CandidateProduct[] = [
        makeCandidate({ slug: "blue-spruce", title: "Blue Spruce", sku: null }),
      ];
      const result = matchVariety(
        "spruce-norway",
        "Norway Spruce",
        "Picea abies",
        [],
        partialMatch,
      );
      expect(result.matchStatus).toBe("unmatched");
      expect(result.candidate).not.toBeNull();
      expect(result.confidence).toBeGreaterThan(0.35);
      expect(result.confidence).toBeLessThan(0.72);
    });

    it("returns unmatched with null candidate when no candidates are provided", () => {
      const result = matchVariety(
        "spruce-colorado-blue",
        "Colorado Blue Spruce",
        "Picea pungens",
        [],
        [],
      );
      expect(result.candidate).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.matchStatus).toBe("unmatched");
    });

    it("botanical name overlap contributes to score when title overlap is zero", () => {
      // candidateSlug == varietyKey so keyOverlap=1.0; title ("Picea Pungens") has
      // zero overlap with commonName ("Blue Spruce"). With botanicalName="Picea pungens"
      // the botOverlap term pushes the score over SURFACE_THRESHOLD (0.35) so a
      // candidate IS returned. Without botanicalName the score stays below the
      // threshold and confidence remains 0.
      const botCandidate: CandidateProduct[] = [
        makeCandidate({ slug: "picea-pungens", title: "Picea Pungens", sku: null }),
      ];

      const withBot = matchVariety(
        "picea-pungens",
        "Blue Spruce",
        "Picea pungens",
        [],
        botCandidate,
      );
      const withoutBot = matchVariety(
        "picea-pungens",
        "Blue Spruce",
        null,
        [],
        botCandidate,
      );

      expect(withBot.confidence).toBeGreaterThan(0);
      expect(withBot.confidence).toBeGreaterThan(withoutBot.confidence);
    });
  });
});

// ── mapFacts ──────────────────────────────────────────────────────────────────

describe("mapFacts", () => {
  it("maps Light Needs to light", () => {
    expect(mapFacts({ "Light Needs": "Full Sun" }).light).toBe("Full Sun");
  });

  it("maps Water Needs to waterUse", () => {
    expect(mapFacts({ "Water Needs": "Low" }).waterUse).toBe("Low");
  });

  it("sets isXeriscape true when water value contains 'xeriscape'", () => {
    expect(mapFacts({ "Water Needs": "Xeriscape / Low" }).isXeriscape).toBe(true);
  });

  it("sets isXeriscape false when water value does not contain xeriscape", () => {
    expect(mapFacts({ "Water Needs": "Moderate" }).isXeriscape).toBe(false);
  });

  it("sets isXeriscape null when Water Needs is absent", () => {
    expect(mapFacts({}).isXeriscape).toBeNull();
  });

  it("maps Flowering Season to bloomTime", () => {
    expect(mapFacts({ "Flowering Season": "Spring" }).bloomTime).toBe("Spring");
  });

  it("maps Bloom Color to bloomColor", () => {
    expect(mapFacts({ "Bloom Color": "White" }).bloomColor).toBe("White");
  });

  it("maps Fall Color to fallColor", () => {
    expect(mapFacts({ "Fall Color": "Orange-Red" }).fallColor).toBe("Orange-Red");
  });

  it("maps Foliage Type to foliageType", () => {
    expect(mapFacts({ "Foliage Type": "Deciduous" }).foliageType).toBe("Deciduous");
  });

  it("maps Growth Rate to growthRate", () => {
    expect(mapFacts({ "Growth Rate": "Fast" }).growthRate).toBe("Fast");
  });

  it("maps Native yes → isNative true", () => {
    expect(mapFacts({ "Native": "Yes" }).isNative).toBe(true);
  });

  it("maps Native no → isNative false", () => {
    expect(mapFacts({ "Native": "No" }).isNative).toBe(false);
  });

  it("maps Native 'maybe' → isNative null (not yes/no)", () => {
    expect(mapFacts({ "Native": "maybe" }).isNative).toBeNull();
  });

  it("maps Pollinator Friendly yes → isPollinatorFriendly true", () => {
    expect(mapFacts({ "Pollinator Friendly": "Yes" }).isPollinatorFriendly).toBe(true);
  });

  it("maps Deer Resistant no → deerResistant false", () => {
    expect(mapFacts({ "Deer Resistant": "No" }).deerResistant).toBe(false);
  });

  it("maps Salt Tolerant yes → saltTolerant true", () => {
    expect(mapFacts({ "Salt Tolerant": "Yes" }).saltTolerant).toBe(true);
  });

  it("returns all nulls for an empty facts object", () => {
    const result = mapFacts({});
    expect(result.light).toBeNull();
    expect(result.waterUse).toBeNull();
    expect(result.isXeriscape).toBeNull();
    expect(result.bloomTime).toBeNull();
    expect(result.bloomColor).toBeNull();
    expect(result.fallColor).toBeNull();
    expect(result.foliageType).toBeNull();
    expect(result.isNative).toBeNull();
    expect(result.isPollinatorFriendly).toBeNull();
    expect(result.deerResistant).toBeNull();
    expect(result.saltTolerant).toBeNull();
    expect(result.growthRate).toBeNull();
  });

  it("maps a full facts row to all expected columns", () => {
    const facts = {
      "Light Needs": "Full Sun to Partial Shade",
      "Water Needs": "Moderate",
      "Flowering Season": "Summer",
      "Bloom Color": "Pink",
      "Fall Color": "Red",
      "Foliage Type": "Deciduous",
      "USDA Hardiness Zone": "4-8",
      "Native": "Yes",
      "Pollinator Friendly": "Yes",
      "Deer Resistant": "No",
      "Salt Tolerant": "No",
      "Growth Rate": "Moderate",
    };
    const result = mapFacts(facts);
    expect(result.light).toBe("Full Sun to Partial Shade");
    expect(result.waterUse).toBe("Moderate");
    expect(result.isXeriscape).toBe(false);
    expect(result.bloomTime).toBe("Summer");
    expect(result.bloomColor).toBe("Pink");
    expect(result.fallColor).toBe("Red");
    expect(result.foliageType).toBe("Deciduous");
    expect(result.isNative).toBe(true);
    expect(result.isPollinatorFriendly).toBe(true);
    expect(result.deerResistant).toBe(false);
    expect(result.saltTolerant).toBe(false);
    expect(result.growthRate).toBe("Moderate");
  });
});

// ── enrichPlants — fetch failure ──────────────────────────────────────────────

describe("enrichPlants — fetch failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network failure")),
    );

    const mockInsertRunChain = makeInsertRunChain({ id: "run-test-1" });
    const mockInsertEnrichChain = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const mockUpdate = makeUpdateChain();

    const catalogRow = {
      varietyKey: "spruce-colorado-blue",
      commonName: "Colorado Blue Spruce",
      botanicalName: "Picea pungens",
      productCode: "CBS-5G",
    };

    const mockCatalogSelect = makeSelectChain([catalogRow]);
    const mockEnrichmentSelect = makeSelectChain([]);

    let insertCallCount = 0;
    let selectCallCount = 0;

    const mockDbObj = db as Record<string, unknown>;

    mockDbObj["insert"] = vi.fn().mockImplementation(() => {
      insertCallCount++;
      return insertCallCount === 1 ? mockInsertRunChain : mockInsertEnrichChain;
    });

    mockDbObj["update"] = vi.fn().mockReturnValue(mockUpdate);

    mockDbObj["select"] = vi.fn().mockImplementation(() => {
      selectCallCount++;
      return selectCallCount === 1 ? mockCatalogSelect : mockEnrichmentSelect;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("completes with status 'success' and enriched=0 when all fetches fail", async () => {
    const promise = enrichPlants("company-abc");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe("success");
    expect(result.enriched).toBe(0);
  });

  it("writes the sync run record to the database", async () => {
    const promise = enrichPlants("company-abc");
    await vi.runAllTimersAsync();
    await promise;

    const mockInsert = (db as Record<string, unknown>)["insert"] as ReturnType<typeof vi.fn>;
    expect(mockInsert).toHaveBeenCalled();
  });

  it("marks the sync run as 'success' (not 'error') in the DB", async () => {
    const promise = enrichPlants("company-abc");
    await vi.runAllTimersAsync();
    await promise;

    const mockUpdate = (db as Record<string, unknown>)["update"] as ReturnType<typeof vi.fn>;
    const setCalls = mockUpdate.mock.results.map((r: { value: { set: ReturnType<typeof vi.fn> } }) => r.value.set.mock.calls[0]?.[0]);
    const finalStatus = setCalls.find((c: Record<string, unknown>) => c?.status === "success" || c?.status === "error");
    expect(finalStatus?.status).toBe("success");
  });

  it("processed count equals the number of varieties in the catalog when candidates are empty", async () => {
    const promise = enrichPlants("company-abc");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.processed).toBe(1);
    expect(result.enriched).toBe(0);
  });
});
