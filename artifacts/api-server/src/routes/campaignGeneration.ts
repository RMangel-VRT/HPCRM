import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import type { UserWithContext } from "../auth";
import { companyToday } from "../lib/companyDay";
import { runCampaignGeneration } from "../lib/campaignReconcile";
import { logger } from "../lib/logger";
import { campaignMembershipStatus } from "../lib/campaignMembership";
import { GenerateContractCampaignsResponse, PreviewCampaignGenerationResponse, GetCampaignMembershipStatusResponse } from "@workspace/api-zod";

function authorize(req: Request, res: Response, write: boolean) {
  res.set("Cache-Control", "no-store");
  if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
  const user = req.user as UserWithContext;
  if (!user.isSuperAdminBool && !(write ? user.accessRole === "admin" : ["admin", "office"].includes(user.accessRole))) {
    res.status(403).json({ message: "Forbidden" }); return;
  }
  if (!user.activeCompanyId) { res.status(403).json({ message: "No active company" }); return; }
  // Require a bound initiating company for writes; a mutable session must not
  // redirect a queued Generate to a different company.
  if ((write && !req.get("X-Company-Id")) || (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId)) {
    res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
  }
  return { companyId: user.activeCompanyId, userId: user.id };
}
export function campaignGenerationYear(raw: unknown, today = companyToday()) {
  const current = Number(today.slice(0, 4));
  return z.string().regex(/^\d{4}$/).transform(Number)
    .refine(year => year === current || year === current + 1, "Choose this Colorado year or next year").parse(raw);
}
export function registerCampaignGenerationRoutes(app: Express) {
  app.get("/api/campaign-generation/:year/status", async (req, res): Promise<void> => {
    const context = authorize(req, res, false); if (!context) return;
    try {
      const year = campaignGenerationYear(req.params.year);
      res.json(GetCampaignMembershipStatusResponse.parse(await campaignMembershipStatus(context.companyId, year)));
    } catch (err) {
      if (err instanceof z.ZodError) { res.status(400).json({ message: "Choose this Colorado year or next year" }); return; }
      logger.error({ err }, "Campaign membership status failed");
      res.status(500).json({ message: "Unable to load membership status." });
    }
  });
  for (const write of [false, true]) {
    app[write ? "post" : "get"](`/api/campaign-generation/:year${write ? "" : "/preview"}`, async (req, res): Promise<void> => {
      const context = authorize(req, res, write); if (!context) return;
      try {
        const year = campaignGenerationYear(req.params.year);
        if (write) z.object({ confirm: z.literal(true) }).strict().parse(req.body);
        const report = await runCampaignGeneration(context.companyId, year, { dryRun: !write, userId: context.userId });
        res.json((write ? GenerateContractCampaignsResponse : PreviewCampaignGenerationResponse).parse(report));
      } catch (err) {
        if (err instanceof z.ZodError) { res.status(400).json({ message: err.issues.map(i => i.message).join("; ") }); return; }
        const code = (err as { code?: string; cause?: { code?: string } })?.cause?.code ?? (err as { code?: string })?.code;
        if (["23505", "40001", "40P01", "23503"].includes(code ?? "")) {
          res.status(409).json({ message: "Campaign work changed concurrently. Refresh the preview and try again." }); return;
        }
        logger.error({ err }, "Campaign generation failed");
        res.status(500).json({ message: "Unable to generate campaigns. No changes were saved." });
      }
    });
  }
}
