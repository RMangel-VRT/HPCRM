ALTER TABLE estimate_versions ADD COLUMN IF NOT EXISTS include_plant_table boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS estimate_version_photos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version_id varchar NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
  storage_object_path varchar NOT NULL,
  filename varchar NOT NULL,
  mime_type varchar NOT NULL,
  file_size integer NOT NULL,
  caption text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estimate_version_photos_order_idx ON estimate_version_photos(version_id, display_order);

ALTER TABLE crew_worksheets
  ADD COLUMN IF NOT EXISTS source_estimate_id varchar REFERENCES estimates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_estimate_version_id varchar REFERENCES estimate_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_estimate_label_snapshot text,
  ADD COLUMN IF NOT EXISTS source_estimate_version_number_snapshot integer,
  ADD COLUMN IF NOT EXISTS estimate_lines_snapshot jsonb;
CREATE INDEX IF NOT EXISTS crew_worksheets_source_estimate_idx ON crew_worksheets(source_estimate_id);
CREATE INDEX IF NOT EXISTS crew_worksheets_source_estimate_version_idx ON crew_worksheets(source_estimate_version_id);
