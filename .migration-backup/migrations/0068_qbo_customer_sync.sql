-- Automatic remote mirror; customers remain the billing owner.
ALTER TABLE qbo_customer_cache ADD COLUMN IF NOT EXISTS normalized jsonb;
ALTER TABLE qbo_customer_cache ADD COLUMN IF NOT EXISTS sync_token text;
ALTER TABLE qbo_customer_cache ADD COLUMN IF NOT EXISTS parent_qbo_id text;
ALTER TABLE qbo_customer_cache ADD COLUMN IF NOT EXISTS is_job boolean NOT NULL DEFAULT false;
ALTER TABLE qbo_customer_cache ADD COLUMN IF NOT EXISTS qbo_created_at timestamptz;
ALTER TABLE qbo_customer_cache ADD COLUMN IF NOT EXISTS qbo_updated_at timestamptz;
ALTER TABLE qbo_connections ADD COLUMN IF NOT EXISTS customer_baseline_at timestamptz;
ALTER TABLE qbo_connections ADD COLUMN IF NOT EXISTS customer_cdc_cursor timestamptz;
ALTER TABLE qbo_connections ADD COLUMN IF NOT EXISTS customer_full_pull_at timestamptz;
-- Intentional review snapshots, never live billing owners.
CREATE TABLE IF NOT EXISTS qbo_customer_reviews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id varchar REFERENCES customers(id) ON DELETE SET NULL,
  qbo_id text,
  kind text NOT NULL CHECK (kind IN ('changed_in_qbo','new_in_qbo','sub_customer','qbo_inactive','qbo_removed','name_taken','push_failed')),
  fields jsonb, qbo_snapshot jsonb, message text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolution text, resolved_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qbo_customer_reviews_open_qbo
  ON qbo_customer_reviews(company_id,qbo_id,kind) WHERE status = 'open' AND qbo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qbo_customer_reviews_open_customer
  ON qbo_customer_reviews(company_id,customer_id,kind) WHERE status = 'open' AND customer_id IS NOT NULL;
