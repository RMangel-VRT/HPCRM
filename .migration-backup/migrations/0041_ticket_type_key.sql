-- Slice A2: stable machine identity for the six seeded ticket types.
-- Idempotent: IF NOT EXISTS on DDL; backfill only writes WHERE type_key IS NULL
-- (preserves any hand-edited value).

ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS type_key text;
CREATE INDEX IF NOT EXISTS ticket_types_key_idx ON ticket_types (company_id, type_key) WHERE type_key IS NOT NULL;

-- Post-rename display names → stable keys.
UPDATE ticket_types SET type_key = 'todo'             WHERE name = 'To-Do'             AND type_key IS NULL;
UPDATE ticket_types SET type_key = 'estimate_request' WHERE name = 'Estimate Request' AND type_key IS NULL;
UPDATE ticket_types SET type_key = 'project'          WHERE name = 'Project'           AND type_key IS NULL;
UPDATE ticket_types SET type_key = 'extra_billable'   WHERE name = 'Extra Billable'    AND type_key IS NULL;
UPDATE ticket_types SET type_key = 'invoice'          WHERE name = 'Invoice'           AND type_key IS NULL;
UPDATE ticket_types SET type_key = 'rfp_request'      WHERE name = 'RFP Request'       AND type_key IS NULL;