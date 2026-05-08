import { pool } from "@workspace/db";
import { checkSchemaDrift, formatDriftReport } from "@workspace/db/check-drift";
import app from "./app";
import { logger } from "./lib/logger";
import { registerRoutes } from "./routes/routes";

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

registerRoutes(app).then((server) => {
  server.listen(port, () => {
    logger.info({ port }, "Server listening");
    void warnIfSchemaDrift();
  });
}).catch((err) => {
  logger.error({ err }, "Failed to register routes");
  process.exit(1);
});
