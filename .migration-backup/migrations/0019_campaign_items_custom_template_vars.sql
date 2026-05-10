-- Per-item custom chemical-notification template variable values.
-- Stores user-supplied values for template variables that don't have a
-- dedicated column on campaign_items (e.g. nextVisitDate). Idempotent.
ALTER TABLE campaign_items
  ADD COLUMN IF NOT EXISTS custom_template_vars JSONB;
