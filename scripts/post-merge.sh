#!/bin/bash
set -e
npm install

# Apply schema changes via raw SQL for tables that need creation or column additions
# This avoids interactive prompts from drizzle-kit for new tables/columns
node -e "
const { Pool } = require('@neondatabase/serverless');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run(client, sql) {
  try { await client.query(sql); } catch(e) { /* ignore if already exists */ }
}

async function main() {
  const client = await pool.connect();
  try {
    // Rename columns from old names to new names (idempotent — catch if already renamed)
    await run(client, \`ALTER TABLE communication_threads RENAME COLUMN subject TO subject_root\`);
    await run(client, \`ALTER TABLE communication_links RENAME COLUMN linked_entity_type TO linked_type\`);
    await run(client, \`ALTER TABLE communication_links RENAME COLUMN linked_entity_id TO linked_id\`);

    // Add missing communication_templates columns
    await run(client, \`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general_outreach'\`);
    await run(client, \`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS description text\`);
    await run(client, \`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true\`);
    await run(client, \`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS default_communication_type text\`);
    await run(client, \`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS created_by_id varchar REFERENCES users(id) ON DELETE SET NULL\`);
    await run(client, \`ALTER TABLE communication_templates ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false\`);

    // Create communication_audit_log table if missing (Slice 10)
    await run(client, \`
      CREATE TABLE IF NOT EXISTS communication_audit_log (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        communication_id varchar REFERENCES communications(id) ON DELETE SET NULL,
        template_id varchar REFERENCES communication_templates(id) ON DELETE SET NULL,
        action_type text NOT NULL,
        action_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
        action_details jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )
    \`);

    // Add missing communications columns (threading + delivery)
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS template_id varchar REFERENCES communication_templates(id) ON DELETE SET NULL\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS thread_id varchar REFERENCES communication_threads(id) ON DELETE SET NULL\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS in_reply_to varchar\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS parent_communication_id varchar\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS internal_notes text\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS scheduled_for timestamp\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS follow_up_due_at timestamp\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS delivery_provider text\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS provider_message_id text\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS failure_reason text\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS recipient_email text\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS customer_name text\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS contact_name text\`);
    await run(client, \`ALTER TABLE communications ADD COLUMN IF NOT EXISTS sent_by_name text\`);
    // Columns with NOT NULL default — catch if already exists with different default
    try { await client.query(\`ALTER TABLE communications ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound'\`); } catch(e) {}
    try { await client.query(\`ALTER TABLE communications ADD COLUMN IF NOT EXISTS follow_up_status text NOT NULL DEFAULT 'none'\`); } catch(e) {}
    try { await client.query(\`ALTER TABLE communications ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending'\`); } catch(e) {}

    // Add unique constraints needed by drizzle schema (idempotent)
    await run(client, \`ALTER TABLE companies ADD CONSTRAINT companies_slug_unique UNIQUE (slug)\`);
    await run(client, \`ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)\`);
    await run(client, \`ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone)\`);
    await run(client, \`ALTER TABLE company_users ADD CONSTRAINT company_users_user_id_company_id_unique UNIQUE (user_id, company_id)\`);
    await run(client, \`ALTER TABLE settings ADD CONSTRAINT settings_company_id_unique UNIQUE (company_id)\`);
    await run(client, \`ALTER TABLE contract_templates ADD CONSTRAINT contract_templates_section_key_unique UNIQUE (section_key)\`);
    await run(client, \`ALTER TABLE contract_builder_sections ADD CONSTRAINT contract_builder_sections_document_id_template_id_unique UNIQUE (document_id, template_id)\`);
    await run(client, \`ALTER TABLE contract_builder_variables ADD CONSTRAINT contract_builder_variables_document_id_variable_key_unique UNIQUE (document_id, variable_key)\`);
    await run(client, \`ALTER TABLE contract_monthly_amounts ADD CONSTRAINT contract_monthly_amounts_contract_id_month_unique UNIQUE (contract_id, month)\`);
    await run(client, \`ALTER TABLE ticket_field_values ADD CONSTRAINT ticket_field_values_ticket_id_field_id_unique UNIQUE (ticket_id, field_id)\`);
    await run(client, \`ALTER TABLE ticket_links ADD CONSTRAINT ticket_links_source_ticket_id_target_ticket_id_link_type_unique UNIQUE (source_ticket_id, target_ticket_id, link_type)\`);
    await run(client, \`ALTER TABLE customer_rate_sheets ADD CONSTRAINT customer_rate_sheets_customer_id_unique UNIQUE (customer_id)\`);
    await run(client, \`ALTER TABLE customer_rate_sheets ADD CONSTRAINT customer_rate_sheets_customer_id_company_id_unique UNIQUE (customer_id, company_id)\`);
    await run(client, \`ALTER TABLE proposals ADD CONSTRAINT proposals_proposal_number_unique UNIQUE (proposal_number)\`);
    await run(client, \`ALTER TABLE proposal_versions ADD CONSTRAINT proposal_versions_proposal_id_version_number_unique UNIQUE (proposal_id, version_number)\`);

    console.log('Raw SQL schema sync complete');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
"

# The startup migration on first boot handles remaining schema sync via the app server
echo "Post-merge schema sync complete"
