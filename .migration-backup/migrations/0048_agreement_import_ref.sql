ALTER TABLE agreements ADD COLUMN IF NOT EXISTS import_ref text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agreements_company_import_ref_unique'
    AND conrelid = 'agreements'::regclass) THEN
    ALTER TABLE agreements ADD CONSTRAINT agreements_company_import_ref_unique UNIQUE (company_id, import_ref);
  END IF;
END $$;
