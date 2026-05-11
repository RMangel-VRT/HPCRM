-- Mobile v1 Slice 2: ticket detail + curated site notes + work items + service-type templates.
-- Adds curated site-note columns to customers (the "property" in this CRM), a
-- completion_notes column on tickets, and two new tables: ticket_work_items
-- (per-ticket checklist) and service_type_templates (admin-managed reusable
-- checklists keyed by service type). All idempotent.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS gate_code text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pet_station_count integer;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pet_station_locations text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS irrigation_controller_locations text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS access_notes text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS watch_out_notes text;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_notes text;

CREATE TABLE IF NOT EXISTS service_type_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_type_templates_company_idx
  ON service_type_templates (company_id, service_type);

CREATE TABLE IF NOT EXISTS ticket_work_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id varchar NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  is_complete boolean NOT NULL DEFAULT false,
  completed_at timestamp,
  completed_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  skip_reason text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_work_items_ticket_idx
  ON ticket_work_items (ticket_id, sort_order);
