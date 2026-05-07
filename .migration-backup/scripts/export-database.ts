import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// Tables in dependency order (parents before children)
const TABLES_IN_ORDER = [
  // Core independent tables
  "companies",
  "users",
  "settings",
  "company_users",
  
  // Property management
  "property_management_companies",
  "property_managers",
  "property_manager_emails",
  "property_manager_phones",
  
  // Customers and related
  "customers",
  "contacts",
  "notes",
  "customer_rate_sheets",
  "customer_map_layers",
  "customer_map_documents",
  
  // Contracts
  "contracts",
  "contract_services",
  "contract_documents",
  "contract_monthly_amounts",
  "contract_status_history",
  
  // Contract builder
  "contract_templates",
  "contract_builder_documents",
  "contract_builder_sections",
  "contract_builder_variables",
  
  // Ticketing
  "ticket_types",
  "ticket_type_statuses",
  "ticket_type_fields",
  "ticket_sources",
  "tickets",
  "ticket_status_history",
  "ticket_field_values",
  "ticket_comments",
  "ticket_links",
  "ticket_notifications",
  
  // Scheduling
  "maintenance_crews",
  "weekly_schedule_templates",
  "maintenance_visit_configs",
  "schedule_blocks",
  
  // Equipment
  "equipment",
  "equipment_tickets",
  "equipment_ticket_status_history",
  "equipment_files",
];

function escapeValue(value: any): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (Array.isArray(value)) {
    // Handle PostgreSQL arrays
    const escaped = value.map(v => escapeValue(v)).join(",");
    return `ARRAY[${escaped}]`;
  }
  if (typeof value === "object") {
    // Handle JSON objects
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  // String - escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function exportTable(tableName: string): Promise<string> {
  try {
    const result = await db.execute(sql.raw(`SELECT * FROM "${tableName}"`));
    const rows = result.rows as Record<string, any>[];
    
    if (rows.length === 0) {
      return `-- Table ${tableName}: No data\n`;
    }
    
    const columns = Object.keys(rows[0]);
    let output = `-- Table ${tableName}: ${rows.length} rows\n`;
    
    for (const row of rows) {
      const values = columns.map(col => escapeValue(row[col]));
      output += `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING;\n`;
    }
    
    return output + "\n";
  } catch (error: any) {
    return `-- Table ${tableName}: Error - ${error.message}\n`;
  }
}

async function main() {
  console.log("Starting database export...\n");
  
  const outputDir = path.join(process.cwd(), "database-export");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let fullExport = `-- High Plains Property Maintenance CRM
-- Database Export
-- Generated: ${new Date().toISOString()}
-- 
-- Instructions:
-- 1. Create a production database in Replit
-- 2. Run the schema migration first (npm run db:push)
-- 3. Then run this SQL script in the production database SQL runner
--
-- Note: Uses ON CONFLICT DO NOTHING to safely skip existing records

`;

  for (const table of TABLES_IN_ORDER) {
    console.log(`Exporting ${table}...`);
    const tableData = await exportTable(table);
    fullExport += tableData;
  }
  
  // Skip session table (not needed for production)
  fullExport += `-- Note: Session table not exported (sessions are transient)\n`;
  
  const outputPath = path.join(outputDir, "full-export.sql");
  fs.writeFileSync(outputPath, fullExport);
  
  console.log(`\nExport complete!`);
  console.log(`File saved to: ${outputPath}`);
  console.log(`\nNext steps:`);
  console.log(`1. Go to the Database tool in Replit`);
  console.log(`2. Create a Production Database`);
  console.log(`3. Publish your app to run schema migrations`);
  console.log(`4. Open the production database SQL runner`);
  console.log(`5. Copy and paste the contents of full-export.sql`);
  console.log(`6. Run the SQL to import your data`);
  
  await pool.end();
}

main().catch(console.error);
