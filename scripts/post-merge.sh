#!/bin/bash
set -e
npm install

# Apply schema changes via raw SQL for tables that need creation or column additions
# This avoids interactive prompts from drizzle-kit for new tables
node -e "
const { Pool } = require('@neondatabase/serverless');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Ensure communication_threads table has subject_root column
    await client.query(\`
      ALTER TABLE communication_threads RENAME COLUMN subject TO subject_root
    \`).catch(() => {});

    // Add missing communications columns
    await client.query(\`
      ALTER TABLE communications
        ADD COLUMN IF NOT EXISTS template_id varchar,
        ADD COLUMN IF NOT EXISTS thread_id varchar,
        ADD COLUMN IF NOT EXISTS in_reply_to varchar,
        ADD COLUMN IF NOT EXISTS parent_communication_id varchar,
        ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound',
        ADD COLUMN IF NOT EXISTS internal_notes text,
        ADD COLUMN IF NOT EXISTS scheduled_for timestamp,
        ADD COLUMN IF NOT EXISTS follow_up_due_at timestamp,
        ADD COLUMN IF NOT EXISTS follow_up_status text NOT NULL DEFAULT 'none'
    \`).catch(() => {});

    // Fix communication_links column names if needed
    await client.query(\`ALTER TABLE communication_links RENAME COLUMN linked_entity_type TO linked_type\`).catch(() => {});
    await client.query(\`ALTER TABLE communication_links RENAME COLUMN linked_entity_id TO linked_id\`).catch(() => {});

    console.log('Raw SQL schema sync complete');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
"

# Push schema changes - use printf to auto-accept the non-destructive prompts
printf 'n\nn\nn\nn\nn\nn\nn\nn\nn\nn\n' | npx drizzle-kit push 2>&1 || true
