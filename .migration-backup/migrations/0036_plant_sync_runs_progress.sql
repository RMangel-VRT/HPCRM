-- Add progress tracking columns to plant_sync_runs for live enrichment feedback
ALTER TABLE plant_sync_runs
  ADD COLUMN IF NOT EXISTS processed_count integer,
  ADD COLUMN IF NOT EXISTS total_count integer;
