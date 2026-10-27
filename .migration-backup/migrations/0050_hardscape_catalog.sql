-- pg_trgm is already required by customers (0014); retain prerequisite for fresh DBs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS hardscape_catalog_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku text,
  category text NOT NULL,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'ea',
  wholesale_cost_cents integer CHECK (wholesale_cost_cents >= 0),
  retail_price_cents integer CHECK (retail_price_cents >= 0),
  umbrella_key text NOT NULL DEFAULT 'landscape_materials' CHECK (umbrella_key = 'landscape_materials'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hardscape_catalog_items_company_id_idx ON hardscape_catalog_items(company_id);
CREATE INDEX IF NOT EXISTS hardscape_catalog_items_category_idx ON hardscape_catalog_items(company_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS hardscape_catalog_items_company_sku_idx ON hardscape_catalog_items(company_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS hardscape_catalog_items_name_trgm_idx ON hardscape_catalog_items USING gin (lower(name) gin_trgm_ops);
