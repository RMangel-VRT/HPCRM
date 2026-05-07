-- Migration: Add mailbox_backfill_runs table (Slice 2.5 — Historical Mail Backfill)

CREATE TABLE IF NOT EXISTS mailbox_backfill_runs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  mailbox_account_id VARCHAR NOT NULL REFERENCES mailbox_accounts(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  range_start TIMESTAMP NOT NULL,
  range_end TIMESTAMP NOT NULL,
  include_inbox BOOLEAN NOT NULL DEFAULT TRUE,
  include_sent BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'queued',
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_total INTEGER,
  current_month TEXT,
  inbox_fetched INTEGER NOT NULL DEFAULT 0,
  inbox_routed INTEGER NOT NULL DEFAULT 0,
  inbox_unsorted INTEGER NOT NULL DEFAULT 0,
  inbox_deduped INTEGER NOT NULL DEFAULT 0,
  sent_fetched INTEGER NOT NULL DEFAULT 0,
  sent_routed INTEGER NOT NULL DEFAULT 0,
  sent_unsorted INTEGER NOT NULL DEFAULT 0,
  sent_deduped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mailbox_backfill_runs_mailbox_started_idx
  ON mailbox_backfill_runs(mailbox_account_id, started_at);
