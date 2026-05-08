-- Communications soft-delete support for the "Undo delete" toast
ALTER TABLE communications ADD COLUMN IF NOT EXISTS deleted_at timestamp;
CREATE INDEX IF NOT EXISTS communications_deleted_at_idx ON communications(deleted_at);
