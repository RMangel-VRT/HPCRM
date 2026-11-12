import { and, eq, sql } from "drizzle-orm";
import { estimateQuickItems as items, estimateServiceCategories as categories } from "@workspace/db";
import { db } from "../db";
import { QuickItemCsvRowError, type QuickItemCsvWrite } from "../lib/quickItemCsv";

/** Each row commits independently. Unique constraints also protect against non-import writers. */
export async function upsertQuickItemCsv(companyId: string, data: QuickItemCsvWrite) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`quick-item-csv:${companyId}`}, 0))`);
        const [current] = await tx.select().from(items).where(and(eq(items.companyId, companyId),
          sql`lower(${items.label}) = lower(${data.label})`)).for("update");
        if (current && current.kind !== data.kind) throw new QuickItemCsvRowError(`Name already belongs to another kind (${current.kind})`);
        let categoryId: string | null = null;
        let categoryCreated: string | undefined;
        if (data.kind === "service") {
          const [created] = await tx.insert(categories).values({
            companyId, name: data.category, defaultUnit: data.defaultUnit, defaultUmbrellaKey: data.umbrellaKey,
          }).onConflictDoNothing().returning();
          // SHARE blocks concurrent deactivation/deletion until the item is committed.
          const [category] = await tx.select().from(categories).where(and(eq(categories.companyId, companyId),
            sql`lower(${categories.name}) = lower(${data.category})`)).for("share");
          if (!category) throw new QuickItemCsvRowError("Category changed; try importing this row again");
          if (!category.isActive && current?.serviceCategoryId !== category.id) {
            throw new QuickItemCsvRowError("New or reassigned services require an active category");
          }
          categoryId = category.id;
          if (created) categoryCreated = created.name;
        }
        const values = {
          defaultUnit: data.defaultUnit, defaultRateCents: data.defaultRateCents ?? null,
          umbrellaKey: data.umbrellaKey, serviceCategoryId: categoryId, isActive: data.isActive,
        };
        if (current) {
          if (Object.entries(values).some(([key, value]) => current[key as keyof typeof current] !== value)) {
            await tx.update(items).set({ ...values, updatedAt: new Date() })
              .where(and(eq(items.companyId, companyId), eq(items.id, current.id)));
          }
          return { outcome: "updated" as const, categoryCreated };
        }
        await tx.insert(items).values({ ...values, kind: data.kind, label: data.label, companyId });
        return { outcome: "inserted" as const, categoryCreated };
      });
    } catch (error) {
      const pg = error as { code?: string; cause?: { code?: string } };
      // A concurrent ordinary create may win after our initial read. Retry the
      // whole transaction so kind checks run again and created categories roll back.
      if ((pg.code ?? pg.cause?.code) === "23505" && attempt < 2) continue;
      throw error;
    }
  }
}
