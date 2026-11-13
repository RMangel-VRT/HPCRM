-- New inserts only. Existing category spellings and audit timestamps stay intact.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hardscape_catalog_items'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.hardscape_catalog_items ALTER COLUMN category SET DEFAULT 'General';
  END IF;
END $$;
COMMIT;
