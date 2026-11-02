-- Additive only. Production maintenance-source count verified zero by SELECT.
CREATE TABLE IF NOT EXISTS route_stops (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  crew_id varchar NOT NULL REFERENCES crews(id) ON DELETE RESTRICT,
  weekday integer NOT NULL CONSTRAINT route_stops_weekday_check CHECK (weekday BETWEEN 1 AND 6),
  every_weeks integer NOT NULL DEFAULT 1 CONSTRAINT route_stops_cadence_check CHECK (every_weeks IN (1,2)),
  anchor_date date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  minutes integer NOT NULL CONSTRAINT route_stops_minutes_check CHECK (minutes BETWEEN 5 AND 720),
  season_start date, season_end date, paused_until date,
  is_active boolean NOT NULL DEFAULT true,
  notes text, imported_from_block_id varchar,
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT route_stops_season_check CHECK (
    (season_start IS NULL AND season_end IS NULL) OR
    (season_start IS NOT NULL AND season_end IS NOT NULL AND season_start <= season_end))
);
CREATE INDEX IF NOT EXISTS route_stops_company_crew_day_idx ON route_stops(company_id, crew_id, weekday, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS route_stops_unique_active ON route_stops(company_id, customer_id, service_key) WHERE is_active;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS route_stop_id varchar REFERENCES route_stops(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS route_occurrence_date date;
CREATE UNIQUE INDEX IF NOT EXISTS visits_route_occurrence_unique ON visits(route_stop_id, route_occurrence_date) WHERE route_stop_id IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='visits'::regclass AND conname='visits_route_identity_check') THEN
    ALTER TABLE visits ADD CONSTRAINT visits_route_identity_check CHECK (source_type <> 'route' OR (route_stop_id IS NOT NULL AND route_occurrence_date IS NOT NULL));
  END IF;
END $$;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS routes_imported_at timestamp;
-- Durable once-per-Colorado-night completion, not an in-memory instance flag.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS routes_last_filled_on date;
