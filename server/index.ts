import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, runStartupMigrations } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runDueDateNotifications } from "./due-date-notifications";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJson = "";

  if (app.get("env") !== "production") {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      try {
        capturedJson = JSON.stringify(body).slice(0, 200);
      } catch {
        capturedJson = "";
      }
      return originalJson(body);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const preview = capturedJson ? ` :: ${capturedJson}` : "";
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms${preview}`);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Startup migrations are gated behind RUN_STARTUP_MIGRATIONS=true.
  // In production, run `RUN_STARTUP_MIGRATIONS=true node dist/index.js` once
  // after each deployment, or use `npx tsx scripts/run-migrations.ts` for SQL migrations.
  if (process.env.RUN_STARTUP_MIGRATIONS === "true") {
    await runStartupMigrations();
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    // Start the due date notification service only in development
    // Autoscale deployments cannot run background tasks
    if (app.get("env") === "development") {
      runDueDateNotifications();
    } else {
      log("Due date notification service disabled in production (Autoscale)");
    }

    // PERF: automation rules are no longer evaluated on a setInterval.
    // Trigger evaluation by calling POST /api/_internal/run-automation-rules
    // with the x-cron-token header (set CRON_SECRET env var) from an external
    // scheduler (e.g., a cron job or Replit Scheduled Deployments).
    log("Automation rules evaluator: use POST /api/_internal/run-automation-rules from a scheduler");
  });
})();
