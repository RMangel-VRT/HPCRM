import type { Express } from "express";
import { and, eq, type SQL } from "drizzle-orm";
import { campaignItems, campaigns, visits } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import type { UserWithContext } from "../auth";

export class CampaignGuardError extends Error {
  readonly statusCode = 409;
}
export const membershipMessage = "Membership follows contracts. Change the property's contract scope.";
export const campaignIdentityFields = ["source", "serviceKey", "roundMonth", "roundSeq", "service_key", "round_month", "round_seq"];
const shapeFields = ["title", "windowStart", "windowEnd", "window_start", "window_end", "category", "subtype", "seasonId", "season_id"];
export function campaignWriteConflict(source: string, body: Record<string, unknown>, action: "create" | "patch" | "membership" | "delete" | "season"): string | undefined {
  if (campaignIdentityFields.some(k => Object.hasOwn(body, k))) return "Campaign identity is engine-owned and cannot be supplied here.";
  if (source !== "contract") return;
  if (action === "membership") return membershipMessage;
  if (action === "delete") return "Generated campaigns cannot be deleted. Archive the campaign instead.";
  if (action === "season" || shapeFields.some(k => Object.hasOwn(body, k)))
    return "Generated campaign shape follows contracts. Only status, assignees, description and notification template can be edited.";
  return undefined;
}
export async function assertNoCampaignVisitLinks(filter: SQL, reader: Pick<AppTransaction, "select"> = db) {
  const linked = await reader.select({ id: visits.id }).from(visits)
    .innerJoin(campaignItems, and(eq(campaignItems.id, visits.campaignItemId), eq(campaignItems.companyId, visits.companyId)))
    .where(filter).limit(1);
  if (linked.length) throw new CampaignGuardError("Recorded campaign work cannot be deleted. Archive or deactivate this record instead.");
}
/** Reject ownership fields BEFORE legacy allow-lists can silently discard them.
 * These handlers do not replace existing permissions or mutate any records.
 */
export function registerCampaignIdentityGuards(app: Express) {
  app.use("/api/campaigns", async (req, res, next) => {
    if (!["POST", "PATCH", "DELETE"].includes(req.method) || !req.isAuthenticated?.()) { next(); return; }
    const user = req.user as UserWithContext;
    const match = /^\/([^/]+)(?:\/(items)(?:\/([^/]+))?|\/(season))?\/?$/.exec(req.path);
    const isCreate = req.method === "POST" && /^\/?$/.test(req.path);
    if (!match && !isCreate) { next(); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const [campaign] = match ? await db.select().from(campaigns)
      .where(and(eq(campaigns.id, match[1]), eq(campaigns.companyId, user.activeCompanyId))) : [];
    if (match && !campaign) { next(); return; } // Existing route owns 404/role policy.
    const membership = !!match?.[2] && (req.method === "POST" || req.method === "DELETE");
    const itemPatch = !!match?.[3] && req.method === "PATCH";
    const action = isCreate ? "create" : membership ? "membership" : match?.[4] ? "season" : req.method === "DELETE" ? "delete" : "patch";
    let message = campaignWriteConflict(campaign?.source ?? "manual", body, action);
    if (itemPatch) {
      // Generated items derive service identity solely from their campaign.
      const fields = [...campaignIdentityFields, "campaignId", "campaign_id", "companyId", "company_id", "customerId", "customer_id", "propertyId", "property_id"];
      if (campaign?.source === "contract") fields.push("servicePlanCategory", "service_plan_category");
      message = fields.some(k => Object.hasOwn(body, k)) ? membershipMessage : undefined;
    }
    if (message) { res.status(409).json({ message, error: message }); return; }
    next();
  });
}
