import type { Express } from "express";
import type { UserWithContext } from "../auth";
import { loadOpportunityBoard } from "./estimatesBoard";
import { loadLinkedContracts } from "../lib/rfpContracts";
import { db } from "../db";

export const BID_STAGES = [
  { key: "new", statusKeys: ["new"] },
  { key: "reviewing", statusKeys: ["reviewing", "waiting_info"] },
  { key: "walk", statusKeys: ["site_visit"] },
  { key: "proposal", statusKeys: ["proposal_draft"] },
  { key: "submitted", statusKeys: ["proposal_sent", "awaiting_response"] },
  { key: "decision", statusKeys: ["decision_received"] },
] as const;

export function loadBidsBoard(companyId: string, now = new Date()) {
  return loadOpportunityBoard(companyId, "rfp_request", BID_STAGES, now, ids => loadLinkedContracts(db, companyId, ids));
}

export function registerBidsBoardRoutes(app: Express): void {
  app.get("/api/bids/board", async (req, res) => {
    if (!req.isAuthenticated?.()) {
      res.status(401).json({ message: "Not authenticated" }); return;
    }
    const user = req.user as UserWithContext;
    if (!["admin", "office"].includes(user.activeRole) || !user.activeCompanyId) {
      res.status(403).json({ message: "Access denied" }); return;
    }
    try {
      res.json(await loadBidsBoard(user.activeCompanyId));
    } catch (error) {
      req.log?.error({ err: error }, "Failed to load bids board");
      res.status(500).json({ message: "Failed to load bids board" });
    }
  });
}
