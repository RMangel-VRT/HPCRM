--> statement-breakpoint
ALTER TABLE "communication_templates" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "communication_audit_log" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" varchar NOT NULL,
        "communication_id" varchar,
        "template_id" varchar,
        "action_type" text NOT NULL,
        "action_by_user_id" varchar,
        "action_details" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communication_audit_log" ADD CONSTRAINT "communication_audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communication_audit_log" ADD CONSTRAINT "communication_audit_log_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communication_audit_log" ADD CONSTRAINT "communication_audit_log_template_id_communication_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "communication_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communication_audit_log" ADD CONSTRAINT "communication_audit_log_action_by_user_id_users_id_fk" FOREIGN KEY ("action_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
