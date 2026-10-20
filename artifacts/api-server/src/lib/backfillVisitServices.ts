import { eq, sql } from "drizzle-orm";
import { companies } from "@workspace/db";
import { db } from "../db";
import { lockVisitCompany } from "./visitSync";
import { logger } from "./logger";

/** DML only. Missing schema is a release-order concern, never startup DDL.
 * Null-only snapshot: never overwrite a visit-specific service or track ticket edits. */
export async function backfillVisitServices(companyId?: string) {
  const guard = await db.execute(sql`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'service_key'
  ) AS installed`);
  if (!guard.rows[0]?.installed) { logger.info("[backfillVisitServices] skipped: service_key not installed"); return 0; }
  const rows = await db.select({ id: companies.id }).from(companies).where(companyId ? eq(companies.id, companyId) : undefined);
  let total = 0;
  for (const company of rows) {
    const count = await db.transaction(async tx => {
      await lockVisitCompany(tx, company.id);
      const result = await tx.execute(sql`UPDATE visits v SET service_key = t.service_type
        FROM tickets t WHERE v.company_id = ${company.id} AND t.company_id = ${company.id}
          AND v.ticket_id = t.id AND v.source_type = 'ticket'
          AND v.service_key IS NULL AND t.service_type IS NOT NULL`);
      return result.rowCount ?? 0;
    });
    total += count;
    logger.info({ companyId: company.id, filled: count }, "[backfillVisitServices]");
  }
  return total;
}
