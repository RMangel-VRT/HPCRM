CREATE TABLE IF NOT EXISTS company_documents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 255),
  category text NOT NULL CHECK (category IN ('tax','licenses','insurance','business','other')),
  role text CHECK (role = 'pesticide_license'),
  expires_on date,
  visibility text NOT NULL DEFAULT 'office' CHECK (visibility IN ('office','everyone')),
  pinned boolean NOT NULL DEFAULT false,
  current_file_id varchar,
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  updated_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS company_documents_live_role_idx ON company_documents(company_id, role)
  WHERE role IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS company_documents_company_archived_idx ON company_documents(company_id, archived_at);
CREATE TABLE IF NOT EXISTS company_document_files (
  id varchar PRIMARY KEY,
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id varchar NOT NULL REFERENCES company_documents(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  mime_type text,
  file_size integer,
  uploaded_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_document_files_document_uploaded_idx ON company_document_files(document_id, uploaded_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_documents_current_file_fk' AND conrelid = 'company_documents'::regclass) THEN
    ALTER TABLE company_documents ADD CONSTRAINT company_documents_current_file_fk FOREIGN KEY (current_file_id)
      REFERENCES company_document_files(id) ON DELETE SET NULL;
  END IF;
END $$;
