-- Crew Worksheets: a frozen, crew-facing snapshot of a Proposal that can be
-- independently edited (no pricing, no estimate PDF). Numbered CW-YYYY-NNNN
-- per company per calendar year.

CREATE TABLE IF NOT EXISTS "crew_worksheets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "customer_id" varchar NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "created_by_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "ticket_id" varchar REFERENCES "tickets"("id") ON DELETE SET NULL,
  "source_proposal_id" varchar REFERENCES "proposals"("id") ON DELETE SET NULL,
  "worksheet_number" varchar NOT NULL UNIQUE,
  "title" varchar NOT NULL DEFAULT 'Crew Worksheet',
  "worksheet_date" varchar NOT NULL,
  "scope_of_work" text NOT NULL DEFAULT '',
  "status" varchar NOT NULL DEFAULT 'draft',
  "visual_scope_sheet_id" varchar REFERENCES "visual_scope_sheets"("id") ON DELETE SET NULL,
  "assigned_crew_lead_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "crew_label" varchar,
  "scheduled_date" varchar,
  "scheduled_start_time" varchar,
  "estimated_hours" numeric(6,2),
  "equipment_checklist" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "materials_checklist" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "crew_notes" text NOT NULL DEFAULT '',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "crew_worksheets_company_id_idx" ON "crew_worksheets" ("company_id");
CREATE INDEX IF NOT EXISTS "crew_worksheets_customer_id_idx" ON "crew_worksheets" ("customer_id");
CREATE INDEX IF NOT EXISTS "crew_worksheets_ticket_id_idx" ON "crew_worksheets" ("ticket_id");
CREATE INDEX IF NOT EXISTS "crew_worksheets_source_proposal_id_idx" ON "crew_worksheets" ("source_proposal_id");

CREATE TABLE IF NOT EXISTS "crew_worksheet_photos" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "crew_worksheet_id" varchar NOT NULL REFERENCES "crew_worksheets"("id") ON DELETE CASCADE,
  "company_id" varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "storage_object_path" varchar NOT NULL,
  "filename" varchar NOT NULL,
  "mime_type" varchar NOT NULL,
  "file_size" integer NOT NULL,
  "caption" text,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "crew_worksheet_photos_worksheet_id_idx" ON "crew_worksheet_photos" ("crew_worksheet_id");

CREATE TABLE IF NOT EXISTS "crew_worksheet_versions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "crew_worksheet_id" varchar NOT NULL REFERENCES "crew_worksheets"("id") ON DELETE CASCADE,
  "company_id" varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "title" varchar NOT NULL,
  "worksheet_date" varchar NOT NULL,
  "finalized_by_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "finalized_at" timestamp NOT NULL DEFAULT now(),
  "pdf_storage_path" varchar NOT NULL,
  "visual_scope_sheet_id" varchar,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "crew_worksheet_versions_unique" UNIQUE ("crew_worksheet_id", "version_number")
);

CREATE TABLE IF NOT EXISTS "crew_worksheet_number_counters" (
  "company_id" varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "last_number" integer NOT NULL DEFAULT 0,
  CONSTRAINT "crew_worksheet_counters_pk" UNIQUE ("company_id", "year")
);
