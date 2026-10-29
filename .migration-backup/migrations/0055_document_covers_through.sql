ALTER TABLE term_documents ADD COLUMN IF NOT EXISTS covers_through_term_id varchar
  REFERENCES agreement_terms(id) ON DELETE SET NULL;
