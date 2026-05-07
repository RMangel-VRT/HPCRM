ALTER TABLE "campaign_items" ADD COLUMN IF NOT EXISTS "property_id" varchar;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_items" ADD CONSTRAINT "campaign_items_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
