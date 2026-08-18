-- Slice A: ticket type capability flags + stable status keys.
-- Idempotent: IF NOT EXISTS guards on DDL; status-key backfill only writes
-- WHERE status_key IS NULL (preserves any hand-edited value).

ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS requires_customer text NOT NULL DEFAULT 'true';
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS requires_scheduling text NOT NULL DEFAULT 'false';
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS requires_completion text NOT NULL DEFAULT 'false';
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS requires_invoicing text NOT NULL DEFAULT 'false';
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS terminal_behavior text NOT NULL DEFAULT 'close';
ALTER TABLE ticket_type_statuses ADD COLUMN IF NOT EXISTS status_key text;
CREATE INDEX IF NOT EXISTS ticket_type_statuses_key_idx ON ticket_type_statuses (ticket_type_id, status_key) WHERE status_key IS NOT NULL;

-- Capability flags for the six seeded ticket types (post-rename names).
UPDATE ticket_types SET requires_customer='false', requires_scheduling='false', requires_completion='false', requires_invoicing='false', terminal_behavior='close'   WHERE name = 'To-Do';
UPDATE ticket_types SET requires_customer='true',  requires_scheduling='true',  requires_completion='true',  requires_invoicing='true',  terminal_behavior='invoice' WHERE name = 'Estimate Request';
UPDATE ticket_types SET requires_customer='true',  requires_scheduling='true',  requires_completion='true',  requires_invoicing='true',  terminal_behavior='invoice' WHERE name = 'Project';
UPDATE ticket_types SET requires_customer='true',  requires_scheduling='true',  requires_completion='true',  requires_invoicing='true',  terminal_behavior='invoice' WHERE name = 'Extra Billable';
UPDATE ticket_types SET requires_customer='true',  requires_scheduling='false', requires_completion='false', requires_invoicing='false', terminal_behavior='close'   WHERE name = 'Invoice';
UPDATE ticket_types SET requires_customer='false', requires_scheduling='false', requires_completion='false', requires_invoicing='false', terminal_behavior='handoff' WHERE name = 'RFP Request';

-- Stable machine keys for every seeded status.
UPDATE ticket_type_statuses s
SET status_key = v.key
FROM (VALUES
  ('To-Do', 'Open', 'new'),
  ('To-Do', 'Done', 'closed_won'),
  ('Invoice', 'Pending Invoice', 'pending_invoice'),
  ('Invoice', 'Invoiced', 'invoiced'),
  ('Estimate Request', 'New', 'new'),
  ('Estimate Request', 'Estimating', 'estimating'),
  ('Estimate Request', 'Create Proposal', 'proposal_draft'),
  ('Estimate Request', 'Proposal Sent', 'proposal_sent'),
  ('Estimate Request', 'Decision Received', 'decision_received'),
  ('Estimate Request', 'Ready to Schedule', 'ready_to_schedule'),
  ('Estimate Request', 'Work Completed', 'work_completed'),
  ('Estimate Request', 'Ready for Billing', 'ready_for_billing'),
  ('Estimate Request', 'Invoicing', 'invoicing'),
  ('Estimate Request', 'Closed - Lost', 'closed_lost'),
  ('Project', 'New', 'new'),
  ('Project', 'Ready to Schedule', 'ready_to_schedule'),
  ('Project', 'Scheduled', 'scheduled'),
  ('Project', 'Work Completed', 'work_completed'),
  ('Project', 'Ready for Billing', 'ready_for_billing'),
  ('Project', 'Invoicing', 'invoicing'),
  ('Project', 'Closed - Lost', 'closed_lost'),
  ('Extra Billable', 'New', 'new'),
  ('Extra Billable', 'Ready to Schedule', 'ready_to_schedule'),
  ('Extra Billable', 'In Progress', 'in_progress'),
  ('Extra Billable', 'Work Completed', 'work_completed'),
  ('Extra Billable', 'Ready for Billing', 'ready_for_billing'),
  ('Extra Billable', 'Done', 'closed_won'),
  ('RFP Request', 'Request Received', 'new'),
  ('RFP Request', 'Review Requirements', 'reviewing'),
  ('RFP Request', 'Request Missing Info', 'waiting_info'),
  ('RFP Request', 'Pre-Proposal Walk', 'site_visit'),
  ('RFP Request', 'Proposal Drafted', 'proposal_draft'),
  ('RFP Request', 'Proposal Submitted', 'proposal_sent'),
  ('RFP Request', 'Awaiting Response', 'awaiting_response'),
  ('RFP Request', 'Decision Received', 'decision_received'),
  ('RFP Request', 'Closed - Lost', 'closed_lost'),
  ('RFP Request', 'Awarded', 'awarded'),
  ('RFP Request', 'Contract Executed', 'contract_executed'),
  ('RFP Request', 'CRM Setup Complete', 'crm_setup'),
  ('RFP Request', 'Maps Requested', 'maps_requested'),
  ('RFP Request', 'Maps Uploaded', 'maps_uploaded'),
  ('RFP Request', 'Contacts Collected', 'contacts_collected'),
  ('RFP Request', 'Post-Award Kickoff', 'kickoff'),
  ('RFP Request', 'Handoff to Operations', 'handoff_ops'),
  ('RFP Request', 'Closed - Won', 'closed_won')
) AS v(type_name, status_name, key)
JOIN ticket_types t ON t.name = v.type_name
WHERE s.ticket_type_id = t.id
  AND s.name = v.status_name
  AND s.status_key IS NULL;
