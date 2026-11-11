BEGIN;
-- 0053's inline CHECK has PostgreSQL's automatic column-based name on
-- migration-created databases. 0078 supplies the canonical expanded check.
-- Remove the obsolete duplicate without renaming any prior migration.
ALTER TABLE estimate_quick_items DROP CONSTRAINT IF EXISTS estimate_quick_items_default_unit_check;
COMMIT;
