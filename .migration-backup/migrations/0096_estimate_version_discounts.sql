-- Version-owned labor and total discounts. Additive and rerunnable; no backfill.
-- Versions frozen before this migration keep frozen_total_cents NULL, which
-- readers treat as frozen_subtotal_cents (no discounts existed then).
ALTER TABLE estimate_versions
  ADD COLUMN IF NOT EXISTS labor_discount_kind text,
  ADD COLUMN IF NOT EXISTS labor_discount_value integer,
  ADD COLUMN IF NOT EXISTS labor_discount_label text,
  ADD COLUMN IF NOT EXISTS total_discount_kind text,
  ADD COLUMN IF NOT EXISTS total_discount_value integer,
  ADD COLUMN IF NOT EXISTS total_discount_label text,
  ADD COLUMN IF NOT EXISTS frozen_labor_discount_cents integer,
  ADD COLUMN IF NOT EXISTS frozen_total_discount_cents integer,
  ADD COLUMN IF NOT EXISTS frozen_total_cents integer;

-- Checks are dropped and re-added so a rerun always leaves the definitive
-- definition. Every branch is NULL-safe: a NULL kind or value can never make a
-- check evaluate to NULL (which PostgreSQL would accept).
ALTER TABLE estimate_versions DROP CONSTRAINT IF EXISTS estimate_versions_labor_discount_check;
ALTER TABLE estimate_versions ADD CONSTRAINT estimate_versions_labor_discount_check CHECK (
  (labor_discount_kind IS NULL AND labor_discount_value IS NULL AND labor_discount_label IS NULL)
  OR (labor_discount_kind IS NOT NULL AND labor_discount_value IS NOT NULL AND (
    (labor_discount_kind = 'percent' AND labor_discount_value BETWEEN 1 AND 10000)
    OR (labor_discount_kind = 'amount' AND labor_discount_value >= 1))));
ALTER TABLE estimate_versions DROP CONSTRAINT IF EXISTS estimate_versions_total_discount_check;
ALTER TABLE estimate_versions ADD CONSTRAINT estimate_versions_total_discount_check CHECK (
  (total_discount_kind IS NULL AND total_discount_value IS NULL AND total_discount_label IS NULL)
  OR (total_discount_kind IS NOT NULL AND total_discount_value IS NOT NULL AND (
    (total_discount_kind = 'percent' AND total_discount_value BETWEEN 1 AND 10000)
    OR (total_discount_kind = 'amount' AND total_discount_value >= 1))));
-- All-NULL frozen amounts are the legacy (pre-discount) state; any stored amount is non-negative.
ALTER TABLE estimate_versions DROP CONSTRAINT IF EXISTS estimate_versions_frozen_discounts_check;
ALTER TABLE estimate_versions ADD CONSTRAINT estimate_versions_frozen_discounts_check CHECK (
  frozen_labor_discount_cents >= 0 AND frozen_total_discount_cents >= 0 AND frozen_total_cents >= 0);
