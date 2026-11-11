import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import { campaigns, campaignItems, campaignCrews, crews, type Campaign } from "@workspace/db";
import { db, type AppTransaction } from "../db";
import { CrewLinkError } from "./crewLinks";
import { lockCampaignRoundCompany, denseRoundOrder } from "./campaignRoundWork";

export async function lockedRound(tx: AppTransaction, companyId: string, id: string) {
  await lockCampaignRoundCompany(tx, companyId);
  const [round] = await tx.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId))).for("update");
  if (!round) throw new CrewLinkError(404, "Round not found");
  if (round.source !== "contract") throw new CrewLinkError(409, "Only generated rounds use priority lists");
  if (round.status === "archived") throw new CrewLinkError(409, "Archived round is read-only");
  return round;
}
export async function previousRound(tx: AppTransaction, round: Campaign) {
  const [previous] = await tx.select().from(campaigns).where(and(eq(campaigns.companyId, round.companyId),
    eq(campaigns.source, "contract"), eq(campaigns.serviceKey, round.serviceKey!),
    or(lt(campaigns.roundMonth, round.roundMonth!), and(eq(campaigns.roundMonth, round.roundMonth!), lt(campaigns.roundSeq, round.roundSeq!)))))
    .orderBy(desc(campaigns.roundMonth), desc(campaigns.roundSeq)).limit(1);
  return previous;
}
/** Reuse standing identity, never copy roster/name ownership from another round. */
export async function inheritedRoundTeam(tx: AppTransaction, round: Campaign, customerId: string, fromRoundId?: string) {
  const [previous] = fromRoundId ? [{ id: fromRoundId }] : await tx.select({ id: campaigns.id }).from(campaigns)
    .innerJoin(campaignItems, and(eq(campaignItems.campaignId, campaigns.id),
      eq(campaignItems.companyId, round.companyId), eq(campaignItems.customerId, customerId)))
    .where(and(eq(campaigns.companyId, round.companyId), eq(campaigns.source, "contract"), eq(campaigns.serviceKey, round.serviceKey!),
      or(lt(campaigns.roundMonth, round.roundMonth!), and(eq(campaigns.roundMonth, round.roundMonth!), lt(campaigns.roundSeq, round.roundSeq!)))))
    .orderBy(desc(campaigns.roundMonth), desc(campaigns.roundSeq)).limit(1);
  if (!previous) return null;
  const [old] = await tx.select({ crew: crews }).from(campaignItems)
    .innerJoin(campaignCrews, and(eq(campaignCrews.id, campaignItems.assignedCampaignCrewId), eq(campaignCrews.companyId, round.companyId)))
    .innerJoin(crews, and(eq(crews.id, campaignCrews.crewId), eq(crews.companyId, round.companyId), eq(crews.isActive, true)))
    .where(and(eq(campaignItems.campaignId, previous.id), eq(campaignItems.companyId, round.companyId), eq(campaignItems.customerId, customerId)));
  if (!old) return null;
  const [present] = await tx.select().from(campaignCrews).where(and(eq(campaignCrews.campaignId, round.id),
    eq(campaignCrews.companyId, round.companyId), eq(campaignCrews.crewId, old.crew.id)));
  if (present) return present.id;
  const [team] = await tx.insert(campaignCrews).values({ companyId: round.companyId, campaignId: round.id,
    crewId: old.crew.id, name: old.crew.name, color: old.crew.color ?? "#2563eb", leaderUserId: old.crew.supervisorUserId }).returning();
  return team.id;
}
export async function moveRoundItems(companyId: string, roundId: string,
  input: { itemIds: string[]; assignedCampaignCrewId: string | null; beforeItemId?: string | null }) {
  return db.transaction(async tx => {
    await lockedRound(tx, companyId, roundId);
    const items = await tx.select().from(campaignItems).where(and(eq(campaignItems.companyId, companyId),
      eq(campaignItems.campaignId, roundId))).orderBy(asc(campaignItems.crewPosition), asc(campaignItems.id)).for("update");
    const selected = input.itemIds.map(id => items.find(i => i.id === id));
    if (selected.some(i => !i || i.status !== "pending")) throw new CrewLinkError(409, "Only unfinished properties in this round can be moved");
    if (input.assignedCampaignCrewId) {
      const [team] = await tx.select().from(campaignCrews).innerJoin(crews, and(eq(crews.id, campaignCrews.crewId),
        eq(crews.companyId, companyId), eq(crews.isActive, true))).where(and(eq(campaignCrews.id, input.assignedCampaignCrewId),
        eq(campaignCrews.companyId, companyId), eq(campaignCrews.campaignId, roundId)));
      if (!team) throw new CrewLinkError(400, "Choose an active linked crew in this round");
    }
    const remaining = items.filter(i => i.status === "pending" && i.assignedCampaignCrewId === input.assignedCampaignCrewId && !input.itemIds.includes(i.id));
    const at = input.beforeItemId ? remaining.findIndex(i => i.id === input.beforeItemId) : remaining.length;
    if (at < 0) throw new CrewLinkError(409, "Priority changed. Reload the crew lists");
    const ordered = [...remaining.slice(0, at).map(i => i.id), ...input.itemIds, ...remaining.slice(at).map(i => i.id)];
    for (const [position, id] of ordered.entries()) await tx.update(campaignItems)
      .set({ assignedCampaignCrewId: input.assignedCampaignCrewId, crewPosition: position, updatedAt: new Date() }).where(eq(campaignItems.id, id));
    await denseRoundOrder(tx, companyId, roundId);
    return { updated: selected.length };
  });
}
