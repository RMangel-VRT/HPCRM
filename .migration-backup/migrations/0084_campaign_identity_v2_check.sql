-- SC2.1 Publish compatibility: force replacement of the old month-based CHECK
-- by changing its name. Preserve the current SC2 expression exactly.
-- Apply to development through the normal migration runner; production is
-- changed only by Publish's generated schema diff.
BEGIN;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_identity_check;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='campaigns'::regclass AND conname='campaigns_identity_v2_check'
  ) THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_identity_v2_check CHECK ((
      source IN ('manual','contract') AND (
        (source = 'manual' AND service_key IS NULL AND calendar_entry_id IS NULL AND round_year IS NULL AND round_month IS NULL AND round_seq IS NULL)
        OR (source = 'contract' AND service_key IS NOT NULL
          AND service_key IN ('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','native_areas','fertilization','broadleaf','irrigation_open','irrigation_winterization','backflow')
          AND calendar_entry_id IS NOT NULL AND round_year IS NOT NULL
          AND category = CASE WHEN service_key IN ('fertilization','broadleaf') THEN 'chemical'
            WHEN service_key IN ('irrigation_open','irrigation_winterization') THEN 'irrigation' ELSE 'general' END
          AND subtype IS NOT DISTINCT FROM CASE WHEN service_key = 'irrigation_open' THEN 'spring_turn_on'
            WHEN service_key = 'irrigation_winterization' THEN 'winterization' ELSE NULL END))
    ) IS TRUE);
  END IF;
END $$;
COMMIT;
