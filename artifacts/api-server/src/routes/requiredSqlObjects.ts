import { readFile } from "node:fs/promises";
import type { Express } from "express";
import { GetRequiredSqlObjectsResponse } from "@workspace/api-zod";
import { readRequiredSqlObjects } from "@workspace/db/required-sql-objects";
import type { UserWithContext } from "../auth";
import { pool } from "../db";
import { logger } from "../lib/logger";

export function registerRequiredSqlObjectsRoutes(app: Express) {
  app.get("/api/settings/database/sql-objects", async (req, res): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    const actor = req.user as UserWithContext;
    if (!actor.activeCompanyId || !(actor.accessRole === "admin" || actor.isSuperAdminBool)) {
      res.status(403).json({ message: "Administrator required" });
      return;
    }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== actor.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." });
      return;
    }
    try {
      const statuses = await readRequiredSqlObjects(pool);
      const files = new Map<string, Promise<string>>();
      const objects = await Promise.all(statuses.map(async status => {
        const { id, label, present, kind, sqlFile } = status;
        if (present) return { id, label, present, kind, sqlFile };
        // Only registry-owned filenames are read; nothing comes from the request.
        if (!files.has(sqlFile)) {
          if (!/^[a-z0-9-]+\.sql$/.test(sqlFile)) throw new Error("Invalid reviewed SQL filename");
          files.set(sqlFile, readFile(new URL(`./assets/production-sql/${sqlFile}`, import.meta.url), "utf8"));
        }
        return { id, label, present, kind, sqlFile, remediationSql: await files.get(sqlFile) };
      }));
      res.json(GetRequiredSqlObjectsResponse.parse({ objects }));
    } catch {
      (req.log ?? logger).error("REQUIRED_SQL_OBJECT_STATUS_UNAVAILABLE");
      res.status(503).json({ message: "Database object status could not be checked" });
    }
  });
}
