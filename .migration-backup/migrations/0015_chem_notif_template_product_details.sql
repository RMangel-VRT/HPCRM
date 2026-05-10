-- Per-template product detail columns for chemical_notification_templates.
-- Powers the "Product details" section in the Notification Templates editor
-- and feeds renderChemicalNotificationTemplate(...) variable substitution.
ALTER TABLE chemical_notification_templates ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE chemical_notification_templates ADD COLUMN IF NOT EXISTS active_ingredient text;
ALTER TABLE chemical_notification_templates ADD COLUMN IF NOT EXISTS epa_reg_number text;
ALTER TABLE chemical_notification_templates ADD COLUMN IF NOT EXISTS purpose_text text;
ALTER TABLE chemical_notification_templates ADD COLUMN IF NOT EXISTS reentry_interval text;
ALTER TABLE chemical_notification_templates ADD COLUMN IF NOT EXISTS watering_instructions text;
ALTER TABLE chemical_notification_templates ADD COLUMN IF NOT EXISTS mowing_instructions text;
ALTER TABLE chemical_notification_templates ADD COLUMN IF NOT EXISTS post_application_expectation text;
