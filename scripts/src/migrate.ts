import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(
  __dirname,
  "..",
  "..",
  ".migration-backup",
  "migrations",
);

const TRACKING_TABLE = "_applied_sql_migrations";

interface AppliedRow {
  filename: string;
  checksum: string;
}

async function ensureTrackingTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(
  client: pg.PoolClient,
): Promise<Map<string, string>> {
  const res = await client.query<AppliedRow>(
    `SELECT filename, checksum FROM ${TRACKING_TABLE}`,
  );
  return new Map(res.rows.map((r) => [r.filename, r.checksum]));
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// Postgres error codes that indicate the object the migration is creating
// already exists — used by --baseline-existing to retrofit migration tracking
// against a database that was previously migrated by hand.
const ALREADY_EXISTS_CODES = new Set([
  "42P07", // duplicate_table
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "42710", // duplicate_object (constraint/index/etc.)
  "42723", // duplicate_function
  "42P16", // invalid_table_definition (some constraint cases)
]);

async function applyMigration(
  client: pg.PoolClient,
  filename: string,
  content: string,
  baselineExisting: boolean,
): Promise<"applied" | "baselined"> {
  await client.query("BEGIN");
  try {
    await client.query(content);
    await client.query(
      `INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2)`,
      [filename, checksum(content)],
    );
    await client.query("COMMIT");
    return "applied";
  } catch (err) {
    await client.query("ROLLBACK");
    const code =
      typeof err === "object" && err && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (baselineExisting && code && ALREADY_EXISTS_CODES.has(code)) {
      await client.query(
        `INSERT INTO ${TRACKING_TABLE} (filename, checksum)
         VALUES ($1, $2)
         ON CONFLICT (filename) DO NOTHING`,
        [filename, checksum(content)],
      );
      return "baselined";
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }

  const baselineExisting = process.argv.includes("--baseline-existing");

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await ensureTrackingTable(client);
    const applied = await getApplied(client);
    const files = listMigrationFiles();

    let appliedCount = 0;
    let baselinedCount = 0;
    let skippedCount = 0;
    const drifted: string[] = [];

    for (const filename of files) {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      const sum = checksum(content);
      const prior = applied.get(filename);
      if (prior) {
        if (prior !== sum) {
          drifted.push(filename);
        }
        skippedCount += 1;
        continue;
      }
      // eslint-disable-next-line no-console
      console.log(
        `${baselineExisting ? "Trying" : "Applying"} migration: ${filename}`,
      );
      const result = await applyMigration(
        client,
        filename,
        content,
        baselineExisting,
      );
      if (result === "applied") {
        appliedCount += 1;
      } else {
        baselinedCount += 1;
        // eslint-disable-next-line no-console
        console.log(`  -> baselined (already present in database)`);
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `Migration run complete: ${appliedCount} applied, ${baselinedCount} baselined, ${skippedCount} already up-to-date.`,
    );

    if (drifted.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `WARNING: ${drifted.length} migration file(s) have changed since being applied:\n  - ${drifted.join("\n  - ")}\n` +
          "These were NOT re-applied. Create a new migration file instead of editing applied ones.",
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed:", err);
  process.exit(1);
});
