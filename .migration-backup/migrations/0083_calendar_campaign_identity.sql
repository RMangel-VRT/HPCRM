-- SC2 production read-only preflight on 2026-11-11 confirmed zero
-- source='contract' campaigns. Production DDL remains Publish-only.
-- Development also had zero; no destructive cleanup is necessary or authorized here.
DO $$
BEGIN
  LOCK TABLE campaigns IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM campaigns WHERE source = 'contract')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'calendar_entry_id') THEN
    RAISE EXCEPTION 'SC2 refuses existing month-based generated work; inspect development dependencies before any separately authorized cleanup';
  END IF;
END $$;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS calendar_entry_id varchar;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS round_year smallint;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM campaigns WHERE source = 'contract' AND (calendar_entry_id IS NULL OR round_year IS NULL)) THEN
    RAISE EXCEPTION 'SC2 refuses month-based generated work';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_calendar_entry_id_service_calendar_id_fk' AND conrelid = 'campaigns'::regclass) THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_calendar_entry_id_service_calendar_id_fk
      FOREIGN KEY (calendar_entry_id) REFERENCES service_calendar(id) ON DELETE RESTRICT;
  END IF;
END $$;
-- Historical automatic names and the current explicit name must all be removed.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_check;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_identity_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_identity_check CHECK ((
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
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_calendar_round_unique
  ON campaigns(company_id, calendar_entry_id, round_year) WHERE source = 'contract';
DROP INDEX IF EXISTS campaigns_contract_round_unique;
