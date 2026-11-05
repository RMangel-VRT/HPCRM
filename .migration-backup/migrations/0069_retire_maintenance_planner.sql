-- R3: explicitly authorized retirement; no import and no route-stop data writes.
-- Production evidence: Randy-run Nov 5, 2026; zero imported stops and external FKs.
-- CSV insurance waived by Randy. Development only; Randy checks Publish.
DROP TABLE IF EXISTS route_import_decisions;
DROP TABLE IF EXISTS schedule_blocks;
DROP TABLE IF EXISTS maintenance_visit_configs;
DROP TABLE IF EXISTS weekly_schedule_templates;
DROP TABLE IF EXISTS maintenance_crews;
ALTER TABLE route_stops DROP COLUMN IF EXISTS imported_from_block_id;
ALTER TABLE companies DROP COLUMN IF EXISTS routes_imported_at;
