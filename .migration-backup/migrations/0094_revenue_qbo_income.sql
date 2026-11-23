CREATE TABLE IF NOT EXISTS revenue_income_accounts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  qbo_account_id text NOT NULL,
  account_name text NOT NULL,
  stream text,
  updated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT revenue_income_accounts_company_id_qbo_account_id_key UNIQUE (company_id, qbo_account_id),
  CONSTRAINT revenue_income_accounts_stream_check
    CHECK (stream IS NULL OR stream IN ('contract', 'snow', 'irrigation', 'projects', 'extra', 'other', 'exclude'))
);

CREATE TABLE IF NOT EXISTS revenue_qbo_income_months (
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  qbo_account_id text NOT NULL,
  month date NOT NULL,
  amount_cents integer NOT NULL,
  fetched_at timestamp NOT NULL,
  CONSTRAINT revenue_qbo_income_months_company_id_qbo_account_id_month_key UNIQUE (company_id, qbo_account_id, month)
);

CREATE INDEX IF NOT EXISTS revenue_qbo_income_months_company_month_idx
  ON revenue_qbo_income_months (company_id, month);

CREATE TABLE IF NOT EXISTS revenue_qbo_income_years (
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year integer NOT NULL,
  fetched_at timestamp NOT NULL,
  basis text NOT NULL DEFAULT 'accrual',
  CONSTRAINT revenue_qbo_income_years_company_id_year_key UNIQUE (company_id, year)
);
