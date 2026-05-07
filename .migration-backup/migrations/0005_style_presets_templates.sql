CREATE TABLE IF NOT EXISTS "style_presets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" varchar REFERENCES "companies"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'general',
  "style_config" jsonb NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sheet_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" varchar NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "layer_visibility" jsonb DEFAULT '{}'::jsonb,
  "legend_config" jsonb DEFAULT '{}'::jsonb,
  "title_block_format" jsonb DEFAULT '{}'::jsonb,
  "notes_layout" jsonb DEFAULT '{}'::jsonb,
  "default_preset_ids" text[] DEFAULT ARRAY[]::text[],
  "created_at" timestamp NOT NULL DEFAULT now()
);
