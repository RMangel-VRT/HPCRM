import { sql } from "drizzle-orm";
import { ESTIMATE_UNITS, ESTIMATE_UNIT_ALIASES } from "../../../../lib/db/src/estimateUnits";
import { db } from "../db";
import { logger } from "./logger";

export const ESTIMATE_UNIT_BOOT_LOCK = 665005;
const targets = [
  { table: "estimate_quick_items", column: "default_unit" },
  { table: "estimate_service_categories", column: "default_unit" },
  { table: "hardscape_catalog_items", column: "unit" },
  { table: "irrigation_catalog_items", column: "unit" },
  { table: "estimate_lines", column: "unit" },
] as const;
export const ESTIMATE_UNIT_REQUIRED_COLUMNS = [
  ...targets.map(t => `${t.table}.${t.column}`),
  "estimate_lines.version_id", "estimate_lines.company_id",
  "estimate_versions.id", "estimate_versions.company_id", "estimate_versions.status",
];
export interface UnitRelabelReport {
  changed: Record<string, number>;
  unknowns: { source: string; unit: string; count: number }[];
}

/** DML only. Non-draft snapshots, prices, totals and audit timestamps are untouched. */
export async function normalizeStoredEstimateUnits(database = db): Promise<UnitRelabelReport | null> {
  const report = await database.transaction(async tx => {
    const guard = await tx.execute(sql`SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN
      ('estimate_quick_items','estimate_service_categories','hardscape_catalog_items',
       'irrigation_catalog_items','estimate_lines','estimate_versions')`);
    const present = new Set(guard.rows.map(r => `${r.table_name}.${r.column_name}`));
    const missing = ESTIMATE_UNIT_REQUIRED_COLUMNS.filter(c => !present.has(c));
    if (missing.length) {
      logger.warn({ missing }, "Estimate unit relabel skipped: required schema is not present");
      return null;
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ESTIMATE_UNIT_BOOT_LOCK})`);
    const mappings = new Map(Object.entries(ESTIMATE_UNIT_ALIASES));
    for (const unit of ESTIMATE_UNITS) mappings.set(unit.toLowerCase(), unit);
    const values = sql.join([...mappings].map(([old, unit]) => sql`(${old}::text,${unit}::text)`), sql`,`);
    const result: UnitRelabelReport = { changed: {}, unknowns: [] };
    for (const target of targets) {
      const table = sql`${sql.identifier("public")}.${sql.identifier(target.table)}`, column = sql.identifier(target.column);
      const value = sql`source.${column}`;
      const draft = target.table === "estimate_lines"
        ? sql`AND EXISTS (SELECT 1 FROM public.estimate_versions v WHERE v.id=source.version_id
            AND v.company_id=source.company_id AND v.status='draft')` : sql``;
      // Lock eligibility inside the SAME statement that updates lines. An earlier
      // lock sweep misses drafts committed during catalog processing. PostgreSQL
      // rechecks the status predicate after a FOR UPDATE wait; only returned,
      // locked version identities can supply eligible lines until commit.
      const lockedVersions = target.table === "estimate_lines" ? sql`
        draft_versions AS MATERIALIZED (
          SELECT id,company_id FROM public.estimate_versions WHERE status='draft'
          ORDER BY company_id,id FOR UPDATE
        ),` : sql``;
      const writeGate = target.table === "estimate_lines"
        ? sql`AND EXISTS (SELECT 1 FROM draft_versions v WHERE v.id=source.version_id
            AND v.company_id=source.company_id)` : sql``;
      const updated = await tx.execute(sql`WITH ${lockedVersions} mapping(old,unit) AS (VALUES ${values}),
        changed AS (UPDATE ${table} AS source SET ${column}=mapping.unit FROM mapping
          WHERE lower(trim(${value}))=mapping.old AND ${value} IS DISTINCT FROM mapping.unit ${writeGate}
          RETURNING 1)
        SELECT count(*)::integer AS count FROM changed`);
      result.changed[target.table] = Number(updated.rows[0].count);
      const unknowns = await tx.execute(sql`WITH mapping(old,unit) AS (VALUES ${values})
        SELECT ${value} AS unit,count(*)::integer AS count FROM ${table} AS source
        WHERE NOT EXISTS (SELECT 1 FROM mapping WHERE old=lower(trim(${value}))) ${draft}
        GROUP BY ${value} ORDER BY ${value}`);
      for (const row of unknowns.rows)
        result.unknowns.push({ source: target.table, unit: String(row.unit), count: Number(row.count) });
    }
    return result;
  }, { isolationLevel: "read committed" });
  if (report) logger.info(report, "Estimate unit relabel complete: changed rows and remaining unmapped units");
  return report;
}
