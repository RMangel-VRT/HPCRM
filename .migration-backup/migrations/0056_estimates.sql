-- Estimate Builder: additive only. Re-runnable; no startup DDL.
CREATE TABLE IF NOT EXISTS estimates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  ticket_id varchar REFERENCES tickets(id) ON DELETE SET NULL,
  estimate_number text NOT NULL, title text NOT NULL, current_version_id varchar,
  voided_at timestamp, void_reason text,
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS estimates_company_number_idx ON estimates(company_id, estimate_number);
CREATE UNIQUE INDEX IF NOT EXISTS estimates_live_ticket_idx ON estimates(ticket_id) WHERE ticket_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS estimates_company_customer_idx ON estimates(company_id, customer_id);
CREATE TABLE IF NOT EXISTS estimate_number_counters (
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year integer NOT NULL, last_value integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS estimate_number_counters_company_year_idx ON estimate_number_counters(company_id, year);
CREATE TABLE IF NOT EXISTS estimate_versions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  estimate_id varchar NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CONSTRAINT estimate_versions_status_check CHECK (status IN ('draft','sent','accepted','declined','superseded','void')),
  created_from_version_id varchar,
  sent_at timestamp, sent_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  sent_method text CONSTRAINT estimate_versions_sent_method_check CHECK (sent_method IN ('email','hard_copy','portal','other')),
  accepted_at timestamp, accepted_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  acceptance_method text CONSTRAINT estimate_versions_acceptance_method_check CHECK (acceptance_method IN ('email_approval','signed_pdf','phone','portal','other')),
  po_number text, declined_at timestamp, declined_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  decline_reason text, superseded_at timestamp,
  frozen_subtotal_cents integer, frozen_cost_known_cents integer, frozen_cost_unknown_lines integer,
  created_by_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS estimate_versions_number_idx ON estimate_versions(estimate_id, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS estimate_versions_draft_idx ON estimate_versions(estimate_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS estimate_versions_accepted_idx ON estimate_versions(estimate_id) WHERE status = 'accepted';
CREATE TABLE IF NOT EXISTS estimate_sections (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version_id varchar NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
  name text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estimate_sections_version_order_idx ON estimate_sections(version_id, sort_order);
CREATE TABLE IF NOT EXISTS estimate_lines (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version_id varchar NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
  section_id varchar NOT NULL REFERENCES estimate_sections(id) ON DELETE CASCADE,
  line_type text NOT NULL CONSTRAINT estimate_lines_type_check CHECK (line_type IN ('plant','hardscape','irrigation','labor','equipment','fee','custom')),
  plant_catalog_item_id varchar REFERENCES plant_catalog_items(id) ON DELETE SET NULL,
  hardscape_catalog_item_id varchar REFERENCES hardscape_catalog_items(id) ON DELETE SET NULL,
  irrigation_catalog_item_id varchar REFERENCES irrigation_catalog_items(id) ON DELETE SET NULL,
  quick_item_id varchar REFERENCES estimate_quick_items(id) ON DELETE SET NULL,
  rate_key text, term_id varchar REFERENCES agreement_terms(id) ON DELETE SET NULL,
  price_source text NOT NULL CONSTRAINT estimate_lines_source_check CHECK (price_source IN ('catalog','contract','rate_card','quick_list','manual')),
  name text NOT NULL, detail text, unit text NOT NULL,
  quantity numeric(12,2) NOT NULL CONSTRAINT estimate_lines_quantity_check CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CONSTRAINT estimate_lines_price_check CHECK (unit_price_cents >= 0),
  unit_cost_cents integer CONSTRAINT estimate_lines_cost_check CHECK (unit_cost_cents >= 0),
  extended_cents integer NOT NULL,
  umbrella_key text NOT NULL CONSTRAINT estimate_lines_umbrella_check CHECK (umbrella_key IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges')),
  include_in_palette boolean NOT NULL DEFAULT false, palette_type_label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estimate_lines_version_section_order_idx ON estimate_lines(version_id, section_id, sort_order);
