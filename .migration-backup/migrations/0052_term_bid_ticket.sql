ALTER TABLE agreement_terms ADD COLUMN IF NOT EXISTS bid_ticket_id varchar
  REFERENCES tickets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS agreement_terms_bid_ticket_idx ON agreement_terms (bid_ticket_id);
