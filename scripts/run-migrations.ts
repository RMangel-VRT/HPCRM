import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { pool } from "../server/db";

async function runMigrations() {
  const migrationsDir = join(process.cwd(), "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    // Split on Drizzle's statement separator (or just run as a single transaction)
    const statements = sql
      .split(/;[ \t]*(?:--[^\n]*)?\n|-->[ \t]*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`Running migration: ${file}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const stmt of statements) {
        await client.query(stmt);
      }
      await client.query("COMMIT");
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ✗ ${file}: ${err}`);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log("All migrations complete.");
  await pool.end();
}

runMigrations().catch((e) => {
  console.error(e);
  process.exit(1);
});
