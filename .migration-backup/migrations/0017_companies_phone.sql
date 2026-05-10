-- Add company contact phone (used by chemical notification templates as
-- the customer-facing contact phone in pre/post emails). Idempotent.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone text;
