import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import type { UserWithContext } from "../auth";
import { CalendarConflict, listServiceCalendar, loadStartingServiceCalendar, replaceServiceCalendar } from "../services/serviceCalendar";
import { logger } from "../lib/logger";

function authorize(req: Request, res: Response, write = false) {
  if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
  const user = req.user as UserWithContext;
  if (!user.isSuperAdminBool && !(write ? user.accessRole === "admin" : ["admin", "office"].includes(user.accessRole))) {
    res.status(403).json({ message: "Forbidden" }); return;
  }
  if (!user.activeCompanyId) { res.status(403).json({ message: "No active company" }); return; }
  if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
    res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
  }
  res.set("Cache-Control", "no-store");
  return user;
}
function failure(res: Response, err: unknown) {
  if (err instanceof z.ZodError) { res.status(400).json({ message: err.issues.map(i => i.message).join("; ") }); return; }
  const code = (err as { cause?: { code?: string }; code?: string })?.cause?.code ?? (err as { code?: string })?.code;
  if (err instanceof CalendarConflict || ["23505", "40001", "40P01"].includes(code ?? "")) {
    res.status(409).json({ message: err instanceof CalendarConflict ? err.message : "Calendar changed concurrently. Reload before saving." }); return;
  }
  logger.error({ err }, "Service calendar operation failed");
  res.status(500).json({ message: "Unable to update service calendar" });
}
export function registerServiceCalendarRoutes(app: Express) {
  app.get("/api/service-calendar", async (req, res) => {
    const user = authorize(req, res); if (!user) return;
    try { res.json(await listServiceCalendar(user.activeCompanyId)); } catch (err) { failure(res, err); }
  });
  app.put("/api/service-calendar/:serviceKey", async (req, res) => {
    const user = authorize(req, res, true); if (!user) return;
    try { res.json(await replaceServiceCalendar(user.activeCompanyId, user.id, String(req.params.serviceKey), req.body)); }
    catch (err) { failure(res, err); }
  });
  app.post("/api/service-calendar/load-starting", async (req, res) => {
    const user = authorize(req, res, true); if (!user) return;
    try {
      z.object({}).strict().parse(req.body ?? {});
      res.json(await loadStartingServiceCalendar(user.activeCompanyId, user.id));
    } catch (err) { failure(res, err); }
  });
}
