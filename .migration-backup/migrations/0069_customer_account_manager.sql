-- Owner: customers. Branch assignments are live parent projections, never copies.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_manager_id varchar
  REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS customers_company_account_manager_idx
  ON customers (company_id, account_manager_id);
