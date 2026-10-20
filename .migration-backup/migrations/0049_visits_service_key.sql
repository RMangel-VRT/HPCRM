ALTER TABLE visits ADD COLUMN IF NOT EXISTS service_key text;
CREATE INDEX IF NOT EXISTS visits_company_service_date_idx ON visits (company_id, service_key, visit_date);
