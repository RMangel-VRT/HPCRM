-- Migration: Add chemical_notification_templates table and FK on campaigns

CREATE TABLE IF NOT EXISTS "chemical_notification_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "service_type" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "pre_visit_subject" text NOT NULL,
  "pre_visit_html" text NOT NULL,
  "post_visit_subject" text NOT NULL,
  "post_visit_html" text NOT NULL,
  "created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chem_notif_templates_company_id_idx" ON "chemical_notification_templates" ("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "chem_notif_templates_name_company_unique" ON "chemical_notification_templates" ("name", "company_id");

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "notification_template_id" varchar REFERENCES "chemical_notification_templates"("id") ON DELETE SET NULL;
