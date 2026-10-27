-- Guarded schema; existing migration filenames deliberately preserved.
CREATE TABLE IF NOT EXISTS qbo_umbrella_items (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 key text NOT NULL CHECK (key IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges')),
 label text NOT NULL, description text, qbo_item_id varchar, qbo_item_name text,
 qbo_item_type text CHECK (qbo_item_type IN ('Service','NonInventory')), qbo_synced_at timestamp,
 sort_order integer NOT NULL DEFAULT 0, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qbo_umbrella_items_company_key_idx ON qbo_umbrella_items(company_id,key);
CREATE TABLE IF NOT EXISTS qbo_item_cache (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 qbo_id varchar NOT NULL, name text NOT NULL, type text NOT NULL, income_account_name text,
 active boolean NOT NULL DEFAULT true, fetched_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qbo_item_cache_company_qbo_idx ON qbo_item_cache(company_id,qbo_id);
CREATE TABLE IF NOT EXISTS estimate_quick_items (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('equipment','fee')), label text NOT NULL CHECK (length(trim(label)) > 0),
 default_unit text NOT NULL DEFAULT 'hour' CHECK (default_unit IN ('hour','day','week','ea','flat')),
 default_rate_cents integer CHECK (default_rate_cents >= 0),
 umbrella_key text NOT NULL CHECK (umbrella_key IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges')),
 is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
 created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estimate_quick_items_company_idx ON estimate_quick_items(company_id,kind);
CREATE UNIQUE INDEX IF NOT EXISTS estimate_quick_items_company_label_idx ON estimate_quick_items(company_id,lower(label));
INSERT INTO qbo_umbrella_items(company_id,key,label,description,sort_order)
SELECT c.id, v.key, v.label, v.description, v.sort_order FROM companies c CROSS JOIN (VALUES
 ('plants','Plants','Trees, shrubs, perennials and other plant material.',0),
 ('landscape_materials','Landscape Materials','Mulch, soil, rock, pavers and other landscape materials.',1),
 ('irrigation_materials','Irrigation Materials','Irrigation parts, pipe, fittings and controllers.',2),
 ('landscape_labor','Landscape Labor','Landscape labor and equipment charges.',3),
 ('irrigation_labor','Irrigation Labor','Irrigation installation, service and repair labor.',4),
 ('fees_surcharges','Fees & Surcharges','Disposal, delivery, permits and other fees or surcharges.',5)
) AS v(key,label,description,sort_order) ON CONFLICT (company_id,key) DO NOTHING;
