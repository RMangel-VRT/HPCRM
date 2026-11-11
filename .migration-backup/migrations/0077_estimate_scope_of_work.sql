BEGIN;
ALTER TABLE estimate_versions ADD COLUMN IF NOT EXISTS scope_of_work text;
COMMIT;
