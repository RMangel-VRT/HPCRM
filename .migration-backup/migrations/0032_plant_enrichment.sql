-- Plant Library Slice 2: enrichment table + source column on sync runs

ALTER TABLE plant_sync_runs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'availability';

CREATE TABLE IF NOT EXISTS plant_enrichment (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  variety_key TEXT NOT NULL,
  display_name TEXT,
  treefarm_url TEXT,
  treefarm_slug TEXT,
  image_url TEXT,
  image_storage_path TEXT,
  image_attribution TEXT,
  description_text TEXT,
  facts_json JSONB,
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  match_confidence REAL,
  attribute_source TEXT,
  light TEXT,
  water_use TEXT,
  is_xeriscape BOOLEAN,
  bloom_time TEXT,
  bloom_color TEXT,
  fall_color TEXT,
  foliage_type TEXT,
  is_native BOOLEAN,
  is_pollinator_friendly BOOLEAN,
  deer_resistant BOOLEAN,
  salt_tolerant BOOLEAN,
  growth_rate TEXT,
  last_enriched_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS plant_enrichment_company_variety_idx
  ON plant_enrichment(company_id, variety_key);

CREATE INDEX IF NOT EXISTS plant_enrichment_company_id_idx
  ON plant_enrichment(company_id);

CREATE INDEX IF NOT EXISTS plant_enrichment_match_status_idx
  ON plant_enrichment(match_status);
