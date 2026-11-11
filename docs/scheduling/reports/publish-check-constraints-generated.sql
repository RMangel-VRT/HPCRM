-- Exact CREATE TABLE from the final actual Publish preview, 2026-11-11.
-- Evidence only: not a production migration runner or instructions to publish.
-- service_programs is correctly absent after SC1; this is its replacement.
CREATE TABLE "service_calendar" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"service_key" text NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"opens_md" char(5) NOT NULL,
	"due_md" char(5) NOT NULL,
	"in_standard" boolean DEFAULT false NOT NULL,
	"pattern" text,
	"includes" text,
	"updated_by_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_calendar_position_unique" UNIQUE("company_id","service_key","kind","position"),
	CONSTRAINT "service_calendar_valid_check" CHECK (COALESCE((("position" >= 1) AND ("position" <= 24) AND (name = btrim(name)) AND ((length(name) >= 1) AND (length(name) <= 80)) AND (opens_md ~ '^(01|03|05|07|08|10|12)-(0[1-9]|[12][0-9]|3[01])$|^(04|06|09|11)-(0[1-9]|[12][0-9]|30)$|^02-(0[1-9]|1[0-9]|2[0-8])$'::text) AND (due_md ~ '^(01|03|05|07|08|10|12)-(0[1-9]|[12][0-9]|3[01])$|^(04|06|09|11)-(0[1-9]|[12][0-9]|30)$|^02-(0[1-9]|1[0-9]|2[0-8])$'::text) AND (opens_md <> due_md) AND (((kind = 'round'::text) AND (service_key = ANY (ARRAY['aeration'::text, 'cleanups'::text, 'shrub_trimming'::text, 'ornamental_grass'::text, 'tree_pruning'::text, 'native_areas'::text, 'fertilization'::text, 'broadleaf'::text, 'irrigation_open'::text, 'irrigation_winterization'::text]))) OR ((kind = 'checklist'::text) AND (service_key = 'backflow'::text) AND ("position" = 1)) OR ((kind = 'recurring'::text) AND (service_key = ANY (ARRAY['mowing'::text, 'pet_station'::text, 'winter_visits'::text, 'irrigation_inspection'::text, 'native_areas'::text])))) AND ((kind = 'round'::text) OR (NOT in_standard)) AND ((kind = 'recurring'::text) OR ((pattern IS NULL) AND (includes IS NULL)))), false) IS TRUE)
);
