import type { Express } from "express";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { campaignGenerationYears } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { companyToday } from "./companyDay";
import { reconcileCampaigns } from "./campaignReconcile";
import { logger } from "./logger";
import type { CampaignMembershipStatus } from "../../../../lib/db/src/campaignGenerationContracts";

const pending = new Map<string, Promise<void>>();
// Only latest summaries, never reports, contract data or unbounded run history.
const latest = new Map<string, CampaignMembershipStatus>();
const key = (companyId: string, year: number) => `${companyId}:${year}`;
function remember(companyId: string, year: number, status: CampaignMembershipStatus) {
  const id = key(companyId, year);
  latest.delete(id); latest.set(id, status);
  while (latest.size > 500) latest.delete(latest.keys().next().value!);
}
export async function campaignMembershipStatus(companyId: string, year: number): Promise<CampaignMembershipStatus> {
  const [enabled] = await db.select().from(campaignGenerationYears).where(and(
    eq(campaignGenerationYears.companyId, companyId), eq(campaignGenerationYears.year, year)));
  return { enabledAt: enabled?.enabledAt.toISOString() ?? null,
    checkedAt: null, succeededAt: null, error: null, changes: 0, keptNotOwed: 0, missed: 0,
    ...(enabled ? latest.get(key(companyId, year)) : undefined) };
}

export async function reconcileEnabledCampaignYears(companyId: string, today = companyToday()) {
  const years = await db.select().from(campaignGenerationYears).where(and(
    eq(campaignGenerationYears.companyId, companyId),
    gte(campaignGenerationYears.year, Number(today.slice(0, 4)))))
    .orderBy(asc(campaignGenerationYears.year));
  for (const enabled of years) {
    const previous = latest.get(key(companyId, enabled.year));
    try {
      const report = await db.transaction(async tx => {
        // Recheck opt-in while holding the same lock as the existing engine.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`campaign-gen:${companyId}`}, 0))`);
        const [stillEnabled] = await tx.select().from(campaignGenerationYears).where(and(
          eq(campaignGenerationYears.companyId, companyId), eq(campaignGenerationYears.year, enabled.year)));
        if (!stillEnabled) return null;
        return reconcileCampaigns(tx, companyId, enabled.year, { dryRun: false, today });
      });
      if (!report) continue;
      const checkedAt = new Date().toISOString();
      const changes = report.created.length + report.deleted.length + report.added.length + report.removed.length;
      const summary = { enabledAt: enabled.enabledAt.toISOString(), checkedAt, succeededAt: checkedAt,
        error: null, changes, keptNotOwed: report.keptNotOwed.length, missed: report.missed.length };
      remember(companyId, enabled.year, summary);
      if (changes || summary.keptNotOwed || summary.missed || report.gaps.length || report.waitingOnSignature)
        logger.info({ companyId, year: enabled.year, ...summary, gaps: report.gaps.length,
          waitingOnSignature: report.waitingOnSignature }, "Campaign membership reconciled");
    } catch (err) {
      remember(companyId, enabled.year, { enabledAt: enabled.enabledAt.toISOString(),
        checkedAt: new Date().toISOString(), succeededAt: previous?.succeededAt ?? null,
        error: "Membership check failed. The hourly sweep will retry.", changes: 0, keptNotOwed: 0, missed: 0 });
      logger.error({ err, companyId, year: enabled.year }, "Campaign membership reconciliation failed; hourly sweep will retry");
    }
  }
}
/** Independent from contract questions. Every committed write queues behind the
 * preceding job rather than coalescing away a later commit. */
export function scheduleCampaignMembership(companyId: string, today?: string) {
  const job = (pending.get(companyId) ?? Promise.resolve()).then(() => reconcileEnabledCampaignYears(companyId, today))
    .catch(err => logger.error({ err, companyId }, "Campaign membership queue failed; hourly sweep will retry"));
  pending.set(companyId, job);
  void job.then(() => { if (pending.get(companyId) === job) pending.delete(companyId); });
  return job;
}
export function registerCampaignMembershipReconciliation(app: Express) {
  app.use((req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ||
      !/^\/api\/(customers|contract-center|admin\/contract-center|service-calendar|estimates|bids|proposals|qbo)(?:\/|$)/.test(req.path)) return next();
    const companyId = (req.user as UserWithContext | undefined)?.activeCompanyId;
    if (companyId) res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) void scheduleCampaignMembership(companyId);
    });
    next();
  });
}
export async function runCampaignMembershipSweep(today = companyToday()) {
  const companies = await db.selectDistinct({ companyId: campaignGenerationYears.companyId }).from(campaignGenerationYears)
    .where(gte(campaignGenerationYears.year, Number(today.slice(0, 4))));
  for (const { companyId } of companies) await scheduleCampaignMembership(companyId, today);
}
export function startCampaignMembershipSweep() {
  const run = () => void runCampaignMembershipSweep().catch(err => logger.error({ err }, "Campaign membership sweep failed"));
  run();
  const timer = setInterval(run, 60 * 60 * 1000); timer.unref();
  return () => clearInterval(timer);
}
