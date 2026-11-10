import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import type { UserWithContext } from "../auth";
import { serviceProgramSchema } from "../../../../lib/db/src/serviceProgramContracts";
import { SCOPE_CATALOG, campaignServices } from "../shared/contractCatalog";
import { clearServiceStandard, deleteServiceProgram, listServicePrograms, ProgramConflict, saveServiceProgram } from "../services/servicePrograms";
import { logger } from "../lib/logger";

export const programInput = serviceProgramSchema(SCOPE_CATALOG);
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
function serviceKey(value: unknown) {
  return z.string().refine(k => campaignServices().some(s => s.key === k), "Choose a campaign service").parse(value);
}
function failure(res: Response, err: unknown) {
  if (err instanceof z.ZodError) { res.status(400).json({ message: err.issues.map(i => i.message).join("; ") }); return; }
  const code = (err as { code?: string; cause?: { code?: string } })?.cause?.code ?? (err as { code?: string })?.code;
  if (err instanceof ProgramConflict || ["23505", "40001", "40P01"].includes(code ?? "")) {
    res.status(409).json({ message: err instanceof ProgramConflict ? err.message : "Timing changed concurrently. Reload and try again." }); return;
  }
  logger.error({ err }, "Service timing operation failed");
  res.status(500).json({ message: "Unable to update service timing" });
}
export function registerServiceProgramRoutes(app: Express) {
  app.get("/api/service-programs", async (req, res) => {
    const user = authorize(req, res); if (!user) return;
    try { res.json(await listServicePrograms(user.activeCompanyId)); } catch (err) { failure(res, err); }
  });
  // Register the literal standard route before the count route.
  app.delete("/api/service-programs/:serviceKey/standard", async (req, res) => {
    const user = authorize(req, res, true); if (!user) return;
    try {
      await clearServiceStandard(user.activeCompanyId, serviceKey(req.params.serviceKey), user.id);
      res.status(204).send();
    } catch (err) { failure(res, err); }
  });
  app.put("/api/service-programs/:serviceKey/:rounds", async (req, res) => {
    const user = authorize(req, res, true); if (!user) return;
    try {
      const body = z.object({ monthSpread: z.unknown(), isStandard: z.boolean() }).strict().parse(req.body);
      const rounds = z.string().regex(/^(?:[1-9]|1[0-9]|2[0-4])$/).transform(Number).parse(req.params.rounds);
      const input = programInput.parse({ ...body, serviceKey: serviceKey(req.params.serviceKey), rounds });
      res.json(await saveServiceProgram(user.activeCompanyId, user.id, input));
    } catch (err) { failure(res, err); }
  });
  app.delete("/api/service-programs/:serviceKey/:rounds", async (req, res) => {
    const user = authorize(req, res, true); if (!user) return;
    try {
      const rounds = z.string().regex(/^(?:[1-9]|1[0-9]|2[0-4])$/).transform(Number).parse(req.params.rounds);
      await deleteServiceProgram(user.activeCompanyId, serviceKey(req.params.serviceKey), rounds);
      res.status(204).send();
    } catch (err) { failure(res, err); }
  });
}
