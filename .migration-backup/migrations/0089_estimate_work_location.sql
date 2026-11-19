-- Only standalone estimates own work-location text. No copying or backfill.
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS work_location_label text,
  ADD COLUMN IF NOT EXISTS work_location_description text;
