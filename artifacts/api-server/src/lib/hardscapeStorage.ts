import { and, asc, eq, sql } from "drizzle-orm";
import { hardscapeCatalogItems as items, type InsertHardscapeCatalogItem } from "@workspace/db";
import { db } from "../db";

export type HardscapeWrite = Omit<InsertHardscapeCatalogItem, "companyId">;
export interface HardscapeFilters { search?: string; category?: string; includeInactive?: boolean }

export const hardscapeStorage = {
  async getHardscapeCatalog(companyId: string, filters: HardscapeFilters = {}) {
    const conditions = [eq(items.companyId, companyId)];
    if (!filters.includeInactive) conditions.push(eq(items.isActive, true));
    if (filters.category) conditions.push(eq(items.category, filters.category));
    if (filters.search) {
      // Treat %/_ as literal search characters rather than wildcard instructions.
      const pattern = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(sql`(lower(${items.name}) LIKE lower(${pattern}) OR ${items.sku} ILIKE ${pattern})`);
    }
    const [rows, categories] = await Promise.all([
      db.select().from(items).where(and(...conditions))
        .orderBy(asc(items.category), asc(items.name), asc(items.id)),
      db.selectDistinct({ category: items.category }).from(items)
        .where(eq(items.companyId, companyId)).orderBy(asc(items.category)),
    ]);
    return { items: rows, categories: [...new Set(["general", ...categories.map(row => row.category)])].sort() };
  },
  async createHardscapeCatalogItem(companyId: string, data: HardscapeWrite) {
    const [row] = await db.insert(items).values({ ...data, companyId }).returning();
    return row;
  },
  async updateHardscapeCatalogItem(companyId: string, id: string, data: Partial<HardscapeWrite>) {
    const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    if (!Object.keys(clean).length) {
      const [row] = await db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.id, id)));
      return row;
    }
    const [row] = await db.update(items).set({ ...clean, updatedAt: new Date() })
      .where(and(eq(items.companyId, companyId), eq(items.id, id))).returning();
    return row;
  },
  async upsertHardscapeCatalogItem(companyId: string, data: HardscapeWrite): Promise<"inserted" | "updated"> {
    // Serialize imports within a company, including SKU-less name matches.
    // Each row has its own transaction: one failed row never poisons the file.
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hardscape:${companyId}`}, 0))`);
      const match = data.sku ? eq(items.sku, data.sku) : sql`lower(${items.name}) = lower(${data.name})`;
      const candidates = await tx.select().from(items).where(and(eq(items.companyId, companyId), match))
        .orderBy(asc(items.id));
      const normalized = { ...data, sku: data.sku ?? null, description: data.description ?? null,
        wholesaleCostCents: data.wholesaleCostCents ?? null, retailPriceCents: data.retailPriceCents ?? null };
      const unchanged = (row: typeof items.$inferSelect) =>
        Object.entries(normalized).every(([key, value]) => row[key as keyof typeof row] === value);
      // Names are not unique. Prefer an identical row for lossless reimports,
      // then an un-SKU'd match, then the deterministic first named match.
      const existing = candidates.find(unchanged) ?? candidates.find(row => row.sku === null) ?? candidates[0];
      if (existing) {
        if (!unchanged(existing)) {
          await tx.update(items).set({ ...normalized, updatedAt: new Date() })
            .where(and(eq(items.companyId, companyId), eq(items.id, existing.id)));
        }
        return "updated";
      }
      await tx.insert(items).values({ ...data, companyId });
      return "inserted";
    });
  },
};
