-- Extra Billable Campaigns (Slice 1)
-- Adds campaign_crews and campaign_crew_members tables, plus 4 new columns on campaign_items.

CREATE TABLE IF NOT EXISTS campaign_crews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id varchar NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#2563eb',
  display_order integer NOT NULL DEFAULT 0,
  leader_user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

ALTER TABLE campaign_crews ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS campaign_crews_campaign_id_idx ON campaign_crews(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_crews_company_id_idx ON campaign_crews(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_crews_campaign_name_unique ON campaign_crews(campaign_id, name);

CREATE TABLE IF NOT EXISTS campaign_crew_members (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_crew_id varchar NOT NULL REFERENCES campaign_crews(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_crew_members_crew_user_unique
  ON campaign_crew_members(campaign_crew_id, user_id);
CREATE INDEX IF NOT EXISTS campaign_crew_members_crew_id_idx ON campaign_crew_members(campaign_crew_id);
CREATE INDEX IF NOT EXISTS campaign_crew_members_user_id_idx ON campaign_crew_members(user_id);

ALTER TABLE campaign_items
  ADD COLUMN IF NOT EXISTS assigned_campaign_crew_id varchar
    REFERENCES campaign_crews(id) ON DELETE SET NULL;

ALTER TABLE campaign_items
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'not_created';

ALTER TABLE campaign_items
  ADD COLUMN IF NOT EXISTS ticket_id varchar;

-- Add FK constraint on ticket_id (separate from column add to be idempotent and avoid
-- circular create-time dependency between campaign_items and tickets).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaign_items_ticket_id_fkey'
      AND table_name = 'campaign_items'
  ) THEN
    ALTER TABLE campaign_items
      ADD CONSTRAINT campaign_items_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE campaign_items
  ADD COLUMN IF NOT EXISTS estimated_amount numeric(10, 2);

CREATE INDEX IF NOT EXISTS campaign_items_assigned_campaign_crew_id_idx
  ON campaign_items(assigned_campaign_crew_id);
