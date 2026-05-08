-- Add missing created_at column to mailbox_backfill_runs.
-- The table was created by hand previously without this column.
ALTER TABLE mailbox_backfill_runs
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
