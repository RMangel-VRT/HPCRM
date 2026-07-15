-- Plant Palettes: create plant_palettes and plant_palette_items tables,
-- and add plant_palette_id FK to proposals.

CREATE TABLE IF NOT EXISTS plant_palettes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id VARCHAR REFERENCES customers(id) ON DELETE SET NULL,
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_by_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Plant Palette',
  intro_text TEXT,
  palette_date VARCHAR,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plant_palettes_company_id_idx ON plant_palettes(company_id);
CREATE INDEX IF NOT EXISTS plant_palettes_customer_id_idx ON plant_palettes(customer_id);

CREATE TABLE IF NOT EXISTS plant_palette_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  palette_id VARCHAR NOT NULL REFERENCES plant_palettes(id) ON DELETE CASCADE,
  company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plant_catalog_item_id VARCHAR REFERENCES plant_catalog_items(id) ON DELETE SET NULL,
  variety_key TEXT,
  name_snapshot TEXT NOT NULL,
  type_label TEXT NOT NULL,
  category TEXT NOT NULL,
  image_storage_path_snapshot TEXT,
  image_url_snapshot TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plant_palette_items_palette_id_idx ON plant_palette_items(palette_id);

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS plant_palette_id VARCHAR REFERENCES plant_palettes(id) ON DELETE SET NULL;
