import { and, asc, desc, eq, sql } from "drizzle-orm";
import { irrigationCatalogItems as items, irrigationSyncRuns as runs, type IrrigationSyncRun } from "@workspace/db";
import { db } from "../db";
import { IrrigationCsvError, parseIrrigationCsv } from "./irrigationCsv";
import { logger } from "./logger";

export interface IrrigationFilters { search?: string; category?: string; brand?: string; includeInactive?: boolean }
export const irrigationCatalog = {
  async list(companyId: string, filters: IrrigationFilters = {}) {
    const conditions = [eq(items.companyId, companyId)];
    if (!filters.includeInactive) conditions.push(eq(items.isActive, true));
    if (filters.category) conditions.push(eq(items.category, filters.category));
    if (filters.brand) conditions.push(eq(items.brand, filters.brand));
    if (filters.search) {
      const pattern = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(sql`(lower(${items.name}) LIKE lower(${pattern}) OR ${items.externalSku} ILIKE ${pattern})`);
    }
    const [rows, categories, brands] = await Promise.all([
      db.select().from(items).where(and(...conditions)).orderBy(asc(items.category), asc(items.name), asc(items.externalSku), asc(items.id)),
      db.selectDistinct({ value: items.category }).from(items).where(eq(items.companyId, companyId)).orderBy(asc(items.category)),
      db.selectDistinct({ value: items.brand }).from(items).where(eq(items.companyId, companyId)).orderBy(asc(items.brand)),
    ]);
    return { items: rows, categories: categories.map(row => row.value), brands: brands.flatMap(row => row.value ? [row.value] : []) };
  },
  async history(companyId: string, limit = 10) {
    return db.select().from(runs).where(eq(runs.companyId, companyId))
      .orderBy(desc(runs.startedAt), desc(runs.id)).limit(Math.min(50, Math.max(1, limit)));
  },
  async import(companyId: string, userId: string | null, filename: string | null, text: string): Promise<{ run: IrrigationSyncRun; httpStatus: number }> {
    // Persist before parsing, outside the replacement transaction, so failures
    // remain visible even when all catalog changes roll back.
    const [started] = await db.insert(runs).values({ companyId, importedById: userId, filename }).returning();
    try {
      const parsed = parseIrrigationCsv(text);
      const run = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`irrigation:${companyId}`}, 0))`);
        const existing = await tx.select().from(items).where(eq(items.companyId, companyId));
        const bySku = new Map(existing.map(row => [row.externalSku, row]));
        const now = new Date();
        let itemsUpserted = 0, itemsDeactivated = 0;
        for (const data of parsed.rows) {
          const previous = bySku.get(data.externalSku);
          if (!previous) {
            await tx.insert(items).values({ ...data, companyId, lastSeenAt: now, createdAt: now, updatedAt: now });
            itemsUpserted++;
          } else {
            const changed = Object.entries(data).some(([key, value]) => previous[key as keyof typeof previous] !== value);
            await tx.update(items).set(changed ? { ...data, lastSeenAt: now, updatedAt: now } : { lastSeenAt: now })
              .where(and(eq(items.companyId, companyId), eq(items.id, previous.id)));
            if (changed) itemsUpserted++;
          }
        }
        for (const previous of existing) {
          if (previous.isActive && !parsed.presentSkus.has(previous.externalSku)) {
            await tx.update(items).set({ isActive: false, updatedAt: now })
              .where(and(eq(items.companyId, companyId), eq(items.id, previous.id)));
            itemsDeactivated++;
          }
        }
        const [finished] = await tx.update(runs).set({
          status: parsed.skippedRows.length ? "partial" : "success", finishedAt: now,
          itemsUpserted, itemsDeactivated, itemsSkipped: parsed.skippedRows.length, skippedRows: parsed.skippedRows,
        }).where(and(eq(runs.id, started.id), eq(runs.companyId, companyId))).returning();
        return finished;
      });
      return { run, httpStatus: 200 };
    } catch (error) {
      const validation = error instanceof IrrigationCsvError;
      // Drizzle errors include SQL parameters (the uploaded parts). Log only a
      // diagnostic code, never raw query errors or user-supplied field values.
      const pg = error as { code?: string; cause?: { code?: string } };
      if (!validation) logger.error({ code: pg.code ?? pg.cause?.code, companyId, runId: started.id }, "Irrigation catalog replacement rolled back");
      const skippedRows = validation ? error.skippedRows : [];
      const [run] = await db.update(runs).set({
        status: "error", finishedAt: new Date(), errorMessage: validation ? error.message : "Unable to save irrigation catalog; no catalog changes were applied. Retry the upload.",
        itemsSkipped: skippedRows.length, skippedRows,
      }).where(and(eq(runs.id, started.id), eq(runs.companyId, companyId))).returning();
      return { run, httpStatus: validation ? 400 : 500 };
    }
  },
};
