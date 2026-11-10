-- CG1: company defaults and engine-owned identity only. No seeds, backfill or generation.
BEGIN;
CREATE TABLE IF NOT EXISTS service_programs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  rounds smallint NOT NULL,
  month_spread smallint[] NOT NULL,
  is_standard boolean NOT NULL DEFAULT false,
  updated_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT service_programs_unique UNIQUE(company_id, service_key, rounds),
  CONSTRAINT service_programs_valid_check CHECK (coalesce(
    service_key IN ('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','chemical','irrigation_open','irrigation_winterization')
    AND rounds BETWEEN 1 AND 24
    AND array_ndims(month_spread)=1 AND array_lower(month_spread,1)=1 AND array_length(month_spread,1)=12
    AND array_position(month_spread,NULL) IS NULL AND 0 <= ALL(month_spread) AND 4 >= ALL(month_spread)
    AND rounds=(month_spread[1]+month_spread[2]+month_spread[3]+month_spread[4]+month_spread[5]+month_spread[6]+month_spread[7]+month_spread[8]+month_spread[9]+month_spread[10]+month_spread[11]+month_spread[12]), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS service_programs_one_standard ON service_programs(company_id,service_key) WHERE is_standard;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS service_key text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS round_month date;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS round_seq smallint;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS campaign_item_id varchar
  CONSTRAINT visits_campaign_item_id_campaign_items_id_fk REFERENCES campaign_items(id) ON DELETE NO ACTION;
DO $$ BEGIN
  -- Preserve Drizzle's exact FK identity if this unmerged migration was first
  -- applied locally with PostgreSQL's default constraint name.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='visits'::regclass AND conname='visits_campaign_item_id_fkey')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='visits'::regclass AND conname='visits_campaign_item_id_campaign_items_id_fk') THEN
    ALTER TABLE visits RENAME CONSTRAINT visits_campaign_item_id_fkey TO visits_campaign_item_id_campaign_items_id_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='campaigns'::regclass AND conname='campaigns_identity_check') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_identity_check CHECK (
      source IN ('manual','contract') AND (
        (source='manual' AND service_key IS NULL AND round_month IS NULL AND round_seq IS NULL)
        OR (source='contract' AND service_key IS NOT NULL
          AND service_key IN ('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','chemical','irrigation_open','irrigation_winterization')
          AND round_month IS NOT NULL AND extract(day FROM round_month)=1 AND round_seq IS NOT NULL AND round_seq>0
          AND category=CASE WHEN service_key='chemical' THEN 'chemical'
            WHEN service_key IN ('irrigation_open','irrigation_winterization') THEN 'irrigation' ELSE 'general' END
          AND subtype IS NOT DISTINCT FROM CASE WHEN service_key='irrigation_open' THEN 'spring_turn_on'
            WHEN service_key='irrigation_winterization' THEN 'winterization' ELSE NULL END)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='campaigns'::regclass AND conname='campaigns_id_company_unique') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_id_company_unique UNIQUE(id,company_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='campaign_items'::regclass AND conname='campaign_items_id_company_unique') THEN
    ALTER TABLE campaign_items ADD CONSTRAINT campaign_items_id_company_unique UNIQUE(id,company_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='campaign_items'::regclass AND conname='campaign_items_campaign_company_fk') THEN
    ALTER TABLE campaign_items ADD CONSTRAINT campaign_items_campaign_company_fk FOREIGN KEY(campaign_id,company_id) REFERENCES campaigns(id,company_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='visits'::regclass AND conname='visits_campaign_item_company_fk') THEN
    ALTER TABLE visits ADD CONSTRAINT visits_campaign_item_company_fk FOREIGN KEY(campaign_item_id,company_id) REFERENCES campaign_items(id,company_id) ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='visits'::regclass AND conname='visits_campaign_identity_check') THEN
    ALTER TABLE visits ADD CONSTRAINT visits_campaign_identity_check CHECK ((source_type='campaign_item') = (campaign_item_id IS NOT NULL));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_contract_round_unique ON campaigns(company_id,service_key,round_month,round_seq) WHERE source='contract';
CREATE UNIQUE INDEX IF NOT EXISTS visits_campaign_item_done_unique ON visits(campaign_item_id) WHERE campaign_item_id IS NOT NULL AND status='done';
CREATE INDEX IF NOT EXISTS visits_campaign_item_idx ON visits(campaign_item_id);
COMMIT;
