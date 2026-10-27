import type { RequestHandler } from "express";
import type { UserWithContext } from "../auth";

/** Supplied company is an expectation, never an authorization grant. */
export const estimateAccess: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
  const user = req.user as UserWithContext;
  if (!user.activeCompanyId || !["admin", "office"].includes(user.activeRole)) {
    res.status(403).json({ message: "Access denied" }); return;
  }
  if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
    res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
};
