-- Add per-proposal photo appendix layout selector. Idempotent.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS photo_layout varchar NOT NULL DEFAULT 'large';
