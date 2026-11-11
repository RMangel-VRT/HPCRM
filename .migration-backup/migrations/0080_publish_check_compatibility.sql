-- Constraint-only compatibility for Publish's database-to-database diff.
-- No data changes, startup DDL or production-targeted runner.
BEGIN;
ALTER TABLE estimate_quick_items DROP CONSTRAINT IF EXISTS estimate_quick_items_kind_check;
ALTER TABLE estimate_lines DROP CONSTRAINT IF EXISTS estimate_lines_type_check;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='estimate_quick_items'::regclass AND conname='estimate_quick_items_kind_v2_check') THEN
    ALTER TABLE estimate_quick_items ADD CONSTRAINT estimate_quick_items_kind_v2_check
      CHECK (kind IN ('equipment','fee','service'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='estimate_lines'::regclass AND conname='estimate_lines_type_v2_check') THEN
    ALTER TABLE estimate_lines ADD CONSTRAINT estimate_lines_type_v2_check
      CHECK (line_type IN ('plant','hardscape','irrigation','labor','service','equipment','fee','custom'));
  END IF;
  -- SC1 separately retires this table only if empty. Never recreate it if that
  -- slice has already run; this compatibility fix applies only while it exists.
  IF to_regclass('public.service_programs') IS NOT NULL THEN
    ALTER TABLE service_programs DROP CONSTRAINT IF EXISTS service_programs_valid_check;
    ALTER TABLE service_programs ADD CONSTRAINT service_programs_valid_check CHECK ((
      service_key IN ('aeration','cleanups','shrub_trimming','ornamental_grass','tree_pruning','chemical','irrigation_open','irrigation_winterization')
      AND rounds BETWEEN 1 AND 24
      AND array_ndims(month_spread)=1 AND array_lower(month_spread,1)=1
      AND array_length(month_spread,1)=12 AND array_position(month_spread,NULL) IS NULL
      AND 0 <= ALL(month_spread) AND 4 >= ALL(month_spread)
      AND rounds=(month_spread[1]+month_spread[2]+month_spread[3]+month_spread[4]+month_spread[5]+month_spread[6]+month_spread[7]+month_spread[8]+month_spread[9]+month_spread[10]+month_spread[11]+month_spread[12])
    ) IS TRUE);
  END IF;
END $$;
COMMIT;
