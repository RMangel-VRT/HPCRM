import type { Express, RequestHandler } from "express";
import type { UserWithContext } from "../auth";
import { canWriteCrewWorksheets } from "../lib/crewWorksheetAccess";
import { estimateAccess } from "../lib/estimateAccess";

const retired: RequestHandler = (_req, res) => {
  res.status(409).json({
    error: "PROPOSALS_RETIRED",
    message: "Proposals are retired. Use the estimate builder to prepare and send estimates, add photos and plants, or generate crew worksheets.",
    estimateBuilderPath: "/dashboard/estimates/builder",
  });
};

/** Keep the old HTTP endpoints callable, but never run their former writes. */
export function registerRetiredProposalWrites(app: Express) {
  const base = "/api/proposals/:id";
  app.post([
    "/api/proposals",
    `${base}/files/upload-url`,
    `${base}/files`,
    `${base}/files/reorder`,
    `${base}/files/bulk-delete`,
    `${base}/plant-items`,
    `${base}/plant-items/reorder`,
    `${base}/finalize`,
    `${base}/crew-worksheets`,
  ], estimateAccess, retired);
  app.patch([base, `${base}/files/:fileId`, `${base}/plant-items/:itemId`], estimateAccess, retired);
  // The authorized whole-proposal DELETE is deliberately not retired.
  app.delete([`${base}/files/:fileId`, `${base}/plant-items/:itemId`], estimateAccess, retired);

  // The historic worksheet alias formerly accepted additional crew roles.
  app.post("/api/crew-worksheets/from-proposal/:proposalId", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.isAuthenticated?.()) { res.status(401).send("Not authenticated"); return; }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId || !canWriteCrewWorksheets(user.activeRole)) {
      res.status(403).send("Insufficient permissions"); return;
    }
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    next();
  }, retired);
}
