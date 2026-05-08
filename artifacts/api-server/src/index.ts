import { pool } from "@workspace/db";
import { checkSchemaDrift, formatDriftReport } from "@workspace/db/check-drift";
import app from "./app";
import { logger } from "./lib/logger";
import { registerRoutes } from "./routes/routes";

async function ensureRequiredExtensions(): Promise<void> {
  // The Drizzle schema declares a trigram index on customers.name using
  // `gin_trgm_ops`, which requires the pg_trgm extension. Production Publish
  // can fail building that index if pg_trgm isn't installed on the target DB.
  // Create it idempotently on every boot. If the role lacks privilege (some
  // managed Postgres setups install extensions out-of-band), log and continue
  // — querying will surface the real problem at index-creation time.
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    logger.info("Ensured required Postgres extensions (pg_trgm)");
  } catch (err) {
    logger.warn(
      { err },
      "Failed to ensure pg_trgm extension; continuing boot. " +
        "If schema migrations rely on gin_trgm_ops, they will fail until " +
        "pg_trgm is installed on this database (CREATE EXTENSION pg_trgm).",
    );
  }
}

async function warnIfSchemaDrift(): Promise<void> {
  try {
    const report = await checkSchemaDrift(pool);
    const formatted = formatDriftReport(report);
    if (formatted) {
      logger.warn({ drift: report }, formatted);
    }
  } catch (err) {
    logger.warn({ err }, "Schema drift check failed; continuing boot");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function bootstrap(): Promise<void> {
  // Install required Postgres extensions BEFORE doing anything that might run
  // schema DDL (drift check, downstream migrations, or index creation). Doing
  // this before server.listen also guarantees the extension is present before
  // any traffic — and before any external deploy step that races with boot.
  await ensureRequiredExtensions();
  const server = await registerRoutes(app);
  server.listen(port, () => {
    logger.info({ port }, "Server listening");
    void warnIfSchemaDrift();
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to bootstrap server");
  process.exit(1);
});
