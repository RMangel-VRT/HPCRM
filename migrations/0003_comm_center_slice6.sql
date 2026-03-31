-- Add scheduling and follow-up fields to communications table
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp;
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "follow_up_due_at" timestamp;
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "follow_up_status" text DEFAULT 'none';
ALTER TABLE "communications" ADD COLUMN IF NOT EXISTS "parent_communication_id" varchar;
