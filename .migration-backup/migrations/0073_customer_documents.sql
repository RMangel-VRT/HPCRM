-- CP5: one owner, renamed in place. Never merge or discard competing tables.
DO $$
BEGIN
  IF to_regclass('public.customer_map_documents') IS NOT NULL
     AND to_regclass('public.customer_documents') IS NOT NULL THEN
    RAISE EXCEPTION 'Both customer document tables exist; manual ownership review required';
  ELSIF to_regclass('public.customer_map_documents') IS NOT NULL THEN
    ALTER TABLE public.customer_map_documents RENAME TO customer_documents;
  ELSIF to_regclass('public.customer_documents') IS NULL THEN
    RAISE EXCEPTION 'Customer document owner is missing; refusing to create a replacement';
  END IF;
END $$;

ALTER TABLE public.customer_documents
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS uploaded_by varchar,
  ADD COLUMN IF NOT EXISTS updated_at timestamp;
UPDATE public.customer_documents SET category = 'map' WHERE category IS NULL;
UPDATE public.customer_documents SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE public.customer_documents
  ALTER COLUMN category SET DEFAULT 'map',
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- Unknown historical types remain NULL; never invent MIME from a generic "image".
UPDATE public.customer_documents SET mime_type = CASE
  WHEN lower(file_type) IN ('pdf', 'application/pdf') OR lower(file_path) ~ '\.pdf$' THEN 'application/pdf'
  WHEN lower(file_type) IN ('jpg', 'jpeg', 'image/jpeg') OR lower(file_path) ~ '\.jpe?g$' THEN 'image/jpeg'
  WHEN lower(file_type) IN ('png', 'image/png') OR lower(file_path) ~ '\.png$' THEN 'image/png'
  WHEN lower(file_type) IN ('heic', 'heif', 'image/heic', 'image/heif') OR lower(file_path) ~ '\.hei[cf]$' THEN 'image/heic'
  WHEN lower(file_type) = 'docx' OR lower(file_path) ~ '\.docx$' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  WHEN lower(file_type) = 'xlsx' OR lower(file_path) ~ '\.xlsx$' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ELSE NULL END WHERE mime_type IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.customer_documents'::regclass AND conname = 'customer_documents_note_check') THEN
    ALTER TABLE public.customer_documents ADD CONSTRAINT customer_documents_note_check CHECK (length(note) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.customer_documents'::regclass AND conname = 'customer_documents_category_check') THEN
    ALTER TABLE public.customer_documents ADD CONSTRAINT customer_documents_category_check CHECK (category IN ('map', 'site_plan', 'irrigation', 'photo', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.customer_documents'::regclass AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.customer_documents'::regclass AND attname = 'uploaded_by')]::smallint[]) THEN
    ALTER TABLE public.customer_documents ADD CONSTRAINT customer_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS customer_documents_company_customer_category_idx ON public.customer_documents(company_id, customer_id, category);
