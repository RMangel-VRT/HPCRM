-- Migration: Service Plan Layer
-- Adds service plan templates, template items, and customer service plans tables.

CREATE TABLE IF NOT EXISTS service_plan_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  active text NOT NULL DEFAULT 'true',
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_plan_template_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id varchar NOT NULL REFERENCES service_plan_templates(id) ON DELETE CASCADE,
  service_category text NOT NULL,
  default_annual_quantity integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_service_plans (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id varchar NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  year integer NOT NULL,
  service_category text NOT NULL,
  expected_quantity integer NOT NULL DEFAULT 1,
  notes text,
  source_contract_ref varchar REFERENCES contracts(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_service_plans_unique_key UNIQUE (customer_id, year, service_category)
);

CREATE INDEX IF NOT EXISTS customer_service_plans_customer_idx ON customer_service_plans(customer_id);
CREATE INDEX IF NOT EXISTS customer_service_plans_company_idx ON customer_service_plans(company_id);

-- Add service_plan_category to campaign_items for per-category fulfillment tracking
ALTER TABLE campaign_items ADD COLUMN IF NOT EXISTS service_plan_category text;
CREATE INDEX IF NOT EXISTS campaign_items_service_plan_cat_idx
  ON campaign_items(customer_id, service_plan_category)
  WHERE service_plan_category IS NOT NULL;
