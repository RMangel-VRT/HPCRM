import type { Express } from "express";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { loadCustomerListSummary } from "../services/customerListSummary";

/** Commercial list projection is intentionally not added to the web field list. */
export function registerCustomerListSummary(app: Express) {
  app.get("/api/customers/list-summary", async (req, res): Promise<void> => {
    if (!req.isAuthenticated?.()) { res.status(401).send("Not authenticated"); return; }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId || !["admin", "office"].includes(user.accessRole)) {
      res.status(403).send("Forbidden"); return;
    }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    if (typeof req.query.ids !== "string") { res.status(400).json({ message: "Customer ids are required" }); return; }
    const ids = [...new Set(req.query.ids.split(","))];
    if (!ids.length || ids.length > 200 || ids.some(id => !id || id.length > 100 || id.trim() !== id)) {
      res.status(400).json({ message: "Supply between 1 and 200 customer ids" }); return;
    }
    res.set("Cache-Control", "private, no-store");
    res.json(await loadCustomerListSummary(db, user.activeCompanyId, ids));
  });
}
