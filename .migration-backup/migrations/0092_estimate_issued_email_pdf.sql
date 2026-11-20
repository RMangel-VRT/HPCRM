-- Private issued PDF reference and outbound reservation. Delivery facts stay in communications.
ALTER TABLE estimate_versions ADD COLUMN IF NOT EXISTS email_issue jsonb;
