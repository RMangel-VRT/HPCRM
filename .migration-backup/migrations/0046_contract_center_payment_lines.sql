ALTER TABLE term_billing_months ADD COLUMN IF NOT EXISTS component text NOT NULL DEFAULT 'Contract';
ALTER TABLE term_billing_months DROP CONSTRAINT IF EXISTS term_billing_months_term_month_unique;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'term_billing_months_term_component_month_unique' AND conrelid = 'term_billing_months'::regclass) THEN
    ALTER TABLE term_billing_months ADD CONSTRAINT term_billing_months_term_component_month_unique UNIQUE (term_id, component, month);
  END IF;
END $$;
ALTER TABLE agreement_terms ADD COLUMN IF NOT EXISTS snow_pricing text;
ALTER TABLE agreement_terms ADD COLUMN IF NOT EXISTS snow_flat_price_cents integer;
