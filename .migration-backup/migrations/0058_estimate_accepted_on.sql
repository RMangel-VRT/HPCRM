-- accepted_at remains the audit instant; accepted_on is the customer's calendar
-- date. Do not infer/backfill a customer date from a historical audit timestamp.
ALTER TABLE estimate_versions ADD COLUMN IF NOT EXISTS accepted_on date;
