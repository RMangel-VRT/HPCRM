-- Mobile v1 Slice 2 review fixes:
--   1. property_site_notes: per-property curated notes, optionally scoped by service_type.
--      Replaces the JSON-on-customers approach from 0022 (those columns are left in
--      place, unused, to avoid destructive churn).
--   2. service_type_template_items: split out template items into a real table with
--      first-class columns (default_instruction, photo_required, display_order, is_active).
--   3. ticket_work_items: add instruction, photo_required, skip_note (the chip code lives
--      in skip_reason; skip_note is the optional free-text follow-up).
--   4. tickets.completion_override_note: the required note typed when the supervisor
--      forces "Mark complete" while required items are missing.

CREATE TABLE IF NOT EXISTS property_site_notes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_type text,
  label text NOT NULL,
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_site_notes_customer_idx
  ON property_site_notes(customer_id, service_type, sort_order);

CREATE TABLE IF NOT EXISTS service_type_template_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id varchar NOT NULL REFERENCES service_type_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  default_instruction text,
  photo_required boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_type_template_items_template_idx
  ON service_type_template_items(template_id, display_order);

ALTER TABLE ticket_work_items
  ADD COLUMN IF NOT EXISTS instruction text,
  ADD COLUMN IF NOT EXISTS photo_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_note text;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS completion_override_note text;
