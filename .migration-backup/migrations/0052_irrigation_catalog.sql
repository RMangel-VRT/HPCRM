-- Dev migration only; production schema uses Publish. pg_trgm is an existing
-- required extension and must already be installed in production before Publish.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS irrigation_catalog_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_sku text NOT NULL,
  category text NOT NULL,
  name text NOT NULL,
  description text,
  material text,
  size text,
  brand text,
  fitting_type text,
  detail text,
  unit text NOT NULL DEFAULT 'ea',
  wholesale_cost_cents integer CONSTRAINT irrigation_catalog_cost_check CHECK (wholesale_cost_cents >= 0),
  retail_price_cents integer CONSTRAINT irrigation_catalog_price_check CHECK (retail_price_cents >= 0),
  umbrella_key text NOT NULL DEFAULT 'irrigation_materials' CONSTRAINT irrigation_catalog_umbrella_check CHECK (umbrella_key = 'irrigation_materials'),
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS irrigation_catalog_items_company_sku_idx ON irrigation_catalog_items(company_id, external_sku);
CREATE INDEX IF NOT EXISTS irrigation_catalog_items_company_id_idx ON irrigation_catalog_items(company_id);
CREATE INDEX IF NOT EXISTS irrigation_catalog_items_category_idx ON irrigation_catalog_items(company_id, category);
CREATE INDEX IF NOT EXISTS irrigation_catalog_items_name_trgm_idx ON irrigation_catalog_items USING gin(lower(name) gin_trgm_ops);
CREATE TABLE IF NOT EXISTS irrigation_sync_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CONSTRAINT irrigation_sync_runs_status_check CHECK (status IN ('running', 'success', 'partial', 'error')),
  source text NOT NULL DEFAULT 'irrigopro_csv' CONSTRAINT irrigation_sync_runs_source_check CHECK (source = 'irrigopro_csv'),
  started_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp,
  items_upserted integer NOT NULL DEFAULT 0,
  items_deactivated integer NOT NULL DEFAULT 0,
  items_skipped integer NOT NULL DEFAULT 0,
  skipped_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  filename text,
  imported_by_id varchar REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS irrigation_sync_runs_company_started_idx ON irrigation_sync_runs(company_id, started_at);
