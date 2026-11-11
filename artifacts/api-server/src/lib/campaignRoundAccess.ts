import { and, eq, or } from "drizzle-orm";
import { campaignItems, campaignCrews, campaignCrewMembers, crews, type Campaign } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";

export const roundOffice = (user: UserWithContext) => ["admin", "office"].includes(user.accessRole);
// Irrigation managers had no legacy all-campaign read privilege. Their new
// started-team access must use the same item projection as other crew roles.
export const roundField = (user: UserWithContext) => ["field", "landscape_supervisor", "crew_supervisor", "irrigation_manager"].includes(user.activeRole);
export const roundAssigned = (user: UserWithContext, campaign: Pick<Campaign, "assignedToId" | "assignedToId2">) =>
  campaign.assignedToId === user.id || campaign.assignedToId2 === user.id;

export async function roundTeamIds(user: UserWithContext, campaign: Pick<Campaign, "id" | "source" | "startedAt" | "companyId">) {
  if (campaign.source !== "contract" || !campaign.startedAt) return [];
  const rows = await db.select({ id: campaignCrews.id }).from(campaignCrews)
    .innerJoin(crews, and(eq(crews.id, campaignCrews.crewId), eq(crews.companyId, campaign.companyId), eq(crews.isActive, true)))
    .leftJoin(campaignCrewMembers, eq(campaignCrewMembers.campaignCrewId, campaignCrews.id))
    .where(and(eq(campaignCrews.companyId, user.activeCompanyId), eq(campaignCrews.campaignId, campaign.id),
      or(eq(crews.supervisorUserId, user.id), eq(campaignCrews.leaderUserId, user.id), eq(campaignCrewMembers.userId, user.id))));
  return [...new Set(rows.map(r => r.id))];
}
/** Preserve assigned-user access. Crew-based access is additive, start-gated,
 * and item-scoped. Existing action-role checks still run at every endpoint. */
export async function canAccessGeneratedRound(user: UserWithContext, campaign: Campaign, itemId?: string) {
  if (campaign.source !== "contract") return false;
  if (roundAssigned(user, campaign)) return true;
  const ids = await roundTeamIds(user, campaign);
  if (!itemId) return ids.length > 0;
  const [item] = await db.select({ teamId: campaignItems.assignedCampaignCrewId }).from(campaignItems)
    .where(and(eq(campaignItems.id, itemId), eq(campaignItems.campaignId, campaign.id),
      eq(campaignItems.companyId, user.activeCompanyId)));
  return !!item?.teamId && ids.includes(item.teamId);
}
