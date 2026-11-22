BEGIN;

CREATE OR REPLACE FUNCTION public.retire_routes_before_customer_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.route_stops SET customer_id=NULL, is_active=false, updated_at=now()
    WHERE company_id=OLD.company_id AND customer_id=OLD.id;
  UPDATE public.visits SET status='cancelled', updated_at=now()
    WHERE company_id=OLD.company_id AND customer_id=OLD.id
      AND source_type='route' AND status='planned'
      AND visit_date >= (now() AT TIME ZONE 'America/Denver')::date;
  RETURN OLD;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='customers'::regclass AND tgname='routes_customer_retirement') THEN
    CREATE TRIGGER routes_customer_retirement BEFORE DELETE ON customers
      FOR EACH ROW EXECUTE FUNCTION public.retire_routes_before_customer_delete();
  END IF;
END $$;

COMMIT;
