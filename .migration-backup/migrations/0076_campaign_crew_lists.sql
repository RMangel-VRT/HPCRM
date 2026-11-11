BEGIN;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS started_at timestamp;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS started_by_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE campaign_items ADD COLUMN IF NOT EXISTS crew_position integer;
CREATE INDEX IF NOT EXISTS campaign_items_crew_priority_idx
  ON campaign_items(company_id,campaign_id,assigned_campaign_crew_id,crew_position)
  WHERE status='pending';
-- CG1 already owns visits_campaign_item_done_unique. Preserve its done-only
-- predicate; do not replace or assume the obsolete open-visit index.
COMMIT;
