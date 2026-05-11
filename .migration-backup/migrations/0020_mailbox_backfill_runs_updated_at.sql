-- Add updated_at heartbeat column to mailbox_backfill_runs.
-- Used by the stale-run reaper to detect runs whose worker has died, and by
-- the cancel endpoint to force-clear runs whose worker is no longer observing
-- the cancel flag.
ALTER TABLE mailbox_backfill_runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Touch any currently active runs so the next reaper sweep doesn't instantly
-- mark them stale just because the column was just backfilled with NOW().
UPDATE mailbox_backfill_runs
  SET updated_at = NOW()
  WHERE status IN ('queued', 'running');
