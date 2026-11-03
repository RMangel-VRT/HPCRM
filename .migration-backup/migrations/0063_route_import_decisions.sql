-- Import-review workflow state only; no production-targeted execution or startup DDL.
-- Frozen source snapshots do not own live recurrence or contractual entitlement.
CREATE TABLE IF NOT EXISTS route_import_decisions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_block_id varchar NOT NULL,
  snapshot jsonb NOT NULL,
  resolution text,
  resolved_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT route_import_decisions_resolution_check
    CHECK (resolution IS NULL OR resolution IN ('keep', 'remove'))
);
CREATE UNIQUE INDEX IF NOT EXISTS route_import_decisions_source_unique
  ON route_import_decisions(company_id, source_block_id);
