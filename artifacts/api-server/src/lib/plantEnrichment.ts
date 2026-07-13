/**
 * Plant Library Slice 2: Enrichment (photos + facts)
 *
 * Crawls thetreefarm.com category pages to build a candidate index, matches
 * availability varieties via SKU-first then fuzzy fallback, scrapes product
 * facts, and downloads photos to object storage.
 *
 * All outbound requests are rate-limited aggressively (1 req/s).
 */

import { promises as fs } from "fs";
import path from "path";
import { parse } from "node-html-parser";
import { db } from "../db";
import { plantCatalogItems, plantEnrichment, plantSyncRuns, companies } from "@workspace/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { ObjectStorageService } from "../objectStorage";
import type { PlantMatchStatus } from "@workspace/db";

const TREEFARM_BASE = "https://www.thetreefarm.com";
const CANDIDATE_CACHE_PATH = path.join("/tmp", "plant-enrichment-candidate-index.json");
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const REQUEST_DELAY_MS = 1200;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithDelay(url: string): Promise<string | null> {
  await sleep(REQUEST_DELAY_MS);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HighPlainsCRM/1.0; +https://highplainsprop.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, url }, "plant enrichment: non-OK fetch");
      return null;
    }
    return res.text();
  } catch (err) {
    logger.warn({ err, url }, "plant enrichment: fetch error");
    return null;
  }
}

export interface CandidateProduct {
  slug: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  imageAttribution: string | null;
  pageUrl: string;
}

interface CandidateCache {
  builtAt: number;
  candidates: CandidateProduct[];
}

const TREEFARM_CATEGORIES = [
  "/plants/deciduous-trees",
  "/plants/shrubs",
  "/plants/evergreens",
  "/plants/perennials",
  "/plants/fruit-trees",
  "/plants/roses",
  "/plants/vines",
  "/plants/ornamental-grasses",
];

function extractProductsFromCategoryPage(html: string, pageUrl: string): Array<Omit<CandidateProduct, "sku" | "imageAttribution">> {
  const root = parse(html);
  const products: Array<Omit<CandidateProduct, "sku" | "imageAttribution">> = [];

  const productItems = root.querySelectorAll(".product-item, .grid-product, article.product, li.product, .product");
  for (const item of productItems) {
    const linkEl = item.querySelector("a[href]");
    if (!linkEl) continue;
    const href = linkEl.getAttribute("href") ?? "";
    const slug = href.replace(/^\//, "").replace(/\/$/, "").split("/").pop() ?? "";
    if (!slug) continue;

    const titleEl = item.querySelector(".product-item__title, .grid-product__title, h2, h3, .product-title, .product__title");
    const title = (titleEl?.text ?? "").trim();
    if (!title) continue;

    const imgEl = item.querySelector("img");
    let imageUrl: string | null = imgEl?.getAttribute("src") ?? imgEl?.getAttribute("data-src") ?? null;
    if (imageUrl && imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
    if (imageUrl && !imageUrl.startsWith("http")) imageUrl = null;

    const fullHref = href.startsWith("http") ? href : `${TREEFARM_BASE}${href.startsWith("/") ? "" : "/"}${href}`;

    products.push({ slug, title, imageUrl, pageUrl: fullHref });
  }

  if (products.length === 0) {
    const links = root.querySelectorAll("a[href*='/products/']");
    const seen = new Set<string>();
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      const slug = href.split("/products/")[1]?.split("?")[0]?.replace(/\/$/, "");
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const title = (link.text ?? "").trim();
      if (title.length < 3) continue;
      const fullHref = href.startsWith("http") ? href : `${TREEFARM_BASE}${href}`;
      products.push({ slug, title, imageUrl: null, pageUrl: fullHref });
    }
  }

  return products;
}

async function scrapeProductPage(pageUrl: string): Promise<{
  sku: string | null;
  imageUrl: string | null;
  imageAttribution: string | null;
  descriptionText: string | null;
  facts: Record<string, string>;
}> {
  const html = await fetchWithDelay(pageUrl);
  if (!html) return { sku: null, imageUrl: null, imageAttribution: null, descriptionText: null, facts: {} };

  const root = parse(html);

  let sku: string | null = null;
  const rows = root.querySelectorAll("table tr, .product-attribute, .product-additional-info tr");
  const facts: Record<string, string> = {};
  for (const row of rows) {
    const cells = row.querySelectorAll("td, th");
    if (cells.length >= 2) {
      const label = (cells[0].text ?? "").trim().toLowerCase();
      const value = (cells[1].text ?? "").trim();
      if (!value) continue;
      if (label.includes("sku") || label.includes("item number") || label.includes("item #")) {
        sku = value.trim().toUpperCase();
      } else if (label.includes("light")) {
        facts["Light Needs"] = value;
      } else if (label.includes("water")) {
        facts["Water Needs"] = value;
      } else if (label.includes("bloom") || label.includes("flower")) {
        if (label.includes("color")) facts["Bloom Color"] = value;
        else facts["Flowering Season"] = value;
      } else if (label.includes("fall color")) {
        facts["Fall Color"] = value;
      } else if (label.includes("growth rate")) {
        facts["Growth Rate"] = value;
      } else if (label.includes("foliage")) {
        facts["Foliage Type"] = value;
      } else if (label.includes("zone") || label.includes("hardiness")) {
        facts["USDA Hardiness Zone"] = value;
      } else if (label.includes("native")) {
        facts["Native"] = value;
      } else if (label.includes("pollinator")) {
        facts["Pollinator Friendly"] = value;
      } else if (label.includes("deer")) {
        facts["Deer Resistant"] = value;
      } else if (label.includes("salt")) {
        facts["Salt Tolerant"] = value;
      }
    }
  }

  const skuEl = root.querySelector("[class*='sku'], [itemprop='sku'], .product-sku");
  if (!sku && skuEl) {
    sku = (skuEl.text ?? "").replace(/sku[:\s]*/i, "").trim().toUpperCase() || null;
  }

  const imgEl = root.querySelector(".product-featured-media img, .product__media img, [class*='product'] img");
  let imageUrl: string | null = imgEl?.getAttribute("src") ?? imgEl?.getAttribute("data-src") ?? null;
  if (imageUrl && imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
  if (imageUrl && !imageUrl.startsWith("http")) imageUrl = null;

  const copyrightEl = root.querySelector(".image-attribution, .photo-credit, [class*='attribution'], figcaption");
  const imageAttribution: string | null = (copyrightEl?.text ?? "").trim() || "© The Tree Farm";

  const descEl = root.querySelector(".product-description, .product__description, [class*='description']");
  const descriptionText: string | null = (descEl?.text ?? "").replace(/\s+/g, " ").trim() || null;

  return { sku, imageUrl, imageAttribution, descriptionText, facts };
}

async function buildCandidateIndex(): Promise<CandidateProduct[]> {
  try {
    const raw = await fs.readFile(CANDIDATE_CACHE_PATH, "utf-8");
    const cache: CandidateCache = JSON.parse(raw);
    if (Date.now() - cache.builtAt < CACHE_MAX_AGE_MS && cache.candidates.length > 0) {
      logger.info({ count: cache.candidates.length }, "plant enrichment: using cached candidate index");
      return cache.candidates;
    }
  } catch {
  }

  logger.info("plant enrichment: building candidate index from thetreefarm.com");

  const allBasic: Array<Omit<CandidateProduct, "sku" | "imageAttribution">> = [];

  for (const categoryPath of TREEFARM_CATEGORIES) {
    const url = `${TREEFARM_BASE}${categoryPath}`;
    const html = await fetchWithDelay(url);
    if (!html) continue;
    const products = extractProductsFromCategoryPage(html, url);
    allBasic.push(...products);
    logger.info({ category: categoryPath, found: products.length }, "plant enrichment: category crawled");

    let page = 2;
    while (page <= 10) {
      const pageUrl = `${url}?page=${page}`;
      const pageHtml = await fetchWithDelay(pageUrl);
      if (!pageHtml) break;
      const pageProducts = extractProductsFromCategoryPage(pageHtml, pageUrl);
      if (pageProducts.length === 0) break;
      allBasic.push(...pageProducts);
      page++;
    }
  }

  const deduped = Array.from(
    new Map(allBasic.map((p) => [p.slug, p])).values()
  );

  logger.info({ total: deduped.length }, "plant enrichment: scraping product pages for SKUs");

  const candidates: CandidateProduct[] = [];
  for (const basic of deduped.slice(0, 500)) {
    const detail = await scrapeProductPage(basic.pageUrl);
    candidates.push({
      ...basic,
      sku: detail.sku,
      imageUrl: detail.imageUrl ?? basic.imageUrl,
      imageAttribution: detail.imageAttribution,
    });
  }

  const cache: CandidateCache = { builtAt: Date.now(), candidates };
  try {
    await fs.writeFile(CANDIDATE_CACHE_PATH, JSON.stringify(cache), "utf-8");
    logger.info({ count: candidates.length }, "plant enrichment: candidate index cached");
  } catch (err) {
    logger.warn({ err }, "plant enrichment: failed to write candidate cache");
  }

  return candidates;
}

function extractSkuPrefix(productCode: string): string {
  return productCode.replace(/-\d+[A-Z].*$/, "").toUpperCase();
}

function tokenize(s: string): Set<string> {
  return new Set(
    s.toUpperCase()
      .replace(/[^A-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

function tokenOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let matches = 0;
  for (const t of ta) if (tb.has(t)) matches++;
  return matches / Math.max(ta.size, tb.size);
}

function simpleEditDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function editSimilarity(a: string, b: string): number {
  const dist = simpleEditDistance(a.slice(0, 30).toUpperCase(), b.slice(0, 30).toUpperCase());
  return 1 - dist / Math.max(a.length, b.length, 1);
}

function scoreCandidate(
  varietyKey: string,
  commonName: string,
  botanicalName: string | null,
  candidate: CandidateProduct,
): number {
  const titleOverlap = tokenOverlap(commonName, candidate.title);
  const keyOverlap = tokenOverlap(varietyKey, candidate.slug.replace(/-/g, " "));
  const botOverlap = botanicalName ? tokenOverlap(botanicalName, candidate.title) : 0;
  const editSim = editSimilarity(commonName, candidate.title);

  return Math.min(1, titleOverlap * 0.45 + keyOverlap * 0.25 + botOverlap * 0.2 + editSim * 0.1);
}

const AUTO_CONFIRM_THRESHOLD = 0.72;
const SURFACE_THRESHOLD = 0.35;

export interface MatchResult {
  candidate: CandidateProduct | null;
  confidence: number;
  matchStatus: PlantMatchStatus;
}

export function matchVariety(
  varietyKey: string,
  commonName: string,
  botanicalName: string | null,
  productCodes: string[],
  candidates: CandidateProduct[],
): MatchResult {
  const skuPrefixes = productCodes.map(extractSkuPrefix);

  for (const candidate of candidates) {
    if (!candidate.sku) continue;
    const candidateSku = candidate.sku.replace(/^#/, "").toUpperCase();
    if (skuPrefixes.some((p) => candidateSku === p || candidateSku.startsWith(p))) {
      return { candidate, confidence: 1.0, matchStatus: "auto" };
    }
  }

  let bestScore = 0;
  let bestCandidate: CandidateProduct | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(varietyKey, commonName, botanicalName, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestScore >= AUTO_CONFIRM_THRESHOLD) {
    return { candidate: bestCandidate, confidence: bestScore, matchStatus: "auto" };
  }
  if (bestScore >= SURFACE_THRESHOLD) {
    return { candidate: bestCandidate, confidence: bestScore, matchStatus: "unmatched" };
  }
  return { candidate: null, confidence: 0, matchStatus: "unmatched" };
}

function mapFacts(facts: Record<string, string>): {
  light: string | null;
  waterUse: string | null;
  isXeriscape: boolean | null;
  bloomTime: string | null;
  bloomColor: string | null;
  fallColor: string | null;
  foliageType: string | null;
  isNative: boolean | null;
  isPollinatorFriendly: boolean | null;
  deerResistant: boolean | null;
  saltTolerant: boolean | null;
  growthRate: string | null;
} {
  const booleanLike = (v: string | undefined): boolean | null => {
    if (!v) return null;
    const l = v.toLowerCase();
    if (l.includes("yes") || l === "true") return true;
    if (l.includes("no") || l === "false") return false;
    return null;
  };

  const waterRaw = facts["Water Needs"] ?? null;
  const isXeriscape = waterRaw ? waterRaw.toLowerCase().includes("xeriscape") : null;

  return {
    light: facts["Light Needs"] ?? null,
    waterUse: waterRaw,
    isXeriscape,
    bloomTime: facts["Flowering Season"] ?? null,
    bloomColor: facts["Bloom Color"] ?? null,
    fallColor: facts["Fall Color"] ?? null,
    foliageType: facts["Foliage Type"] ?? null,
    isNative: booleanLike(facts["Native"]),
    isPollinatorFriendly: booleanLike(facts["Pollinator Friendly"]),
    deerResistant: booleanLike(facts["Deer Resistant"]),
    saltTolerant: booleanLike(facts["Salt Tolerant"]),
    growthRate: facts["Growth Rate"] ?? null,
  };
}

async function downloadAndStorePhoto(
  imageUrl: string,
  companyId: string,
  varietyKey: string,
): Promise<string | null> {
  try {
    await sleep(500);
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const safeKey = varietyKey.replace(/[^A-Z0-9_-]/gi, "_").slice(0, 60);
    const relativePath = `plant-photos/${companyId}/${safeKey}.${ext}`;

    const storageService = new ObjectStorageService();
    const fullPath = await storageService.saveBufferToPrivatePath(relativePath, buffer, contentType);
    return fullPath;
  } catch (err) {
    logger.warn({ err, imageUrl }, "plant enrichment: photo download failed");
    return null;
  }
}

interface VarietyToEnrich {
  varietyKey: string;
  commonName: string;
  botanicalName: string | null;
  productCodes: string[];
}

async function getVarietiesToEnrich(companyId: string): Promise<VarietyToEnrich[]> {
  const { desc } = await import("drizzle-orm");

  const catalogRows = await db
    .select({
      varietyKey: plantCatalogItems.varietyKey,
      commonName: plantCatalogItems.commonName,
      botanicalName: plantCatalogItems.botanicalName,
      productCode: plantCatalogItems.productCode,
    })
    .from(plantCatalogItems)
    .where(
      and(
        eq(plantCatalogItems.companyId, companyId),
        eq(plantCatalogItems.isActive, true),
      ),
    );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const existingEnrichments = await db
    .select({ varietyKey: plantEnrichment.varietyKey, lastEnrichedAt: plantEnrichment.lastEnrichedAt, matchStatus: plantEnrichment.matchStatus })
    .from(plantEnrichment)
    .where(eq(plantEnrichment.companyId, companyId));

  const enrichedMap = new Map(existingEnrichments.map((e) => [e.varietyKey, e]));

  const byVariety = new Map<string, VarietyToEnrich>();
  for (const row of catalogRows) {
    if (!byVariety.has(row.varietyKey)) {
      byVariety.set(row.varietyKey, {
        varietyKey: row.varietyKey,
        commonName: row.commonName,
        botanicalName: row.botanicalName,
        productCodes: [],
      });
    }
    byVariety.get(row.varietyKey)!.productCodes.push(row.productCode);
  }

  const toEnrich: VarietyToEnrich[] = [];
  for (const variety of byVariety.values()) {
    const existing = enrichedMap.get(variety.varietyKey);
    if (!existing) {
      toEnrich.push(variety);
      continue;
    }
    if (existing.matchStatus === "confirmed" || existing.matchStatus === "rejected") continue;
    if (existing.lastEnrichedAt && existing.lastEnrichedAt > sevenDaysAgo) continue;
    toEnrich.push(variety);
  }

  return toEnrich;
}

export async function scrapeAndEnrichVariety(
  companyId: string,
  varietyKey: string,
  slug: string,
): Promise<void> {
  const pageUrl = `${TREEFARM_BASE}/products/${slug}`;
  const detail = await scrapeProductPage(pageUrl);

  const factFields = mapFacts(detail.facts);
  const imageStoragePath = detail.imageUrl
    ? await downloadAndStorePhoto(detail.imageUrl, companyId, varietyKey)
    : null;

  await db
    .update(plantEnrichment)
    .set({
      treefarmUrl: pageUrl,
      treefarmSlug: slug,
      imageUrl: detail.imageUrl,
      imageStoragePath: imageStoragePath ?? undefined,
      imageAttribution: detail.imageAttribution,
      descriptionText: detail.descriptionText,
      factsJson: Object.keys(detail.facts).length > 0 ? detail.facts : undefined,
      attributeSource: "auto",
      lastEnrichedAt: new Date(),
      updatedAt: new Date(),
      ...factFields,
    })
    .where(
      and(
        eq(plantEnrichment.companyId, companyId),
        eq(plantEnrichment.varietyKey, varietyKey),
      ),
    );
}

export async function enrichPlants(companyId: string): Promise<{
  processed: number;
  enriched: number;
  status: "success" | "error";
  errorMessage?: string;
}> {
  const [run] = await db
    .insert(plantSyncRuns)
    .values({ companyId, status: "running", source: "enrichment" })
    .returning();

  let processed = 0;
  let enriched = 0;

  try {
    const candidates = await buildCandidateIndex();
    const varieties = await getVarietiesToEnrich(companyId);

    logger.info({ companyId, total: varieties.length, candidates: candidates.length }, "plant enrichment: starting enrichment run");

    for (const variety of varieties) {
      processed++;
      const matchResult = matchVariety(
        variety.varietyKey,
        variety.commonName,
        variety.botanicalName,
        variety.productCodes,
        candidates,
      );

      const upsertData: Partial<typeof plantEnrichment.$inferInsert> = {
        companyId,
        varietyKey: variety.varietyKey,
        matchStatus: matchResult.matchStatus,
        matchConfidence: matchResult.confidence > 0 ? matchResult.confidence : undefined,
        updatedAt: new Date(),
      };

      if (matchResult.candidate) {
        upsertData.displayName = matchResult.candidate.title;
        upsertData.treefarmSlug = matchResult.candidate.slug;
        upsertData.treefarmUrl = matchResult.candidate.pageUrl;
        upsertData.imageUrl = matchResult.candidate.imageUrl ?? undefined;
        upsertData.imageAttribution = matchResult.candidate.imageAttribution ?? undefined;

        if (matchResult.matchStatus === "auto") {
          const detail = await scrapeProductPage(matchResult.candidate.pageUrl);
          const factFields = mapFacts(detail.facts);
          const imageStoragePath = detail.imageUrl
            ? await downloadAndStorePhoto(detail.imageUrl, companyId, variety.varietyKey)
            : null;

          Object.assign(upsertData, {
            imageUrl: detail.imageUrl ?? matchResult.candidate.imageUrl ?? undefined,
            imageStoragePath: imageStoragePath ?? undefined,
            imageAttribution: detail.imageAttribution ?? matchResult.candidate.imageAttribution ?? undefined,
            descriptionText: detail.descriptionText ?? undefined,
            factsJson: Object.keys(detail.facts).length > 0 ? detail.facts : undefined,
            attributeSource: "auto" as const,
            lastEnrichedAt: new Date(),
            ...factFields,
          });
          enriched++;
        }
      }

      await db
        .insert(plantEnrichment)
        .values({ ...upsertData, companyId, varietyKey: variety.varietyKey } as typeof plantEnrichment.$inferInsert)
        .onConflictDoUpdate({
          target: [plantEnrichment.companyId, plantEnrichment.varietyKey],
          set: { ...upsertData, updatedAt: new Date() },
        });

      if (processed % 10 === 0) {
        logger.info({ companyId, processed, enriched, total: varieties.length }, "plant enrichment: progress");
      }
    }

    await db
      .update(plantSyncRuns)
      .set({ status: "success", finishedAt: new Date(), itemsUpserted: enriched, itemsDeactivated: 0 })
      .where(eq(plantSyncRuns.id, run.id));

    logger.info({ companyId, processed, enriched }, "plant enrichment: run complete");
    return { processed, enriched, status: "success" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, companyId }, "plant enrichment: run failed");
    await db
      .update(plantSyncRuns)
      .set({ status: "error", finishedAt: new Date(), errorMessage })
      .where(eq(plantSyncRuns.id, run.id));
    return { processed, enriched, status: "error", errorMessage };
  }
}

export async function enrichAllCompanies(): Promise<void> {
  const allCompanies = await db.select({ id: companies.id }).from(companies);
  for (const company of allCompanies) {
    try {
      await enrichPlants(company.id);
    } catch (err) {
      logger.error({ err, companyId: company.id }, "plant enrichment: company enrichment failed");
    }
  }
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function startPlantEnrichmentScheduler(): void {
  logger.info("plant enrichment: weekly scheduler started");
  setInterval(() => {
    logger.info("plant enrichment: running scheduled weekly enrichment");
    void enrichAllCompanies();
  }, ONE_WEEK_MS);
}
