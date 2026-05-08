-- Ensure the pg_trgm extension is installed before any trigram-using DDL runs.
-- The trigram index `customers_name_trgm_idx` (lib/db/src/schema/schema.ts) depends on
-- `gin_trgm_ops`, which is only available when pg_trgm is installed. Production
-- Publish failed because the prod DB did not have pg_trgm; this migration is the
-- migrate-runner side of the fix (the API server also creates the extension on boot).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
