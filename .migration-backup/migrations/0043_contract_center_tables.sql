CREATE TABLE IF NOT EXISTS agreements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  line text NOT NULL,
  form text NOT NULL DEFAULT 'ours',
  property_management_company_id varchar REFERENCES property_management_companies(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agreements_company_idx ON agreements (company_id);
CREATE INDEX IF NOT EXISTS agreements_customer_idx ON agreements (customer_id);

CREATE TABLE IF NOT EXISTS contract_masters (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  filename text NOT NULL,
  storage_object_path text NOT NULL,
  notes text,
  is_current boolean NOT NULL DEFAULT false,
  uploaded_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT contract_masters_company_version_unique UNIQUE (company_id, version)
);

CREATE TABLE IF NOT EXISTS agreement_terms (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agreement_id varchar NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  season_label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  billing_type text NOT NULL,
  annual_price_cents integer,
  renewal_increase_pct numeric(5,2),
  renewed_from_term_id varchar REFERENCES agreement_terms(id) ON DELETE SET NULL,
  legal_name text,
  managing_agent_name text,
  project_contact text,
  contact_phone text,
  contact_email text,
  project_address text,
  snow_triggers text,
  po text,
  sent_at timestamp,
  signed_at timestamp,
  master_id varchar REFERENCES contract_masters(id) ON DELETE SET NULL,
  needs_review boolean NOT NULL DEFAULT false,
  review_note text,
  notes text,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agreement_terms_company_idx ON agreement_terms (company_id);
CREATE INDEX IF NOT EXISTS agreement_terms_agreement_idx ON agreement_terms (agreement_id);
CREATE INDEX IF NOT EXISTS agreement_terms_company_status_idx ON agreement_terms (company_id, status);
CREATE INDEX IF NOT EXISTS agreement_terms_company_end_idx ON agreement_terms (company_id, end_date);

CREATE TABLE IF NOT EXISTS term_scope_lines (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  term_id varchar NOT NULL REFERENCES agreement_terms(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  line text NOT NULL,
  included boolean NOT NULL DEFAULT true,
  quantity integer,
  unit text,
  month_spread integer[],
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_cents integer,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS term_scope_lines_term_idx ON term_scope_lines (term_id);

CREATE TABLE IF NOT EXISTS rate_card_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rate_key text NOT NULL,
  line text NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  price_cents integer,
  price_text text,
  unit text NOT NULL,
  minimum text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT rate_card_items_company_key_unique UNIQUE (company_id, rate_key)
);

CREATE TABLE IF NOT EXISTS term_rates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  term_id varchar NOT NULL REFERENCES agreement_terms(id) ON DELETE CASCADE,
  rate_key text NOT NULL,
  line text NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  price_cents integer,
  price_text text,
  unit text NOT NULL,
  minimum text,
  card_price_cents integer,
  card_price_text text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT term_rates_term_key_unique UNIQUE (term_id, rate_key)
);

CREATE TABLE IF NOT EXISTS term_billing_months (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  term_id varchar NOT NULL REFERENCES agreement_terms(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount_cents integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT term_billing_months_term_month_unique UNIQUE (term_id, month)
);

CREATE TABLE IF NOT EXISTS term_documents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  term_id varchar NOT NULL REFERENCES agreement_terms(id) ON DELETE CASCADE,
  kind text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  filename text NOT NULL,
  storage_object_path text NOT NULL,
  mime_type text NOT NULL,
  file_size integer,
  master_id varchar REFERENCES contract_masters(id) ON DELETE SET NULL,
  uploaded_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS term_documents_term_idx ON term_documents (term_id);

CREATE TABLE IF NOT EXISTS term_status_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  term_id varchar NOT NULL REFERENCES agreement_terms(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by varchar REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS term_status_history_term_idx ON term_status_history (term_id);

CREATE TABLE IF NOT EXISTS scope_presets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  line text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_preset_lines (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id varchar NOT NULL REFERENCES scope_presets(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  quantity integer,
  month_spread integer[],
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS term_legacy_sources (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  term_id varchar NOT NULL REFERENCES agreement_terms(id) ON DELETE CASCADE,
  legacy_contract_id varchar NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT term_legacy_sources_legacy_unique UNIQUE (legacy_contract_id)
);
