import type { Express } from "express";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { flags } from "@workspace/db";
import { customerContractProjector, loadCustomerContractInputs, projectContractSummary, snowCoveredCustomerIds } from "../lib/customerContractSummary";

export const CUSTOMER_CONTRACT_READERS = new Set(["admin", "office", "field_manager", "chemical_manager", "field", "irrigation_manager", "mapping", "landscape_supervisor", "crew_supervisor"]);
export function registerCustomerContractSummary(app: Express) {
  app.get(["/api/customers/:id/contract-summary", "/api/customers/snow-covered"], async (req, res): Promise<void> => {
    if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId || !CUSTOMER_CONTRACT_READERS.has(user.accessRole)) { res.status(403).json({ message: "Forbidden" }); return; }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    res.set("Cache-Control", "private, no-store");
    if (!req.params.id) { res.json({ customerIds: [...await snowCoveredCustomerIds(db, user.activeCompanyId)] }); return; }
    const commercial = ["admin", "office"].includes(user.accessRole);
    const data = await loadCustomerContractInputs(db, user.activeCompanyId, commercial);
    const summary = customerContractProjector(data)(String(req.params.id));
    if (!summary) { res.status(404).json({ message: "Customer not found" }); return; }
    const projected = projectContractSummary(summary, commercial);
    // Status-only projection from the flag owner. Never infer an open question
    // from missing trigger text or expose the privileged flag inbox to managers.
    const snowTerms = ["admin", "office", "field_manager"].includes(user.accessRole)
      ? summary.current.filter(t => t.line === "snow" || t.line === "both") : [];
    const keys = snowTerms.map(t => `snow-triggers:${t.termId}`);
    const rows = keys.length ? await db.select({ sourceKey: flags.sourceKey, status: flags.status })
      .from(flags).where(and(eq(flags.companyId, user.activeCompanyId), inArray(flags.sourceKey, keys)))
      .orderBy(desc(flags.updatedAt), desc(flags.id)) : [];
    const latest = new Map<string, string>();
    for (const row of rows) if (row.sourceKey && !latest.has(row.sourceKey)) latest.set(row.sourceKey, row.status);
    res.json({ ...projected, ...(["admin", "office", "field_manager"].includes(user.accessRole) ? {
      snowTriggerFlags: snowTerms.flatMap(t => {
        const status = latest.get(`snow-triggers:${t.termId}`);
        return status ? [{ termId: t.termId, status }] : [];
      }),
    } : {}) });
  });
}
