-- Canonical-only setup units. No data repair; boot relabel remains DML-only.
BEGIN;
DO $$
DECLARE
  target text;
  targets text[] := ARRAY[]::text[];
  units text[] := ARRAY['SF','LF','1,000 SF','HR','DAY','WEEK','EA','FLAT','GAL','CU. YD','LB','BAG','TON','IN. DBH'];
  offenders jsonb;
  failures jsonb := '{}'::jsonb;
BEGIN
  -- Acquire every applicable table lock BEFORE reading either table. Retain
  -- locks through COMMIT, including preflight and CHECK validation. This also
  -- serializes concurrent applications without a lock-upgrade deadlock.
  FOREACH target IN ARRAY ARRAY['estimate_quick_items','estimate_service_categories'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name=target AND column_name='default_unit') THEN
      EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', target);
      targets := array_append(targets, target);
    ELSE
      RAISE NOTICE 'Canonical unit check skipped: public.% or default_unit is absent', target;
    END IF;
  END LOOP;

  -- No active/company filter. JSON preserves exact offending strings and gives
  -- actionable identities, even on guarded partial schemas without a label.
  FOREACH target IN ARRAY targets LOOP
    EXECUTE format(
      'SELECT jsonb_agg(jsonb_build_object(
        ''id'', to_jsonb(r)->''id'', ''company_id'', to_jsonb(r)->''company_id'',
        ''label'', to_jsonb(r)->''label'', ''name'', to_jsonb(r)->''name'',
        ''default_unit'', r.default_unit) ORDER BY to_jsonb(r)->>''id'')
       FROM public.%I r WHERE (r.default_unit = ANY($1)) IS NOT TRUE', target)
      INTO offenders USING units;
    IF offenders IS NOT NULL THEN
      failures := failures || jsonb_build_object('public.' || target, offenders);
    END IF;
  END LOOP;
  IF failures <> '{}'::jsonb THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Canonical estimate unit preflight failed; no data or constraints were changed',
      DETAIL = failures::text,
      HINT = 'Review the listed table, id, company_id, label/name and default_unit. Resolve noncanonical values through an authorized workflow before retrying; this migration never repairs data.';
  END IF;

  FOREACH target IN ARRAY targets LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', target, target || '_unit_v2_check');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.' || target)
      AND conname=target || '_unit_v3_check') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (default_unit IN
        (''SF'',''LF'',''1,000 SF'',''HR'',''DAY'',''WEEK'',''EA'',''FLAT'',''GAL'',''CU. YD'',''LB'',''BAG'',''TON'',''IN. DBH''))',
        target, target || '_unit_v3_check');
    END IF;
  END LOOP;
END $$;
COMMIT;
