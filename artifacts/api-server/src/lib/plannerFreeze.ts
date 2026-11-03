import type { Express, Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { companies, weeklyScheduleTemplates, scheduleBlocks } from "@workspace/db";
import { db, inTransaction } from "../db";
import type { UserWithContext } from "../auth";
import { lockVisitCompany, VisitError } from "./visitSync";
import { PLANNER_REPLACED_MESSAGE } from "./routeReporting";
import { failure } from "../routes/visits";

export async function assertPlannerWritable(companyId: string) {
  const [company] = await db.select({ imported: companies.routesImportedAt }).from(companies).where(eq(companies.id, companyId));
  if (!company) throw new VisitError(404, "NOT_FOUND");
  if (company.imported) throw new VisitError(409, "PLANNER_REPLACED", PLANNER_REPLACED_MESSAGE);
}

/** Import and legacy writes cannot race: test the durable import marker under
 * the SAME scheduling gate as the importer, not just in a UI or middleware.
 */
export async function withPlannerWrite<T>(companyId: string, work: () => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await lockVisitCompany(tx, companyId);
    return inTransaction(tx, async () => {
      await assertPlannerWritable(companyId);
      return work();
    });
  });
}
export async function withPlannerTemplateWrite<T>(templateId: string, work: () => Promise<T>): Promise<T> {
  const [template] = await db.select({ companyId: weeklyScheduleTemplates.companyId }).from(weeklyScheduleTemplates).where(eq(weeklyScheduleTemplates.id, templateId));
  if (!template) throw new VisitError(404, "NOT_FOUND");
  return withPlannerWrite(template.companyId, work);
}
export async function withPlannerBlockWrite<T>(blockId: string, work: () => Promise<T>): Promise<T> {
  const [block] = await db.select({ templateId: scheduleBlocks.templateId }).from(scheduleBlocks).where(eq(scheduleBlocks.id, blockId));
  if (!block) throw new VisitError(404, "NOT_FOUND");
  return withPlannerTemplateWrite(block.templateId, work);
}

/** Covers alternate/duplicate endpoints before their older role checks.
 * Settings -> Crews column linking is intentionally NOT a planner-only write.
 */
export function registerPlannerFreeze(app: Express) {
  app.use(async (req, res, next) => {
    const path = req.path;
    const planner = /^\/api\/schedule-templates(?:\/|$)/.test(path)
      || /^\/api\/schedule-blocks(?:\/|$)/.test(path)
      || /^\/api\/maintenance-visit-configs(?:\/|$)/.test(path)
      || /^\/api\/customers\/[^/]+\/maintenance-config\/?$/.test(path);
    if (!planner || ["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    try {
      if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId)
        throw new VisitError(409, "COMPANY_CHANGED", "Company changed. Reload the planner.");
      await assertPlannerWritable(user.activeCompanyId);
      // Old block endpoints lacked company validation. Do not allow a different
      // company's still-editable planner to be used to bypass the freeze.
      if (/^\/api\/schedule-blocks\//.test(path)) {
        const id = path.split("/")[3];
        const [block] = await db.select({ id: scheduleBlocks.id }).from(scheduleBlocks).innerJoin(weeklyScheduleTemplates,
          eq(weeklyScheduleTemplates.id, scheduleBlocks.templateId)).where(and(eq(scheduleBlocks.id, id), eq(weeklyScheduleTemplates.companyId, user.activeCompanyId)));
        if (!block) throw new VisitError(404, "NOT_FOUND");
      }
      next();
    } catch (error) { failure(res, error); }
  });
}

/** Covers a request admitted just BEFORE an import committed, then rejected
 * under the gate in storage. It must still return the same JSON contract.
 */
export function registerPlannerFreezeErrors(app: Express) {
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof VisitError && error.code === "PLANNER_REPLACED") {
      res.status(409).json({ error: error.code, message: PLANNER_REPLACED_MESSAGE });
      return;
    }
    next(error);
  });
}
