-- Correct only the new R1 foreign keys. No pre-R1 table/column is retired.
-- Preserve the stop/occurrence identity when its property is physically deleted.
ALTER TABLE route_stops ALTER COLUMN customer_id DROP NOT NULL;
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid='route_stops'::regclass AND contype='f'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='route_stops'::regclass AND attname='customer_id')]::smallint[]
      AND confdeltype <> 'n'
  LOOP EXECUTE format('ALTER TABLE route_stops DROP CONSTRAINT %I', item.conname); END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='route_stops'::regclass AND contype='f'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='route_stops'::regclass AND attname='customer_id')]::smallint[]) THEN
    ALTER TABLE route_stops ADD CONSTRAINT route_stops_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid='visits'::regclass AND contype='f'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='visits'::regclass AND attname='route_stop_id')]::smallint[]
      AND confdeltype <> 'a'
  LOOP EXECUTE format('ALTER TABLE visits DROP CONSTRAINT %I', item.conname); END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='visits'::regclass AND contype='f'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='visits'::regclass AND attname='route_stop_id')]::smallint[]) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_route_stop_id_fkey FOREIGN KEY (route_stop_id) REFERENCES route_stops(id) ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='route_stops'::regclass AND conname='route_stops_active_customer_check') THEN
    ALTER TABLE route_stops ADD CONSTRAINT route_stops_active_customer_check CHECK (NOT is_active OR customer_id IS NOT NULL);
  END IF;
END $$;

-- Works for all deletion callers, including SQL and company cascades. The app
-- takes its scheduling gate before deleting the customer, not from this trigger
-- after a customer row lock (which would invert the fill lock order).
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
