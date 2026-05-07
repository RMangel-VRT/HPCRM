ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_sync_interval_minutes integer DEFAULT 2;
