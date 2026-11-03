-- Presentation only. No commercial data or historical PDFs are changed.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS cover_source text NOT NULL DEFAULT 'none';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS cover_photo_file_id varchar;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'proposals'::regclass AND conname = 'proposals_cover_source_check') THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_cover_source_check CHECK (cover_source IN ('none', 'photo', 'visual_scope'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'proposals'::regclass AND conname = 'proposals_cover_photo_file_id_fk') THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_cover_photo_file_id_fk FOREIGN KEY (cover_photo_file_id) REFERENCES proposal_files(id) ON DELETE SET NULL;
  END IF;
END $$;
