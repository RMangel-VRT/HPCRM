-- Customer-owned billing facts; the QBO cache remains a sync-service mirror.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_company_name text,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS billing_phone text,
  ADD COLUMN IF NOT EXISTS billing_mobile text,
  ADD COLUMN IF NOT EXISTS bill_to_mode text NOT NULL DEFAULT 'property',
  ADD COLUMN IF NOT EXISTS bill_street text,
  ADD COLUMN IF NOT EXISTS bill_street2 text,
  ADD COLUMN IF NOT EXISTS bill_city text,
  ADD COLUMN IF NOT EXISTS bill_state text,
  ADD COLUMN IF NOT EXISTS bill_zip text,
  ADD COLUMN IF NOT EXISTS qbo_term_id text,
  ADD COLUMN IF NOT EXISTS branch_billing_mode text NOT NULL DEFAULT 'master',
  ADD COLUMN IF NOT EXISTS qbo_sync_token text,
  ADD COLUMN IF NOT EXISTS qbo_baseline jsonb,
  ADD COLUMN IF NOT EXISTS qbo_sync_state text NOT NULL DEFAULT 'not_linked',
  ADD COLUMN IF NOT EXISTS qbo_last_error text,
  ADD COLUMN IF NOT EXISTS qbo_pushed_at timestamp;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'customers'::regclass AND conname = 'customers_bill_to_mode_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_bill_to_mode_check CHECK (bill_to_mode IN ('property', 'management_company', 'custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'customers'::regclass AND conname = 'customers_branch_billing_mode_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_branch_billing_mode_check CHECK (branch_billing_mode IN ('master', 'separate'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'customers'::regclass AND conname = 'customers_qbo_sync_state_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_qbo_sync_state_check CHECK (qbo_sync_state IN ('not_linked', 'in_sync', 'pending_push', 'error', 'via_parent'));
  END IF;
END $$;

UPDATE customers SET qbo_sync_state = 'in_sync'
WHERE qbo_customer_id IS NOT NULL AND qbo_sync_state = 'not_linked';
