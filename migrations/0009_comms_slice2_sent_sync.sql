-- Comms Slice 2: Sent-Folder Sync & Outbound Dedup
-- Add gmail_sent_history_id cursor to mailbox_accounts
ALTER TABLE mailbox_accounts ADD COLUMN IF NOT EXISTS gmail_sent_history_id text;

-- Add sent_* counters to mailbox_sync_runs
ALTER TABLE mailbox_sync_runs ADD COLUMN IF NOT EXISTS sent_messages_fetched integer NOT NULL DEFAULT 0;
ALTER TABLE mailbox_sync_runs ADD COLUMN IF NOT EXISTS sent_messages_routed integer NOT NULL DEFAULT 0;
ALTER TABLE mailbox_sync_runs ADD COLUMN IF NOT EXISTS sent_messages_deduped integer NOT NULL DEFAULT 0;
ALTER TABLE mailbox_sync_runs ADD COLUMN IF NOT EXISTS sent_messages_unsorted integer NOT NULL DEFAULT 0;
ALTER TABLE mailbox_sync_runs ADD COLUMN IF NOT EXISTS sent_messages_discarded integer NOT NULL DEFAULT 0;

-- Add direction column to unsorted_emails
ALTER TABLE unsorted_emails ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inbound';
