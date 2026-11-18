import type { Express } from "express";
import { and, eq, like, sql } from "drizzle-orm";
import { companies, companyDocuments, flags } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { companyDocumentStatus } from "../../../../lib/db/src/companyDocumentContracts";
import { companyToday } from "./companyDay";
import { logger } from "./logger";

type Document = { id: string; name: string; expiresOn: string | null; archivedAt: Date | null };
type Reminder = { id: string; sourceKey: string | null; status: string };
export function companyDocumentExpiryCandidate(document: Document, today: string) {
  if (document.archivedAt || !document.expiresOn) return null;
  const { daysUntilExpiry: days } = companyDocumentStatus(document.expiresOn, today);
  if (days === null || days > 60) return null;
  const stage = days < 0 ? "expired" : days <= 14 ? "14" : "60";
  const date = new Date(`${document.expiresOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const note = stage === "expired"
    ? `${document.name} expired ${date}. Anyone asking for it will get an expired copy until a new one is uploaded.`
    : stage === "14"
      ? `${document.name} expires in ${days} days (${date}). Upload the renewed copy on Company documents.`
      : `${document.name} expires ${date} (${days} days). Get the renewed copy and upload it on Company documents.`;
  return { sourceKey: `company-doc:${document.id}:${document.expiresOn}:${stage}`, note };
}
export function companyDocumentExpiryPlan(documents: Document[], history: Reminder[], today: string) {
  const known = new Set(history.map(f => f.sourceKey));
  const desired = new Map(documents.map(d => [d.id, companyDocumentExpiryCandidate(d, today)]));
  const create = [...desired.values()].filter((v): v is NonNullable<typeof v> => !!v && !known.has(v.sourceKey));
  const resolve: { id: string; resolution: string }[] = [];
  for (const flag of history) {
    if (!flag.sourceKey?.startsWith("company-doc:") || ["resolved", "dismissed"].includes(flag.status)) continue;
    const match = /^company-doc:(.+):(\d{4}-\d{2}-\d{2}):(60|14|expired)$/.exec(flag.sourceKey);
    if (!match) continue; // Do not alter unknown keys or another source's reminders.
    const [, id, oldDate] = match, document = documents.find(d => d.id === id);
    if (desired.get(id)?.sourceKey === flag.sourceKey) continue;
    const resolution = !document || document.archivedAt ? "Document removed"
      : !document.expiresOn ? "Expiration removed"
        : document.expiresOn !== oldDate ? document.expiresOn > oldDate ? "Renewed copy uploaded" : "Expiration date changed"
          : "Moved to the next reminder";
    resolve.push({ id: flag.id, resolution });
  }
  return { create, resolve };
}
export async function reconcileCompanyDocumentExpiry(companyId: string, today = companyToday()) {
  return db.transaction(async tx => {
    // Same gate as document writes: snapshots cannot race a renewal, archive or role edit.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`company-documents:${companyId}`}, 0))`);
    const documents = await tx.select().from(companyDocuments).where(eq(companyDocuments.companyId, companyId));
    // All states are required: the open-only unique index cannot suppress a closed key.
    const history = await tx.select().from(flags).where(and(eq(flags.companyId, companyId), like(flags.sourceKey, "company-doc:%"))).for("update");
    const plan = companyDocumentExpiryPlan(documents, history, today);
    for (const old of plan.resolve) await tx.update(flags).set({ status: "resolved", resolution: old.resolution, resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(flags.id, old.id), eq(flags.companyId, companyId), sql`${flags.status} NOT IN ('resolved', 'dismissed')`));
    for (const candidate of plan.create) await tx.insert(flags).values({
      companyId, ...candidate, tag: "document_expiring", createdByUserId: null, assignedToUserId: null,
      propertyId: null, ticketId: null, status: "new",
    }).onConflictDoNothing();
    return { created: plan.create.length, resolved: plan.resolve.length };
  });
}
const pending = new Map<string, Promise<void>>();
export function scheduleCompanyDocumentExpiry(companyId: string) {
  const job = (pending.get(companyId) ?? Promise.resolve()).then(async () => { await reconcileCompanyDocumentExpiry(companyId); })
    .catch(err => logger.error({ err, companyId }, "Company document reminders failed; hourly sweep will retry"));
  pending.set(companyId, job);
  void job.then(() => { if (pending.get(companyId) === job) pending.delete(companyId); });
  return job;
}
export function registerCompanyDocumentReconciliation(app: Express, schedule = scheduleCompanyDocumentExpiry) {
  app.use((req, res, next) => {
    const path = req.path.replace(/\/$/, "");
    const applies = (req.method === "POST" && (path === "/api/company-documents" || /^\/api\/company-documents\/[^/]+\/files$/.test(path))) ||
      (["PATCH", "DELETE"].includes(req.method) && /^\/api\/company-documents\/[^/]+$/.test(path));
    const company = (req.user as UserWithContext | undefined)?.activeCompanyId;
    if (applies && company) res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) void schedule(company);
    });
    next();
  });
}
export async function runCompanyDocumentExpirySweep(today = companyToday()) {
  const rows = await db.select({ id: companies.id }).from(companies);
  for (const { id } of rows) await reconcileCompanyDocumentExpiry(id, today);
}
export function startCompanyDocumentExpirySweep() {
  const run = () => void runCompanyDocumentExpirySweep().catch(err => logger.error({ err }, "Company document expiry sweep failed"));
  run();
  const timer = setInterval(run, 3600000); timer.unref();
  return () => clearInterval(timer);
}
