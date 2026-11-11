-- SC1 can migrate the shared development database before its source merges.
-- Preserve its exact installed rule while fixing the same inline-CHECK
-- introspection problem as the retired service-program table.
BEGIN;
DO $$
DECLARE
  predicate text;
BEGIN
  IF to_regclass('public.service_calendar') IS NOT NULL THEN
    SELECT pg_get_expr(conbin, conrelid) INTO predicate
    FROM pg_constraint
    WHERE conrelid='public.service_calendar'::regclass
      AND conname='service_calendar_valid_check' AND contype='c';
    IF predicate IS NULL THEN
      RAISE EXCEPTION 'service_calendar_valid_check is missing; refusing to invent a calendar rule';
    END IF;
    -- Already wrapped predicates are left alone on reruns.
    IF predicate !~* '\)\s+IS TRUE$' THEN
      ALTER TABLE service_calendar DROP CONSTRAINT service_calendar_valid_check;
      EXECUTE format(
        'ALTER TABLE public.service_calendar ADD CONSTRAINT service_calendar_valid_check CHECK ((%s) IS TRUE)',
        predicate
      );
    END IF;
  END IF;
END $$;
COMMIT;
