/**
 * migrationRunner.ts — shared migration logic for the API server's admin UI routes.
 *
 * Resolution strategy for MIGRATIONS_DIR:
 *   1. MIGRATIONS_DIR env var (highest priority — works in any layout or container)
 *   2. Monorepo default: walk upward from __dirname (up to 8 levels) looking for
 *      a directory that contains .migration-backup/migrations/.  This handles both
 *      the bundled esbuild output (artifacts/api-server/dist/ — 3 levels below root)
 *      and ts-node / tsx dev mode (artifacts/api-server/src/lib/ — 4 levels below root)
 *      without needing to know the exact depth.
 *   3. Final fallback: 3 levels up from __dirname (used if the walk finds nothing).
 *
 * The .sql files are NOT bundled into the esbuild output — they are read from disk
 * at runtime.  The deployment artifact must therefore include .migration-backup/migrations/
 * alongside the compiled JS (handled by the platform's publish flow which copies the
 * whole workspace).
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename);

/**
 * Resolve the migrations directory.
 * Walks upward from this file's location (up to 8 levels) and returns the first
 * directory where `.migration-backup/migrations` exists.  Falls back to 3 levels
 * up if nothing is found, so the caller gets a deterministic path even on a fresh
 * clone where the directory might not exist yet.
 */
function resolveMigrationsDir(): string {
  if (process.env["MIGRATIONS_DIR"]) {
    return process.env["MIGRATIONS_DIR"];
  }
  let dir = __dirname_local;
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, ".migration-backup", "migrations");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: 3 levels up from __dirname_local (workspace root for the dist/ bundle)
  return resolve(__dirname_local, "..", "..", "..", ".migration-backup", "migrations");
}

export const MIGRATIONS_DIR = resolveMigrationsDir();

const TRACKING_TABLE = "_applied_sql_migrations";
const AUDIT_TABLE = "_migration_audit_log";

export interface MigrationFileResult {
  filename: string;
  status: "applied" | "already_applied" | "failed" | "drifted";
  appliedAt?: string;
  error?: string;
  checksum: string;
}

export interface MigrationRunResult {
  files: MigrationFileResult[];
  drifted: string[];
  appliedCount: number;
  pendingCount: number;
}

interface AppliedRow {
  filename: string;
  checksum: string;
  applied_at: string;
}

function fileChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function listSqlFiles(): string[] {
  try {
    return readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}

async function ensureInfrastructure(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
      id text PRIMARY KEY DEFAULT gen_random_uuid(),
      run_at timestamptz NOT NULL DEFAULT NOW(),
      run_by_user_id text NOT NULL,
      run_by_email text NOT NULL,
      files_applied text[] NOT NULL DEFAULT '{}',
      files_failed text[] NOT NULL DEFAULT '{}',
      files_drifted text[] NOT NULL DEFAULT '{}'
    )
  `);
}

async function getApplied(client: pg.PoolClient): Promise<Map<string, AppliedRow>> {
  const res = await client.query<AppliedRow>(
    `SELECT filename, checksum, applied_at FROM ${TRACKING_TABLE}`,
  );
  return new Map(res.rows.map((r) => [r.filename, r]));
}

/**
 * Read applied rows without creating any tables — returns empty map if the
 * tracking table does not yet exist (Postgres error 42P01 = undefined_table).
 * This keeps GET /api/admin/migrations strictly read-only (no DDL).
 */
async function getAppliedSafe(client: pg.PoolClient): Promise<Map<string, AppliedRow>> {
  try {
    return await getApplied(client);
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === "42P01") {
      // Tracking table does not exist yet — treat all files as pending
      return new Map();
    }
    throw err;
  }
}

/**
 * Dry-run: reads all migration files, compares against the tracking table.
 * Returns the full status list without making any writes.
 * Strictly read-only — no DDL or INSERT is executed.
 */
export async function listMigrations(databaseUrl: string): Promise<MigrationRunResult> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const applied = await getAppliedSafe(client);
    const filenames = listSqlFiles();
    const files: MigrationFileResult[] = [];
    const drifted: string[] = [];
    let pendingCount = 0;

    for (const filename of filenames) {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      const sum = fileChecksum(content);
      const row = applied.get(filename);

      if (row) {
        if (row.checksum !== sum) {
          drifted.push(filename);
          files.push({ filename, status: "drifted", appliedAt: row.applied_at, checksum: sum });
        } else {
          files.push({ filename, status: "already_applied", appliedAt: row.applied_at, checksum: sum });
        }
      } else {
        pendingCount++;
        files.push({ filename, status: "applied", checksum: sum });
        // Rename status to "pending" for display — we reuse the result type so
        // the consumer can distinguish: status === "applied" means it would be applied.
      }
    }

    return { files, drifted, appliedCount: 0, pendingCount };
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Apply all pending migrations in filename order.
 * Each migration is wrapped in a transaction.  Stops on first failure.
 * Writes an audit log row on completion.
 */
export async function applyMigrations(
  databaseUrl: string,
  actor: { userId: string; email: string },
): Promise<MigrationRunResult> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await ensureInfrastructure(client);
    const applied = await getApplied(client);
    const filenames = listSqlFiles();
    const files: MigrationFileResult[] = [];
    const drifted: string[] = [];
    const filesApplied: string[] = [];
    const filesFailed: string[] = [];
    const filesDrifted: string[] = [];
    let appliedCount = 0;
    let pendingCount = 0;

    for (const filename of filenames) {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      const sum = fileChecksum(content);
      const row = applied.get(filename);

      if (row) {
        if (row.checksum !== sum) {
          drifted.push(filename);
          filesDrifted.push(filename);
          files.push({ filename, status: "drifted", appliedAt: row.applied_at, checksum: sum });
        } else {
          files.push({ filename, status: "already_applied", appliedAt: row.applied_at, checksum: sum });
        }
        continue;
      }

      pendingCount++;
      try {
        await client.query("BEGIN");
        await client.query(content);
        const insertRes = await client.query<{ applied_at: string }>(
          `INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2) RETURNING applied_at`,
          [filename, sum],
        );
        await client.query("COMMIT");
        const ts = insertRes.rows[0]?.applied_at ?? new Date().toISOString();
        files.push({ filename, status: "applied", appliedAt: ts, checksum: sum });
        filesApplied.push(filename);
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        const msg = err instanceof Error ? err.message : String(err);
        files.push({ filename, status: "failed", checksum: sum, error: msg });
        filesFailed.push(filename);
        // Stop on first failure — remaining files won't be attempted
        break;
      }
    }

    // Write audit row
    await client.query(
      `INSERT INTO ${AUDIT_TABLE} (run_by_user_id, run_by_email, files_applied, files_failed, files_drifted)
       VALUES ($1, $2, $3, $4, $5)`,
      [actor.userId, actor.email, filesApplied, filesFailed, filesDrifted],
    );

    return { files, drifted, appliedCount, pendingCount };
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Baseline all pending migrations — writes tracking rows without executing any SQL.
 * Use when the database already contains the schema objects described by the migration
 * files and you only need the tracking table to catch up (e.g. first-time adoption of
 * the tracker on an existing database).
 *
 * Files already tracked (including drifted files) are left untouched.
 * An audit row is written at the end so the action appears in the apply history.
 */
export async function baselineMigrations(
  databaseUrl: string,
  actor: { userId: string; email: string },
): Promise<{ baselinedCount: number; baselinedFiles: string[] }> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await ensureInfrastructure(client);
    const applied = await getApplied(client);
    const filenames = listSqlFiles();
    const baselinedFiles: string[] = [];

    for (const filename of filenames) {
      if (applied.has(filename)) {
        continue;
      }
      const content = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      const sum = fileChecksum(content);
      await client.query(
        `INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING`,
        [filename, sum],
      );
      baselinedFiles.push(filename);
    }

    await client.query(
      `INSERT INTO ${AUDIT_TABLE} (run_by_user_id, run_by_email, files_applied, files_failed, files_drifted)
       VALUES ($1, $2, $3, '{}', '{}')`,
      [actor.userId, actor.email, baselinedFiles],
    );

    return { baselinedCount: baselinedFiles.length, baselinedFiles };
  } finally {
    client.release();
    await pool.end();
  }
}

/** Audit log rows for display in the UI. */
export interface AuditRow {
  id: string;
  runAt: string;
  runByEmail: string;
  filesApplied: string[];
  filesFailed: string[];
  filesDrifted: string[];
}

export async function getAuditLog(databaseUrl: string): Promise<AuditRow[]> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await ensureInfrastructure(client);
    const res = await client.query<{
      id: string;
      run_at: string;
      run_by_email: string;
      files_applied: string[];
      files_failed: string[];
      files_drifted: string[];
    }>(
      `SELECT id, run_at, run_by_email, files_applied, files_failed, files_drifted
       FROM ${AUDIT_TABLE}
       ORDER BY run_at DESC
       LIMIT 50`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      runAt: r.run_at,
      runByEmail: r.run_by_email,
      filesApplied: r.files_applied,
      filesFailed: r.files_failed,
      filesDrifted: r.files_drifted,
    }));
  } finally {
    client.release();
    await pool.end();
  }
}
