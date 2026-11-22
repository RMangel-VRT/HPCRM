import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { REQUIRED_SQL_OBJECTS, readRequiredSqlObjects } from "@workspace/db/required-sql-objects";
import { auditSqlObjectMigrations } from "./sql-object-migration-audit";

async function main() {
  const directory = new URL("../../.migration-backup/migrations/", import.meta.url);
  const migrations = readdirSync(directory).filter(file => file.endsWith(".sql"))
    .map(filename => ({ filename, sql: readFileSync(new URL(filename, directory), "utf8") }));
  const errors = auditSqlObjectMigrations(migrations, REQUIRED_SQL_OBJECTS);
  const sqlDir = new URL("../../docs/database/production-sql/", import.meta.url);
  for (const object of REQUIRED_SQL_OBJECTS) {
    if (!existsSync(fileURLToPath(new URL(object.sqlFile, sqlDir)))) {
      errors.push(`Missing reviewed SQL file: ${object.sqlFile}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be set");
  const pool = new pg.Pool({ connectionString });
  try {
    // The catalog helper performs only a static, parameterized SELECT.
    const statuses = await readRequiredSqlObjects(pool);
    for (const object of statuses) {
      console.log(`${object.present ? "Present" : "Missing"}: ${object.label} (${object.migration})`);
      if (!object.present) {
        console.error(`Review docs/database/production-sql/${object.sqlFile}; nothing was installed.`);
        process.exitCode = 1;
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "SQL-only object check failed");
  process.exitCode = 1;
});
