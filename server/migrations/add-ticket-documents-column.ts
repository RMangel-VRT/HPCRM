import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Starting migration: Add documents columns to tickets table");

  await db.execute(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS documents text[]`);
  console.log("Added documents column");

  await db.execute(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS document_names text[]`);
  console.log("Added document_names column");

  console.log("Migration complete");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
