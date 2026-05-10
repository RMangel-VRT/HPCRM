/**
 * Per-company, idempotent cleanup of pre-#392 chemical `email_rules` and
 * seeded `email_templates` rows. Tracks completion per-company in
 * `_chem_notif_legacy_cleanup` (file-scoped `_applied_sql_migrations`
 * can't represent per-company state).
 */

import { sql } from 'drizzle-orm';
import { LEGACY_CHEMICAL_EVENT_KEYS, LEGACY_CHEMICAL_TEMPLATE_NAMES } from '@workspace/db';
import { db } from '../db';

const TRACKING_TABLE = '_chem_notif_legacy_cleanup';

let trackingTableEnsured = false;

async function ensureTrackingTable(): Promise<void> {
  if (trackingTableEnsured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.raw(TRACKING_TABLE)} (
      company_id varchar PRIMARY KEY,
      removed_rules_count integer NOT NULL DEFAULT 0,
      removed_templates_count integer NOT NULL DEFAULT 0,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  trackingTableEnsured = true;
}

async function alreadyApplied(companyId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM ${sql.raw(TRACKING_TABLE)} WHERE company_id = ${companyId} LIMIT 1
  `);
  const rows = (result as unknown as { rows: unknown[] }).rows ?? [];
  return rows.length > 0;
}

/**
 * Run the cleanup for `companyId` exactly once. Returns per-company counts;
 * `skipped: true` indicates a previous successful run was found in the tracker.
 */
export async function migrateRemoveChemicalEmailTemplates(
  companyId: string,
): Promise<{ removedRules: number; removedTemplates: number; skipped: boolean }> {
  await ensureTrackingTable();
  if (await alreadyApplied(companyId)) {
    // eslint-disable-next-line no-console
    console.log(
      `[chem-notif legacy cleanup] company=${companyId} skipped (already applied) removed 0 rules, 0 templates`,
    );
    return { removedRules: 0, removedTemplates: 0, skipped: true };
  }

  let removedRules = 0;
  let removedTemplates = 0;
  try {
    const capturedRes = await db.execute(sql`
      SELECT DISTINCT template_id FROM email_rules
      WHERE company_id = ${companyId}
        AND template_id IS NOT NULL
        AND event_key IN (
          ${LEGACY_CHEMICAL_EVENT_KEYS[0]},
          ${LEGACY_CHEMICAL_EVENT_KEYS[1]},
          ${LEGACY_CHEMICAL_EVENT_KEYS[2]}
        )
    `);
    const capturedRows = (capturedRes as unknown as { rows: { template_id: string }[] }).rows ?? [];
    const capturedTemplateIds = capturedRows
      .map(r => r.template_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const rulesRes = await db.execute(sql`
      DELETE FROM email_rules
      WHERE company_id = ${companyId}
        AND event_key IN (
          ${LEGACY_CHEMICAL_EVENT_KEYS[0]},
          ${LEGACY_CHEMICAL_EVENT_KEYS[1]},
          ${LEGACY_CHEMICAL_EVENT_KEYS[2]}
        )
    `);
    removedRules = Number((rulesRes as unknown as { rowCount?: number }).rowCount ?? 0);

    if (capturedTemplateIds.length > 0) {
      await db.execute(sql`
        UPDATE email_logs SET template_id = NULL
        WHERE company_id = ${companyId}
          AND template_id = ANY(${capturedTemplateIds})
      `);

      const templatesRes = await db.execute(sql`
        DELETE FROM email_templates
        WHERE company_id = ${companyId}
          AND id = ANY(${capturedTemplateIds})
          AND name IN (
            ${LEGACY_CHEMICAL_TEMPLATE_NAMES[0]},
            ${LEGACY_CHEMICAL_TEMPLATE_NAMES[1]}
          )
      `);
      removedTemplates = Number((templatesRes as unknown as { rowCount?: number }).rowCount ?? 0);
    }

    await db.execute(sql`
      INSERT INTO ${sql.raw(TRACKING_TABLE)} (company_id, removed_rules_count, removed_templates_count)
      VALUES (${companyId}, ${removedRules}, ${removedTemplates})
      ON CONFLICT (company_id) DO NOTHING
    `);

    // eslint-disable-next-line no-console
    console.log(
      `[chem-notif legacy cleanup] company=${companyId} removed ${removedRules} rules, ${removedTemplates} templates`,
    );
    return { removedRules, removedTemplates, skipped: false };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[chem-notif legacy cleanup] company=${companyId} FAILED:`,
      err,
    );
    throw err;
  }
}
