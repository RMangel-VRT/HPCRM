import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function listMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
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

async function applyMigrationFile(
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

export interface MigrationFileStatus {
  filename: string;
  status: "applied" | "skipped" | "baselined" | "drifted";
}

export interface RunMigrationsResult {
  files: MigrationFileStatus[];
  drifted: string[];
  appliedCount: number;
  baselinedCount: number;
  skippedCount: number;
}

/**
 * Core migration runner — shared between this CLI and any other caller.
 *
 * @param options.apply        If true, applies pending migrations. If false, dry-run only.
 * @param options.migrationsDir  Absolute path to the directory of .sql files.
 * @param options.databaseUrl  Postgres connection string.
 * @param options.baselineExisting  If true, uses the --baseline-existing strategy on duplicate-object errors.
 * @param options.log  Optional function to receive progress messages (defaults to console.log).
 */
export async function runMigrations(options: {
  apply: boolean;
  migrationsDir: string;
  databaseUrl: string;
  baselineExisting?: boolean;
  log?: (msg: string) => void;
}): Promise<RunMigrationsResult> {
  const { apply, migrationsDir, databaseUrl, baselineExisting = false, log = () => {} } = options;

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await ensureTrackingTable(client);
    const applied = await getApplied(client);
    const files = listMigrationFiles(migrationsDir);

    const result: RunMigrationsResult = {
      files: [],
      drifted: [],
      appliedCount: 0,
      baselinedCount: 0,
      skippedCount: 0,
    };

    for (const filename of files) {
      const content = readFileSync(join(migrationsDir, filename), "utf8");
      const sum = checksum(content);
      const prior = applied.get(filename);

      if (prior) {
        if (prior !== sum) {
          result.drifted.push(filename);
          result.files.push({ filename, status: "drifted" });
        } else {
          result.files.push({ filename, status: "skipped" });
        }
        result.skippedCount += 1;
        continue;
      }

      if (!apply) {
        // Dry-run: report as "would be applied" without writing
        result.files.push({ filename, status: "applied" });
        result.appliedCount += 1;
        continue;
      }

      log(`${baselineExisting ? "Trying" : "Applying"} migration: ${filename}`);
      const outcome = await applyMigrationFile(client, filename, content, baselineExisting);
      if (outcome === "applied") {
        result.appliedCount += 1;
        result.files.push({ filename, status: "applied" });
      } else {
        result.baselinedCount += 1;
        result.files.push({ filename, status: "baselined" });
        log(`  -> baselined (already present in database)`);
      }
    }

    return result;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }

  const migrationsDir = resolve(__dirname, "..", "..", ".migration-backup", "migrations");
  const baselineExisting = process.argv.includes("--baseline-existing");

  const result = await runMigrations({
    apply: true,
    migrationsDir,
    databaseUrl,
    baselineExisting,
    // eslint-disable-next-line no-console
    log: (msg) => console.log(msg),
  });

  // eslint-disable-next-line no-console
  console.log(
    `Migration run complete: ${result.appliedCount} applied, ${result.baselinedCount} baselined, ${result.skippedCount} already up-to-date.`,
  );

  if (result.drifted.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `WARNING: ${result.drifted.length} migration file(s) have changed since being applied:\n  - ${result.drifted.join("\n  - ")}\n` +
        "These were NOT re-applied. Create a new migration file instead of editing applied ones.",
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed:", err);
  process.exit(1);
});
