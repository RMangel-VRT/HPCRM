import { and, eq, gte, inArray, lte, sql, asc } from "drizzle-orm";
import {
  campaigns, campaignItems, campaignItemTaskCompletions, campaignChecklistAuditLog, visits,
  campaignGenerationYears, type Campaign, type CampaignItem,
} from "@workspace/db";
import { db, type AppTransaction } from "../db";
import type { CampaignGenerationReport, RoundRef, ItemRef } from "../../../../lib/db/src/campaignGenerationContracts";
import { campaignDemand } from "./campaignDemand";
import { loadCustomerContractInputs } from "./customerContractSummary";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { companyToday, addCalendarDays } from "./companyDay";
import { campaignItemRow } from "./campaignItemRow";
import { GenerateContractCampaignsResponse } from "@workspace/api-zod";
import { inheritedRoundTeam } from "./campaignRoundLists";
import { denseRoundOrder } from "./campaignRoundWork";

const keyOf = (r: { serviceKey: string | null; roundMonth: string | null; roundSeq: number | null }) => `${r.serviceKey}:${r.roundMonth}:${r.roundSeq}`;
function monthEnd(month: string) {
  const [year, m] = month.split("-").map(Number);
  return addCalendarDays(m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`, -1);
}
function roundRef(c: Campaign): RoundRef {
  return { campaignId: c.id, serviceKey: c.serviceKey!, roundMonth: c.roundMonth!, roundSeq: c.roundSeq!,
    title: c.title, windowStart: c.windowStart, windowEnd: c.windowEnd };
}
/** Conservative protection includes promised chemical dates and recorded work,
 * not just the three communication timestamps. No finished/started work is lost.
 */
export function campaignItemProtected(item: CampaignItem, visited: boolean, checklist: boolean) {
  return item.status !== "pending" || visited || checklist || !!item.ticketId ||
    !!item.notes || !!item.skipReason ||
    !!item.completedAt || !!item.completedById || !!item.assignedCampaignCrewId ||
    !!item.photos?.length || !!item.completionPhotoStorageKeys?.length ||
    (item.workflowStep !== null && item.workflowStep !== "pre_communication") ||
    [item.preCommSentAt, item.preCommSentById, item.workCompletedAt, item.workCompletedById,
      item.postCommSentAt, item.postCommSentById, item.preCommEmailLogId, item.postCommEmailLogId,
      item.weatherRecordedAt, item.targetDate, item.backupDate, item.completionEmailSentAt,
      item.actualAreasTreated, item.actualConditions, item.completionNotes,
      item.chemicalProductId, item.applicatorUserId, item.timeWindowStart, item.timeWindowEnd,
      item.labelBatchNumber, item.labelMixRatio, item.labelPdfOverrideKey,
      item.postApplicationExpectationOverride, item.postApplicationWateringOverride,
      item.reEntryIntervalOverride, item.mowingRestrictionOverride, item.exceptionType].some(Boolean) ||
    [item.weatherTemp, item.weatherWindSpeed, item.weatherHumidity].some(v => v != null) ||
    !!item.weatherWindDirection || !!item.weatherConditions || !!Object.keys(item.customTemplateVars ?? {}).length ||
    item.wasBumpedToBackup === true || item.finishedWithoutComms === "true";
}

async function reconcile(tx: AppTransaction, companyId: string, year: number,
  opts: { userId?: string; today?: string }): Promise<CampaignGenerationReport> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'campaign-gen:' + companyId}, 0))`);
  const today = opts.today ?? companyToday(), from = `${year}-01-01`, through = `${year}-12-31`;
  const inputs = await loadCustomerContractInputs(tx, companyId);
  // SC1 transition: the unused timing owner is retired; calendar allocation is SC2.
  const demand = campaignDemand({ ...inputs, programs: [] }, year, today);
  const existing = await tx.select().from(campaigns).where(and(eq(campaigns.companyId, companyId),
    eq(campaigns.source, "contract"), gte(campaigns.roundMonth, from), lte(campaigns.roundMonth, through)))
    .orderBy(asc(campaigns.id)).for("update");
  const ids = existing.map(c => c.id);
  // Lock items before examining progress or dependent rows. FOR UPDATE also
  // conflicts with FK key-share inserts, closing the check-then-delete race.
  const items = ids.length ? await tx.select().from(campaignItems).where(and(eq(campaignItems.companyId, companyId),
    inArray(campaignItems.campaignId, ids))).orderBy(asc(campaignItems.id)).for("update") : [];
  const itemIds = items.map(i => i.id);
  const linkedVisits = itemIds.length ? await tx.select({ itemId: visits.campaignItemId }).from(visits)
    .where(and(eq(visits.companyId, companyId), inArray(visits.campaignItemId, itemIds))) : [];
  const completions = itemIds.length ? await tx.select({ itemId: campaignItemTaskCompletions.campaignItemId })
    .from(campaignItemTaskCompletions).where(inArray(campaignItemTaskCompletions.campaignItemId, itemIds)) : [];
  // Unchecking removes the current completion, not the recorded work history.
  // Deleting the item would cascade-delete this audit trail, so either form
  // of checklist evidence protects it permanently from demand reconciliation.
  const checklistHistory = itemIds.length ? await tx.select({ itemId: campaignChecklistAuditLog.campaignItemId })
    .from(campaignChecklistAuditLog).where(inArray(campaignChecklistAuditLog.campaignItemId, itemIds)) : [];
  const visited = new Set(linkedVisits.map(v => v.itemId));
  const checked = new Set([...completions, ...checklistHistory].map(v => v.itemId));
  const [enabled] = await tx.select().from(campaignGenerationYears).where(and(
    eq(campaignGenerationYears.companyId, companyId), eq(campaignGenerationYears.year, year)));
  const manualCampaigns = await tx.select({ id: campaigns.id, title: campaigns.title, category: campaigns.category,
    windowStart: campaigns.windowStart, windowEnd: campaigns.windowEnd }).from(campaigns).where(and(
    eq(campaigns.companyId, companyId), eq(campaigns.source, "manual"),
    lte(campaigns.windowStart, through), gte(campaigns.windowEnd, from)));
  const report: CampaignGenerationReport = { year, today, enabledAt: enabled?.enabledAt.toISOString() ?? null,
    rounds: [], created: [], deleted: [], added: [], removed: [], keptNotOwed: [], missed: [],
    addedToClosedRound: [], gaps: demand.gaps, waitingOnSignature: 0, manualCampaigns };
  const byRound = new Map(existing.map(c => [keyOf(c), c]));
  const desired = new Map(demand.rounds.map(r => [keyOf(r), new Set(r.members.map(m => m.propertyId))]));
  const properties = new Map(inputs.customers.map(c => [c.id, c]));
  const remaining = new Map(existing.map(c => [c.id, items.filter(i => i.campaignId === c.id).length]));
  const services = SCOPE_CATALOG.filter(s => s.scheduling === "campaign" || s.scheduling === "legacy");
  for (const round of demand.rounds) {
    const key = keyOf(round), service = services.find(s => s.key === round.serviceKey)!;
    const n = Math.max(...demand.rounds.filter(r => r.serviceKey === round.serviceKey && r.roundMonth === round.roundMonth).map(r => r.roundSeq));
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(`${round.roundMonth}T12:00:00Z`));
    const title = `${year} ${service.campaignName} – ${monthName}${n > 1 ? ` (${round.roundSeq} of ${n})` : ""}`;
    let campaign = byRound.get(key);
    let ref: RoundRef = campaign ? roundRef(campaign) : { ...round, title, campaignId: null,
      windowStart: round.roundMonth, windowEnd: monthEnd(round.roundMonth) };
    const newRound = !campaign;
    const row = { ...ref, members: round.members, newRound, added: 0, removed: 0 };
    report.rounds.push(row);
    report.waitingOnSignature += round.members.filter(m => m.termStatus === "sent").length;
    const present = new Set(items.filter(i => i.campaignId === campaign?.id).map(i => i.customerId));
    if (ref.windowEnd < today) {
      for (const member of round.members.filter(m => !present.has(m.propertyId)))
        report.missed.push({ ...ref, propertyId: member.propertyId, propertyName: member.propertyName, itemId: null });
      continue;
    }
    if (!campaign) {
      [campaign] = await tx.insert(campaigns).values({ companyId, source: "contract", serviceKey: round.serviceKey,
        roundMonth: round.roundMonth, roundSeq: round.roundSeq, title,
        windowStart: ref.windowStart, windowEnd: ref.windowEnd, status: "active",
        category: round.serviceKey === "chemical" ? "chemical" : service.line === "irrigation" ? "irrigation" : "general",
        subtype: round.serviceKey === "irrigation_open" ? "spring_turn_on" : round.serviceKey === "irrigation_winterization" ? "winterization" : null,
        createdById: opts.userId ?? null }).returning();
      ref = roundRef(campaign); Object.assign(row, ref);
      byRound.set(key, campaign); remaining.set(campaign.id, 0);
      report.created.push(ref);
    }
    for (const member of round.members) {
      if (present.has(member.propertyId)) continue;
      const inherited = await inheritedRoundTeam(tx, campaign, member.propertyId);
      const [item] = await tx.insert(campaignItems).values({ ...campaignItemRow(campaign, properties.get(member.propertyId)!),
        assignedCampaignCrewId: inherited }).returning();
      const itemRef = { ...ref, propertyId: member.propertyId, propertyName: member.propertyName, itemId: item.id };
      report.added.push(itemRef); row.added++;
      remaining.set(campaign.id, (remaining.get(campaign.id) ?? 0) + 1);
      if (campaign.status !== "active") report.addedToClosedRound.push(itemRef);
    }
  }
  for (const campaign of existing) {
    const key = keyOf(campaign), ref = roundRef(campaign);
    let row = report.rounds.find(r => keyOf(r) === key);
    if (!row) { row = { ...ref, members: [], newRound: false, added: 0, removed: 0 }; report.rounds.push(row); }
    for (const item of items.filter(i => i.campaignId === campaign.id)) {
      if (desired.get(key)?.has(item.customerId)) continue;
      const itemRef: ItemRef = { ...ref, propertyId: item.customerId, propertyName: properties.get(item.customerId)?.name ?? item.customerName, itemId: item.id };
      if (campaign.windowEnd < today || campaignItemProtected(item, visited.has(item.id), checked.has(item.id))) {
        report.keptNotOwed.push(itemRef); continue;
      }
      await tx.delete(campaignItems).where(and(eq(campaignItems.id, item.id), eq(campaignItems.companyId, companyId)));
      report.removed.push(itemRef); row.removed++;
      remaining.set(campaign.id, remaining.get(campaign.id)! - 1);
    }
    if (remaining.get(campaign.id) === 0 && campaign.windowStart > today && campaign.status === "active") {
      await tx.delete(campaigns).where(and(eq(campaigns.id, campaign.id), eq(campaigns.companyId, companyId)));
      report.deleted.push(ref);
    }
  }
  report.rounds.sort((a, b) => a.roundMonth.localeCompare(b.roundMonth) ||
    services.findIndex(s => s.key === a.serviceKey) - services.findIndex(s => s.key === b.serviceKey) || a.roundSeq - b.roundSeq);
  for (const campaign of byRound.values()) if (!report.deleted.some(r => r.campaignId === campaign.id))
    await denseRoundOrder(tx, companyId, campaign.id);
  return report;
}

/** Preview uses the identical writer in a rollback-only savepoint. No year opt-in,
 * campaigns or items survive; caller-owned transaction stays usable.
 */
export async function reconcileCampaigns(tx: AppTransaction, companyId: string, year: number,
  opts: { dryRun: boolean; userId?: string; today?: string }): Promise<CampaignGenerationReport> {
  if (!opts.dryRun) return reconcile(tx, companyId, year, opts);
  const rollback = { report: undefined as CampaignGenerationReport | undefined };
  try {
    await tx.transaction(async preview => { rollback.report = await reconcile(preview, companyId, year, opts); throw rollback; });
  } catch (err) { if (err !== rollback) throw err; }
  // Never expose rolled-back campaign/item IDs as navigable links.
  const report = rollback.report!;
  const createdIds = new Set(report.created.map(r => r.campaignId));
  for (const list of [report.rounds, report.created, report.added, report.missed, report.addedToClosedRound])
    for (const ref of list) { if (createdIds.has(ref.campaignId)) ref.campaignId = null; }
  for (const ref of report.added) ref.itemId = null;
  return report;
}

/** Public entry point: one transaction and one company advisory lock per run. */
export async function runCampaignGeneration(companyId: string, year: number,
  opts: { dryRun: boolean; userId?: string; today?: string }) {
  return db.transaction(async tx => {
    const report = await reconcileCampaigns(tx, companyId, year, opts);
    if (!opts.dryRun) {
      const [enabled] = await tx.insert(campaignGenerationYears).values({ companyId, year, enabledById: opts.userId ?? null })
        .onConflictDoNothing().returning();
      if (enabled) report.enabledAt = enabled.enabledAt.toISOString();
    }
    // Validate before commit so a response-contract failure cannot save work
    // while telling the caller the transaction failed.
    return GenerateContractCampaignsResponse.parse(report);
  });
}
