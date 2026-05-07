ALTER TABLE "communication_templates" ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'general_outreach';
--> statement-breakpoint
ALTER TABLE "communication_templates" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "communication_templates" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "communication_templates" ADD COLUMN IF NOT EXISTS "default_communication_type" text;
