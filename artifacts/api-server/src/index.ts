import app from "./app";
import { logger } from "./lib/logger";
import { registerRoutes } from "./routes/routes";

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
  });
}).catch((err) => {
  logger.error({ err }, "Failed to register routes");
  process.exit(1);
});
