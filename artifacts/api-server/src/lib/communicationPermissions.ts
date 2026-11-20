import type { RequestHandler } from "express";
import type { UserWithContext } from "../auth";

export const COMM_VIEW_ROLES_SET = ["admin", "office"];
export const COMM_LIST_ROLES_SET = ["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor"];
const roles = {
  view: COMM_VIEW_ROLES_SET, manage_templates: ["admin", "office"], send: ["admin", "office"], manage_automations: ["admin"],
};

export function requireCommPermission(level: keyof typeof roles): RequestHandler {
  return (req, res, next) => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (!roles[level].includes(user.accessRole)) {
      res.status(403).json({
        error: "Access denied",
        message: `You do not have permission to perform this action. Required permission: ${level}.`,
        requiredPermission: level,
      });
      return;
    }
    next();
  };
}
