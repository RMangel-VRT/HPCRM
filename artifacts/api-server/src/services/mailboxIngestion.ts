import { communications, mailboxAccounts, unsortedEmails } from "@workspace/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, inTransaction, type AppTransaction } from "../db";
import { routeMessage, type ParsedMessage } from "./emailRouter";

export const activeSharedMailbox = and(eq(mailboxAccounts.accountType, "shared"), eq(mailboxAccounts.isActive, true))!;
export const syncableSharedMailbox = and(activeSharedMailbox, eq(mailboxAccounts.syncEnabled, true),
  isNotNull(mailboxAccounts.oauthTokenJson))!;

type Mailbox = typeof mailboxAccounts.$inferSelect;

/** Per-company identity gate, shared by ingestion, delivery receipts, and cleanup. */
export async function lockMailIdentity(tx: AppTransaction, companyId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-mail:${companyId}`}, 0))`);
}

export function mailboxConnectionScope(account: Mailbox) {
  const token = account.oauthTokenJson as { connected_at?: string } | null;
  return and(eq(mailboxAccounts.id, account.id), eq(mailboxAccounts.companyId, account.companyId), syncableSharedMailbox,
    eq(mailboxAccounts.emailAddress, account.emailAddress),
    sql`(${mailboxAccounts.oauthTokenJson}->>'connected_at') IS NOT DISTINCT FROM ${token?.connected_at ?? null}`);
}

export async function lockSyncableMailbox(tx: AppTransaction, account: Mailbox) {
  const [current] = await tx.select({ id: mailboxAccounts.id }).from(mailboxAccounts)
    .where(mailboxConnectionScope(account)).for("share");
  return !!current;
}

export async function hasSyncedCommunication(companyId: string, rfcMessageId: string) {
  const rows = await db.select({ id: communications.id }).from(communications)
    .where(and(eq(communications.companyId, companyId), eq(communications.providerMessageId, rfcMessageId))).limit(1);
  return rows.length > 0;
}

/** No provider calls under this lock. A queued fetch must re-check the mailbox
 * before any write; either it commits before deactivation/purge, or it skips. */
export async function ingestMailboxMessage(account: Mailbox, message: ParsedMessage,
  direction: "inbound" | "outbound", resourceId: string, canWrite?: (tx: AppTransaction) => Promise<boolean>,
): Promise<"routed" | "unsorted" | "discarded" | "deduped" | "stopped"> {
  return db.transaction(tx => inTransaction(tx, async () => {
    const { companyId, id: mailboxAccountId } = account;
    await lockMailIdentity(tx, companyId);
    if (!await lockSyncableMailbox(tx, account) || (canWrite && !await canWrite(tx))) return "stopped";
    const identities = [...new Set([message.providerMessageId, resourceId])];
    const [existing] = await tx.select({ id: communications.id, thread: communications.providerThreadId,
      messageId: communications.providerMessageId }).from(communications)
      .where(and(eq(communications.companyId, companyId), inArray(communications.providerMessageId, identities)))
      .orderBy(sql`(${communications.providerMessageId} = ${message.providerMessageId}) DESC`).limit(1);
    if (existing) {
      const rekey = existing.messageId !== message.providerMessageId;
      if (rekey || (!existing.thread && message.providerThreadId)) {
        await tx.update(communications).set({ providerThreadId: existing.thread || message.providerThreadId,
          providerMessageId: message.providerMessageId, updatedAt: new Date() })
          .where(and(eq(communications.companyId, companyId), eq(communications.id, existing.id)));
      }
      return "deduped";
    }
    const [unsorted] = await tx.select({ id: unsortedEmails.id, messageId: unsortedEmails.providerMessageId }).from(unsortedEmails)
      .where(and(eq(unsortedEmails.companyId, companyId), inArray(unsortedEmails.providerMessageId, identities)))
      .orderBy(sql`(${unsortedEmails.providerMessageId} = ${message.providerMessageId}) DESC`).limit(1);
    if (unsorted) {
      if (unsorted.messageId !== message.providerMessageId) {
        await tx.update(unsortedEmails).set({ providerMessageId: message.providerMessageId })
          .where(and(eq(unsortedEmails.companyId, companyId), eq(unsortedEmails.id, unsorted.id)));
      }
      return "deduped";
    }

    const result = await routeMessage(companyId, { ...message, mailboxEmailAddress: account.emailAddress }, { direction });
    const common = {
      companyId, mailboxAccountId, direction, subject: message.subject, fromAddress: message.fromAddress,
      fromName: message.fromName, toAddresses: message.toAddresses, bodyText: message.bodyText || undefined,
      bodyHtml: message.bodyHtml, receivedAt: message.receivedAt, providerMessageId: message.providerMessageId,
      providerThreadId: message.providerThreadId,
      attachmentsJson: message.attachments ?? [],
    };
    if (result.action === "route" && result.customerId) {
      await tx.insert(communications).values({ ...common, customerId: result.customerId, type: "email",
        status: "sent", followUpStatus: "none", body: message.bodyText || message.subject, sentAt: message.receivedAt,
        ccAddresses: message.ccAddresses ?? [], bccAddresses: [], inReplyTo: message.inReplyTo,
        routingMethod: result.routingMethod, routingConfidence: result.routingConfidence });
      return "routed";
    }
    if (result.action === "unsorted") {
      await tx.insert(unsortedEmails).values({ ...common, status: "pending", candidateCustomerIds: result.candidateCustomerIds ?? [],
        routingNotes: result.routingNotes });
      return "unsorted";
    }
    return "discarded";
  }));
}
