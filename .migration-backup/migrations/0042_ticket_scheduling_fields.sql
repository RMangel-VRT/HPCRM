ALTER TABLE tickets ADD COLUMN IF NOT EXISTS schedule_by date;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS accepted_at timestamp;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS accepted_by_id varchar REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS follow_up_date date;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS follow_up_note text;
CREATE INDEX IF NOT EXISTS tickets_company_schedule_by_idx ON tickets (company_id, schedule_by);
