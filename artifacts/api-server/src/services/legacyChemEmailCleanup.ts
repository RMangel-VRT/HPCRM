import { sql } from "drizzle-orm";
import { LEGACY_CHEMICAL_TEMPLATE_NAMES } from "@workspace/db";
import { db } from "../db";

/** Retire only the two obsolete system templates, never rules or unrelated rows. */
export async function migrateRemoveChemicalEmailTemplates(companyId: string): Promise<number> {
  return db.transaction(async tx => {
    // Run only after the additive release migration. Boot must not create tables.
    const release = await tx.execute<{ ready: boolean }>(sql`SELECT to_regclass('company_email_wording') IS NOT NULL AS ready`);
    if (!release.rows[0]?.ready) return 0;
    // The FK cascades on template deletion. Keep new rule references from racing
    // the check, including a malformed pre-existing reference from another tenant.
    await tx.execute(sql`LOCK TABLE email_rules IN SHARE ROW EXCLUSIVE MODE`);
    const deleted = await tx.execute(sql`
      DELETE FROM email_templates AS t
      WHERE t.company_id = ${companyId}
        AND t.name IN (${LEGACY_CHEMICAL_TEMPLATE_NAMES[0]}, ${LEGACY_CHEMICAL_TEMPLATE_NAMES[1]})
        AND NOT EXISTS (SELECT 1 FROM email_rules AS r WHERE r.template_id = t.id)
    `);
    return deleted.rowCount ?? 0;
  });
}
