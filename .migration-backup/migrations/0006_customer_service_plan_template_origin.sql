ALTER TABLE customer_service_plans
  ADD COLUMN IF NOT EXISTS source_template_id varchar
    REFERENCES service_plan_templates(id) ON DELETE SET NULL;
