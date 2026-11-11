-- SC1: unused old timing can be retired, never converted or deleted if populated.
-- The runner wraps each file in a transaction; this guard must be first.
DO $$
BEGIN
  IF to_regclass('public.service_programs') IS NOT NULL THEN
    LOCK TABLE service_programs IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM service_programs) THEN
      RAISE EXCEPTION 'SC1 refuses to retire populated service_programs; no data was deleted';
    END IF;
    DROP TABLE service_programs;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS service_calendar (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL,
  service_key text NOT NULL,
  position smallint NOT NULL,
  name text NOT NULL,
  opens_md char(5) NOT NULL,
  due_md char(5) NOT NULL,
  in_standard boolean NOT NULL DEFAULT false,
  pattern text,
  includes text,
  updated_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT service_calendar_position_unique UNIQUE (company_id, service_key, kind, position) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT service_calendar_valid_check CHECK (coalesce(
    position BETWEEN 1 AND 24 AND name = btrim(name) AND length(name) BETWEEN 1 AND 80
    AND (opens_md ~ '^(01|03|05|07|08|10|12)-(0[1-9]|[12][0-9]|3[01])$|^(04|06|09|11)-(0[1-9]|[12][0-9]|30)$|^02-(0[1-9]|1[0-9]|2[0-8])$')
    AND (due_md ~ '^(01|03|05|07|08|10|12)-(0[1-9]|[12][0-9]|3[01])$|^(04|06|09|11)-(0[1-9]|[12][0-9]|30)$|^02-(0[1-9]|1[0-9]|2[0-8])$')
    AND opens_md <> due_md
    AND ((kind = 'round' AND service_key IN ('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','native_areas','fertilization','broadleaf','irrigation_open','irrigation_winterization'))
      OR (kind = 'checklist' AND service_key = 'backflow' AND position = 1)
      OR (kind = 'recurring' AND service_key IN ('mowing','pet_station','winter_visits','irrigation_inspection','native_areas')))
    AND (kind = 'round' OR NOT in_standard)
    AND (kind = 'recurring' OR (pattern IS NULL AND includes IS NULL)), false))
);
-- Checklists have a single identity regardless of position.
CREATE UNIQUE INDEX IF NOT EXISTS service_calendar_one_checklist
  ON service_calendar(company_id, service_key) WHERE kind = 'checklist';
-- Expand integrity for new campaign keys, preserving old generated chemical identities.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_identity_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_identity_check CHECK (
  source IN ('manual','contract') AND (
    (source = 'manual' AND service_key IS NULL AND round_month IS NULL AND round_seq IS NULL)
    OR (source = 'contract' AND service_key IS NOT NULL AND service_key IN
      ('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','native_areas','fertilization','broadleaf','irrigation_open','irrigation_winterization','chemical')
      AND round_month IS NOT NULL AND extract(day FROM round_month) = 1 AND round_seq IS NOT NULL AND round_seq > 0
      AND category = CASE WHEN service_key = 'chemical' THEN 'chemical'
        WHEN service_key IN ('irrigation_open','irrigation_winterization') THEN 'irrigation' ELSE 'general' END
      AND subtype IS NOT DISTINCT FROM CASE WHEN service_key = 'irrigation_open' THEN 'spring_turn_on'
        WHEN service_key = 'irrigation_winterization' THEN 'winterization' ELSE NULL END))
);
