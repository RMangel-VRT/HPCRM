-- Explicitly approved two-Publish rollout: unique keys first, composite FKs second.
-- This is a normal DEVELOPMENT migration; never run it directly on production.
-- No data deletion. Keep all existing primary/single-column foreign keys.
-- Restore both composite FKs only after Publish one has succeeded and production
-- has both unique keys. Restoration instructions are in the stage-one report.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='campaigns'::regclass
      AND conname='campaigns_id_company_unique' AND contype='u'
      AND NOT condeferrable
      AND pg_get_constraintdef(oid)='UNIQUE (id, company_id)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='campaign_items'::regclass
      AND conname='campaign_items_id_company_unique' AND contype='u'
      AND NOT condeferrable
      AND pg_get_constraintdef(oid)='UNIQUE (id, company_id)'
  ) THEN
    RAISE EXCEPTION 'Publish stage one requires both exact composite unique keys';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='campaign_items'::regclass AND contype='f'
      AND confrelid='campaigns'::regclass
      AND conname='campaign_items_campaign_id_fkey'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='visits'::regclass AND contype='f'
      AND confrelid='campaign_items'::regclass
      AND conname='visits_campaign_item_id_campaign_items_id_fk'
  ) THEN
    RAISE EXCEPTION 'Publish stage one requires the existing single-column relationship guards';
  END IF;
END $$;
ALTER TABLE campaign_items DROP CONSTRAINT IF EXISTS campaign_items_campaign_company_fk;
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_campaign_item_company_fk;
COMMIT;
