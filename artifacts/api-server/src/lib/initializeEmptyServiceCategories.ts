import { sql } from "drizzle-orm";
import { SERVICE_CATEGORY_DEFAULTS } from "@workspace/db";
import { db } from "../db";
import { logger } from "./logger";

// Dedicated to this boot step; distinct from scheduling's 664002 / 665003.
export const SERVICE_CATEGORY_BOOT_LOCK = 665004;

/**
 * DML only. Publish supplies schema, not the historical migration's row seed.
 * Any category (including inactive/custom/renamed) means the company opted in
 * already; never repair partial sets or reseed on catalog reads.
 */
export async function initializeEmptyServiceCategories(database = db): Promise<number> {
  const count = await database.transaction(async tx => {
    const guard = await tx.execute(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('companies', 'estimate_service_categories')
    `);
    const columns = new Set(guard.rows.map(row => `${row.table_name}.${row.column_name}`));
    const required = [
      "companies.id",
      ...["id", "company_id", "name", "default_umbrella_key", "default_unit",
        "sort_order", "is_active", "created_at", "updated_at"]
        .map(column => `estimate_service_categories.${column}`),
    ];
    const missing = required.filter(column => !columns.has(column));
    if (missing.length) {
      logger.warn({ missing }, "Default service category initialization skipped: required schema is not present");
      return null;
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SERVICE_CATEGORY_BOOT_LOCK})`);
    // A fresh READ COMMITTED statement after acquiring the lock sees a competing
    // initializer's committed categories. Count actual inserted company IDs.
    const defaults = sql.join(SERVICE_CATEGORY_DEFAULTS.map(row =>
      sql`(${row.name}::text, ${row.defaultUmbrellaKey}::text, ${row.defaultUnit}::text, ${row.sortOrder}::integer)`), sql`, `);
    const result = await tx.execute(sql`
      WITH inserted AS (
        INSERT INTO public.estimate_service_categories
          (company_id, name, default_umbrella_key, default_unit, sort_order)
        SELECT c.id, v.name, v.umbrella, v.unit, v.sort_order
        FROM public.companies c
        CROSS JOIN (VALUES ${defaults}) v(name, umbrella, unit, sort_order)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.estimate_service_categories existing
          WHERE existing.company_id = c.id
        )
        ON CONFLICT (company_id, lower(name)) DO NOTHING
        RETURNING company_id
      )
      SELECT count(DISTINCT company_id)::integer AS seeded_companies FROM inserted
    `);
    return Number(result.rows[0].seeded_companies);
  }, { isolationLevel: "read committed" });
  if (count === null) return 0;
  logger.info({ seededCompanies: count }, "Default service category initialization complete");
  return count;
}
