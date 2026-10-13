-- One-time company backfill marker. Manual choices also set it so explicit
-- "None" cannot become an automatic match after an API restart.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS crew_links_initialized_at timestamp;
