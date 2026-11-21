import { createHash } from "node:crypto";
import { communications, communicationThreads, estimateVersions, mailboxAccounts, mailboxBackfillRuns,
  mailboxSyncRuns, unsortedEmails } from "@workspace/db";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, type AppTransaction } from "../db";
import { gmailReservation, hasEstimateReceiptReference, hasForeignCopyReference, mergeSentCopy } from "./gmailReceipt";
import { isRfcMessageId } from "./gmailSender";
import { lockMailIdentity } from "./mailboxIngestion";

export class MailboxCleanupError extends Error {
  constructor(readonly status: 404 | 409, message: string) { super(message); }
}

export const eligibleLegacyMailbox = or(eq(mailboxAccounts.accountType, "personal"), eq(mailboxAccounts.isActive, false))!;
const reviewKey = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const verifyReview = (expected: string, provided: string) => {
  if (expected !== provided) throw new MailboxCleanupError(409, "Cleanup scope changed; review the updated counts before confirming.");
};

export function listLegacyMailboxes(companyId: string) {
  return db.select({ id: mailboxAccounts.id, displayName: mailboxAccounts.displayName,
    emailAddress: mailboxAccounts.emailAddress, accountType: mailboxAccounts.accountType }).from(mailboxAccounts)
    .where(and(eq(mailboxAccounts.companyId, companyId), eligibleLegacyMailbox)).orderBy(mailboxAccounts.emailAddress);
}

export function cleanLegacyMailbox(companyId: string, mailboxId: string, confirmation?: string) {
  return db.transaction(async tx => {
    await lockMailIdentity(tx, companyId);
    const mailboxScope = and(eq(mailboxAccounts.companyId, companyId), eq(mailboxAccounts.id, mailboxId), eligibleLegacyMailbox);
    const [account] = await tx.select({ address: mailboxAccounts.emailAddress, type: mailboxAccounts.accountType,
      active: mailboxAccounts.isActive, status: mailboxAccounts.syncStatus, enabled: mailboxAccounts.syncEnabled,
      connected: isNotNull(mailboxAccounts.oauthTokenJson) }).from(mailboxAccounts).where(mailboxScope).for("update");
    if (!account) throw new MailboxCleanupError(404, "Eligible legacy mailbox not found.");

    const commScope = and(eq(communications.companyId, companyId), eq(communications.mailboxAccountId, mailboxId));
    const rows = await tx.select({ id: communications.id, actor: communications.sentById, thread: communications.threadId,
      provider: communications.deliveryProvider, routing: communications.routingMethod,
      estimateReceipt: sql<boolean>`EXISTS (SELECT 1 FROM estimate_versions
        WHERE ${estimateVersions.companyId} = ${companyId} AND (${estimateVersions.emailIssue}->>'firstCommunicationId' = "communications"."id"
          OR ${estimateVersions.emailIssue}->>'pendingCommunicationId' = "communications"."id"))`,
    }).from(communications).where(commScope).orderBy(communications.id).for("update");
    // Actor FK is SET NULL when staff are removed. Delivery/receipt evidence
    // prevents losing their CRM-authored emails even after that happens.
    const imported = rows.filter(r => r.actor === null && !r.provider && !r.estimateReceipt
      && r.routing !== "estimate_email" && r.routing !== "company_documents");
    const importedIds = imported.map(r => r.id);
    const importedSet = new Set(importedIds);
    const detachedIds = rows.filter(r => !importedSet.has(r.id)).map(r => r.id);
    const touched = [...new Set(imported.flatMap(r => r.thread ? [r.thread] : []))];
    const threads = touched.length ? await tx.select({ id: communicationThreads.id }).from(communicationThreads)
      .where(and(eq(communicationThreads.companyId, companyId), inArray(communicationThreads.id, touched)))
      .orderBy(communicationThreads.id).for("update") : [];
    const remaining = touched.length ? await tx.select({ id: communications.id, thread: communications.threadId }).from(communications)
      .where(inArray(communications.threadId, touched)) : [];
    const occupied = new Set(remaining.filter(r => !importedSet.has(r.id)).map(r => r.thread));
    const emptyThreads = threads.filter(t => !occupied.has(t.id)).map(t => t.id);

    const unsortedScope = and(eq(unsortedEmails.companyId, companyId), eq(unsortedEmails.mailboxAccountId, mailboxId));
    const syncScope = and(eq(mailboxSyncRuns.companyId, companyId), eq(mailboxSyncRuns.mailboxAccountId, mailboxId));
    const backfillScope = and(eq(mailboxBackfillRuns.companyId, companyId), eq(mailboxBackfillRuns.mailboxAccountId, mailboxId));
    const unsorted = await tx.select({ id: unsortedEmails.id }).from(unsortedEmails).where(unsortedScope).orderBy(unsortedEmails.id).for("update");
    const syncRuns = await tx.select({ id: mailboxSyncRuns.id }).from(mailboxSyncRuns).where(syncScope).orderBy(mailboxSyncRuns.id);
    const backfillRuns = await tx.select({ id: mailboxBackfillRuns.id }).from(mailboxBackfillRuns).where(backfillScope).orderBy(mailboxBackfillRuns.id);
    const counts = { imported: importedIds.length, retained: detachedIds.length, threads: emptyThreads.length,
      unsorted: unsorted.length, syncRuns: syncRuns.length, backfillRuns: backfillRuns.length, mailboxes: 1 };
    const key = reviewKey({ companyId, mailboxId, account, importedIds, detachedIds, emptyThreads, unsorted, syncRuns, backfillRuns });
    if (confirmation === undefined) return { counts, reviewKey: key };
    verifyReview(key, confirmation);

    // FK actions are not tenant-filtered. Refuse inconsistent data rather than
    // let a cascade or SET NULL modify a row belonging to a different company.
    const affectedCompany = await tx.execute(sql`SELECT 1 WHERE EXISTS (
      SELECT 1 FROM communications WHERE mailbox_account_id = ${mailboxId} AND company_id <> ${companyId}
      UNION ALL SELECT 1 FROM unsorted_emails WHERE mailbox_account_id = ${mailboxId} AND company_id <> ${companyId}
      UNION ALL SELECT 1 FROM mailbox_sync_runs WHERE mailbox_account_id = ${mailboxId} AND company_id <> ${companyId}
      UNION ALL SELECT 1 FROM mailbox_backfill_runs WHERE mailbox_account_id = ${mailboxId} AND company_id <> ${companyId}
      UNION ALL SELECT 1 FROM communication_links WHERE company_id <> ${companyId} AND communication_id = ANY(${sql.param(importedIds)}::varchar[])
      UNION ALL SELECT 1 FROM communication_audit_log WHERE company_id <> ${companyId} AND communication_id = ANY(${sql.param(importedIds)}::varchar[])
      UNION ALL SELECT 1 FROM communications WHERE company_id <> ${companyId} AND parent_communication_id = ANY(${sql.param(importedIds)}::varchar[])
    )`);
    if (affectedCompany.rows.length) throw new MailboxCleanupError(409, "Legacy mailbox has inconsistent company references.");

    await tx.update(mailboxAccounts).set({ oauthTokenJson: null, oauthProvider: null,
      syncEnabled: false, syncStatus: "not_connected" }).where(mailboxScope);
    if (importedIds.length) {
      await tx.update(unsortedEmails).set({ resolvedToCommunicationId: null }).where(and(
        eq(unsortedEmails.companyId, companyId), inArray(unsortedEmails.resolvedToCommunicationId, importedIds)));
      await tx.delete(communications).where(and(commScope, inArray(communications.id, importedIds)));
    }
    if (detachedIds.length) await tx.update(communications).set({ mailboxAccountId: null })
      .where(and(commScope, inArray(communications.id, detachedIds)));
    await tx.delete(unsortedEmails).where(unsortedScope);
    if (emptyThreads.length) await tx.delete(communicationThreads).where(and(
      eq(communicationThreads.companyId, companyId), inArray(communicationThreads.id, emptyThreads)));
    await tx.delete(mailboxSyncRuns).where(syncScope);
    await tx.delete(mailboxBackfillRuns).where(backfillScope);
    await tx.delete(mailboxAccounts).where(mailboxScope);
    return { counts, reviewKey: key };
  });
}

type Pair = { canonical: string; copy: string; reserved: string; actual: string };

type SentEvidence = Pick<typeof communications.$inferSelect,
  "body" | "bodyText" | "bodyHtml" | "toAddresses" | "ccAddresses" | "bccAddresses" | "recipientEmail">;
const normalizeBody = (body?: string | null) => body?.replace(/\r\n/g, "\n").trimEnd() ?? "";
const normalizedRecipients = (addresses?: string[] | null) =>
  JSON.stringify([...new Set((addresses ?? []).map(address => address.trim().toLowerCase()).filter(Boolean))].sort());

function hasMatchingSentEvidence(canonical: SentEvidence, copy: SentEvidence) {
  const to = canonical.toAddresses?.length ? canonical.toAddresses : canonical.recipientEmail ? [canonical.recipientEmail] : [];
  const fromCrm = normalizeBody(canonical.bodyText || canonical.body);
  // An imported row may fall back to its subject when no body was extracted.
  // A fallback label is not evidence, nor is the approximate timestamp alone.
  const fromGmail = normalizeBody(copy.bodyText);
  return normalizedRecipients(to) !== "[]" && normalizedRecipients(to) === normalizedRecipients(copy.toAddresses)
    && normalizedRecipients(canonical.ccAddresses) === normalizedRecipients(copy.ccAddresses)
    && normalizedRecipients(canonical.bccAddresses) === normalizedRecipients(copy.bccAddresses)
    && !!fromCrm && fromCrm === fromGmail
    && (!canonical.bodyHtml || !copy.bodyHtml || normalizeBody(canonical.bodyHtml) === normalizeBody(copy.bodyHtml));
}

async function duplicatePlan(tx: AppTransaction, companyId: string) {
  const scope = and(eq(communications.companyId, companyId), eq(communications.type, "email"),
    eq(communications.direction, "outbound"), eq(communications.status, "sent"),
    isNotNull(communications.mailboxAccountId), isNotNull(communications.providerThreadId),
    isNotNull(communications.providerMessageId), isNotNull(communications.sentAt));
  const rows = await tx.select({ id: communications.id, mailbox: communications.mailboxAccountId, subject: communications.subject,
    thread: communications.providerThreadId, messageId: communications.providerMessageId, sentAt: communications.sentAt,
    actor: communications.sentById, deletedAt: communications.deletedAt, deliveryProvider: communications.deliveryProvider,
    body: communications.body, bodyText: communications.bodyText, bodyHtml: communications.bodyHtml,
    toAddresses: communications.toAddresses, ccAddresses: communications.ccAddresses, bccAddresses: communications.bccAddresses,
    recipientEmail: communications.recipientEmail,
  }).from(communications).where(scope).orderBy(communications.id).for("update");
  const alreadyClaimed = new Set(rows.filter(r => r.actor || r.deliveryProvider).map(r => r.messageId));
  const evidence = new Map(rows.map(row => [row.id, row] as const));
  const keyFor = (row: typeof rows[number]) => JSON.stringify([row.mailbox, row.thread, row.subject]);
  const buckets = new Map<string, typeof rows>();
  const canonicalRows = rows.filter(row => row.actor && !row.deletedAt && gmailReservation(row.messageId!));
  for (const row of rows) {
    if (!row.actor && !row.deliveryProvider && !row.deletedAt && isRfcMessageId(row.messageId!) &&
      !gmailReservation(row.messageId!) && !alreadyClaimed.has(row.messageId)) {
      const key = keyFor(row);
      const bucket = buckets.get(key) ?? [];
      bucket.push(row);
      buckets.set(key, bucket);
    }
  }
  const candidates = new Map<string, Pair[]>();
  const byActual = new Map<string, number>();
  let unmatched = 0;
  for (const row of canonicalRows) {
    const matches = (buckets.get(keyFor(row)) ?? []).filter(copy => Math.abs(+copy.sentAt! - +row.sentAt!) <= 120_000)
      .map(copy => ({ canonical: row.id, copy: copy.id, reserved: row.messageId!, actual: copy.messageId! }));
    if (!matches.length) unmatched++;
    for (const match of matches) byActual.set(match.actual, (byActual.get(match.actual) ?? 0) + 1);
    candidates.set(row.id, matches);
  }
  const pairs: Pair[] = [];
  const ambiguous = new Set<string>();
  for (const matches of candidates.values()) {
    const first = matches[0];
    if (!first) continue;
    if (matches.length === 1 && byActual.get(first.actual) === 1 &&
      hasMatchingSentEvidence(evidence.get(first.canonical)!, evidence.get(first.copy)!) &&
      !await hasEstimateReceiptReference(tx, companyId, first.copy) &&
      !await hasForeignCopyReference(tx, companyId, first.copy)) {
      // Do not move an ID already present on another row, including one
      // outside the candidate scan (e.g. a soft-deleted or unthreaded row).
      const [collision] = await tx.select({ id: communications.id }).from(communications).where(and(
        eq(communications.companyId, companyId), eq(communications.providerMessageId, first.actual),
        sql`${communications.id} <> ${first.copy}`)).limit(1);
      if (!collision) { pairs.push(first); continue; }
    }
    for (const match of matches) { ambiguous.add(match.canonical); ambiguous.add(match.copy); }
  }
  return { pairs, ambiguous, unmatched };
}

export function cleanDuplicateSentCopies(companyId: string, confirmation?: string) {
  return db.transaction(async tx => {
    await lockMailIdentity(tx, companyId);
    const plan = await duplicatePlan(tx, companyId);
    const counts = { merged: plan.pairs.length, ambiguous: plan.ambiguous.size, unmatched: plan.unmatched };
    const key = reviewKey({ companyId, counts, pairs: plan.pairs, needsReview: [...plan.ambiguous].sort() });
    if (confirmation === undefined) return { counts, reviewKey: key };
    verifyReview(key, confirmation);
    for (const pair of plan.pairs) {
      await mergeSentCopy(tx, companyId, pair.canonical, pair.copy, pair.actual, pair.reserved);
      await tx.update(communications).set({ providerMessageId: pair.actual, updatedAt: new Date() }).where(and(
        eq(communications.companyId, companyId), eq(communications.id, pair.canonical)));
    }
    return { counts, reviewKey: key };
  });
}
