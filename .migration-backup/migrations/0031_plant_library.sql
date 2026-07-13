-- Plant Library: plant_catalog_items + plant_sync_runs
-- Slice 1: availability sync foundation

CREATE TABLE IF NOT EXISTS plant_catalog_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  category TEXT NOT NULL,
  variety_key TEXT NOT NULL,
  raw_description TEXT NOT NULL,
  common_name TEXT NOT NULL,
  botanical_name TEXT,
  size_label TEXT NOT NULL,
  size_code TEXT,
  on_hand INTEGER NOT NULL DEFAULT 0,
  retail_price NUMERIC(10,2),
  sale_price NUMERIC(10,2),
  wholesale_cost NUMERIC(10,2),
  ws_code TEXT,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS plant_catalog_items_company_product_idx
  ON plant_catalog_items(company_id, product_code);

CREATE INDEX IF NOT EXISTS plant_catalog_items_company_id_idx
  ON plant_catalog_items(company_id);

CREATE INDEX IF NOT EXISTS plant_catalog_items_variety_key_idx
  ON plant_catalog_items(variety_key);

CREATE INDEX IF NOT EXISTS plant_catalog_items_category_idx
  ON plant_catalog_items(category);

CREATE TABLE IF NOT EXISTS plant_sync_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  items_upserted INTEGER NOT NULL DEFAULT 0,
  items_deactivated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS plant_sync_runs_company_started_idx
  ON plant_sync_runs(company_id, started_at DESC);
