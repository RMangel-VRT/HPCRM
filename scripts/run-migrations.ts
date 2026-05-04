import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { pool } from "../server/db";

/**
 * SQL migration files that existed before schema_migrations tracking was
 * introduced. On the very first run against an **existing** database (one
 * where the app tables are already present), these files are recorded as
 * already-applied so they are not re-executed. Any file whose name does NOT
 * match this pattern (i.e. 0008+) is executed normally in the same run.
 *
 * Pattern: filenames whose four-digit prefix is 0001–0007.
 * 0000 is included because it is the base schema migration.
 */
const LEGACY_MIGRATION_PATTERN = /^000[0-7]/;

/**
 * Tables that are guaranteed to exist once the base migration (0000) has been
 * applied. All of them must be present to confirm this is an existing database.
 * Using multiple sentinels avoids false-positives from a partial schema state.
 */
const SENTINEL_TABLES = ["campaign_checklist_tasks", "campaign_items", "customers"];

async function ensureMigrationsTable(
  client: Awaited<ReturnType<typeof pool.connect>>
): Promise<boolean> {
  const checkResult = await client.query<{ existed: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'schema_migrations'
    ) AS existed
  `);
  const existed = checkResult.rows[0].existed;
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return !existed;
}

async function isExistingDatabase(
  client: Awaited<ReturnType<typeof pool.connect>>
): Promise<boolean> {
  const result = await client.query<{ found: boolean }>(`
    SELECT (
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ) = $2 AS found
  `, [SENTINEL_TABLES, SENTINEL_TABLES.length]);
  return result.rows[0].found;
}

async function getAppliedMigrations(
  client: Awaited<ReturnType<typeof pool.connect>>
): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    `SELECT filename FROM schema_migrations`
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function recordMigration(
  client: Awaited<ReturnType<typeof pool.connect>>,
  filename: string
): Promise<void> {
  await client.query(
    `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
    [filename]
  );
}

async function executeMigration(
  client: Awaited<ReturnType<typeof pool.connect>>,
  migrationsDir: string,
  file: string
): Promise<void> {
  const sqlContent = readFileSync(join(migrationsDir, file), "utf-8");
  const statements = sqlContent
    .split(/;[ \t]*(?:--[^\n]*)?\n|-->[ \t]*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Running migration: ${file}`);
  await client.query("BEGIN");
  try {
    for (const stmt of statements) {
      await client.query(stmt);
    }
    await recordMigration(client, file);
    await client.query("COMMIT");
    console.log(`  ✓ ${file}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`  ✗ ${file}: ${err}`);
    throw err;
  }
}

async function runMigrations() {
  const migrationsDir = join(process.cwd(), "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = await pool.connect();

  try {
    const tableWasNew = await ensureMigrationsTable(client);

    if (tableWasNew) {
      // The tracking table did not exist. Determine whether this is an upgrade
      // of an existing database or a fresh install.
      const existingDb = await isExistingDatabase(client);

      if (existingDb) {
        // Existing database: migrations 0000–0007 were already applied before
        // tracking was introduced. Backfill their filenames so they are not
        // re-executed. Files outside the legacy range (0008+) will run below.
        const legacyFiles = files.filter((f) => LEGACY_MIGRATION_PATTERN.test(f));
        console.log(
          `schema_migrations table created — backfilling ${legacyFiles.length} legacy migration(s) on existing database...`
        );
        await client.query("BEGIN");
        for (const file of legacyFiles) {
          await recordMigration(client, file);
          console.log(`  ✓ backfilled (not re-run): ${file}`);
        }
        await client.query("COMMIT");
      } else {
        console.log(
          "schema_migrations table created on fresh database — all migrations will run normally."
        );
      }
    }

    // Fetch the current applied set (includes anything just backfilled above).
    const applied = await getAppliedMigrations(client);

    let ranAny = false;
    for (const file of files) {
      if (applied.has(file)) {
        if (!tableWasNew) {
          console.log(`Skipping already-applied migration: ${file}`);
        }
        continue;
      }
      await executeMigration(client, migrationsDir, file);
      ranAny = true;
    }

    if (!ranAny && !tableWasNew) {
      console.log("No new migrations to run.");
    }
    console.log("All migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((e) => {
  console.error(e);
  process.exit(1);
});
