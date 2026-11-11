import { and, asc, eq, sql } from "drizzle-orm";
import { campaignItems, campaigns, campaignCrews, crews, customers, visits, campaignChecklistTasks, campaignItemTaskCompletions, campaignChecklistAuditLog, type CampaignItem } from "@workspace/db";
import { db, inTransaction, type AppTransaction } from "../db";
import { companyDateString, companyNoon } from "./companyDay";
import { lockVisitCompany } from "./visitSync";
import { CrewLinkError } from "./crewLinks";
import { campaignRoundActor } from "./campaignRoundContext";
import { canAccessGeneratedRound, roundAssigned, roundField } from "./campaignRoundAccess";

/** Same gate as demand reconciliation. Campaign rows, then item IDs, are locked
 * in that order everywhere round lists or completions change. */
export async function lockCampaignRoundCompany(tx: AppTransaction, companyId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'campaign-gen:' + companyId}, 0))`);
}

/** Generated irrigation checklist changes, item completion and visit history
 * commit together; recompute under lock instead of trusting a stale checkbox. */
export async function toggleRoundChecklist(companyId: string, campaignId: string, itemId: string,
  taskId: string, userId: string, completedDate?: string) {
  return db.transaction(async tx => {
    await lockVisitCompany(tx, companyId);
    await lockCampaignRoundCompany(tx, companyId);
    const [campaign] = await tx.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId))).for("update");
    const [item] = await tx.select().from(campaignItems).where(and(eq(campaignItems.id, itemId),
      eq(campaignItems.campaignId, campaignId), eq(campaignItems.companyId, companyId))).for("update");
    if (!campaign || !item || campaign.source !== "contract") throw new CrewLinkError(404, "Round item not found");
    if (campaign.status === "archived" || item.status === "skipped") throw new CrewLinkError(409, "This item is read-only");
    const tasks = await tx.select().from(campaignChecklistTasks).where(eq(campaignChecklistTasks.campaignId, campaignId));
    if (!tasks.some(t => t.id === taskId)) throw new CrewLinkError(404, "Checklist task not found in this round");
    const completions = await tx.select().from(campaignItemTaskCompletions).where(eq(campaignItemTaskCompletions.campaignItemId, itemId));
    const checked = completions.some(c => c.campaignChecklistTaskId === taskId);
    if (checked) await tx.delete(campaignItemTaskCompletions).where(and(eq(campaignItemTaskCompletions.campaignItemId, itemId),
      eq(campaignItemTaskCompletions.campaignChecklistTaskId, taskId)));
    else await tx.insert(campaignItemTaskCompletions).values({ campaignItemId: itemId, campaignChecklistTaskId: taskId, completedById: userId });
    await tx.insert(campaignChecklistAuditLog).values({ campaignItemId: itemId, campaignChecklistTaskId: taskId, userId,
      action: checked ? "uncompleted" : "completed" });
    const allDone = !checked && tasks.every(t => t.id === taskId || completions.some(c => c.campaignChecklistTaskId === t.id));
    const updated = await inTransaction(tx, () => updateCampaignRoundItem(itemId, companyId, {
      status: allDone ? "completed" : "pending", completedById: allDone ? userId : null,
      completedAt: allDone ? completedDate ? companyNoon(completedDate) : new Date() : null, updatedAt: new Date() }));
    const allItems = await tx.select().from(campaignItems).where(and(eq(campaignItems.campaignId, campaignId), eq(campaignItems.companyId, companyId)));
    await tx.update(campaigns).set({ status: allItems.every(i => i.status !== "pending") ? "completed" : "active" }).where(eq(campaigns.id, campaignId));
    return { item: updated, completions: await tx.select().from(campaignItemTaskCompletions).where(eq(campaignItemTaskCompletions.campaignItemId, itemId)) };
  });
}
export async function denseRoundOrder(tx: AppTransaction, companyId: string, campaignId: string) {
  const rows = await tx.select().from(campaignItems).where(and(eq(campaignItems.companyId, companyId),
    eq(campaignItems.campaignId, campaignId))).orderBy(asc(campaignItems.crewPosition), asc(campaignItems.id));
  const positions = new Map<string, number>();
  for (const row of rows) {
    // Reconciliation/reordering must not rewrite pre-existing finished work.
    // The actual completion writer removes its own row from priority atomically.
    if (row.status !== "pending") continue;
    const key = row.assignedCampaignCrewId ?? "";
    const position = positions.get(key) ?? 0;
    positions.set(key, position + 1);
    if (row.crewPosition !== position)
      await tx.update(campaignItems).set({ crewPosition: position }).where(eq(campaignItems.id, row.id));
  }
}

/** All existing completion/reset writers pass through storage.updateCampaignItem.
 * Item status and done/cancelled visit are one commit. Manual/extra-billable
 * workflows deliberately retain their pre-CG4 behavior.
 */
export async function updateCampaignRoundItem(id: string, companyId: string,
  updates: Partial<typeof campaignItems.$inferInsert>): Promise<CampaignItem | undefined> {
  const [owner] = await db.select({ source: campaigns.source }).from(campaignItems)
    .innerJoin(campaigns, and(eq(campaigns.id, campaignItems.campaignId), eq(campaigns.companyId, companyId)))
    .where(and(eq(campaignItems.id, id), eq(campaignItems.companyId, companyId)));
  if (!owner) return;
  if (owner.source !== "contract") {
    const [row] = await db.update(campaignItems).set(updates).where(and(eq(campaignItems.id, id),
      eq(campaignItems.companyId, companyId))).returning();
    return row;
  }
  return db.transaction(async tx => {
    await lockVisitCompany(tx, companyId);
    await lockCampaignRoundCompany(tx, companyId);
    const [identity] = await tx.select({ campaignId: campaignItems.campaignId }).from(campaignItems)
      .where(and(eq(campaignItems.id, id), eq(campaignItems.companyId, companyId)));
    if (!identity) return;
    const [campaign] = await tx.select().from(campaigns).where(and(eq(campaigns.id, identity.campaignId),
      eq(campaigns.companyId, companyId))).for("update");
    const [before] = await tx.select().from(campaignItems).where(and(eq(campaignItems.id, id),
      eq(campaignItems.companyId, companyId))).for("update");
    if (!before || !campaign) return;
    if (campaign.status === "archived") throw new CrewLinkError(409, "Archived round is read-only");
    const actor = campaignRoundActor.getStore();
    if (actor && (actor.activeCompanyId !== companyId || (roundField(actor) && !roundAssigned(actor, campaign) &&
      !await canAccessGeneratedRound(actor, campaign, id))))
      throw new CrewLinkError(409, "Crew assignment changed. Reload your list before recording work.");
    const [after] = await tx.update(campaignItems).set(updates).where(and(eq(campaignItems.id, id),
      eq(campaignItems.companyId, companyId))).returning();
    if (campaign.source !== "contract" || campaign.category === "extra_billable") return after;
    if (before.status !== "completed" && after.status === "completed") {
      const [team] = after.assignedCampaignCrewId ? await tx.select().from(campaignCrews).where(and(
        eq(campaignCrews.id, after.assignedCampaignCrewId), eq(campaignCrews.campaignId, campaign.id),
        eq(campaignCrews.companyId, companyId))) : [];
      if (after.assignedCampaignCrewId && !team) throw new CrewLinkError(409, "Assigned crew does not belong to this round");
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, after.customerId), eq(customers.companyId, companyId)));
      if (!customer) throw new CrewLinkError(409, "Property does not belong to this company");
      if (team?.crewId) {
        const [standing] = await tx.select({ id: crews.id }).from(crews).where(and(eq(crews.id, team.crewId), eq(crews.companyId, companyId)));
        if (!standing) throw new CrewLinkError(409, "Standing crew does not belong to this company");
      }
      const completedAt = after.completedAt ?? after.workCompletedAt ?? new Date();
      await tx.insert(visits).values({ companyId, campaignItemId: id, sourceType: "campaign_item",
        customerId: after.customerId, serviceKey: campaign.serviceKey, crewId: team?.crewId ?? null,
        visitDate: companyDateString(completedAt), status: "done", actualEndAt: completedAt,
        createdById: after.completedById ?? after.workCompletedById, title: campaign.title });
    } else if (before.status === "completed" && after.status !== "completed") {
      await tx.update(visits).set({ status: "cancelled", updatedAt: new Date() }).where(and(
        eq(visits.companyId, companyId), eq(visits.campaignItemId, id), eq(visits.status, "done")));
    }
    if (after.status !== "pending" && before.status !== after.status)
      await tx.update(campaignItems).set({ crewPosition: null }).where(eq(campaignItems.id, id));
    await denseRoundOrder(tx, companyId, campaign.id);
    const [ordered] = await tx.select().from(campaignItems).where(eq(campaignItems.id, id));
    return ordered;
  });
}
