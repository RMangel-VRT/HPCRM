CREATE TABLE IF NOT EXISTS "campaign_checklist_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_item_id" varchar NOT NULL,
	"campaign_checklist_task_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "campaign_checklist_audit_log" ADD CONSTRAINT "campaign_checklist_audit_log_campaign_item_id_campaign_items_id_fk" FOREIGN KEY ("campaign_item_id") REFERENCES "public"."campaign_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "campaign_checklist_audit_log" ADD CONSTRAINT "campaign_checklist_audit_log_campaign_checklist_task_id_campaign_checklist_tasks_id_fk" FOREIGN KEY ("campaign_checklist_task_id") REFERENCES "public"."campaign_checklist_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "campaign_checklist_audit_log" ADD CONSTRAINT "campaign_checklist_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
