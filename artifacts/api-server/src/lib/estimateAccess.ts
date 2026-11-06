import type { RequestHandler } from "express";
import type { UserWithContext } from "../auth";
import { accessRole } from "../../../../lib/db/src/accessRole";

/** Supplied company is an expectation, never an authorization grant. */
export const estimateAccess: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
  const user = req.user as UserWithContext;
  if (!user.activeCompanyId || !["admin", "office"].includes(accessRole(user.activeRole))) {
    res.status(403).json({ message: "Access denied" }); return;
  }
  if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
    res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
  }
  next();
};
