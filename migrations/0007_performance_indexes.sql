-- Phase 1: Performance indexes
-- Enable pg_trgm for trigram-based substring searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Customers: trigram index for name search
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON customers USING gin (lower(name) gin_trgm_ops);

-- Contacts: lookup by customer and company
CREATE INDEX IF NOT EXISTS contacts_company_id_idx ON contacts (company_id);
CREATE INDEX IF NOT EXISTS contacts_customer_id_idx ON contacts (customer_id);

-- Notes: lookup by customer and company
CREATE INDEX IF NOT EXISTS notes_company_id_idx ON notes (company_id);
CREATE INDEX IF NOT EXISTS notes_customer_id_idx ON notes (customer_id);

-- Contract status history: lookup by contract
CREATE INDEX IF NOT EXISTS contract_status_history_contract_id_idx ON contract_status_history (contract_id);

-- Campaign items: lookup by campaign and customer
CREATE INDEX IF NOT EXISTS campaign_items_campaign_id_idx ON campaign_items (campaign_id);
CREATE INDEX IF NOT EXISTS campaign_items_company_id_idx ON campaign_items (company_id);
CREATE INDEX IF NOT EXISTS campaign_items_customer_id_idx ON campaign_items (customer_id);

-- Email logs: lookup by company, customer, ticket
CREATE INDEX IF NOT EXISTS email_logs_company_id_idx ON email_logs (company_id);
CREATE INDEX IF NOT EXISTS email_logs_customer_id_idx ON email_logs (customer_id);
CREATE INDEX IF NOT EXISTS email_logs_ticket_id_idx ON email_logs (ticket_id);

-- Proposals: lookup by company and customer
CREATE INDEX IF NOT EXISTS proposals_company_id_idx ON proposals (company_id);
CREATE INDEX IF NOT EXISTS proposals_customer_id_idx ON proposals (customer_id);

-- Equipment tickets: lookup by company and equipment
CREATE INDEX IF NOT EXISTS equipment_tickets_company_id_idx ON equipment_tickets (company_id);
CREATE INDEX IF NOT EXISTS equipment_tickets_equipment_id_idx ON equipment_tickets (equipment_id);

-- Ticket comment mentions: lookup by comment
CREATE INDEX IF NOT EXISTS ticket_comment_mentions_comment_id_idx ON ticket_comment_mentions (comment_id);

-- Communications: lookup by status, sent_by_id, follow_up_status (company/customer already indexed)
CREATE INDEX IF NOT EXISTS communications_status_idx ON communications (status);
CREATE INDEX IF NOT EXISTS communications_sent_by_id_idx ON communications (sent_by_id);
CREATE INDEX IF NOT EXISTS communications_follow_up_status_idx ON communications (follow_up_status);
CREATE INDEX IF NOT EXISTS communications_company_created_at_idx ON communications (company_id, created_at DESC);

-- Tickets: contract lookup and time-range scans
CREATE INDEX IF NOT EXISTS tickets_contract_id_idx ON tickets (contract_id);
CREATE INDEX IF NOT EXISTS tickets_company_created_at_idx ON tickets (company_id, created_at DESC);

-- Email logs: time-range scans per company
CREATE INDEX IF NOT EXISTS email_logs_company_created_at_idx ON email_logs (company_id, created_at DESC);

-- Tickets: equipment-scoped lookups for shop_todo tickets
CREATE INDEX IF NOT EXISTS tickets_equipment_id_idx ON tickets (equipment_id) WHERE equipment_id IS NOT NULL;

-- Campaign items: property-scoped lookups (conditional: only useful when property_id is populated)
CREATE INDEX IF NOT EXISTS campaign_items_property_id_idx ON campaign_items (property_id) WHERE property_id IS NOT NULL;
