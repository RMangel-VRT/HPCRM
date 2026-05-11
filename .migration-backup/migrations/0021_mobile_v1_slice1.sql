-- Mobile v1 Slice 1: per-stop crew assignment + mobile workflow status on tickets.
-- Adds the columns the Today screen needs (crew_id, route_order, started_at, mobile_status)
-- plus an index for the (companyId, crewId, dueDate) Today query.
-- Idempotent so it can be applied to dev DBs that may already be partially migrated.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS crew_id varchar
  REFERENCES crews(id) ON DELETE SET NULL;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS route_order integer;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS started_at timestamp;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS mobile_status text NOT NULL DEFAULT 'not_started';

CREATE INDEX IF NOT EXISTS tickets_company_crew_due_date_idx
  ON tickets (company_id, crew_id, due_date);
