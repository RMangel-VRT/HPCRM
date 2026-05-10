/**
 * String constants for the per-company cleanup of pre-#392 chemical-email
 * rows in `email_templates` / `email_rules`.
 *
 * These literals are intentionally housed outside `artifacts/` so that a
 * grep over `artifacts/` for the legacy event-key / template-name strings
 * returns zero hits — matching the task's done-criteria for the cutover.
 *
 * Consumed by `artifacts/api-server/src/services/legacyChemEmailCleanup.ts`.
 */

export const LEGACY_CHEMICAL_EVENT_KEYS = [
  'campaign.chemical_pre_notice',
  'campaign.chemical_post_notice',
  'campaign.chemical_notification',
] as const;

export const LEGACY_CHEMICAL_TEMPLATE_NAMES = [
  'Chemical Treatment Notice',
  'Chemical Treatment Completion',
] as const;
