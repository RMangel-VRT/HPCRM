import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import { accessRole } from "../../../../lib/db/src/accessRole";
import { bulkAssignAccountManager, loadAccountManagerContext, resolveAccountManager } from "../services/accountManagers";
import { setupFailure } from "./customerSetup";

export function registerAccountManagerRoutes(app: Express) {
  function allowed(req: Request, res: Response, write = false) {
    res.setHeader("Cache-Control", "no-store");
    if (!req.isAuthenticated()) { res.sendStatus(401); return false; }
    if (write && !["admin", "office"].includes(accessRole(req.user.activeRole))) { res.sendStatus(403); return false; }
    // Required expectation prevents a queued request being redirected by a company switch.
    if (req.get("X-Company-Id") !== req.user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return false;
    }
    return true;
  }
  app.get("/api/customer-account-managers", async (req, res) => {
    if (!allowed(req, res)) return;
    const context = await loadAccountManagerContext(req.user!.activeCompanyId);
    res.json({ managers: [...context.managers.values()],
      assignments: Object.fromEntries([...context.customers.values()].map(c => [c.id, resolveAccountManager(c, context)])) });
  });
  app.post("/api/customers/account-manager", async (req, res) => {
    if (!allowed(req, res, true)) return;
    const parsed = z.object({ customerIds: z.array(z.string().min(1)).min(1).max(10000),
      accountManagerId: z.string().min(1).nullable() }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(422).json({ message: "Invalid account manager assignment." }); return; }
    try { res.json(await bulkAssignAccountManager(req.user!.activeCompanyId, parsed.data.customerIds, parsed.data.accountManagerId)); }
    catch (error) { setupFailure(res, error); }
  });
}
