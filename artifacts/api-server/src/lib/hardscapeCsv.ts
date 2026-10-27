import { z } from "zod/v4";
import { hardscapeCatalogFields, type HardscapeCatalogItem } from "@workspace/db";
import { centsToDollars, dollarsToCents, parseCsv, writeCsv } from "./csv";
import type { HardscapeWrite } from "./hardscapeStorage";

export const HARDSCAPE_CSV_HEADERS = ["sku", "category", "name", "description", "unit", "wholesale_cost", "retail_price", "active"] as const;
export const createHardscapeBody = z.object({
  ...hardscapeCatalogFields,
  unit: hardscapeCatalogFields.unit.default("ea"),
  isActive: hardscapeCatalogFields.isActive.default(true),
}).strict();
// No defaults in PATCH; explicit null clears nullable values.
export const patchHardscapeBody = z.object({
  sku: hardscapeCatalogFields.sku,
  category: hardscapeCatalogFields.category.optional(),
  name: hardscapeCatalogFields.name.optional(),
  description: hardscapeCatalogFields.description,
  unit: hardscapeCatalogFields.unit.optional(),
  wholesaleCostCents: hardscapeCatalogFields.wholesaleCostCents,
  retailPriceCents: hardscapeCatalogFields.retailPriceCents,
  isActive: hardscapeCatalogFields.isActive.optional(),
}).strict();

export function parseHardscapeCsv(text: string) {
  const [header, ...records] = parseCsv(text);
  const names = header?.fields.map(field => field.trim().toLowerCase()) ?? [];
  if (!header || header.error || names.length !== HARDSCAPE_CSV_HEADERS.length ||
    new Set(names).size !== names.length || HARDSCAPE_CSV_HEADERS.some(name => !names.includes(name))) {
    throw new Error(`CSV must contain exactly these headers: ${HARDSCAPE_CSV_HEADERS.join(",")}`);
  }
  return records.map(record => {
    try {
      if (record.error) throw new Error(record.error);
      if (record.fields.length !== names.length) throw new Error("Expected eight columns");
      const row = Object.fromEntries(names.map((name, index) => [name, record.fields[index]]));
      const active = row.active.trim().toLowerCase();
      if (!["true", "false", "1", "0", "yes", "no"].includes(active)) {
        throw new Error("Active must be true/false, yes/no or 1/0");
      }
      const data = createHardscapeBody.parse({
        sku: row.sku.trim() || null, category: row.category, name: row.name,
        description: row.description === "" ? null : row.description, unit: row.unit,
        wholesaleCostCents: dollarsToCents(row.wholesale_cost),
        retailPriceCents: dollarsToCents(row.retail_price), isActive: ["true", "yes", "1"].includes(active),
      });
      return { line: record.line, data };
    } catch (error) {
      return { line: record.line, reason: error instanceof z.ZodError
        ? error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(";")
        : (error as Error).message };
    }
  });
}

export async function importHardscapeCsv(text: string, upsert: (data: HardscapeWrite) => Promise<"inserted" | "updated">) {
  const result = { inserted: 0, updated: 0, skipped: [] as { line: number; reason: string }[] };
  for (const row of parseHardscapeCsv(text)) {
    if (!row.data) { result.skipped.push({ line: row.line, reason: row.reason! }); continue; }
    try { result[await upsert(row.data)]++; }
    catch (error) {
      const code = (error as { code?: string; cause?: { code?: string } });
      result.skipped.push({ line: row.line, reason: (code.code ?? code.cause?.code) === "23505"
        ? "Duplicate SKU" : "Unable to save row" });
    }
  }
  return result;
}

export function exportHardscapeCsv(items: HardscapeCatalogItem[]): string {
  return writeCsv([HARDSCAPE_CSV_HEADERS, ...items.map(item => [
    item.sku, item.category, item.name, item.description, item.unit,
    centsToDollars(item.wholesaleCostCents), centsToDollars(item.retailPriceCents), item.isActive,
  ])]);
}
