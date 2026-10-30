-- IC1 is additive only. Existing Invoice tickets remain authoritative until IC8.
CREATE TABLE IF NOT EXISTS invoices (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_prefix text NOT NULL CHECK (invoice_prefix IN ('MA','SN')),
  invoice_seq integer NOT NULL CHECK (invoice_seq > 0),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  kind text NOT NULL CHECK (kind IN ('standalone','monthly')),
  period_month date CHECK ((kind <> 'monthly' OR period_month IS NOT NULL) AND (period_month IS NULL OR EXTRACT(DAY FROM period_month) = 1)),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void','superseded','cancelled')),
  qbo_state text NOT NULL DEFAULT 'not_pushed' CHECK (qbo_state IN ('not_pushed','pushed','reconciled','mismatch','drift','error')),
  delivery_state text NOT NULL DEFAULT 'not_sent' CHECK (delivery_state IN ('not_sent','sent','failed')),
  -- QBO mirror, written only by pushInvoice/pullPayments
  payment_state text NOT NULL DEFAULT 'unpaid' CHECK (payment_state IN ('unpaid','partial','paid','voided_in_qbo')),
  txn_date date, due_date date, terms_label text, po_number text, memo text,
  -- Frozen snapshot, written at issue by IC3
  bill_to_snapshot jsonb, work_location_snapshot jsonb,
  subtotal_cents integer NOT NULL DEFAULT 0,
  -- QBO mirror, written only by pushInvoice/pullPayments
  tax_cents integer, total_cents integer, balance_cents integer,
  qbo_invoice_id text, qbo_sync_token text, qbo_doc_number text, qbo_last_synced_at timestamp,
  supersedes_invoice_id varchar REFERENCES invoices(id) ON DELETE SET NULL,
  pdf_object_key text, source_summary text NOT NULL DEFAULT 'Manual',
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  issued_by_id varchar REFERENCES users(id) ON DELETE SET NULL, issued_at timestamp,
  cancelled_at timestamp, cancel_reason text,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_prefix, invoice_seq, revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_live_number_idx ON invoices(company_id,invoice_prefix,invoice_seq) WHERE status <> 'superseded';
CREATE INDEX IF NOT EXISTS invoices_company_customer_idx ON invoices(company_id,customer_id);
CREATE INDEX IF NOT EXISTS invoices_company_status_idx ON invoices(company_id,status);
CREATE INDEX IF NOT EXISTS invoices_company_period_idx ON invoices(company_id,period_month);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id varchar NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  category text NOT NULL CHECK (category IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges','grounds_contract','chemical_contract','snow_contract','snow_services')),
  description text NOT NULL,
  quantity numeric(12,2) CHECK (quantity IS NULL OR quantity > 0),
  unit text NOT NULL,
  rate_cents integer CHECK (rate_cents IS NULL OR rate_cents >= 0),
  amount_cents integer CHECK ((amount_cents IS NULL) = (quantity IS NULL OR rate_cents IS NULL)),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('estimate_line','term_billing_month','ticket','campaign_item','snow_impact','manual')),
  source_id varchar CHECK ((source_id IS NULL) = (source_type = 'manual')),
  source_label text, live boolean NOT NULL DEFAULT true,
  added_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_lines_live_source_idx ON invoice_lines(company_id,source_type,source_id) WHERE live AND source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_lines_invoice_order_idx ON invoice_lines(invoice_id,display_order);
CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prefix text NOT NULL CHECK (prefix IN ('MA','SN')),
  next_value integer NOT NULL DEFAULT 1001
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_number_sequences_company_prefix_idx ON invoice_number_sequences(company_id,prefix);
CREATE TABLE IF NOT EXISTS invoice_qbo_pushes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id varchar NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create','update','void')),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','succeeded','failed')),
  error_code text, error_message text,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_sends (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id varchar NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  revision integer NOT NULL, to_addresses text[] NOT NULL, subject text,
  email_log_id varchar REFERENCES email_logs(id) ON DELETE SET NULL,
  pdf_object_key text, status text NOT NULL CHECK (status IN ('sent','failed')),
  sent_by_id varchar REFERENCES users(id) ON DELETE SET NULL, sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id varchar NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  revision integer NOT NULL, kind text NOT NULL, detail jsonb,
  actor_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_events_invoice_created_idx ON invoice_events(invoice_id,created_at);
