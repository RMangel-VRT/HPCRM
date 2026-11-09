-- Additive only: no payment classification or commercial-data rewrite.
ALTER TABLE term_billing_months ADD COLUMN IF NOT EXISTS is_fee boolean NOT NULL DEFAULT false;
ALTER TABLE agreement_terms ADD COLUMN IF NOT EXISTS payment_schedule text NOT NULL DEFAULT 'pattern';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agreement_terms_payment_schedule_check'
    AND conrelid = 'agreement_terms'::regclass) THEN
    ALTER TABLE agreement_terms ADD CONSTRAINT agreement_terms_payment_schedule_check
      CHECK (payment_schedule IN ('pattern', 'explicit'));
  END IF;
END $$;
