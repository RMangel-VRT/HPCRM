-- Relationships only: no historical linking or commercial-value copies.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS estimate_id varchar;
ALTER TABLE proposal_versions ADD COLUMN IF NOT EXISTS estimate_version_id varchar;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_estimate_id_fk' AND conrelid = 'proposals'::regclass) THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_estimate_id_fk FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_versions_estimate_version_id_fk' AND conrelid = 'proposal_versions'::regclass) THEN
    ALTER TABLE proposal_versions ADD CONSTRAINT proposal_versions_estimate_version_id_fk FOREIGN KEY (estimate_version_id) REFERENCES estimate_versions(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS proposals_company_estimate_idx ON proposals(company_id, estimate_id);
