import pg from "pg";
import { checkSchemaDrift, formatDriftReport } from "@workspace/db/check-drift";

async function main(): Promise<void> {
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
