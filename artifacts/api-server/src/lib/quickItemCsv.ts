import { z } from "zod/v4";
import { quickItemFields, UMBRELLA_DEFAULTS } from "@workspace/db";
import { normalizeEstimateUnit } from "../../../../lib/db/src/estimateUnits";
import { centsToDollars, dollarsToCents, parseCsv, writeCsv } from "./csv";

export const QUICK_ITEM_CSV_HEADERS = ["kind", "category", "name", "unit", "price", "posts_to", "active"] as const;
export const QUICK_ITEM_CSV_SCOPES = ["services", "equipment-fees"] as const;
export type QuickItemCsvScope = typeof QUICK_ITEM_CSV_SCOPES[number];
const rowSchema = z.object({
  kind: quickItemFields.kind, label: quickItemFields.label,
  defaultUnit: quickItemFields.defaultUnit, defaultRateCents: quickItemFields.defaultRateCents,
  umbrellaKey: quickItemFields.umbrellaKey, isActive: quickItemFields.isActive,
  category: z.string().trim().max(100),
});
export type QuickItemCsvWrite = z.output<typeof rowSchema>;
export interface QuickItemCsvResult {
  inserted: number; updated: number; categoriesCreated: string[];
  skipped: { line: number; reason: string }[];
}
export function kindInCsvScope(kind: string, scope: QuickItemCsvScope) {
  return scope === "services" ? kind === "service" : kind === "equipment" || kind === "fee";
}
export function parseQuickItemCsv(text: string, scope: QuickItemCsvScope) {
  const [header, ...records] = parseCsv(text);
  const names = header?.fields.map(v => v.trim().toLowerCase()) ?? [];
  if (!header || header.error || names.length !== 7 || new Set(names).size !== 7 ||
    QUICK_ITEM_CSV_HEADERS.some(name => !names.includes(name))) {
    throw new Error(`CSV must contain exactly these headers: ${QUICK_ITEM_CSV_HEADERS.join(",")}`);
  }
  return records.map(record => {
    try {
      if (record.error) throw new Error(record.error);
      if (record.fields.length !== 7) throw new Error("Expected seven columns");
      const row = Object.fromEntries(names.map((name, i) => [name, record.fields[i]]));
      const kind = row.kind.trim().toLowerCase();
      if (!["service", "equipment", "fee"].includes(kind)) throw new Error("Kind must be service, equipment or fee");
      if (!kindInCsvScope(kind, scope)) throw new Error(`Kind ${kind} is not allowed in this catalog`);
      const category = row.category.trim();
      if (kind === "service" ? !category : !!category) throw new Error("Services require a category; equipment and fees must have a blank category");
      const unit = normalizeEstimateUnit(row.unit);
      if (!unit) throw new Error(`Unknown unit: ${row.unit.trim()}`);
      const umbrella = UMBRELLA_DEFAULTS.find(v => [v.key, v.label].some(s => s.toLowerCase() === row.posts_to.trim().toLowerCase()));
      if (!umbrella) throw new Error(`Unknown posts_to: ${row.posts_to.trim()}`);
      const active = row.active.trim().toLowerCase();
      if (!["true", "false", "yes", "no", "1", "0"].includes(active)) throw new Error("Active must be true/false, yes/no or 1/0");
      const data = rowSchema.parse({
        kind, category, label: row.name, defaultUnit: unit,
        defaultRateCents: row.price.trim().toLowerCase() === "variable" ? null : dollarsToCents(row.price),
        umbrellaKey: umbrella.key, isActive: ["true", "yes", "1"].includes(active),
      });
      return { line: record.line, data };
    } catch (error) {
      return { line: record.line, reason: error instanceof z.ZodError
        ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
        : (error as Error).message };
    }
  });
}
export class QuickItemCsvRowError extends Error {}
export async function importQuickItemCsv(text: string, scope: QuickItemCsvScope,
  upsert: (data: QuickItemCsvWrite) => Promise<{ outcome: "inserted" | "updated"; categoryCreated?: string }>) {
  const result: QuickItemCsvResult = { inserted: 0, updated: 0, categoriesCreated: [], skipped: [] };
  for (const row of parseQuickItemCsv(text, scope)) {
    if (!row.data) { result.skipped.push({ line: row.line, reason: row.reason! }); continue; }
    try {
      const saved = await upsert(row.data);
      result[saved.outcome]++;
      if (saved.categoryCreated) result.categoriesCreated.push(saved.categoryCreated);
    } catch (error) {
      result.skipped.push({ line: row.line, reason: error instanceof QuickItemCsvRowError ? error.message : "Unable to save row" });
    }
  }
  return result;
}
export interface QuickItemCsvExport {
  kind: string; label: string; defaultUnit: string; defaultRateCents: number | null;
  umbrellaKey: string; isActive: boolean; serviceCategoryName: string | null;
}
export function exportQuickItemCsv(items: QuickItemCsvExport[], scope: QuickItemCsvScope) {
  const rows = items.filter(item => kindInCsvScope(item.kind, scope)).map(item => {
    const unit = normalizeEstimateUnit(item.defaultUnit);
    if (!unit) throw Object.assign(new Error(`Cannot export "${item.label}": unknown unit "${item.defaultUnit}". Resolve it before a roundtrip export.`), { status: 422 });
    const umbrella = UMBRELLA_DEFAULTS.find(v => v.key === item.umbrellaKey);
    if (!umbrella || (item.kind === "service" && !item.serviceCategoryName)) {
      throw Object.assign(new Error(`Cannot export "${item.label}": missing category or unknown posts_to`), { status: 422 });
    }
    return [item.kind, item.kind === "service" ? item.serviceCategoryName : "", item.label, unit,
      item.defaultRateCents === null ? "Variable" : centsToDollars(item.defaultRateCents), umbrella.label, item.isActive];
  });
  return writeCsv([QUICK_ITEM_CSV_HEADERS, ...rows]);
}
