import type { Express } from "express";
import type { UserWithContext } from "../auth";
import { storage } from "../storage";

/** Optional expectation on existing APIs. Authorization still comes from the session. */
export function registerTicketExpectedCompany(app: Express) {
  app.use(["/api/tickets", "/api/ticket-types"], (req, res, next) => {
    const expected = req.get("X-Company-Id");
    if (!expected) { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
    if (expected !== (req.user as UserWithContext).activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    next();
  });
  app.use("/api/ticket-types/:ticketTypeId", async (req, res, next) => {
    if (!req.get("X-Company-Id") || !req.isAuthenticated?.()) { next(); return; }
    const id = typeof req.params.ticketTypeId === "string" ? req.params.ticketTypeId : "";
    const type = await storage.getTicketTypeById(id, (req.user as UserWithContext).activeCompanyId);
    if (!type || type.companyId !== (req.user as UserWithContext).activeCompanyId) {
      res.status(404).json({ message: "Ticket type not found" }); return;
    }
    next();
  });
}
