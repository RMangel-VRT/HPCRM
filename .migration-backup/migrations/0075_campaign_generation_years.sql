-- CG2: explicit company/year generation opt-in. No generation or backfill.
CREATE TABLE IF NOT EXISTS campaign_generation_years (
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year smallint NOT NULL,
  enabled_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  enabled_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, year)
);
