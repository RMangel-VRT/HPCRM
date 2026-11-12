-- Transitional union: Publish applies schema before the DML-only boot relabel.
-- Historical migrations/seeds are immutable. Do not tighten to new-only here.
BEGIN;
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['estimate_quick_items','estimate_service_categories'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name=target AND column_name='default_unit') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', target, target || '_default_unit_check');
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', target, target || '_unit_check');
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.' || target)
        AND conname=target || '_unit_v2_check') THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (default_unit IN
          (''hour'',''day'',''week'',''ea'',''flat'',''sq ft'',''1,000 sq ft'',''lin ft'',''visit'',
           ''SF'',''LF'',''1,000 SF'',''HR'',''DAY'',''WEEK'',''EA'',''FLAT'',''GAL'',''CU. YD'',''LB'',''BAG'',''TON'',''IN. DBH''))',
          target, target || '_unit_v2_check');
      END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='estimate_quick_items' AND column_name='default_unit') THEN
    ALTER TABLE public.estimate_quick_items ALTER COLUMN default_unit SET DEFAULT 'HR';
  END IF;
  FOREACH target IN ARRAY ARRAY['hardscape_catalog_items','irrigation_catalog_items'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name=target AND column_name='unit') THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN unit SET DEFAULT ''EA''', target);
    END IF;
  END LOOP;
END $$;
COMMIT;
