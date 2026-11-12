import { and, eq, getTableColumns } from "drizzle-orm";
import { estimateQuickItems, estimateServiceCategories, type createQuickItemSchema, type patchQuickItemSchema, type QUICK_ITEM_KINDS } from "@workspace/db";
import type { z } from "zod/v4";
import { db, type AppTransaction } from "../db";
import { canonicalEstimateUnit } from "./estimateUnit";

function invalidCategory(): never {
  throw Object.assign(new Error("Choose an active service category from this company"), { status: 400 });
}
async function categoryFor(tx: AppTransaction, companyId: string, id: string) {
  const [category] = await tx.select().from(estimateServiceCategories).where(and(
    eq(estimateServiceCategories.companyId, companyId), eq(estimateServiceCategories.id, id),
  )).for("share");
  if (!category?.isActive) invalidCategory();
  return category;
}
export const estimateQuickCatalog = {
  list(companyId: string, kind?: typeof QUICK_ITEM_KINDS[number]) {
    return db.select({
      ...getTableColumns(estimateQuickItems),
      serviceCategoryName: estimateServiceCategories.name,
      serviceCategoryIsActive: estimateServiceCategories.isActive,
    }).from(estimateQuickItems).leftJoin(estimateServiceCategories, and(
      eq(estimateServiceCategories.id, estimateQuickItems.serviceCategoryId),
      eq(estimateServiceCategories.companyId, estimateQuickItems.companyId),
    )).where(and(eq(estimateQuickItems.companyId, companyId), kind ? eq(estimateQuickItems.kind, kind) : undefined))
      .orderBy(estimateQuickItems.sortOrder, estimateQuickItems.label);
  },
  async create(companyId: string, body: z.output<typeof createQuickItemSchema>) {
    return db.transaction(async tx => {
      if ((body.kind === "service") !== !!body.serviceCategoryId) invalidCategory();
      const category = body.kind === "service" ? await categoryFor(tx, companyId, body.serviceCategoryId!) : undefined;
      const [row] = await tx.insert(estimateQuickItems).values({
        ...body, companyId, serviceCategoryId: body.serviceCategoryId ?? null,
        defaultUnit: canonicalEstimateUnit(body.defaultUnit ?? category?.defaultUnit ?? "HR"),
        umbrellaKey: body.umbrellaKey ?? category?.defaultUmbrellaKey ?? (body.kind === "fee" ? "fees_surcharges" : "landscape_labor"),
      }).returning();
      return row;
    });
  },
  async update(companyId: string, id: string, body: z.output<typeof patchQuickItemSchema>) {
    return db.transaction(async tx => {
      const where = and(eq(estimateQuickItems.companyId, companyId), eq(estimateQuickItems.id, id));
      const [current] = await tx.select().from(estimateQuickItems).where(where).for("update");
      if (!current) return undefined;
      const merged = { ...current, ...body };
      if ((merged.kind === "service") !== !!merged.serviceCategoryId) invalidCategory();
      // Do not strand existing members of inactive categories. Only new/reassigned
      // associations need an available category; ordinary edits retain captured defaults.
      if (merged.kind === "service" && (merged.serviceCategoryId !== current.serviceCategoryId || merged.kind !== current.kind)) {
        await categoryFor(tx, companyId, merged.serviceCategoryId!);
      }
      const [row] = await tx.update(estimateQuickItems).set({ ...body, updatedAt: new Date() }).where(where).returning();
      return row;
    });
  },
};
