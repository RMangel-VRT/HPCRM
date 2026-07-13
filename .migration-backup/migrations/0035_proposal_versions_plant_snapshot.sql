-- Add plant_items_snapshot to proposal_versions so finalized versions are fully self-contained
ALTER TABLE proposal_versions
  ADD COLUMN IF NOT EXISTS plant_items_snapshot jsonb;
