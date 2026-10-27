import { dollarsToCents, parseCsv } from "./csv";
import type { IrrigationCatalogItem, IrrigationSkip } from "@workspace/db";

export type IrrigationWrite = Pick<IrrigationCatalogItem, "externalSku" | "name" | "category" | "description" | "material" | "size" | "brand" | "fittingType" | "detail" | "unit" | "wholesaleCostCents" | "retailPriceCents" | "isActive">;
export class IrrigationCsvError extends Error {
  constructor(message: string, public skippedRows: IrrigationSkip[] = []) { super(message); }
}
const normalize = (name: string) => {
  const normalized = name.trim().toLowerCase().replace(/[_\s-]/g, "");
  return normalized === "active" ? "isactive" : normalized;
};
export function parseIrrigationCsv(text: string) {
  const [header, ...records] = parseCsv(text);
  const names = header?.fields.map(normalize) ?? [];
  const missing = ["sku", "name", "category", "price"].filter(name => !names.includes(name));
  if (missing.length) throw new IrrigationCsvError(`Missing required CSV headers: ${missing.join(", ")}`);
  if (header?.error || names.some(name => !name) || new Set(names).size !== names.length) {
    throw new IrrigationCsvError("Invalid CSV header: malformed, blank or duplicate column names");
  }
  const rows: IrrigationWrite[] = [], skippedRows: IrrigationSkip[] = [];
  const presentSkus = new Set<string>();
  for (const record of records) {
    const row = Object.fromEntries(names.map((name, index) => [name, record.fields[index]?.trim() ?? ""]));
    const sku = row.sku;
    const duplicate = !!sku && presentSkus.has(sku);
    if (sku) presentSkus.add(sku);
    try {
      if (duplicate) throw new Error("Duplicate SKU: first occurrence wins");
      if (record.error) throw new Error(record.error);
      if (record.fields.length !== names.length) throw new Error("Column count does not match header");
      for (const key of ["sku", "name", "category"]) if (!row[key]) throw new Error(`Required value missing: ${key}`);
      const active = (row.isactive ?? row.active ?? "").toLowerCase();
      if (!["", "true", "false", "1", "0", "yes", "no"].includes(active)) throw new Error("Active must be true/false, yes/no or 1/0");
      const optional = (name: string) => row[name] || null;
      rows.push({
        externalSku: sku, name: row.name, category: row.category,
        description: optional("description"), material: optional("material"), size: optional("size"),
        brand: optional("brand"), fittingType: optional("fittingtype"), detail: optional("detail"),
        unit: row.unit || "ea", wholesaleCostCents: dollarsToCents(row.cost ?? ""),
        retailPriceCents: dollarsToCents(row.price), isActive: !["false", "0", "no"].includes(active),
      });
    } catch (error) { skippedRows.push({ line: record.line, reason: (error as Error).message }); }
  }
  if (!rows.length) throw new IrrigationCsvError("CSV has no valid parts; catalog was not replaced", skippedRows);
  return { rows, skippedRows, presentSkus };
}
