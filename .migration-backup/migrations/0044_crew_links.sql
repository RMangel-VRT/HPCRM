ALTER TABLE crews ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE crews ADD COLUMN IF NOT EXISTS default_hours_per_day real;
ALTER TABLE crews ADD COLUMN IF NOT EXISTS display_order integer;
ALTER TABLE maintenance_crews ADD COLUMN IF NOT EXISTS crew_id varchar REFERENCES crews(id) ON DELETE SET NULL;
ALTER TABLE campaign_crews ADD COLUMN IF NOT EXISTS crew_id varchar REFERENCES crews(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_crews_crew_id_unique ON maintenance_crews (crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_crews_crew_id_idx ON campaign_crews (crew_id);
