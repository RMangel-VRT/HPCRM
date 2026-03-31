CREATE TABLE IF NOT EXISTS "communications" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" varchar NOT NULL,
        "customer_id" varchar,
        "contact_id" varchar,
        "sent_by_id" varchar,
        "type" text NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "subject" text NOT NULL,
        "body" text NOT NULL,
        "scheduled_at" timestamp,
        "sent_at" timestamp,
        "customer_name" text,
        "contact_name" text,
        "sent_by_name" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "communication_templates" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" varchar NOT NULL,
        "name" text NOT NULL,
        "type" text NOT NULL,
        "subject" text,
        "body" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "communication_links" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "company_id" varchar NOT NULL,
        "communication_id" varchar NOT NULL,
        "linked_entity_type" text NOT NULL,
        "linked_entity_id" varchar NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communications" ADD CONSTRAINT "communications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communications" ADD CONSTRAINT "communications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communications" ADD CONSTRAINT "communications_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communications" ADD CONSTRAINT "communications_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communication_links" ADD CONSTRAINT "communication_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "communication_links" ADD CONSTRAINT "communication_links_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communications_company_id_idx" ON "communications" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communications_customer_id_idx" ON "communications" ("customer_id");
