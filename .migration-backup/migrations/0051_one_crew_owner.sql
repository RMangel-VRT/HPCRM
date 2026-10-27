-- Additive only. Planner identities and their cascading placement FK stay intact.
ALTER TABLE crew_worksheets ADD COLUMN IF NOT EXISTS crew_id varchar REFERENCES crews(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campaign_crews_campaign_crew_unique ON campaign_crews (campaign_id, crew_id) WHERE crew_id IS NOT NULL;
