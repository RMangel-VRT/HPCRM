-- Workflow identity only. Contract Center remains the sole coverage owner.
ALTER TABLE flags ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS flags_company_open_source_key
  ON flags (company_id, source_key)
  WHERE source_key IS NOT NULL AND status NOT IN ('resolved', 'dismissed');
