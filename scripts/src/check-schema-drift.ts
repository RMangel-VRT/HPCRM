import pg from "pg";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";
import { checkSchemaDrift, formatDriftReport } from "@workspace/db/check-drift";

const WORKSPACE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CANONICAL_DRIZZLE_CONFIG = resolve(
  WORKSPACE_ROOT,
  "lib/db/drizzle.config.ts",
);
const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  "attached_assets",
  "dist",
  "node_modules",
]);
const DRIZZLE_CONFIG_PATTERN = /^drizzle\.config\.(?:[cm]?[jt]s)$/;
const LEGACY_PUBLISH_DISCOVERY_FILES = [
  ".migration-backup/drizzle.config.ts",
  ".migration-backup/shared/schema.ts",
  ".migration-backup/package.json",
  ".migration-backup/package-lock.json",
  ".migration-backup/migrations/meta/0000_snapshot.json",
  ".migration-backup/migrations/meta/_journal.json",
];

function findDrizzleConfigs(directory: string): string[] {
  const configs: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        configs.push(...findDrizzleConfigs(join(directory, entry.name)));
      }
      continue;
    }

    if (DRIZZLE_CONFIG_PATTERN.test(entry.name)) {
      configs.push(resolve(directory, entry.name));
    }
  }

  return configs;
}

function assertSingleDrizzleConfig(): void {
  const unexpected = findDrizzleConfigs(WORKSPACE_ROOT).filter(
    (configPath) => configPath !== CANONICAL_DRIZZLE_CONFIG,
  );

  if (unexpected.length > 0) {
    const paths = unexpected
      .map((configPath) => `  - ${relative(WORKSPACE_ROOT, configPath)}`)
      .join("\n");
    throw new Error(
      `Unexpected Drizzle config(s) can confuse Replit Publish schema discovery:\n${paths}\n` +
        "Keep lib/db/drizzle.config.ts as the only active Drizzle config.",
    );
  }
}

function assertNoLegacyPublishSchema(): void {
  const staleFiles = LEGACY_PUBLISH_DISCOVERY_FILES.filter((filePath) =>
    existsSync(resolve(WORKSPACE_ROOT, filePath)),
  );

  if (staleFiles.length > 0) {
    const paths = staleFiles.map((filePath) => `  - ${filePath}`).join("\n");
    throw new Error(
      `Legacy project files can make Replit Publish generate destructive schema drops:\n${paths}\n` +
        "Keep only the SQL files under .migration-backup/migrations/.",
    );
  }
}

async function main(): Promise<void> {
  assertSingleDrizzleConfig();
  assertNoLegacyPublishSchema();

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const report = await checkSchemaDrift(pool);
    const formatted = formatDriftReport(report);
    if (formatted) {
      // eslint-disable-next-line no-console
      console.warn(formatted);
      process.exitCode = 1;
    } else {
      // eslint-disable-next-line no-console
      console.log("Schema is in sync with Drizzle declarations.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Schema drift check failed:", err);
  process.exit(1);
});
