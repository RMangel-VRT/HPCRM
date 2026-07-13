import { db } from "../db";
import { plantCatalogItems, plantSyncRuns } from "@workspace/db";
import { eq, and, not, inArray } from "drizzle-orm";
import { PLANT_CATEGORIES, fetchCategoryAvailability } from "./plantAvailability";
import { logger } from "./logger";

/**
 * Sync plant availability for a single company.
 * - Opens a plant_sync_runs row
 * - Fetches + parses all six Citiyard category endpoints
 * - Upserts by (companyId, productCode)
 * - Soft-deletes rows not seen this run (isActive = false)
 * - Closes the run row with counts
 */
export async function syncPlantAvailability(companyId: string): Promise<{
  itemsUpserted: number;
  itemsDeactivated: number;
  status: "success" | "error";
  errorMessage?: string;
}> {
  const [run] = await db
    .insert(plantSyncRuns)
    .values({ companyId, status: "running" })
    .returning();

  let itemsUpserted = 0;
  let itemsDeactivated = 0;
  const seenProductCodes: string[] = [];

  try {
    for (const category of PLANT_CATEGORIES) {
      let rows: Awaited<ReturnType<typeof fetchCategoryAvailability>>;
      try {
        rows = await fetchCategoryAvailability(category);
      } catch (err) {
        logger.warn({ err, category, companyId }, "category fetch failed; continuing");
        continue;
      }

      for (const row of rows) {
        seenProductCodes.push(row.productCode);
        await db
          .insert(plantCatalogItems)
          .values({
            companyId,
            productCode: row.productCode,
            category: row.category,
            varietyKey: row.varietyKey,
            rawDescription: row.rawDescription,
            commonName: row.commonName,
            botanicalName: row.botanicalName ?? null,
            sizeCode: row.sizeCode,
            sizeLabel: row.sizeLabel,
            onHand: row.onHand,
            retailPrice: row.retailPrice?.toFixed(2) ?? null,
            salePrice: row.salePrice?.toFixed(2) ?? null,
            wholesaleCost: row.wholesaleCost?.toFixed(2) ?? null,
            wsCode: row.wsCode ?? null,
            location: row.location ?? null,
            isActive: true,
            lastSeenAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [plantCatalogItems.companyId, plantCatalogItems.productCode],
            set: {
              category: row.category,
              varietyKey: row.varietyKey,
              rawDescription: row.rawDescription,
              commonName: row.commonName,
              botanicalName: row.botanicalName ?? null,
              sizeCode: row.sizeCode,
              sizeLabel: row.sizeLabel,
              onHand: row.onHand,
              retailPrice: row.retailPrice?.toFixed(2) ?? null,
              salePrice: row.salePrice?.toFixed(2) ?? null,
              wholesaleCost: row.wholesaleCost?.toFixed(2) ?? null,
              wsCode: row.wsCode ?? null,
              location: row.location ?? null,
              isActive: true,
              lastSeenAt: new Date(),
              updatedAt: new Date(),
            },
          });
        itemsUpserted++;
      }
    }

    if (seenProductCodes.length > 0) {
      const deactivated = await db
        .update(plantCatalogItems)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(plantCatalogItems.companyId, companyId),
            eq(plantCatalogItems.isActive, true),
            not(inArray(plantCatalogItems.productCode, seenProductCodes)),
          ),
        )
        .returning({ id: plantCatalogItems.id });
      itemsDeactivated = deactivated.length;
    }

    await db
      .update(plantSyncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        itemsUpserted,
        itemsDeactivated,
      })
      .where(eq(plantSyncRuns.id, run.id));

    logger.info({ companyId, itemsUpserted, itemsDeactivated }, "plant sync complete");
    return { itemsUpserted, itemsDeactivated, status: "success" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, companyId }, "plant sync failed");

    await db
      .update(plantSyncRuns)
      .set({ status: "error", finishedAt: new Date(), errorMessage })
      .where(eq(plantSyncRuns.id, run.id));

    return { itemsUpserted, itemsDeactivated, status: "error", errorMessage };
  }
}

/**
 * Nightly scheduler: run syncPlantAvailability for all active companies.
 */
export async function syncAllCompanies(): Promise<void> {
  const { companies } = await import("@workspace/db");
  const allCompanies = await db.select({ id: companies.id }).from(companies);
  logger.info({ count: allCompanies.length }, "plant sync: starting nightly sync for all companies");
  for (const company of allCompanies) {
    try {
      await syncPlantAvailability(company.id);
    } catch (err) {
      logger.error({ err, companyId: company.id }, "plant sync: company sync failed");
    }
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function startPlantSyncScheduler(): void {
  logger.info("plant sync: nightly scheduler started");
  setInterval(() => {
    logger.info("plant sync: running scheduled nightly sync");
    void syncAllCompanies();
  }, ONE_DAY_MS);
}
