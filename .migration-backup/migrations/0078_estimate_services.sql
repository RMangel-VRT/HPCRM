BEGIN;
CREATE TABLE IF NOT EXISTS estimate_service_categories (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 name text NOT NULL CONSTRAINT estimate_service_categories_name_check CHECK (name = trim(name) AND length(name) BETWEEN 1 AND 100),
 default_umbrella_key text NOT NULL CONSTRAINT estimate_service_categories_key_check CHECK (default_umbrella_key IN ('plants','landscape_materials','irrigation_materials','landscape_labor','irrigation_labor','fees_surcharges')),
 default_unit text NOT NULL CONSTRAINT estimate_service_categories_unit_check CHECK (default_unit IN ('hour','day','week','ea','flat','sq ft','1,000 sq ft','lin ft','visit')),
 sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
 created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS estimate_service_categories_company_name_idx ON estimate_service_categories(company_id,lower(name));
ALTER TABLE estimate_quick_items ADD COLUMN IF NOT EXISTS service_category_id varchar REFERENCES estimate_service_categories(id) ON DELETE RESTRICT;
ALTER TABLE estimate_quick_items DROP CONSTRAINT IF EXISTS estimate_quick_items_kind_check;
ALTER TABLE estimate_quick_items ADD CONSTRAINT estimate_quick_items_kind_check CHECK (kind IN ('equipment','fee','service'));
ALTER TABLE estimate_quick_items DROP CONSTRAINT IF EXISTS estimate_quick_items_unit_check;
ALTER TABLE estimate_quick_items ADD CONSTRAINT estimate_quick_items_unit_check CHECK (default_unit IN ('hour','day','week','ea','flat','sq ft','1,000 sq ft','lin ft','visit'));
ALTER TABLE estimate_quick_items DROP CONSTRAINT IF EXISTS estimate_quick_items_category_check;
ALTER TABLE estimate_quick_items ADD CONSTRAINT estimate_quick_items_category_check CHECK ((kind = 'service') = (service_category_id IS NOT NULL));
ALTER TABLE estimate_lines DROP CONSTRAINT IF EXISTS estimate_lines_type_check;
ALTER TABLE estimate_lines ADD CONSTRAINT estimate_lines_type_check CHECK (line_type IN ('plant','hardscape','irrigation','labor','service','equipment','fee','custom'));
INSERT INTO estimate_service_categories(company_id,name,default_umbrella_key,default_unit,sort_order)
 SELECT c.id,v.name,'landscape_labor','1,000 sq ft',v.sort_order FROM companies c
 CROSS JOIN (VALUES ('General Landscape',0),('Chemical Treatments',1)) v(name,sort_order)
 ON CONFLICT (company_id,lower(name)) DO NOTHING;
COMMIT;
