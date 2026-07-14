import { parse } from "node-html-parser";
import { logger } from "./logger";

export type PlantCategory =
  | "tree"
  | "shrub"
  | "perennial"
  | "shrub_rose"
  | "vine"
  | "ornamental_grass";

export interface CategoryEndpoint {
  slug: string;
  key: PlantCategory;
}

export const PLANT_CATEGORIES: CategoryEndpoint[] = [
  { slug: "tree",             key: "tree" },
  { slug: "shrub",            key: "shrub" },
  { slug: "perennial",        key: "perennial" },
  { slug: "shrub-rose",       key: "shrub_rose" },
  { slug: "vine",             key: "vine" },
  { slug: "ornamental-grass", key: "ornamental_grass" },
];

const BASE_URL = "https://api.citiyard.com/availability";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export interface PlantRow {
  productCode: string;
  category: PlantCategory;
  rawDescription: string;
  commonName: string;
  botanicalName: string | null;
  varietyKey: string;
  sizeCode: string;
  sizeLabel: string;
  onHand: number;
  retailPrice: number | null;
  salePrice: number | null;
  wholesaleCost: number | null;
  wsCode: string | null;
  location: string | null;
}

/**
 * Parse wholesale cost from the WS CODE field value.
 * The WS CODE is formatted as a string like "WS2099" or just "2099".
 * Extract trailing digit run n, then: floor(n / 10) + 0.90
 *
 * Examples:
 *   "2099" → floor(2099/10) + 0.90 = 209 + 0.90 = 209.90
 *   "5499" → floor(5499/10) + 0.90 = 549 + 0.90 = 549.90
 *   "799"  → floor(799/10)  + 0.90 = 79  + 0.90 = 79.90
 */
export function parseWholesaleCost(wsCode: string | null | undefined): number | null {
  if (!wsCode) return null;
  const match = wsCode.match(/(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (isNaN(n)) return null;
  return Math.floor(n / 10) + 0.90;
}

/**
 * Decode a size code into a human-readable label.
 * Codes observed in nursery availability sheets:
 *   C  = container, number prefix = gallon size  (e.g. 5C = 5-gallon container)
 *   CS = container shrub
 *   B  = balled & burlapped
 *   BB = balled & burlapped (alternate)
 *   F  = fiber pot / flat
 *   CL = clump
 *   CSTK = container staked
 *   Number after code = caliper (inches) or height (feet)
 */
export function decodeSizeCode(sizeCode: string): string {
  if (!sizeCode) return sizeCode;
  const s = sizeCode.trim().toUpperCase();

  const containerMatch = s.match(/^(\d+\.?\d*)(C|CS|CSTK|CL)(.*)$/);
  if (containerMatch) {
    const size = containerMatch[1];
    const type = containerMatch[2];
    const suffix = containerMatch[3].trim();
    let label = `${size}-Gal`;
    if (type === "CSTK") label += " Staked";
    else if (type === "CL") label += " Clump";
    if (suffix) label += ` ${suffix}"`;
    return label;
  }

  const bbMatch = s.match(/^(\d+\.?\d*)(BB?)\s*(.*)$/);
  if (bbMatch) {
    const size = bbMatch[1];
    const suffix = bbMatch[3].trim();
    let label = `${size}" B&B`;
    if (suffix) label += ` ${suffix}`;
    return label;
  }

  const fMatch = s.match(/^(\d+)(F)\s*(.*)$/);
  if (fMatch) {
    return `${fMatch[1]}" Fiber Pot`;
  }

  const cSuffix = s.match(/^(C|CS|CSTK|CL|BB?|F)(\d+\.?\d*)?(.*)$/);
  if (cSuffix) {
    const type = cSuffix[1];
    const num = cSuffix[2] || "";
    const typeLabels: Record<string, string> = {
      C: "Container", CS: "Container", CSTK: "Staked Container",
      CL: "Clump", BB: "B&B", B: "B&B", F: "Fiber Pot",
    };
    const base = typeLabels[type] ?? type;
    return num ? `${num} ${base}` : base;
  }

  return sizeCode;
}

/**
 * Derive variety key from botanical name (or common name fallback).
 * - Uppercase
 * - Strip rootstock suffixes (M7, M26, etc.) and cultivar noise
 * - Strip punctuation
 * - Collapse whitespace
 */
export function deriveVarietyKey(botanicalName: string | null, commonName: string): string {
  const source = botanicalName ?? commonName;
  return source
    .toUpperCase()
    .replace(/\b(M\d+|EMLA|OHF|BRIX|SERIES)\b/gi, "")
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a raw product description into common name and botanical name.
 * Convention: "Common Name - Botanical Name" (split on last " - ")
 */
export function splitDescription(raw: string): { commonName: string; botanicalName: string | null } {
  const idx = raw.lastIndexOf(" - ");
  if (idx === -1) {
    return { commonName: raw.trim(), botanicalName: null };
  }
  const commonName = raw.slice(0, idx).trim();
  const botanical = raw.slice(idx + 3).trim();
  return { commonName, botanicalName: botanical || null };
}

/**
 * Parse a price string like "$12.99" or "12.99" into a float.
 */
function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Fetch and parse one category's availability HTML table from Citiyard.
 */
export async function fetchCategoryAvailability(
  endpoint: CategoryEndpoint,
): Promise<PlantRow[]> {
  const url = `${BASE_URL}/${endpoint.slug}`;
  let html: string;
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Citiyard returned HTTP ${res.status} for ${url}`);
  }
  html = await res.text();

  const root = parse(html);
  const rows = root.querySelectorAll("table tr");

  const results: PlantRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    const cells = row.querySelectorAll("td, th");
    if (cells.length < 8) continue;

    const productCode = cells[0]?.text?.trim();
    const onHandRaw = cells[1]?.text?.trim();
    const description = cells[2]?.text?.trim();
    const retailRaw = cells[3]?.text?.trim();
    const saleRaw = cells[4]?.text?.trim();
    const sizeCode = cells[5]?.text?.trim();
    const wsCodeRaw = cells[6]?.text?.trim();
    const location = cells[7]?.text?.trim() || null;

    if (!productCode || productCode === "PRODUCT CODE" || !description) {
      continue;
    }

    const onHand = parseInt(onHandRaw ?? "0", 10);
    if (isNaN(onHand)) {
      skipped++;
      continue;
    }

    const { commonName, botanicalName } = splitDescription(description);
    const varietyKey = deriveVarietyKey(botanicalName, commonName);
    const sizeLabel = sizeCode ? decodeSizeCode(sizeCode) : "";
    const wholesaleCost = parseWholesaleCost(wsCodeRaw ?? null);
    const retailPrice = parsePrice(retailRaw);
    const salePrice = parsePrice(saleRaw);

    if (!productCode || !commonName) {
      skipped++;
      continue;
    }

    results.push({
      productCode,
      category: endpoint.key,
      rawDescription: description,
      commonName,
      botanicalName: botanicalName || null,
      varietyKey,
      sizeCode: sizeCode || "",
      sizeLabel,
      onHand,
      retailPrice,
      salePrice,
      wholesaleCost,
      wsCode: wsCodeRaw || null,
      location,
    });
  }

  logger.info({ category: endpoint.key, slug: endpoint.slug, parsed: results.length, skipped }, "plant availability fetched");
  return results;
}
