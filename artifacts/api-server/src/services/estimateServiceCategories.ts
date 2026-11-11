import { and, count, eq } from "drizzle-orm";
import { estimateQuickItems, estimateServiceCategories, SERVICE_CATEGORY_DEFAULTS, type createServiceCategorySchema, type patchServiceCategorySchema } from "@workspace/db";
import type { z } from "zod/v4";
import { db, type AppTransaction } from "../db";

/** Company creation calls this inside its own transaction. Never reseed on reads. */
export async function initializeServiceCategories(tx: AppTransaction, companyId: string) {
  await tx.insert(estimateServiceCategories).values(SERVICE_CATEGORY_DEFAULTS.map(row => ({ ...row, companyId }))).onConflictDoNothing();
}
export const estimateCategoryCatalog = {
  async list(companyId: string) {
    const categories = await db.select().from(estimateServiceCategories)
      .where(eq(estimateServiceCategories.companyId, companyId))
      .orderBy(estimateServiceCategories.sortOrder, estimateServiceCategories.name);
    const counts = await db.select({ id: estimateQuickItems.serviceCategoryId, itemCount: count() })
      .from(estimateQuickItems).where(and(eq(estimateQuickItems.companyId, companyId), eq(estimateQuickItems.kind, "service")))
      .groupBy(estimateQuickItems.serviceCategoryId);
    const byId = new Map(counts.map(row => [row.id, row.itemCount]));
    return categories.map(row => ({ ...row, itemCount: byId.get(row.id) ?? 0 }));
  },
  async create(companyId: string, body: z.output<typeof createServiceCategorySchema>) {
    const [row] = await db.insert(estimateServiceCategories).values({ ...body, companyId }).returning();
    return { ...row, itemCount: 0 };
  },
  async update(companyId: string, id: string, body: z.output<typeof patchServiceCategorySchema>) {
    const [row] = await db.update(estimateServiceCategories).set({ ...body, updatedAt: new Date() })
      .where(and(eq(estimateServiceCategories.companyId, companyId), eq(estimateServiceCategories.id, id))).returning();
    return row;
  },
};
