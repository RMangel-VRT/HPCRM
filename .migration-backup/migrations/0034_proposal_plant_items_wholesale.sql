-- Add wholesale_cost_snapshot to proposal_plant_items (internal-only, never shown in PDFs)
ALTER TABLE proposal_plant_items
  ADD COLUMN IF NOT EXISTS wholesale_cost_snapshot numeric(10, 2);
