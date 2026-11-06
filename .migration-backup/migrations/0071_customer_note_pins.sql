-- Additive only: existing shared customer notes remain unpinned.
-- Pin instants are written by the API; no text/author/creation backfill.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS pinned_at timestamp;
