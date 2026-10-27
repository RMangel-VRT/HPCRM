ALTER TABLE agreement_terms ADD COLUMN IF NOT EXISTS line text;
ALTER TABLE agreement_terms ADD COLUMN IF NOT EXISTS form text;
-- Preserve independently populated seasonal values when repeating a partial migration.
UPDATE agreement_terms t
SET line = COALESCE(t.line, a.line), form = COALESCE(t.form, a.form, 'ours')
FROM agreements a
WHERE a.id = t.agreement_id AND (t.line IS NULL OR t.form IS NULL);
ALTER TABLE agreement_terms ALTER COLUMN line SET NOT NULL;
ALTER TABLE agreement_terms ALTER COLUMN form SET NOT NULL;
ALTER TABLE agreement_terms ALTER COLUMN form SET DEFAULT 'ours';
ALTER TABLE agreements ALTER COLUMN line DROP NOT NULL;
ALTER TABLE agreements ALTER COLUMN form DROP NOT NULL;
