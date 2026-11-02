ALTER TABLE agreement_terms
  ADD COLUMN IF NOT EXISTS non_renewal_on date,
  ADD COLUMN IF NOT EXISTS non_renewal_reason text,
  ADD COLUMN IF NOT EXISTS non_renewal_competitor text,
  ADD COLUMN IF NOT EXISTS non_renewal_note text,
  ADD COLUMN IF NOT EXISTS non_renewal_by varchar REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deactivate_customer_on_end boolean NOT NULL DEFAULT false;
