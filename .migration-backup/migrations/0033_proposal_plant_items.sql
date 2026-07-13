-- Migration: proposal_plant_items
-- Adds a plant schedule to proposals. Name/botanical/size/imageUrl/imageStoragePath
-- are snapshotted at insert time so finalized proposals remain stable.
-- No unitPrice column (pricing stays in QuickBooks per product decision).

CREATE TABLE IF NOT EXISTS proposal_plant_items (
  id                        varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id               varchar NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  company_id                varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plant_catalog_item_id     varchar REFERENCES plant_catalog_items(id) ON DELETE SET NULL,
  name_snapshot             text    NOT NULL,
  botanical_snapshot        text,
  size_snapshot             text,
  image_url_snapshot        text,
  image_storage_path_snapshot text,
  quantity                  integer NOT NULL DEFAULT 1,
  notes                     text,
  display_order             integer NOT NULL DEFAULT 0,
  created_at                timestamp NOT NULL DEFAULT NOW(),
  updated_at                timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS proposal_plant_items_proposal_id_idx
  ON proposal_plant_items (proposal_id);

CREATE INDEX IF NOT EXISTS proposal_plant_items_company_id_idx
  ON proposal_plant_items (company_id);
