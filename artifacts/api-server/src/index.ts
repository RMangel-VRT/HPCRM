import { pool } from "@workspace/db";
import { checkSchemaDrift, formatDriftReport } from "@workspace/db/check-drift";
import app from "./app";
import { logger } from "./lib/logger";
import { registerRoutes } from "./routes/routes";
import { requeueInterruptedBackfills } from "./services/mailboxBackfillService";

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

// Note: production schema (including Postgres extensions) is NOT this
// process's responsibility. Replit's Publish flow diffs the dev schema
// against prod and applies it; per the `database` skill, the application
// must NOT do startup-time DDL or self-heal production. Required
// extensions (currently just pg_trgm for the customers trigram index)
// must be installed once per database via Replit's production DB tools
// or, in dev, by running migration 0014_ensure_pg_trgm.sql.
registerRoutes(app)
  .then((server) => {
    server.listen(port, () => {
      logger.info({ port }, "Server listening");
      void warnIfSchemaDrift();
      void requeueInterruptedBackfills();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to bootstrap server");
    process.exit(1);
  });
