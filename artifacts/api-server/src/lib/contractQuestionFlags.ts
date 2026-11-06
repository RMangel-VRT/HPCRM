import type { Express } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, flags } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { loadAccountManagerContext, resolveAccountManager } from "../services/accountManagers";
import { customerContractProjector, loadCustomerContractInputs, type CustomerContractInputs } from "./customerContractSummary";
import { companyToday } from "./companyDay";
import { logger } from "./logger";

export const NO_TERM_NOTE = "No contract in the Contract Center for this property. Add the current contract.";
export function contractQuestionCandidates(data: CustomerContractInputs, today = companyToday()) {
  const project = customerContractProjector(data, today);
  const owners = new Map(data.agreements.map(a => [a.id, a.customerId]));
  const result = new Map<string, { propertyId: string; note: string }>();
  for (const t of data.terms) {
    const propertyId = owners.get(t.agreementId);
    if (propertyId && ["snow", "both"].includes(t.line) && ["signed", "active", "renewed"].includes(t.status)
      && t.endDate >= today && !t.snowTriggers?.trim()) {
      result.set(`snow-triggers:${t.id}`, { propertyId,
        note: `Snow triggers missing from the ${t.seasonLabel} contract. Confirm trigger depth with the customer and add it on the contract.` });
    }
  }
  for (const c of data.customers) {
    if (c.status === "active" && c.active === "true" && !project(c.id)?.current.length)
      result.set(`no-term:${c.id}`, { propertyId: c.id, note: NO_TERM_NOTE });
  }
  return result;
}

/** Serializes concurrent sweeps and post-commit work. The partial unique index is
 * a second database-level guard; office workflow transitions are never overwritten.
 */
export async function reconcileContractQuestions(companyId: string, today = companyToday()) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`contract-questions:${companyId}`}, 0))`);
    const data = await loadCustomerContractInputs(tx, companyId, false);
    const context = await loadAccountManagerContext(companyId, tx);
    const desired = contractQuestionCandidates(data, today);
    const open = await tx.select().from(flags).where(and(eq(flags.companyId, companyId),
      sql`${flags.sourceKey} IS NOT NULL`, sql`${flags.status} NOT IN ('resolved', 'dismissed')`)).for("update");
    const existing = new Map(open.map(f => [f.sourceKey!, f]));
    for (const [sourceKey, candidate] of desired) {
      const customer = context.customers.get(candidate.propertyId);
      const assignee = customer ? resolveAccountManager(customer, context)?.id ?? null : null;
      const old = existing.get(sourceKey);
      if (!old) await tx.insert(flags).values({
        companyId, sourceKey, ...candidate, tag: "contract_question", createdByUserId: null,
        assignedToUserId: assignee, status: "new",
      }).onConflictDoNothing();
      else if (old.status === "new" && old.assignedToUserId !== assignee) {
        await tx.update(flags).set({ assignedToUserId: assignee, updatedAt: new Date() })
          .where(and(eq(flags.id, old.id), eq(flags.companyId, companyId), eq(flags.status, "new")));
      }
    }
    for (const old of open) {
      if (!/^(snow-triggers:|no-term:)/.test(old.sourceKey!) || desired.has(old.sourceKey!)) continue;
      const term = old.sourceKey!.startsWith("snow-triggers:")
        ? data.terms.find(t => `snow-triggers:${t.id}` === old.sourceKey) : null;
      const resolution = term?.snowTriggers?.trim() ? "Triggers added on contract"
        : old.sourceKey!.startsWith("snow-triggers:") ? "Term ended" : "Contract added or customer no longer active";
      await tx.update(flags).set({ status: "resolved", resolution, resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(flags.id, old.id), eq(flags.companyId, companyId),
          sql`${flags.status} NOT IN ('resolved', 'dismissed')`));
    }
    return { qualifying: desired.size };
  });
}

const pending = new Map<string, Promise<void>>();
export function scheduleContractQuestions(companyId: string) {
  // Queue behind any in-flight projection so a late commit is never lost.
  const job = (pending.get(companyId) ?? Promise.resolve()).then(async () => {
    await reconcileContractQuestions(companyId);
  }).catch(err => logger.error({ err, companyId }, "Contract questions reconciliation failed; nightly sweep will retry"));
  pending.set(companyId, job);
  void job.then(() => { if (pending.get(companyId) === job) pending.delete(companyId); });
  return job;
}

/** Runs only after successful committed request handlers finish. Covers audit
 * imports, lifecycle writes, activation, parent changes and AM membership changes.
 * Capture company at request entry, never from a mutable session after response.
 */
export function registerContractQuestionReconciliation(app: Express) {
  app.use((req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ||
      !/^\/api\/(customers(?:\/|$)|contract-center(?:\/|$)|admin\/contract-center(?:\/|$)|users(?:\/|$)|team(?:\/|$)|company-users(?:\/|$)|companies\/users(?:\/|$)|qbo(?:\/|$)|estimates(?:\/|$)|bids(?:\/|$)|proposals(?:\/|$))/.test(req.path)) return next();
    const companyId = (req.user as UserWithContext | undefined)?.activeCompanyId;
    if (companyId) res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) void scheduleContractQuestions(companyId);
    });
    next();
  });
}
export async function runContractQuestionSweep(today = companyToday()) {
  const rows = await db.select({ id: companies.id }).from(companies);
  for (const { id } of rows) await reconcileContractQuestions(id, today);
}
export function startContractQuestionSweep() {
  const run = () => void runContractQuestionSweep().catch(err => logger.error({ err }, "Contract questions sweep failed"));
  run();
  // Same startup/hourly pattern as the existing non-renewal scheduler; includes
  // every Colorado midnight without relying on the hosting machine's timezone.
  const timer = setInterval(run, 60 * 60 * 1000); timer.unref();
  return () => clearInterval(timer);
}
